import { describe, it, expect } from 'vitest';
import {
  splitEvenly,
  splitBySeat,
  calculateBalanceDue,
  validateCheckoutPermitted,
  calculateChangeDue,
  type SplitSeatItem,
} from '@/features/platform/pos/splitUtils';

describe('Stage 5: Split Checks & Multi-Tender Payments (Unit Tests)', () => {
  describe('Even Check Splitting (Toast / Clover $N$-Way Split)', () => {
    it('handles single guest taking entire bill', () => {
      const shares = splitEvenly(4550, 1); // $45.50
      expect(shares).toHaveLength(1);
      expect(shares[0].amount).toBe(4550);
      expect(shares[0].guestNumber).toBe(1);
    });

    it('splits evenly between 2 guests with no remainder', () => {
      const shares = splitEvenly(4000, 2); // $40.00
      expect(shares).toHaveLength(2);
      expect(shares[0].amount).toBe(2000);
      expect(shares[1].amount).toBe(2000);
      expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(4000);
    });

    it('splits $100.00 across 3 guests with zero penny loss ($33.34 + $33.33 + $33.33)', () => {
      const total = 10000; // $100.00
      const shares = splitEvenly(total, 3);
      expect(shares).toHaveLength(3);
      expect(shares[0].amount).toBe(3334);
      expect(shares[1].amount).toBe(3333);
      expect(shares[2].amount).toBe(3333);
      expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(total);
    });

    it('splits odd prime amounts across 4 guests correctly', () => {
      const total = 5001; // $50.01
      const shares = splitEvenly(total, 4);
      expect(shares).toHaveLength(4);
      expect(shares[0].amount).toBe(1251); // 5001 % 4 = 1 remainder
      expect(shares[1].amount).toBe(1250);
      expect(shares[2].amount).toBe(1250);
      expect(shares[3].amount).toBe(1250);
      expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(total);
    });

    it('handles large party splits (e.g. 7 guests on $123.45) with perfect cent conservation', () => {
      const total = 12345;
      const shares = splitEvenly(total, 7);
      expect(shares).toHaveLength(7);
      expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(total);
    });

    it('handles zero total gracefully', () => {
      const shares = splitEvenly(0, 3);
      expect(shares).toHaveLength(3);
      expect(shares.every((s) => s.amount === 0)).toBe(true);
    });

    it('clamps negative guest count to 1', () => {
      const shares = splitEvenly(5000, -2);
      expect(shares).toHaveLength(1);
      expect(shares[0].amount).toBe(5000);
    });
  });

  describe('Seat / Item Allocation Split', () => {
    const items: SplitSeatItem[] = [
      { id: 'item-1', name: 'Artisan Burger', price: 1800, quantity: 1, seatNumber: 1 },
      { id: 'item-2', name: 'Draft IPA', price: 800, quantity: 1, seatNumber: 1 },
      { id: 'item-3', name: 'Ribeye Steak', price: 3800, quantity: 1, seatNumber: 2 },
      { id: 'item-4', name: 'Cabernet Sauvignon', price: 1400, quantity: 1, seatNumber: 2 },
    ];

    it('groups items by seat number and calculates seat subtotals', () => {
      const orderTotals = {
        subtotal: 7800, // $78.00 (Seat 1: $26.00, Seat 2: $52.00)
        tax: 780, // 10% tax = $7.80
        tip: 1560, // 20% tip = $15.60
        discount: 0,
        total: 10140, // $101.40
      };

      const bills = splitBySeat(items, orderTotals);
      expect(bills).toHaveLength(2);

      const seat1 = bills.find((b) => b.seatNumber === 1)!;
      const seat2 = bills.find((b) => b.seatNumber === 2)!;

      expect(seat1.subtotal).toBe(2600); // $18 + $8
      expect(seat2.subtotal).toBe(5200); // $38 + $14

      // Seat 1 has 1/3 of subtotal, Seat 2 has 2/3 of subtotal
      expect(seat1.tax).toBe(260); // 1/3 of 780
      expect(seat2.tax).toBe(520); // 2/3 of 780

      expect(seat1.tip).toBe(520); // 1/3 of 1560
      expect(seat2.tip).toBe(1040); // 2/3 of 1560

      expect(seat1.total).toBe(3380); // $26.00 + $2.60 + $5.20
      expect(seat2.total).toBe(6760); // $52.00 + $5.20 + $10.40

      // Sum of seat totals matches order total exactly
      expect(seat1.total + seat2.total).toBe(orderTotals.total);
    });

    it('defaults unassigned items to Seat 1', () => {
      const unassignedItems: SplitSeatItem[] = [
        { id: 'item-1', name: 'Shared Nachos', price: 1500, quantity: 1 },
      ];
      const orderTotals = {
        subtotal: 1500,
        tax: 150,
        total: 1650,
      };

      const bills = splitBySeat(unassignedItems, orderTotals);
      expect(bills).toHaveLength(1);
      expect(bills[0].seatNumber).toBe(1);
      expect(bills[0].total).toBe(1650);
    });

    it('guarantees penny reconciliation across seats when proration results in fractional cents', () => {
      const oddItems: SplitSeatItem[] = [
        { id: 'item-1', name: 'Item A', price: 1000, quantity: 1, seatNumber: 1 },
        { id: 'item-2', name: 'Item B', price: 1000, quantity: 1, seatNumber: 2 },
        { id: 'item-3', name: 'Item C', price: 1000, quantity: 1, seatNumber: 3 },
      ];
      const orderTotals = {
        subtotal: 3000,
        tax: 251, // $2.51 / 3 = 83.666 cents each
        total: 3251,
      };

      const bills = splitBySeat(oddItems, orderTotals);
      expect(bills).toHaveLength(3);
      const totalSeatSum = bills.reduce((sum, b) => sum + b.total, 0);
      expect(totalSeatSum).toBe(orderTotals.total);
    });
  });

  describe('Multi-Tender Balance & Payment Status Engine', () => {
    it('marks order as unpaid when no payments have been processed', () => {
      const balance = calculateBalanceDue(5000, []);
      expect(balance.total).toBe(5000);
      expect(balance.paidAmount).toBe(0);
      expect(balance.balanceDue).toBe(5000);
      expect(balance.isFullyPaid).toBe(false);
      expect(balance.paymentStatus).toBe('unpaid');
    });

    it('updates balance due and status to partially_paid after first tender', () => {
      const payments = [
        { amount: 2000, status: 'succeeded' }, // $20.00 cash
      ];
      const balance = calculateBalanceDue(5000, payments);
      expect(balance.paidAmount).toBe(2000);
      expect(balance.balanceDue).toBe(3000); // $30.00 remaining
      expect(balance.isFullyPaid).toBe(false);
      expect(balance.paymentStatus).toBe('partially_paid');
    });

    it('marks order as paid when multi-tenders sum to total', () => {
      const payments = [
        { amount: 2000, status: 'succeeded' }, // $20.00 Cash
        { amount: 3000, status: 'succeeded' }, // $30.00 Card
      ];
      const balance = calculateBalanceDue(5000, payments);
      expect(balance.paidAmount).toBe(5000);
      expect(balance.balanceDue).toBe(0);
      expect(balance.isFullyPaid).toBe(true);
      expect(balance.paymentStatus).toBe('paid');
    });

    it('ignores failed, pending, or cancelled tenders', () => {
      const payments = [
        { amount: 2000, status: 'succeeded' },
        { amount: 3000, status: 'failed' },
        { amount: 1500, status: 'cancelled' },
      ];
      const balance = calculateBalanceDue(5000, payments);
      expect(balance.paidAmount).toBe(2000);
      expect(balance.balanceDue).toBe(3000);
      expect(balance.paymentStatus).toBe('partially_paid');
    });
  });

  describe('Checkout Permission & Gatekeeper', () => {
    it('allows checkout when balance due is zero', () => {
      const validation = validateCheckoutPermitted(0, 'paid');
      expect(validation.canCheckout).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    it('blocks checkout and returns error message when check is partially paid', () => {
      const validation = validateCheckoutPermitted(1500, 'partially_paid');
      expect(validation.canCheckout).toBe(false);
      expect(validation.reason).toContain('outstanding balance of $15.00');
    });

    it('blocks checkout when check is unpaid', () => {
      const validation = validateCheckoutPermitted(4500, 'unpaid');
      expect(validation.canCheckout).toBe(false);
      expect(validation.reason).toContain('outstanding balance of $45.00');
    });
  });

  describe('Cash Tender & Change Calculation', () => {
    it('calculates change when cash received exceeds amount due', () => {
      const change = calculateChangeDue(5000, 3250); // $50.00 tendered for $32.50
      expect(change).toBe(1750); // $17.50 change
    });

    it('returns zero change on exact cash tender', () => {
      const change = calculateChangeDue(2500, 2500);
      expect(change).toBe(0);
    });

    it('returns zero change when cash tendered is less than amount due', () => {
      const change = calculateChangeDue(2000, 3000);
      expect(change).toBe(0);
    });
  });
});
