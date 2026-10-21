import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ESCPOSBuilder,
  buildCustomerReceipt,
  buildKitchenTicket,
  buildCashDrawerKick,
  ESCPOSReceiptData,
  ESCPOSKitchenTicketData,
} from '@/features/platform/hardware/escposGenerator'
import {
  renderReceiptHTML,
  renderKitchenTicketHTML,
  loadHardwareSettings,
  saveHardwareSettings,
  pingPaymentTerminal,
  DEFAULT_HARDWARE_SETTINGS,
} from '@/features/platform/hardware/printerService'
import {
  createPaymentFunction as createTerminalPayment,
  refundPaymentFunction as refundTerminalPayment,
} from '@/features/integrations/payment/terminal'

describe('Stage 8: Hardware Integrations & Direct ESC/POS Printing (Unit Tests)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('generates standard ESC/POS control byte sequences', () => {
    const builder = new ESCPOSBuilder(42)
    const bytes = builder
      .init()
      .align('center')
      .bold(true)
      .size(2, 2)
      .text('RECEIPT')
      .feed(1)
      .align('left')
      .bold(false)
      .size(1, 1)
      .separator('-')
      .twoColumns('Burger', '$15.00')
      .cut(false)
      .build()

    expect(bytes instanceof Uint8Array).toBe(true)
    expect(bytes.length).toBeGreaterThan(20)

    // Check for ESC @ (0x1b, 0x40)
    expect(bytes[0]).toBe(0x1b)
    expect(bytes[1]).toBe(0x40)

    // Check for ESC a 1 (align center: 0x1b, 0x61, 0x01)
    expect(Array.from(bytes)).toContain(0x61)

    // Check for paper cut (GS V 1: 0x1d, 0x56, 0x01)
    const arr = Array.from(bytes)
    const cutIndex = arr.indexOf(0x56)
    expect(cutIndex).toBeGreaterThan(-1)
    expect(arr[cutIndex - 1]).toBe(0x1d)
    expect(arr[cutIndex + 1]).toBe(0x01)
  })

  it('generates cash drawer kick command pulse for Pin 2 and Pin 5', () => {
    const pin2Bytes = buildCashDrawerKick(2)
    const pin2Arr = Array.from(pin2Bytes)
    // ESC p 0 25 250 -> 0x1b, 0x70, 0x00, 0x19, 0xfa
    expect(pin2Arr).toContain(0x1b)
    expect(pin2Arr).toContain(0x70)
    expect(pin2Arr).toContain(0x00)
    expect(pin2Arr).toContain(0x19)
    expect(pin2Arr).toContain(0xfa)

    const pin5Bytes = buildCashDrawerKick(5)
    const pin5Arr = Array.from(pin5Bytes)
    // ESC p 1 25 250 -> 0x1b, 0x70, 0x01, 0x19, 0xfa
    expect(pin5Arr).toContain(0x01)
  })

  it('generates buzzer chime for urgent kitchen orders', () => {
    const builder = new ESCPOSBuilder(42)
    const bytes = builder.beep(2).build()
    const arr = Array.from(bytes)
    // ASCII Bell is 0x07
    const bellCount = arr.filter((b) => b === 0x07).length
    expect(bellCount).toBe(2)
  })

  it('compiles an 80mm customer guest receipt with totals, tips, and items', () => {
    const sampleReceipt: ESCPOSReceiptData = {
      restaurantName: 'The Openfront Tavern',
      restaurantAddress: '500 Main St',
      restaurantPhone: '(555) 123-4567',
      orderNumber: '501',
      serverName: 'Bob B.',
      tableName: 'T4',
      orderType: 'dine_in',
      createdAt: '2026-10-04T12:00:00.000Z',
      items: [
        {
          name: 'Crispy Wings',
          quantity: 2,
          priceCents: 1400,
          modifiers: [{ name: 'Spicy Buffalo', priceCents: 100 }],
        },
        {
          name: 'Draft Beer',
          quantity: 1,
          priceCents: 700,
        },
      ],
      subtotalCents: 3600,
      taxCents: 315,
      tipCents: 700,
      totalCents: 4615,
      payments: [{ method: 'MasterCard', amountCents: 4615, reference: '****9999' }],
      footerMessage: 'Please visit us again!',
    }

    const receiptBytes = buildCustomerReceipt(sampleReceipt, 42)
    expect(receiptBytes.length).toBeGreaterThan(100)

    // Convert to text string to inspect content
    const receiptText = String.fromCharCode(...receiptBytes)
    expect(receiptText).toContain('The Openfront Tavern')
    expect(receiptText).toContain('Check: #501')
    expect(receiptText).toContain('Table: T4')
    expect(receiptText).toContain('Crispy Wings')
    expect(receiptText).toContain('Spicy Buffalo')
    expect(receiptText).toContain('$36.00')
    expect(receiptText).toContain('$46.15')
    expect(receiptText).toContain('MASTERCARD')
    expect(receiptText).toContain('Suggested Gratuity Guide')
  })

  it('compiles an 80mm kitchen prep ticket with courses, seat routing, and rush header', () => {
    const sampleKitchen: ESCPOSKitchenTicketData = {
      ticketNumber: 'K-901',
      orderNumber: '901',
      tableName: 'T7',
      orderType: 'dine_in',
      serverName: 'Charlie',
      guestCount: 2,
      isUrgent: true,
      createdAt: '2026-10-04T12:05:00.000Z',
      stationName: 'Hot Line',
      specialInstructions: 'VIP Table',
      items: [
        {
          name: 'Spinach Dip',
          quantity: 1,
          priceCents: 1200,
          courseNumber: 1,
          seatNumber: 1,
        },
        {
          name: 'Ribeye Steak',
          quantity: 1,
          priceCents: 3800,
          courseNumber: 2,
          seatNumber: 1,
          modifiers: [{ name: 'Medium' }],
          specialInstructions: 'Sauce on side',
        },
      ],
    }

    const ticketBytes = buildKitchenTicket(sampleKitchen, 42)
    const ticketText = String.fromCharCode(...ticketBytes)

    expect(ticketText).toContain('RUSH ORDER')
    expect(ticketText).toContain('STATION: HOT LINE')
    expect(ticketText).toContain('TABLE: T7')
    expect(ticketText).toContain('--- COURSE 1 ---')
    expect(ticketText).toContain('[S1] 1x Spinach Dip')
    expect(ticketText).toContain('--- COURSE 2 ---')
    expect(ticketText).toContain('[S1] 1x Ribeye Steak')
    expect(ticketText).toContain('>> Medium')
    expect(ticketText).toContain('Sauce on side')
    expect(ticketText).toContain('VIP Table')
  })

  it('renders valid 80mm HTML thermal receipt layout for browser print fallback', () => {
    const receiptData: ESCPOSReceiptData = {
      restaurantName: 'Openfront Bistro',
      orderNumber: '100',
      orderType: 'takeout',
      createdAt: new Date().toISOString(),
      items: [{ name: 'Espresso', quantity: 1, priceCents: 350 }],
      subtotalCents: 350,
      taxCents: 30,
      totalCents: 380,
    }

    const html = renderReceiptHTML(receiptData)
    expect(html).toContain('size: 80mm auto')
    expect(html).toContain('Openfront Bistro')
    expect(html).toContain('TAKEOUT')
    expect(html).toContain('1x Espresso')
    expect(html).toContain('$3.80')
  })

  it('renders valid 80mm HTML kitchen prep ticket layout', () => {
    const kitchenData: ESCPOSKitchenTicketData = {
      ticketNumber: 'K-100',
      orderNumber: '100',
      orderType: 'takeout',
      createdAt: new Date().toISOString(),
      items: [{ name: 'Pizza', quantity: 1, priceCents: 1800, courseNumber: 1 }],
    }

    const html = renderKitchenTicketHTML(kitchenData)
    expect(html).toContain('size: 80mm auto')
    expect(html).toContain('Kitchen #K-100')
    expect(html).toContain('TAKEOUT')
    expect(html).toContain('1x Pizza')
  })

  it('loads and saves hardware configuration in browser localStorage', () => {
    const customConfig = {
      ...DEFAULT_HARDWARE_SETTINGS,
      receiptPrinter: {
        ...DEFAULT_HARDWARE_SETTINGS.receiptPrinter,
        ipAddress: '192.168.1.150',
        columnWidth: 48,
      },
      paymentTerminal: {
        ...DEFAULT_HARDWARE_SETTINGS.paymentTerminal,
        mode: 'pax_poslink' as const,
        ipAddress: '192.168.1.222',
        port: 10009,
      },
    }

    saveHardwareSettings(customConfig)
    const loaded = loadHardwareSettings()
    expect(loaded.receiptPrinter.ipAddress).toBe('192.168.1.150')
    expect(loaded.receiptPrinter.columnWidth).toBe(48)
    expect(loaded.paymentTerminal.mode).toBe('pax_poslink')
    expect(loaded.paymentTerminal.ipAddress).toBe('192.168.1.222')
  })

  it('processes simulated EMV/NFC terminal transactions with on-terminal tip adjustment', async () => {
    const res = await createTerminalPayment({
      order: { id: 'ord_1', orderNumber: '1048' },
      amount: 5000, // $50.00 base
      currency: 'usd',
      idempotencyKey: 'idem_1234',
      terminalConfig: {
        protocol: 'simulated',
        simulatedOutcome: 'approved',
        simulatedEntryMode: 'TAP',
        simulatedCardBrand: 'VISA',
        simulatedLast4: '4242',
        simulatedTipCents: 1000, // $10.00 tip selected on terminal screen
      },
    })

    expect(res.status).toBe('succeeded')
    expect(res.baseAmount).toBe(5000)
    expect(res.tipAmount).toBe(1000)
    expect(res.amount).toBe(6000) // $60.00 total authorized
    expect(res.cardBrand).toBe('VISA')
    expect(res.last4).toBe('4242')
    expect(res.entryMode).toBe('TAP')
  })

  it('dispatches Dejavoo SPIN Cloud REST sale payload and parses approved EMV response', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        GeneralResponse: { ResultCode: '0', StatusCode: '0000', AuthCode: 'DJV991' },
        ReferenceId: 'spin_tx_991',
        Amounts: { TotalAmount: 69.0, TipAmount: 9.0 },
        CardData: { CardType: 'MasterCard', Last4: '8899', EntryType: 'Chip' },
      }),
    } as any)

    const res = await createTerminalPayment({
      order: { id: 'ord_2', orderNumber: '2002' },
      amount: 6000,
      currency: 'usd',
      idempotencyKey: 'idem_spin_1',
      terminalConfig: {
        protocol: 'dejavoo_spin',
        tpn: '123456789012',
        authKey: 'secret_spin_key',
        spinEnvironment: 'sandbox',
      },
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test.spinpos.net/spin/v2/Payment/Sale',
      expect.objectContaining({ method: 'POST' })
    )
    expect(res.status).toBe('succeeded')
    expect(res.amount).toBe(6900)
    expect(res.tipAmount).toBe(900)
    expect(res.cardBrand).toBe('MASTERCARD')
    expect(res.last4).toBe('8899')
    expect(res.entryMode).toBe('CHIP')
  })

  it('dispatches PAX BroadPOS / POSLink local LAN HTTP sale payload and parses approval', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ResultCode: '000000',
        ResponseCode: '00',
        AmountInformation: { ApprovedAmount: '5500', TipAmount: '500' },
        AccountInformation: { CardType: 'AMEX', Account: '378282246311005', EntryMode: 'TAP' },
        HostInformation: { TransactionIdentifier: 'pax_tx_55', AuthCode: 'PAX777' },
      }),
    } as any)

    const res = await createTerminalPayment({
      order: { id: 'ord_3', orderNumber: '3003' },
      amount: 5000,
      currency: 'usd',
      idempotencyKey: 'idem_pax_1',
      terminalConfig: {
        protocol: 'pax_poslink',
        ipAddress: '192.168.1.210',
        port: 10009,
        promptTipOnTerminal: true,
      },
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.1.210:10009/poslink/payment',
      expect.objectContaining({ method: 'POST' })
    )
    expect(res.status).toBe('succeeded')
    expect(res.amount).toBe(5500)
    expect(res.tipAmount).toBe(500)
    expect(res.cardBrand).toBe('AMEX')
    expect(res.last4).toBe('1005')
    expect(res.authCode).toBe('PAX777')
  })

  it('validates payment terminal readiness via pingPaymentTerminal', async () => {
    const simPing = await pingPaymentTerminal({
      enabled: true,
      mode: 'simulated',
      terminalName: 'Bar Reader',
      promptTipOnTerminal: true,
      timeoutSeconds: 60,
    })
    expect(simPing.success).toBe(true)

    const invalidSpin = await pingPaymentTerminal({
      enabled: true,
      mode: 'dejavoo_spin',
      terminalName: 'Counter Dejavoo',
      tpn: '',
      authKey: '',
      promptTipOnTerminal: true,
      timeoutSeconds: 60,
    })
    expect(invalidSpin.success).toBe(false)

    const refundRes = await refundTerminalPayment({
      paymentId: 'sim_term_1',
      amount: 2500,
      idempotencyKey: 'ref_1',
    })
    expect(refundRes.status).toBe('succeeded')
    expect(refundRes.amount).toBe(2500)
  })
})
