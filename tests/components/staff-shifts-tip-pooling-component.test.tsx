import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TimeClockModal } from '@/features/platform/staff/components/TimeClockModal'
import { TipsPage } from '@/features/platform/staff/screens/TipsPage'
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

function getQueryString(query: any): string {
  if (typeof query === 'string') return query
  if (query && typeof query === 'object') {
    if (query.loc?.source?.body) return query.loc.source.body
    return JSON.stringify(query)
  }
  return String(query)
}

describe('Stage 6: Tip Pooling, Staff Shifts & Time Clock Tracking (Component Tests)', () => {
  const mockStaffUsers = [
    { id: 'usr-1', name: 'Alice Server', email: 'alice@restaurant.com', staffRole: 'server', hourlyRate: '15.50' },
    { id: 'usr-2', name: 'Bob Bartender', email: 'bob@restaurant.com', staffRole: 'bartender', hourlyRate: '18.00' },
    { id: 'usr-3', name: 'Charlie Manager', email: 'charlie@restaurant.com', staffRole: 'manager', hourlyRate: '25.00' },
  ]

  let currentActiveShifts = [
    {
      id: 'shift-101',
      role: 'server',
      status: 'started',
      hourlyRate: '15.50',
      clockIn: new Date(Date.now() - 3600000).toISOString(),
      clockOut: null,
      notes: '',
      staff: { id: 'usr-1', name: 'Alice Server' },
    },
  ]

  const mockTipPools = [
    {
      id: 'pool-1',
      date: '2026-10-01T00:00:00.000Z',
      tipPoolType: 'pool_by_points',
      totalTips: '240.00',
      cashTips: '40.00',
      creditTips: '200.00',
      distributions: [
        { staffId: 'usr-1', staffName: 'Alice Server', role: 'server', hoursWorked: 6, amount: 15000 },
        { staffId: 'usr-2', staffName: 'Bob Bartender', role: 'bartender', hoursWorked: 5, amount: 9000 },
      ],
      status: 'calculated',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    currentActiveShifts = [
      {
        id: 'shift-101',
        role: 'server',
        status: 'started',
        hourlyRate: '15.50',
        clockIn: new Date(Date.now() - 3600000).toISOString(),
        clockOut: null,
        notes: '',
        staff: { id: 'usr-1', name: 'Alice Server' },
      },
    ]

    vi.mocked(graphqlRequest.request).mockImplementation(async (_url: string, query: any, _vars?: any) => {
      const q = getQueryString(query)

      if (q.includes('GetTimeClockData')) {
        return {
          users: mockStaffUsers,
          shifts: currentActiveShifts,
        }
      }
      if (q.includes('ClockInStaff')) {
        currentActiveShifts.push({
          id: 'shift-new',
          role: 'bartender',
          status: 'started',
          hourlyRate: '18.00',
          clockIn: new Date().toISOString(),
          clockOut: null,
          notes: '',
          staff: { id: 'usr-2', name: 'Bob Bartender' },
        })
        return {
          clockInStaff: {
            success: true,
            shiftId: 'shift-new',
            error: null,
          },
        }
      }
      if (q.includes('ToggleStaffBreak')) {
        const target = currentActiveShifts.find((s) => s.id === 'shift-101')
        if (target) target.notes = '[BREAK_STARTED:' + new Date().toISOString() + ']'
        return {
          toggleStaffBreak: {
            success: true,
            isOnBreak: true,
            breakMinutes: 15,
            error: null,
          },
        }
      }
      if (q.includes('ClockOutStaff')) {
        currentActiveShifts = currentActiveShifts.filter((s) => s.id !== 'shift-101')
        return {
          clockOutStaff: {
            success: true,
            hoursWorked: 6.5,
            error: null,
          },
        }
      }
      if (q.includes('GetTipPools')) {
        return {
          tipPools: mockTipPools,
          storeSettings: { currencyCode: 'USD', locale: 'en-US' },
        }
      }
      if (q.includes('GetCompletedShiftsForDate')) {
        return {
          shifts: [
            {
              id: 's-1',
              role: 'server',
              hoursWorked: 8,
              hourlyRate: '16.00',
              staff: { id: 'usr-1', name: 'Alice Server' },
            },
            {
              id: 's-2',
              role: 'bartender',
              hoursWorked: 9,
              hourlyRate: '18.00',
              staff: { id: 'usr-2', name: 'Bob Bartender' },
            },
          ],
        }
      }
      if (q.includes('GetSalesForDate')) {
        return {
          restaurantOrders: [
            { id: 'ord-1', total: '1200.00', tip: '180.00' },
          ],
        }
      }
      if (q.includes('UpdateTipPoolStatus')) {
        return {
          updateTipPoolStatus: {
            success: true,
            error: null,
          },
        }
      }
      if (q.includes('CreateTipPoolLedger')) {
        return {
          createTipPoolLedger: {
            success: true,
            error: null,
          },
        }
      }
      return {}
    })
  })

  describe('TimeClockModal (Toast-Style Punch Clock)', () => {
    it('renders the time clock modal and fetches active roster', async () => {
      render(
        <TimeClockModal
          open={true}
          onOpenChange={vi.fn()}
        />
      )

      expect(screen.getByText(/Staff Time Clock/i)).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getAllByText('Alice Server').length).toBeGreaterThan(0)
        expect(screen.getByText('Bob Bartender')).toBeInTheDocument()
        expect(screen.getByText('Charlie Manager')).toBeInTheDocument()
      })
    })

    it('displays active staff member on-shift status badge', async () => {
      render(
        <TimeClockModal
          open={true}
          onOpenChange={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getAllByText(/On Clock/i).length).toBeGreaterThan(0)
      })
    })

    it('performs clock-in mutation when an off-shift staff member clocks in', async () => {
      const onShiftUpdated = vi.fn()

      render(
        <TimeClockModal
          open={true}
          onOpenChange={vi.fn()}
          onShiftUpdated={onShiftUpdated}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Bob Bartender')).toBeInTheDocument()
      })

      // Select off-shift Bob Bartender
      fireEvent.click(screen.getByText('Bob Bartender'))

      // Clock In button should now be visible
      const clockInBtn = await screen.findByRole('button', { name: /Clock In Now/i })
      expect(clockInBtn).toBeInTheDocument()

      fireEvent.click(clockInBtn)

      await waitFor(() => {
        expect(graphqlRequest.request).toHaveBeenCalledWith(
          '/api/graphql',
          expect.anything(),
          expect.objectContaining({
            staffId: 'usr-2',
          })
        )
      })

      await waitFor(() => {
        expect(onShiftUpdated).toHaveBeenCalled()
      })
    })

    it('triggers break toggle mutation when staff takes a break', async () => {
      render(
        <TimeClockModal
          open={true}
          onOpenChange={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getAllByText('Alice Server').length).toBeGreaterThan(0)
      })

      // Alice is on shift - click first instance (button in employee grid)
      fireEvent.click(screen.getAllByText('Alice Server')[0])

      const breakBtn = await screen.findByRole('button', { name: /Start Break/i })
      expect(breakBtn).toBeInTheDocument()

      fireEvent.click(breakBtn)

      await waitFor(() => {
        expect(graphqlRequest.request).toHaveBeenCalledWith(
          '/api/graphql',
          expect.anything(),
          expect.objectContaining({
            shiftId: 'shift-101',
            action: 'start_break',
          })
        )
      })
    })
  })

  describe('TipsPage (Toast & 7shifts Tip Pooling & Daily Closeout)', () => {
    it('renders the Tip Hub with summary metrics', async () => {
      render(<TipsPage />)

      await waitFor(() => {
        expect(screen.getByText(/Tip Hub & Closeout/i)).toBeInTheDocument()
        expect(screen.getByText(/Recorded Batches/i)).toBeInTheDocument()
        expect(screen.getByText(/Process Daily Tips/i)).toBeInTheDocument()
        expect(screen.getByText(/Daily Closeout/i)).toBeInTheDocument()
      })
    })

    it('opens the Daily Tip Reconciliation dialog with FLSA compliance notice and points tiers', async () => {
      render(<TipsPage />)

      await waitFor(() => {
        expect(screen.getByText(/Process Daily Tips/i)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Process Daily Tips/i))

      expect(screen.getByText(/Daily Tip Reconciliation/i)).toBeInTheDocument()
      expect(screen.getByText(/FLSA Compliant/i)).toBeInTheDocument()
      expect(screen.getByText(/Role Point Weights/i)).toBeInTheDocument()
    })

    it('opens and renders Daily Closeout dialog with gross sales, labor cost, and audit balance', async () => {
      render(<TipsPage />)

      const closeoutBtn = await screen.findByRole('button', { name: /Daily Closeout/i })
      expect(closeoutBtn).toBeInTheDocument()

      fireEvent.click(closeoutBtn)

      await waitFor(() => {
        expect(screen.getByText(/Daily Closeout & Payroll Summary/i)).toBeInTheDocument()
        expect(screen.getByText(/Audit Status: Balanced/i)).toBeInTheDocument()
        expect(screen.getAllByText(/Gross Sales/i).length).toBeGreaterThan(0)
        expect(screen.getAllByText(/Labor Cost/i).length).toBeGreaterThan(0)
      }, { timeout: 4000 })
    })

    it('allows marking a calculated tip pool as distributed', async () => {
      render(<TipsPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Mark Distributed/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Mark Distributed/i }))

      await waitFor(() => {
        expect(graphqlRequest.request).toHaveBeenCalledWith(
          '/api/graphql',
          expect.anything(),
          expect.objectContaining({
            tipPoolId: 'pool-1',
            action: 'distribute',
          })
        )
      })
    })
  })
})
