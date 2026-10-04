import { describe, it, expect } from 'vitest'
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
  DEFAULT_HARDWARE_SETTINGS,
} from '@/features/platform/hardware/printerService'

describe('Stage 8: Hardware Integrations & Direct ESC/POS Printing (Unit Tests)', () => {
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
    }

    saveHardwareSettings(customConfig)
    const loaded = loadHardwareSettings()
    expect(loaded.receiptPrinter.ipAddress).toBe('192.168.1.150')
    expect(loaded.receiptPrinter.columnWidth).toBe(48)
  })
})
