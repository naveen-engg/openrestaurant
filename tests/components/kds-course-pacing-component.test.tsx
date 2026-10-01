import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TicketCard, KdsTicket } from '@/features/platform/kds/screens/KDSClient'

describe('Stage 2: KDS Course Pacing & Hold / Fire (Component Tests)', () => {
  const mockTicket: KdsTicket = {
    id: 'ticket-101',
    status: 'new',
    priority: 0,
    firedAt: '2026-10-01T12:00:00Z',
    ticketType: 'prep',
    station: { id: 'station-expo', name: 'Expo' },
    order: {
      id: 'order-101',
      orderNumber: '20261001-0101',
      orderType: 'dine_in',
      guestCount: 2,
      isUrgent: false,
      onHold: false,
      createdAt: '2026-10-01T12:00:00Z',
      tables: [{ id: 'table-12', tableNumber: '12' }],
      courses: [
        {
          id: 'course-1',
          courseNumber: 1,
          courseType: 'appetizers',
          status: 'fired',
          onHold: false,
          fireTime: '2026-10-01T12:00:00Z',
        },
        {
          id: 'course-2',
          courseNumber: 2,
          courseType: 'mains',
          status: 'pending',
          onHold: true,
          fireTime: null,
        },
      ],
    },
    items: [
      {
        id: 'item-beer',
        name: 'Craft IPA Beer',
        quantity: 2,
        station: 'bar',
        status: 'new',
        courseNumber: 1,
        courseType: 'appetizers',
        courseStatus: 'fired',
        isHeld: false,
      },
      {
        id: 'item-salad',
        name: 'Caesar Salad',
        quantity: 1,
        station: 'cold_prep',
        status: 'new',
        courseNumber: 1,
        courseType: 'appetizers',
        courseStatus: 'fired',
        isHeld: false,
      },
      {
        id: 'item-steak',
        name: 'Prime Ribeye Steak',
        quantity: 1,
        station: 'hot_line',
        status: 'new',
        courseNumber: 2,
        courseType: 'mains',
        courseStatus: 'held',
        isHeld: true,
      },
    ],
  }

  it('hides held Course 2 items from hot_line prep station', () => {
    const hotLineTicket: KdsTicket = {
      ...mockTicket,
      station: { id: 'station-hot-line', name: 'Hot Line' },
    }

    render(
      <TicketCard
        ticket={hotLineTicket}
        onStatusChange={vi.fn()}
        onToggleItem={vi.fn()}
        density="comfortable"
        activeStation="hot_line"
      />
    )

    // On hot_line, the held steak must NOT be visible
    expect(screen.queryByText(/Prime Ribeye Steak/i)).toBeNull()
  })

  it('renders all courses, held badge, and 🔥 Fire C2 button on Expo station', () => {
    const fireCourseMock = vi.fn()
    const holdCourseMock = vi.fn()

    render(
      <TicketCard
        ticket={mockTicket}
        onStatusChange={vi.fn()}
        onToggleItem={vi.fn()}
        onFireCourse={fireCourseMock}
        onHoldCourse={holdCourseMock}
        density="comfortable"
        activeStation="expo"
      />
    )

    // Table number and order info
    expect(screen.getByText(/Table 12/i)).toBeDefined()

    // All items visible on Expo
    expect(screen.getByText(/Craft IPA Beer/i)).toBeDefined()
    expect(screen.getByText(/Caesar Salad/i)).toBeDefined()
    expect(screen.getByText(/Prime Ribeye Steak/i)).toBeDefined()

    // Course tags
    expect(screen.getByTestId('item-course-tag-item-beer').textContent).toContain('C1')
    expect(screen.getByTestId('item-course-tag-item-steak').textContent).toContain('C2')

    // HELD badge for steak
    expect(screen.getByTestId('item-held-tag-item-steak').textContent).toContain('HELD')

    // Course pacing bar
    expect(screen.getByTestId('course-badge-course-1').textContent).toContain('C1: appetizers')
    expect(screen.getByTestId('course-badge-course-2').textContent).toContain('C2: mains')

    // Fire button for Course 2
    const fireBtn = screen.getByTestId('fire-course-btn-course-2')
    expect(fireBtn).toBeDefined()
    expect(fireBtn.textContent).toContain('Fire C2')

    // Clicking fire calls onFireCourse with course ID
    fireEvent.click(fireBtn)
    expect(fireCourseMock).toHaveBeenCalledWith('course-2')
  })

  it('allows holding an already fired course on Expo', () => {
    const holdCourseMock = vi.fn()

    render(
      <TicketCard
        ticket={mockTicket}
        onStatusChange={vi.fn()}
        onToggleItem={vi.fn()}
        onHoldCourse={holdCourseMock}
        density="comfortable"
        activeStation="expo"
      />
    )

    const holdBtn = screen.getByTestId('hold-course-btn-course-1')
    expect(holdBtn).toBeDefined()

    fireEvent.click(holdBtn)
    expect(holdCourseMock).toHaveBeenCalledWith('course-1')
  })
})
