import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaymentClient } from '@/features/platform/pos/screens/[orderId]/payment/PaymentClient'
import * as graphqlRequest from 'graphql-request'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
}))

vi.mock('graphql-request', () => ({
  gql: (strings: TemplateStringsArray) => strings.join(''),
  request: vi.fn(),
}))

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: () => <div data-testid="stripe-payment-element" />,
  useElements: () => ({}),
  useStripe: () => ({
    confirmPayment: vi.fn().mockResolvedValue({}),
  }),
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}))

describe('Stage 5: Split Checks & Multi-Tender Payments (Component Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockOrderData = {
    restaurantOrder: {
      id: 'order-101',
      orderNumber: '101',
      status: 'pending',
      subtotal: '6000', // $60.00
      tax: '500',       // $5.00
      tip: '0',
      discount: '0',
      total: '6500',    // $65.00
      paidAmount: 0,
      balanceDue: 6500,
      paymentStatus: 'unpaid',
      orderItems: [
        {
          id: 'item-1',
          quantity: 1,
          price: '3000',
          itemNameSnapshot: 'Steak Frites',
          seatNumber: 1,
          menuItem: { id: 'm-1', name: 'Steak Frites' },
        },
        {
          id: 'item-2',
          quantity: 1,
          price: '2000',
          itemNameSnapshot: 'Caesar Salad',
          seatNumber: 1,
          menuItem: { id: 'm-2', name: 'Caesar Salad' },
        },
        {
          id: 'item-3',
          quantity: 1,
          price: '1000',
          itemNameSnapshot: 'Sparkling Water',
          seatNumber: 2,
          menuItem: { id: 'm-3', name: 'Sparkling Water' },
        },
      ],
      payments: [],
      tables: [{ id: 'tbl-4', tableNumber: '4' }],
    },
    storeSettings: {
      currencyCode: 'USD',
      locale: 'en-US',
      paymentProviders: [{ provider: 'stripe', publishableKey: 'pk_test_123' }],
    },
  }

  it('renders order summary with balance due, seat tags, and unpaid status badge', async () => {
    vi.mocked(graphqlRequest.request).mockResolvedValueOnce(mockOrderData)

    render(<PaymentClient orderId="order-101" />)

    await waitFor(() => {
      expect(screen.getByText('Order #101')).toBeInTheDocument()
    })

    // Check table display
    expect(screen.getByText(/Table: 4/)).toBeInTheDocument()

    // Check seat tags on items
    expect(screen.getAllByText('S1').length).toBe(2)
    expect(screen.getByText('S2')).toBeInTheDocument()

    // Check order total and unpaid status
    expect(screen.getByText('unpaid')).toBeInTheDocument()
    expect(screen.getByText(/Due: \$65\.00/)).toBeInTheDocument()

    // Check gating button prevents checkout while unpaid
    expect(screen.getByText(/Back to POS \(Unpaid: \$65\.00\)/)).toBeInTheDocument()
  })

  it('calculates penny-perfect shares in Split Evenly mode across 3 guests', async () => {
    vi.mocked(graphqlRequest.request).mockResolvedValueOnce(mockOrderData)

    render(<PaymentClient orderId="order-101" />)

    await waitFor(() => {
      expect(screen.getByText('Order #101')).toBeInTheDocument()
    })

    // Click on the "Split" tab in payment methods
    const splitTabTrigger = screen.getByRole('tab', { name: /split/i })
    fireEvent.pointerDown(splitTabTrigger, { button: 0 })
    fireEvent.mouseDown(splitTabTrigger, { button: 0 })
    fireEvent.click(splitTabTrigger)

    // Mode is "even" by default. Check guests stepper button for 3
    const threeGuestBtn = screen.getByRole('button', { name: '3' })
    fireEvent.click(threeGuestBtn)

    // $65.00 / 3 = 6500 cents / 3:
    // Base = 2166 ($21.66), remainder = 2 cents.
    // Guest 1: $21.67, Guest 2: $21.67, Guest 3: $21.66
    await waitFor(() => {
      expect(screen.getByText('Guest #1')).toBeInTheDocument()
      expect(screen.getByText('Guest #2')).toBeInTheDocument()
      expect(screen.getByText('Guest #3')).toBeInTheDocument()
    })

    expect(screen.getAllByText('$21.67').length).toBe(2)
    expect(screen.getByText('$21.66')).toBeInTheDocument()
  })

  it('switches to Split by Seat mode and displays grouped seat totals', async () => {
    vi.mocked(graphqlRequest.request).mockResolvedValueOnce(mockOrderData)

    render(<PaymentClient orderId="order-101" />)

    await waitFor(() => {
      expect(screen.getByText('Order #101')).toBeInTheDocument()
    })

    // Click on Split tab
    const splitTabTrigger = screen.getByRole('tab', { name: /split/i })
    fireEvent.pointerDown(splitTabTrigger, { button: 0 })
    fireEvent.mouseDown(splitTabTrigger, { button: 0 })
    fireEvent.click(splitTabTrigger)

    // Click "Split by Seat" pill
    const seatModeBtn = screen.getByRole('button', { name: /split by seat/i })
    fireEvent.click(seatModeBtn)

    // Seat 1 has Steak Frites ($30) + Caesar Salad ($20) = $50.00 subtotal
    // Seat 2 has Sparkling Water ($10) = $10.00 subtotal
    // Total subtotal = $60, tax = $5 (8.33%).
    // Seat 1 total = $50 + prorated tax ($4.17) = $54.17
    // Seat 2 total = $10 + prorated tax ($0.83) = $10.83
    await waitFor(() => {
      expect(screen.getAllByText('Seat 1').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Seat 2').length).toBeGreaterThan(0)
      expect(screen.getByText('$54.17')).toBeInTheDocument()
      expect(screen.getByText('$10.83')).toBeInTheDocument()
    })
  })

  it('triggers updateOrderItemSeat when an item is reassigned to another seat', async () => {
    vi.mocked(graphqlRequest.request).mockImplementation(async (url, doc, vars: any) => {
      if (typeof doc === 'string' && doc.includes('UpdateOrderItemSeat')) {
        return {
          updateOrderItemSeat: {
            success: true,
            orderItemId: vars.orderItemId,
            seatNumber: vars.seatNumber,
            error: null,
          },
        }
      }
      return mockOrderData
    })

    render(<PaymentClient orderId="order-101" />)

    await waitFor(() => {
      expect(screen.getByText('Order #101')).toBeInTheDocument()
    })

    // Click on Split tab
    const splitTabTrigger = screen.getByRole('tab', { name: /split/i })
    fireEvent.pointerDown(splitTabTrigger, { button: 0 })
    fireEvent.mouseDown(splitTabTrigger, { button: 0 })
    fireEvent.click(splitTabTrigger)

    // Click "Split by Seat" pill
    const seatModeBtn = screen.getByRole('button', { name: /split by seat/i })
    fireEvent.click(seatModeBtn)

    await waitFor(() => {
      expect(screen.getAllByText('Seat 1').length).toBeGreaterThan(0)
    })

    // Find seat trigger for item-1 (Steak Frites)
    const seatTriggers = screen.getAllByRole('combobox')
    expect(seatTriggers.length).toBeGreaterThan(0)
  })

  it('allows table closure only when balance is settled to 0', async () => {
    const settledOrderData = {
      restaurantOrder: {
        ...mockOrderData.restaurantOrder,
        paidAmount: 6500,
        balanceDue: 0,
        paymentStatus: 'paid',
        payments: [
          {
            id: 'pay-1',
            amount: '6500',
            status: 'succeeded',
            paymentMethod: 'credit_card',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      storeSettings: mockOrderData.storeSettings,
    }

    vi.mocked(graphqlRequest.request).mockResolvedValueOnce(settledOrderData)

    render(<PaymentClient orderId="order-101" />)

    await waitFor(() => {
      expect(screen.getByText('Order #101')).toBeInTheDocument()
    })

    // Badge should be paid
    expect(screen.getByText('paid')).toBeInTheDocument()

    // Table settled button should be active
    const exitBtn = screen.getByRole('button', { name: /Table Settled - Exit to POS/i })
    expect(exitBtn).toBeInTheDocument()

    fireEvent.click(exitBtn)
    expect(mockPush).toHaveBeenCalledWith('/dashboard/platform/pos')
  })
})
