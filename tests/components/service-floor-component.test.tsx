import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ServiceFloorClient } from '@/features/platform/service-floor/screens/ServiceFloorClient'
import * as graphqlRequest from 'graphql-request'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock('@/features/dashboard/components/PageBreadcrumbs', () => ({
  PageBreadcrumbs: () => <div data-testid="page-breadcrumbs" />,
}))

vi.mock('graphql-request', () => ({
  request: vi.fn(),
  gql: (strings: TemplateStringsArray) => strings.join(''),
}))

describe('Stage 3: Service Floor & Real-Time Table Management (Component Tests)', () => {
  const mockTables = [
    {
      id: 'table-1',
      tableNumber: '101',
      capacity: 4,
      status: 'occupied',
      shape: 'round',
      section: { id: 'sec-main', name: 'Main Dining' },
      floor: { id: 'fl-1', name: 'Level 1' },
    },
    {
      id: 'table-2',
      tableNumber: '102',
      capacity: 2,
      status: 'available',
      shape: 'square',
      section: { id: 'sec-main', name: 'Main Dining' },
      floor: { id: 'fl-1', name: 'Level 1' },
    },
    {
      id: 'table-3',
      tableNumber: '103',
      capacity: 6,
      status: 'cleaning',
      shape: 'rectangle',
      section: { id: 'sec-patio', name: 'Patio' },
      floor: { id: 'fl-1', name: 'Level 1' },
    },
    {
      id: 'table-4',
      tableNumber: '104',
      capacity: 4,
      status: 'reserved',
      shape: 'rectangle',
      section: { id: 'sec-patio', name: 'Patio' },
      floor: { id: 'fl-1', name: 'Level 1' },
    },
  ]

  const mockOrders = [
    {
      id: 'order-101',
      orderNumber: '20261001-0101',
      status: 'sent_to_kitchen',
      total: 95.0,
      guestCount: 3,
      createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35m ago
      tables: [{ id: 'table-1', tableNumber: '101' }],
      courses: [
        {
          id: 'course-1',
          courseType: 'appetizers',
          courseNumber: 1,
          status: 'fired',
          onHold: false,
        },
      ],
      orderItems: [
        {
          id: 'item-1',
          quantity: 2,
          price: 25.0,
          seatNumber: 1,
          courseNumber: 1,
          specialInstructions: 'Extra sauce',
          itemNameSnapshot: 'Crispy Calamari',
          modifiersSnapshot: [],
          menuItem: { id: 'm-1', name: 'Crispy Calamari' },
        },
      ],
      payments: [],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(graphqlRequest.request as any).mockImplementation((_url: string, query: string, variables?: any) => {
      if (query.includes('updateServiceFloorTableStatus')) {
        return Promise.resolve({
          updateServiceFloorTableStatus: { success: true, error: null },
        })
      }
      if (query.includes('transferTable')) {
        return Promise.resolve({
          transferTable: { success: true, error: null },
        })
      }
      return Promise.resolve({
        tables: mockTables,
        restaurantOrders: mockOrders,
        menuItems: [
          {
            id: 'm-1',
            name: 'Crispy Calamari',
            price: 25.0,
            available: true,
            modifiers: [],
          },
        ],
        storeSettings: {
          currencyCode: 'USD',
          locale: 'en-US',
          taxRate: 0.08,
        },
      })
    })
  })

  it('renders service floor stat strip and table cards with turn time and capacity', async () => {
    render(<ServiceFloorClient />)

    await waitFor(() => {
      expect(screen.getByText('Service Floor')).toBeInTheDocument()
      expect(screen.getByText('Table 101')).toBeInTheDocument()
      expect(screen.getByText('Table 102')).toBeInTheDocument()
      expect(screen.getByText('Table 103')).toBeInTheDocument()
    })

    // Check stat strip numbers
    expect(screen.getAllByText('4')[0]).toBeInTheDocument() // Total tables

    // Table 101 has active order with turn-time ~35m
    expect(screen.getByText('#20261001-0101')).toBeInTheDocument()
    expect(screen.getByText(/35m/)).toBeInTheDocument()
    expect(screen.getByText(/3 guests/)).toBeInTheDocument()
  })

  it('renders quick Mark Clean button for cleaning table and updates status', async () => {
    render(<ServiceFloorClient />)

    await waitFor(() => {
      expect(screen.getByText('Table 103')).toBeInTheDocument()
    })

    // Find the Mark Clean button for Table 103
    const markCleanBtn = screen.getByRole('button', { name: /Mark Clean/i })
    expect(markCleanBtn).toBeInTheDocument()

    fireEvent.click(markCleanBtn)

    await waitFor(() => {
      expect(graphqlRequest.request).toHaveBeenCalledWith(
        '/api/graphql',
        expect.stringContaining('updateServiceFloorTableStatus'),
        expect.objectContaining({
          tableId: 'table-3',
          status: 'available',
        })
      )
    })
  })

  it('opens table sheet and opens transfer table dialog to transfer check to an available table', async () => {
    render(<ServiceFloorClient />)

    await waitFor(() => {
      expect(screen.getByText('Table 101')).toBeInTheDocument()
    })

    // Click on Table 101 card to open sheet
    fireEvent.click(screen.getByText('Table 101'))

    // Sheet displays table details and Transfer Table button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Transfer Table Check/i })).toBeInTheDocument()
    })

    // Click Transfer Table button
    fireEvent.click(screen.getByRole('button', { name: /Transfer Table Check/i }))

    // Transfer Table dialog opens
    await waitFor(() => {
      expect(screen.getByText(/Transfer Check from Table 101/i)).toBeInTheDocument()
    })

    // Confirm button is present
    const confirmBtn = screen.getByRole('button', { name: /Confirm Transfer/i })
    expect(confirmBtn).toBeInTheDocument()
  })

  it('toggles between Floor Plan and Service Lanes and allows Arrange Tables mode', async () => {
    render(<ServiceFloorClient />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Floor Plan/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Service Lanes/i })).toBeInTheDocument()
    })

    // Click Arrange Tables button on Floor Plan
    const arrangeBtn = screen.getByRole('button', { name: /Arrange Tables/i })
    expect(arrangeBtn).toBeInTheDocument()
    fireEvent.click(arrangeBtn)

    // Auto-Arrange and Save Layout buttons become available
    expect(screen.getByRole('button', { name: /Auto-Arrange/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save Layout/i })).toBeInTheDocument()

    // Switch to Service Lanes / Kanban view
    fireEvent.click(screen.getByRole('button', { name: /Service Lanes/i }))
    await waitFor(() => {
      expect(screen.getAllByText(/Available/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/Occupied/i).length).toBeGreaterThanOrEqual(1)
    })
  })
})

