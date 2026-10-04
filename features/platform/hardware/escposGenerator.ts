/**
 * Openfront POS - ESC/POS Binary Command & Thermal Ticket Generator
 * Generates raw ESC/POS byte buffers for 80mm/58mm thermal receipt & kitchen printers.
 */

export interface ESCPOSReceiptItem {
  name: string
  quantity: number
  priceCents: number
  seatNumber?: number
  courseNumber?: number
  modifiers?: Array<{ name: string; priceCents?: number }>
  specialInstructions?: string | null
}

export interface ESCPOSReceiptData {
  restaurantName: string
  restaurantAddress?: string
  restaurantPhone?: string
  orderNumber: string
  serverName?: string
  tableName?: string
  orderType: 'dine_in' | 'takeout'
  createdAt: string
  items: ESCPOSReceiptItem[]
  subtotalCents: number
  taxCents: number
  tipCents?: number
  totalCents: number
  payments?: Array<{ method: string; amountCents: number; reference?: string }>
  footerMessage?: string
}

export interface ESCPOSKitchenTicketData {
  ticketNumber: string
  orderNumber: string
  tableName?: string
  orderType: 'dine_in' | 'takeout'
  serverName?: string
  guestCount?: number
  isUrgent?: boolean
  createdAt: string
  stationName?: string
  specialInstructions?: string | null
  items: ESCPOSReceiptItem[]
}

export class ESCPOSBuilder {
  private buffer: number[] = []
  private columnWidth: number

  constructor(columnWidth: number = 42) {
    this.columnWidth = columnWidth
    this.init()
  }

  /**
   * Resets printer hardware state (ESC @)
   */
  init(): this {
    this.buffer.push(0x1b, 0x40)
    return this
  }

  /**
   * Set text alignment (ESC a n)
   * 0: left, 1: center, 2: right
   */
  align(alignment: 'left' | 'center' | 'right'): this {
    const code = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0
    this.buffer.push(0x1b, 0x61, code)
    return this
  }

  /**
   * Set bold mode (ESC E n)
   */
  bold(enable: boolean = true): this {
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0)
    return this
  }

  /**
   * Set underline mode (ESC - n)
   */
  underline(enable: boolean = true): this {
    this.buffer.push(0x1b, 0x2d, enable ? 1 : 0)
    return this
  }

  /**
   * Set inverted white-on-black mode (GS B n)
   */
  invert(enable: boolean = true): this {
    this.buffer.push(0x1d, 0x42, enable ? 1 : 0)
    return this
  }

  /**
   * Set text character size multiplier (GS ! n)
   * width: 1-8, height: 1-8
   */
  size(width: 1 | 2 | 3 | 4 = 1, height: 1 | 2 | 3 | 4 = 1): this {
    const w = Math.min(Math.max(width - 1, 0), 7)
    const h = Math.min(Math.max(height - 1, 0), 7)
    const n = (w << 4) | h
    this.buffer.push(0x1d, 0x21, n)
    return this
  }

  /**
   * Append raw text string encoded as ASCII/Latin-1
   */
  text(str: string): this {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      this.buffer.push(code <= 0xff ? code : 0x3f) // fallback to '?' for unsupported high code points
    }
    return this
  }

  /**
   * Append text with a trailing newline
   */
  textLine(str: string = ''): this {
    this.text(str)
    this.feed(1)
    return this
  }

  /**
   * Append line feeds (LF)
   */
  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a)
    }
    return this
  }

  /**
   * Append horizontal separator line
   */
  separator(char: string = '-'): this {
    const line = char.repeat(this.columnWidth)
    this.textLine(line)
    return this
  }

  /**
   * Two-column justification (e.g., "Item Name ............ $12.50")
   */
  twoColumns(left: string, right: string, padChar: string = ' '): this {
    const maxLeftLen = this.columnWidth - right.length - 1
    const safeLeft = left.length > maxLeftLen ? left.substring(0, maxLeftLen) : left
    const paddingCount = Math.max(1, this.columnWidth - safeLeft.length - right.length)
    const line = safeLeft + padChar.repeat(paddingCount) + right
    this.textLine(line)
    return this
  }

  /**
   * Cut paper command (GS V m n)
   * full: true for full cut, false for partial cut
   */
  cut(full: boolean = false): this {
    this.feed(3)
    this.buffer.push(0x1d, 0x56, full ? 0x00 : 0x01)
    return this
  }

  /**
   * Kick cash drawer pulse (ESC p m t1 t2)
   * pin: 2 (Drawer 1) or 5 (Drawer 2)
   */
  kickDrawer(pin: 2 | 5 = 2): this {
    const m = pin === 5 ? 1 : 0
    this.buffer.push(0x1b, 0x70, m, 0x19, 0xfa)
    return this
  }

  /**
   * Sound kitchen ticket buzzer / chime (ESC BEL)
   */
  beep(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x07) // ASCII Bell
    }
    return this
  }

  /**
   * Compile buffer into Uint8Array
   */
  build(): Uint8Array {
    return new Uint8Array(this.buffer)
  }

  /**
   * Compile buffer into Hex string for network TCP transport or debugging
   */
  toHexString(): string {
    return Array.from(this.build())
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
  }
}

/**
 * Format cents integer into USD currency string
 */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Build 80mm Customer Guest Receipt in ESC/POS format
 */
