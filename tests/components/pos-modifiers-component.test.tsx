import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { POSClient } from '@/features/platform/pos/screens/POSClient'
import { KDSClient } from '@/features/platform/kds/screens/KDSClient'
import * as graphqlRequest from 'graphql-request'

vi.mock('graphql-request', () => ({
  gql: (strings: TemplateStringsArray) => strings.join(''),
  request: vi.fn(),
}))

vi.mock('@/features/dashboard/components/PageBreadcrumbs', () => ({
  PageBreadcrumbs: () => <div data-testid="page-breadcrumbs" />,
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (param: string) => (param === 'station' ? null : null),
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))

describe('Stage 4: Advanced Modifiers & POS/KDS Workflows (Component Tests)', () => {
  const mockPOSData = {
    tables: [
      { id: 'tbl-1', tableNumber: '1', capacity: 2, status: 'available' },
    ],
    menuCategories: [
      { id: 'cat-food', name: 'Food' },
    ],
    menuItems: [
      {
        id: 'item-burger',
        name: 'Artisan Wagyu Burger',
        price: '1850', // $18.50
        available: true,
        thumbnail: null,
        station: 'hot_line',
        category: { id: 'cat-food', name: 'Food' },
        modifiers: [
          {
            id: 'mod-temp-mr',
            name: 'Medium Rare',
            modifierGroup: 'temperature',
            modifierGroupLabel: 'Burger Temp',
            required: true,
            minSelections: 1,
            maxSelections: 1,
            priceAdjustment: '0',
            defaultSelected: false,
          },
          {
            id: 'mod-temp-m',
            name: 'Medium',
            modifierGroup: 'temperature',
            modifierGroupLabel: 'Burger Temp',
            required: true,
            minSelections: 1,
            maxSelections: 1,
            priceAdjustment: '0',
            defaultSelected: false,
          },
          {
            id: 'mod-bacon',
            name: 'Applewood Bacon',
            modifierGroup: 'addons',
            modifierGroupLabel: 'Extra Toppings',
            required: false,
            minSelections: 0,
            maxSelections: 3,
            priceAdjustment: '200', // +$2.00
            defaultSelected: false,
          },
          {
            id: 'mod-no-onion',
            name: 'NO Onions',
            modifierGroup: 'removals',
            modifierGroupLabel: 'Removals',
            required: false,
            minSelections: 0,
            maxSelections: 2,
            priceAdjustment: '0',
            defaultSelected: false,
          },
        ],
      },
    ],
    storeSettings: {
      taxRate: '8.25',
      currencyCode: 'USD',
      locale: 'en-US',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(graphqlRequest.request).mockImplementation(async (_url: any, query: any) => {
      if (typeof query === 'string' && query.includes('GetPOSData')) {
        return mockPOSData
      }
      return {}
    })
  })

  it('opens modifier modal when clicking an item with modifiers', async () => {
    render(<POSClient />)

    await waitFor(() => {
      expect(screen.getByText('Artisan Wagyu Burger')).toBeInTheDocument()
    })

    // Click burger to open modifier dialog
    fireEvent.click(screen.getByText('Artisan Wagyu Burger'))

    await waitFor(() => {
      expect(screen.getByText('Customize Artisan Wagyu Burger')).toBeInTheDocument()
      expect(screen.getByText('Burger Temp')).toBeInTheDocument()
      expect(screen.getByText('Extra Toppings')).toBeInTheDocument()
      expect(screen.getByText('Removals')).toBeInTheDocument()
    })
  })

  it('enforces required modifier groups and blocks add until satisfied', async () => {
    render(<POSClient />)

    await waitFor(() => {
      expect(screen.getByText('Artisan Wagyu Burger')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Artisan Wagyu Burger'))

    await waitFor(() => {
      expect(screen.getByText('Customize Artisan Wagyu Burger')).toBeInTheDocument()
    })

    // Attempt to click Add item without selecting required temp
    const addBtn = screen.getByRole('button', { name: /Add to Check/i })
    fireEvent.click(addBtn)

    await waitFor(() => {
      expect(screen.getByText(/Select at least 1 option/i)).toBeInTheDocument()
    })

    // Now select Medium Rare
    fireEvent.click(screen.getByText('Medium Rare'))

    // Validation error should disappear on selection
    await waitFor(() => {
      expect(screen.queryByText(/Select at least 1 option/i)).not.toBeInTheDocument()
    })

    // Now click Add to Check
    fireEvent.click(screen.getByRole('button', { name: /Add to Check/i }))

    // Dialog closes and item appears in cart with modifier
    await waitFor(() => {
      expect(screen.queryByText('Customize Artisan Wagyu Burger')).not.toBeInTheDocument()
      expect(screen.getByText(/Medium Rare/)).toBeInTheDocument()
    })
  })

  it('swaps single-selection radio options smoothly and recalculates price', async () => {
    render(<POSClient />)

    await waitFor(() => {
      expect(screen.getByText('Artisan Wagyu Burger')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Artisan Wagyu Burger'))

    await waitFor(() => {
      expect(screen.getByText('Customize Artisan Wagyu Burger')).toBeInTheDocument()
    })

    // Select Medium Rare
    fireEvent.click(screen.getByText('Medium Rare'))

    // Add Bacon (+$2.00)
    fireEvent.click(screen.getByText('Applewood Bacon'))

    // Also test quick instruction chip +ALLERGY
    fireEvent.click(screen.getByRole('button', { name: '+ALLERGY' }))

    const instructionsInput = screen.getByPlaceholderText(/Allergy notes/i) as HTMLTextAreaElement
    expect(instructionsInput.value).toContain('ALLERGY')

    // Add item to cart
    fireEvent.click(screen.getByRole('button', { name: /Add to Check/i }))

    await waitFor(() => {
      // In cart: Burger with bacon and Medium Rare
      expect(screen.getByText(/Medium Rare, Applewood Bacon/)).toBeInTheDocument()
      // Subtotal and item price $20.50 ($18.50 + $2.00)
      expect(screen.getAllByText('$20.50').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders modifiers with Toast-style visual badges on KDS client tickets', async () => {
    const mockKdsData = {
      kitchenStations: [
        { id: 'st-hot', name: 'Hot Line', displayOrder: 1 },
      ],
      kitchenTickets: [
        {
          id: 'tkt-1',
          status: 'new',
          priority: 0,
          ticketType: 'prep',
          firedAt: new Date().toISOString(),
          station: { id: 'st-hot', name: 'Hot Line' },
          order: {
            id: 'ord-1',
            orderNumber: '20261002-001',
            orderType: 'dine_in',
            guestCount: 2,
            isUrgent: false,
            onHold: false,
            createdAt: new Date().toISOString(),
            tables: [{ id: 'tbl-1', tableNumber: '4' }],
            courses: [],
          },
          items: [
            {
              id: 'item-1',
              name: 'Artisan Wagyu Burger',
              quantity: 1,
              notes: 'Gluten allergy',
              station: 'hot_line',
              status: 'new',
              courseNumber: 2,
              modifiers: [
                { name: 'Medium Rare', action: 'standard' },
                { name: 'Onions', action: 'no' },
                { name: 'Truffle Fries', action: 'sub', priceAdjustment: 250 },
              ],
            },
          ],
        },
      ],
    }

    vi.mocked(graphqlRequest.request).mockImplementation(async (_url: any, query: any) => {
      if (typeof query === 'string' && query.includes('GetKdsData')) {
        return mockKdsData
      }
      return {}
    })

    render(<KDSClient />)

    await waitFor(() => {
      expect(screen.getByText(/Artisan Wagyu Burger/)).toBeInTheDocument()
    })

    // Check that modifiers are rendered on the ticket
    expect(screen.getByText('Medium Rare')).toBeInTheDocument()
    expect(screen.getByText('NO Onions')).toBeInTheDocument()
    expect(screen.getByText('SUB Truffle Fries (+$2.50)')).toBeInTheDocument()
    expect(screen.getByText('Gluten allergy')).toBeInTheDocument()
  })
})
