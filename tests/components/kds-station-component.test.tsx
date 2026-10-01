import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KDSClient, type KdsTicket } from '@/features/platform/kds/screens/KDSClient'
import * as graphqlRequest from 'graphql-request'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('station=bar'),
}))

vi.mock('graphql-request', () => ({
  request: vi.fn(),
  gql: (strings: TemplateStringsArray) => strings.join(''),
}))

describe('Stage 1: Multi-Station KDS Routing - Component Tests', () => {
  const mockTickets: KdsTicket[] = [
    {
      id: 'ticket-101',
      status: 'in_progress',
      priority: 0,
      firedAt: new Date().toISOString(),
      station: { id: 'bar', name: 'Bar' },
      ticketType: 'prep',
      order: {
        id: 'order-1',
        orderNumber: '20261001-0001',
        orderType: 'dine_in',
        guestCount: 2,
        isUrgent: false,
        onHold: false,
        createdAt: new Date().toISOString(),
        tables: [{ id: 'table-1', tableNumber: '12' }],
      },
      items: [
        {
          id: 'item-bar-1',
          name: 'Draft IPA Beer',
          quantity: 2,
          notes: 'Chilled glass',
          station: 'bar',
          status: 'new',
        },
        {
          id: 'item-hot-1',
          name: 'Ribeye Steak',
          quantity: 1,
          notes: 'Medium rare',
          station: 'hot_line',
          status: 'in_progress',
        },
      ],
    },
    {
      id: 'ticket-102',
      status: 'new',
      priority: 0,
      firedAt: new Date().toISOString(),
      station: { id: 'hot_line', name: 'Hot Line' },
      ticketType: 'prep',
      order: {
        id: 'order-2',
        orderNumber: '20261001-0002',
        orderType: 'takeout',
        guestCount: 1,
        isUrgent: false,
        onHold: false,
        createdAt: new Date().toISOString(),
        tables: [],
      },
      items: [
        {
          id: 'item-hot-2',
          name: 'Cheeseburger',
          quantity: 1,
          notes: 'No onions',
          station: 'hot_line',
          status: 'new',
        },
      ],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(graphqlRequest.request as any).mockImplementation((_url: string, query: string) => {
      if (typeof query === 'string' && query.includes('GetKdsData')) {
        return Promise.resolve({
          kitchenStations: [
            { id: 'bar', name: 'Bar', displayOrder: 1 },
            { id: 'hot_line', name: 'Hot Line', displayOrder: 2 },
            { id: 'expo', name: 'Expo', displayOrder: 3 },
          ],
          kitchenTickets: mockTickets,
        })
      }
      if (typeof query === 'string' && query.includes('FulfillKitchenTicketItem')) {
        return Promise.resolve({
          fulfillKitchenTicketItem: { success: true, error: null },
        })
      }
      return Promise.resolve({})
    })
  })

  it('renders /kds?station=bar hiding non-bar items from line cooks', async () => {
    render(<KDSClient initialStation="bar" />)

    // Wait for tickets to load
    await waitFor(() => {
      expect(screen.getByText('Table 12')).toBeInTheDocument()
    })

    // Bar items must be visible
    expect(screen.getByText(/Draft IPA Beer/)).toBeInTheDocument()

    // Non-bar item (Ribeye Steak on hot_line) on the same ticket must be HIDDEN for bar line cooks!
    expect(screen.queryByText(/Ribeye Steak/)).not.toBeInTheDocument()

    // Ticket 102 (Cheeseburger only on hot_line) must not appear in the bar queue
    expect(screen.queryByText(/Cheeseburger/)).not.toBeInTheDocument()
  })

  it('marks item-level fulfillment without closing the entire order prematurely', async () => {
    render(<KDSClient initialStation="bar" />)

    await waitFor(() => {
      expect(screen.getByText(/Draft IPA Beer/)).toBeInTheDocument()
    })

    const barItemButton = screen.getByTestId('kds-item-item-bar-1')
    expect(barItemButton).toBeInTheDocument()
    expect(barItemButton).toHaveTextContent('Mark Done')

    // Click to fulfill item
    fireEvent.click(barItemButton)

    // Verify fulfillKitchenTicketItem mutation was dispatched
    await waitFor(() => {
      expect(graphqlRequest.request).toHaveBeenCalledWith(
        '/api/graphql',
        expect.anything(),
        expect.objectContaining({
          ticketId: 'ticket-101',
          itemId: 'item-bar-1',
          fulfilled: true,
        })
      )
    })

    // Verify optimistic item fulfillment: button reflects done
    await waitFor(() => {
      expect(barItemButton).toHaveTextContent('Done')
    })

    // CRITICAL: Order ticket must STILL be present on KDS screen (not prematurely removed or closed!)
    expect(screen.getByTestId('kds-ticket-ticket-101')).toBeInTheDocument()
    expect(screen.getByText('Table 12')).toBeInTheDocument()
  })

  it('renders expo station with consolidated tickets, station tags, and item prep statuses', async () => {
    render(<KDSClient initialStation="expo" />)

    await waitFor(() => {
      expect(screen.getByText('Table 12')).toBeInTheDocument()
    })

    // Expo station sees CONSOLIDATED order: BOTH bar item AND hot_line item are visible!
    expect(screen.getByText(/Draft IPA Beer/)).toBeInTheDocument()
    expect(screen.getByText(/Ribeye Steak/)).toBeInTheDocument()

    // Expo sees station indicators for each item
    expect(screen.getByTestId('item-station-tag-item-bar-1')).toHaveTextContent('bar')
    expect(screen.getByTestId('item-station-tag-item-hot-1')).toHaveTextContent('hot line')

    // Expo sees prep status indicators per item
    expect(screen.getByTestId('item-status-tag-item-bar-1')).toBeInTheDocument()
    expect(screen.getByTestId('item-status-tag-item-hot-1')).toBeInTheDocument()
  })

  it('allows switching stations dynamically via station tabs', async () => {
    render(<KDSClient initialStation="bar" />)

    await waitFor(() => {
      expect(screen.getByText(/Draft IPA Beer/)).toBeInTheDocument()
    })

    // Hot line items are hidden initially
    expect(screen.queryByText(/Cheeseburger/)).not.toBeInTheDocument()

    // Click Hot Line tab
    const hotLineTab = screen.getByTestId('station-tab-hot_line')
    fireEvent.click(hotLineTab)

    // Now hot line items must be visible and bar item hidden
    await waitFor(() => {
      expect(screen.getByText(/Cheeseburger/)).toBeInTheDocument()
      expect(screen.getByText(/Ribeye Steak/)).toBeInTheDocument()
      expect(screen.queryByText(/Draft IPA Beer/)).not.toBeInTheDocument()
    })
  })
})
