/**
 * Commercial Restaurant POS Check Splitting & Multi-Tender Utilities
 * Follows Toast POS and Clover architectural standards for penny-perfect arithmetic.
 */

export interface SplitGuestShare {
  guestNumber: number;
  amount: number; // in cents
  isPaid?: boolean;
  tenderType?: 'cash' | 'card' | 'gift_card' | 'custom';
  paymentId?: string;
}

export interface SplitSeatItem {
  id: string;
  name: string;
  price: number; // in cents
  quantity: number;
  seatNumber?: number | null;
}

export interface SeatBill {
  seatNumber: number;
  label: string;
  items: SplitSeatItem[];
  subtotal: number; // in cents
  tax: number; // in cents
  tip: number; // in cents
  discount: number; // in cents
  total: number; // in cents
  isPaid?: boolean;
}

export interface BalanceStatus {
  total: number;
  paidAmount: number;
  balanceDue: number;
  isFullyPaid: boolean;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
}

/**
 * Split an order total evenly across N guests down to the exact cent without penny drop.
 *
 * Example: $100.00 across 3 guests:
 * - baseShare = 3333 cents ($33.33)
 * - remainder = 1 cent
 * - Guest 1: 3334 cents ($33.34)
 * - Guest 2: 3333 cents ($33.33)
 * - Guest 3: 3333 cents ($33.33)
 * Sum = 10000 cents ($100.00) exactly.
 */
export function splitEvenly(totalCents: number, numGuests: number): SplitGuestShare[] {
  const safeTotal = Math.max(0, Math.round(totalCents));
  const safeGuests = Math.max(1, Math.round(numGuests));

  if (safeGuests === 1) {
    return [{ guestNumber: 1, amount: safeTotal }];
  }

  const baseShare = Math.floor(safeTotal / safeGuests);
  const remainder = safeTotal % safeGuests;

  const shares: SplitGuestShare[] = [];
  for (let i = 0; i < safeGuests; i++) {
    // Distribute remainder cents to first `remainder` guests
    const amount = baseShare + (i < remainder ? 1 : 0);
    shares.push({
      guestNumber: i + 1,
      amount,
      isPaid: false,
    });
  }

  return shares;
}

/**
 * Split items by assigned seat number and prorate taxes, tips, and discounts.
 * Sum of all seat totals strictly equals orderTotals.total.
 */
export function splitBySeat(
  items: SplitSeatItem[],
  orderTotals: {
    subtotal: number;
    tax: number;
    tip?: number;
    discount?: number;
    total: number;
  }
): SeatBill[] {
  const totalSubtotal = Math.max(0, Math.round(orderTotals.subtotal));
  const totalTax = Math.max(0, Math.round(orderTotals.tax));
  const totalTip = Math.max(0, Math.round(orderTotals.tip || 0));
  const totalDiscount = Math.max(0, Math.round(orderTotals.discount || 0));
  const expectedTotal = Math.max(0, Math.round(orderTotals.total));

  // Group items by seat (default to 1)
  const seatGroups = new Map<number, SplitSeatItem[]>();
  for (const item of items) {
    const seat = item.seatNumber && item.seatNumber > 0 ? item.seatNumber : 1;
    if (!seatGroups.has(seat)) {
      seatGroups.set(seat, []);
    }
    seatGroups.get(seat)!.push(item);
  }

  // Ensure at least Seat 1 exists
  if (seatGroups.size === 0) {
    return [
      {
        seatNumber: 1,
        label: 'Seat 1',
        items: [],
        subtotal: 0,
        tax: totalTax,
        tip: totalTip,
        discount: totalDiscount,
        total: expectedTotal,
      },
    ];
  }

  const sortedSeats = Array.from(seatGroups.keys()).sort((a, b) => a - b);
  const seatBills: SeatBill[] = [];

  let accumulatedTax = 0;
  let accumulatedTip = 0;
  let accumulatedDiscount = 0;
  let accumulatedTotal = 0;

  sortedSeats.forEach((seatNum, index) => {
    const seatItems = seatGroups.get(seatNum)!;
    const seatSubtotal = seatItems.reduce((sum, item) => sum + Math.round(item.price * item.quantity), 0);

    const isLast = index === sortedSeats.length - 1;
    const ratio = totalSubtotal > 0 ? seatSubtotal / totalSubtotal : 1 / sortedSeats.length;

    // Prorated shares
    const seatTax = isLast ? totalTax - accumulatedTax : Math.round(totalTax * ratio);
    const seatTip = isLast ? totalTip - accumulatedTip : Math.round(totalTip * ratio);
    const seatDiscount = isLast ? totalDiscount - accumulatedDiscount : Math.round(totalDiscount * ratio);

    accumulatedTax += seatTax;
    accumulatedTip += seatTip;
    accumulatedDiscount += seatDiscount;

    let seatTotal = Math.max(0, seatSubtotal + seatTax + seatTip - seatDiscount);

    if (isLast) {
      // Reconcile any rounding discrepancy against expectedTotal
      const diff = expectedTotal - (accumulatedTotal + seatTotal);
      seatTotal += diff;
    }

    accumulatedTotal += seatTotal;

    seatBills.push({
      seatNumber: seatNum,
      label: `Seat ${seatNum}`,
      items: seatItems,
      subtotal: seatSubtotal,
      tax: seatTax,
      tip: seatTip,
      discount: seatDiscount,
      total: seatTotal,
      isPaid: false,
    });
  });

  return seatBills;
}

/**
 * Calculate live balance due and payment status from succeeded tenders.
 */
export function calculateBalanceDue(
  orderTotalCents: number,
  payments: Array<{ amount: number | string; status: string }>
): BalanceStatus {
  const total = Math.max(0, Math.round(orderTotalCents));
  const paidAmount = payments
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + Math.max(0, Math.round(Number(p.amount || 0))), 0);

  const balanceDue = Math.max(0, total - paidAmount);
  const isFullyPaid = balanceDue === 0 && total > 0;

  let paymentStatus: 'unpaid' | 'partially_paid' | 'paid' = 'unpaid';
  if (paidAmount >= total && total > 0) {
    paymentStatus = 'paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'partially_paid';
  }

  return {
    total,
    paidAmount,
    balanceDue,
    isFullyPaid,
    paymentStatus,
  };
}

/**
 * Validate whether checkout / table freeing is permitted.
 */
export function validateCheckoutPermitted(
  balanceDueCents: number,
  paymentStatus: string = 'unpaid'
): { canCheckout: boolean; reason?: string } {
  if (balanceDueCents <= 0 || paymentStatus === 'paid') {
    return { canCheckout: true };
  }

  const formattedBalance = (balanceDueCents / 100).toFixed(2);
  return {
    canCheckout: false,
    reason: `Check has an outstanding balance of $${formattedBalance}. All split and multi-tender payments must be completed before closing the check.`,
  };
}

/**
 * Calculate change due if cash tendered exceeds amount due.
 */
export function calculateChangeDue(cashTenderedCents: number, amountDueCents: number): number {
  const tendered = Math.max(0, Math.round(cashTenderedCents));
  const due = Math.max(0, Math.round(amountDueCents));
  return Math.max(0, tendered - due);
}