export function buildCustomerReceipt(data: ESCPOSReceiptData, columnWidth: number = 42): Uint8Array {
  const b = new ESCPOSBuilder(columnWidth)

  // 1. Restaurant Header
  b.align('center').size(2, 2).bold(true).textLine(data.restaurantName)
  b.size(1, 1).bold(false)

  if (data.restaurantAddress) {
    b.textLine(data.restaurantAddress)
  }
  if (data.restaurantPhone) {
    b.textLine(data.restaurantPhone)
  }

  b.feed(1)
  b.separator('=')

  // 2. Order Metadata
  b.align('left')
  b.twoColumns(`Check: #${data.orderNumber}`, data.orderType === 'dine_in' ? `Table: ${data.tableName || 'N/A'}` : 'TAKEOUT')
  if (data.serverName) {
    b.twoColumns(`Server: ${data.serverName}`, new Date(data.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  } else {
    b.textLine(`Date: ${new Date(data.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`)
  }
  b.separator('-')

  // 3. Items List
  b.twoColumns('QTY ITEM', 'AMOUNT')
  b.separator('-')

  for (const item of data.items) {
    const itemTotal = item.priceCents * item.quantity
    b.twoColumns(`${item.quantity}x ${item.name}`, formatCents(itemTotal))

    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        const modPrice = mod.priceCents ? `+${formatCents(mod.priceCents)}` : ''
        b.twoColumns(`   + ${mod.name}`, modPrice)
      }
    }

    if (item.specialInstructions) {
      b.textLine(`   * Note: ${item.specialInstructions}`)
    }
  }

  b.separator('-')

  // 4. Totals
  b.twoColumns('Subtotal', formatCents(data.subtotalCents))
  b.twoColumns('Tax', formatCents(data.taxCents))

  if (data.tipCents && data.tipCents > 0) {
    b.twoColumns('Tip', formatCents(data.tipCents))
  }

  b.bold(true).size(1, 2)
  b.twoColumns('TOTAL', formatCents(data.totalCents))
  b.size(1, 1).bold(false)

  // 5. Payment Details
  if (data.payments && data.payments.length > 0) {
    b.separator('-')
    for (const p of data.payments) {
      b.twoColumns(`Paid: ${p.method.toUpperCase()}${p.reference ? ` (${p.reference})` : ''}`, formatCents(p.amountCents))
    }
  }

  // 6. Tip Suggestion Guide
  const subtotal = data.subtotalCents
  b.separator('-')
  b.align('center').textLine('Suggested Gratuity Guide')
  b.align('left')
  b.twoColumns('18%', formatCents(Math.round(subtotal * 0.18)))
  b.twoColumns('20%', formatCents(Math.round(subtotal * 0.20)))
  b.twoColumns('22%', formatCents(Math.round(subtotal * 0.22)))

  // 7. Footer
  b.separator('=')
  b.align('center')
  b.textLine(data.footerMessage || 'Thank you for dining with us!')
  b.textLine('Powered by Openfront POS')

  // Cut paper
  b.cut(false)

  return b.build()
}

/**
 * Build 80mm Kitchen Prep / Line Cook Ticket in ESC/POS format
 */
export function buildKitchenTicket(data: ESCPOSKitchenTicketData, columnWidth: number = 42): Uint8Array {
  const b = new ESCPOSBuilder(columnWidth)

  // Alert buzzer for urgent/rush tickets
  if (data.isUrgent) {
    b.beep(2)
  }

  // 1. Station & Table Header
  b.align('center')
  if (data.isUrgent) {
    b.invert(true).bold(true).size(2, 2).textLine(' *** RUSH ORDER *** ').size(1, 1).invert(false).bold(false)
  }

  if (data.stationName) {
    b.bold(true).size(2, 1).textLine(`STATION: ${data.stationName.toUpperCase()}`).size(1, 1).bold(false)
  }

  b.separator('=')

  // Large Table / Order header for cooks
  b.align('left').bold(true).size(2, 2)
  if (data.orderType === 'dine_in') {
    b.textLine(`TABLE: ${data.tableName || 'N/A'}`)
  } else {
    b.textLine('TAKEOUT')
  }

  b.size(1, 1).bold(false)
  b.twoColumns(`Order: #${data.ticketNumber || data.orderNumber}`, `Guests: ${data.guestCount || 1}`)
  if (data.serverName) {
    b.twoColumns(`Server: ${data.serverName}`, new Date(data.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }

  b.separator('=')

  // 2. Kitchen Items with Courses & Seat Routing
  let currentCourse = -1
  for (const item of data.items) {
    if (item.courseNumber && item.courseNumber !== currentCourse) {
      currentCourse = item.courseNumber
      b.bold(true).textLine(`--- COURSE ${currentCourse} ---`).bold(false)
    }

    const seatTag = item.seatNumber ? `[S${item.seatNumber}] ` : ''
    b.bold(true).size(1, 2)
    b.textLine(`${seatTag}${item.quantity}x ${item.name}`)
    b.size(1, 1).bold(false)

    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        b.textLine(`   >> ${mod.name}`)
      }
    }

    if (item.specialInstructions) {
      b.invert(true).textLine(`   NOTE: ${item.specialInstructions} `).invert(false)
    }
  }

  if (data.specialInstructions) {
    b.separator('-')
    b.invert(true).bold(true).textLine(` TICKET NOTE: ${data.specialInstructions} `).bold(false).invert(false)
  }

  b.separator('=')
  b.align('center')
  b.textLine(`Sent: ${new Date(data.createdAt).toLocaleTimeString()}`)

  // Cut paper
  b.cut(false)

  return b.build()
}

/**
 * Generate Cash Drawer Kick command buffer
 */
export function buildCashDrawerKick(pin: 2 | 5 = 2): Uint8Array {
  const b = new ESCPOSBuilder()
  b.kickDrawer(pin)
  return b.build()
}
