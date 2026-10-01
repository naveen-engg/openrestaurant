'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { gql, request } from 'graphql-request'
import { RefreshCw } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

export type StatusFilter = 'all' | 'in-progress' | 'ready'
export type LaneFilter = 'all' | 'prep' | 'expediter'
export type Density = 'comfortable' | 'compact'
export type ViewMode = 'tickets' | 'all-day'

export type TicketItem = {
  id: string
  name: string
  quantity: number
  notes?: string | null
  station: string
  status: 'new' | 'in_progress' | 'fulfilled'
  fulfilledAt?: string | null
  courseNumber?: number
  courseType?: string
  courseStatus?: 'pending' | 'held' | 'fired' | 'ready' | 'served'
  courseId?: string
  isHeld?: boolean
  firedAt?: string | null
}

export type OrderCourseData = {
  id: string
  courseNumber: number
  courseType: string
  status: string
  onHold: boolean
  fireTime?: string | null
}

export type KdsTicket = {
  id: string
  status: 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled'
  priority: number
  firedAt?: string | null
  ticketType?: string | null
  station: { id: string; name: string } | null
  order: {
    id: string
    orderNumber: string
    orderType: 'dine_in' | 'takeout' | 'delivery'
    guestCount: number
    isUrgent: boolean
    onHold: boolean
    createdAt: string
    tables: { id: string; tableNumber: string }[]
    courses?: OrderCourseData[]
  } | null
  items: TicketItem[]
}

export const GET_KDS_DATA = gql`
  query GetKdsData {
    kitchenStations(where: { isActive: { equals: true } }, orderBy: { displayOrder: asc }) {
      id
      name
      displayOrder
    }
    kitchenTickets(
      where: { status: { in: ["new", "in_progress", "ready"] } }
      orderBy: { firedAt: asc }
    ) {
      id
      status
      priority
      ticketType
      firedAt
      items
      station { id name }
      order {
        id
        orderNumber
        orderType
        guestCount
        isUrgent
        onHold
        createdAt
        tables { id tableNumber }
        courses {
          id
          courseNumber
          courseType
          status
          onHold
          fireTime
        }
      }
    }
  }
`

export const UPDATE_TICKET_STATUS = gql`
  mutation UpdateKitchenTicketStatus($ticketId: String!, $status: String!) {
    updateKitchenTicketStatus(ticketId: $ticketId, status: $status) {
      success
      error
    }
  }
`

export const FULFILL_TICKET_ITEM = gql`
  mutation FulfillKitchenTicketItem($ticketId: String!, $itemId: String!, $fulfilled: Boolean!) {
    fulfillKitchenTicketItem(ticketId: $ticketId, itemId: $itemId, fulfilled: $fulfilled) {
      success
      error
    }
  }
`

export const FIRE_COURSE = gql`
  mutation FireCourse($courseId: String!) {
    fireCourse(courseId: $courseId) {
      success
      error
    }
  }
`

export const HOLD_COURSE = gql`
  mutation HoldCourse($courseId: String!) {
    holdCourse(courseId: $courseId) {
      success
      error
    }
  }
`

const warnMins = 12
const criticalMins = 20

export function normalizeStation(station?: string | { id?: string; name?: string } | null): string {
  if (!station) return ''
  if (typeof station === 'object') {
    return (station.name || station.id || '').toLowerCase().trim().replace(/[\s-]+/g, '_')
  }
  return String(station).toLowerCase().trim().replace(/[\s-]+/g, '_')
}

export function isExpoStation(station?: string | { id?: string; name?: string } | null): boolean {
  const s = normalizeStation(station)
  return s.includes('expo') || s.includes('expediter')
}

export function isStationMatch(
  filterStation: string,
  targetStation?: string | { id?: string; name?: string } | null
): boolean {
  if (!filterStation || filterStation === 'all') return true
  const filterNorm = normalizeStation(filterStation)
  const targetNorm = normalizeStation(targetStation)
  if (!targetNorm) return false
  return targetNorm === filterNorm || targetNorm.includes(filterNorm) || filterNorm.includes(targetNorm)
}

function getTicketAgeMins(ticket: KdsTicket) {
  const sentAt = ticket.firedAt || ticket.order?.createdAt
  if (!sentAt) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000))
}

function getTicketLane(ticket: KdsTicket): LaneFilter {
  const stationName = (ticket.station?.name || '').toLowerCase()
  if (stationName.includes('expo') || stationName.includes('expediter') || ticket.ticketType === 'expediter') {
    return 'expediter'
  }
  return 'prep'
}

function sortTickets(tickets: KdsTicket[]) {
  return [...tickets].sort((a, b) => {
    const aUrgent = !!a.order?.isUrgent
    const bUrgent = !!b.order?.isUrgent
    if (aUrgent !== bUrgent) return aUrgent ? -1 : 1

    const aHold = !!a.order?.onHold
    const bHold = !!b.order?.onHold
    if (aHold !== bHold) return aHold ? 1 : -1

    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0)

    return getTicketAgeMins(b) - getTicketAgeMins(a)
  })
}

export const TOAST_STANDARD_STATIONS = [
  { id: 'all', name: 'All Stations' },
  { id: 'hot_line', name: 'Hot Line' },
  { id: 'cold_prep', name: 'Cold Prep' },
  { id: 'bar', name: 'Bar' },
  { id: 'dessert', name: 'Dessert' },
  { id: 'expo', name: 'Expo' },
]

function KDSHeader({
  now,
  activeStatus,
  onStatusChange,
  counts,
}: {
  now: Date
  activeStatus: StatusFilter
  onStatusChange: (status: StatusFilter) => void
  counts: { active: number; inProgress: number; ready: number; urgent: number; overdue: number; critical: number }
}) {
  const filters = [
    { id: 'all' as const, label: 'Active', count: counts.active },
    { id: 'in-progress' as const, label: 'In Progress', count: counts.inProgress },
    { id: 'ready' as const, label: 'Ready', count: counts.ready },
  ]

  return (
    <header className="bg-secondary border-b border-border">
      <div className="px-8 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Kitchen Display System</h1>
            <p className="text-xs text-muted-foreground mt-1">Multi-station routing • Toast-style line cook & expo split</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-bold tracking-tight">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">System Time</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => onStatusChange(filter.id)}
              className={`rounded border p-3 text-left transition-colors ${
                activeStatus === filter.id
                  ? 'border-blue-500 bg-card'
                  : 'border-border bg-card hover:border-border-hover'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{filter.label}</p>
              <p className="text-2xl font-bold mt-1">{filter.count}</p>
            </button>
          ))}

          <div className="rounded border border-border p-3 bg-card">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Urgent</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{counts.urgent}</p>
          </div>

          <div className="rounded border border-border p-3 bg-card">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Overdue</p>
            <p className="text-2xl font-bold mt-1 text-orange-600">{counts.overdue}</p>
          </div>

          <div className="rounded border border-border p-3 bg-card">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Critical</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{counts.critical}</p>
          </div>
        </div>
      </div>
    </header>
  )
}

function StationTabs({
  stations,
  activeStation,
  stationCounts,
  onStationChange,
}: {
  stations: { id: string; name: string }[]
  activeStation: string
  stationCounts: Record<string, number>
  onStationChange: (stationId: string) => void
}) {
  return (
    <div className="border-b border-border bg-secondary">
      <div className="px-8 flex items-center gap-1 overflow-x-auto" data-testid="kds-station-tabs">
        {stations.map((station) => {
          const isSelected = isStationMatch(activeStation, station.id) || isStationMatch(activeStation, station.name)
          return (
            <button
              key={station.id}
              data-testid={`station-tab-${station.id}`}
              onClick={() => onStationChange(station.id)}
              className={`px-5 py-3 text-sm whitespace-nowrap border-b-2 transition-all ${
                isSelected
                  ? 'border-foreground text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {station.name} <span className="text-xs opacity-80">({stationCounts[station.id] ?? 0})</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function KDSViewControls({
  laneFilter,
  onLaneFilterChange,
  density,
  onDensityChange,
  viewMode,
  onViewModeChange,
}: {
  laneFilter: LaneFilter
  onLaneFilterChange: (lane: LaneFilter) => void
  density: Density
  onDensityChange: (density: Density) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}) {
  return (
    <div className="px-8 py-3 border-b border-border bg-background/80 backdrop-blur-sm flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">Lane</span>
        {([
          { id: 'all', label: 'All Lanes' },
          { id: 'prep', label: 'Line Prep' },
          { id: 'expediter', label: 'Expo Gate' },
        ] as { id: LaneFilter; label: string }[]).map((lane) => (
          <button
            key={lane.id}
            onClick={() => onLaneFilterChange(lane.id)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              laneFilter === lane.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background border-border text-foreground hover:border-zinc-400'
            }`}
          >
            {lane.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="uppercase tracking-wider text-muted-foreground">View</span>
          {([
            { id: 'tickets', label: 'Tickets' },
            { id: 'all-day', label: 'All Day' },
          ] as { id: ViewMode; label: string }[]).map((mode) => (
            <button
              key={mode.id}
              onClick={() => onViewModeChange(mode.id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                viewMode === mode.id
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background border-border text-foreground hover:border-zinc-400'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="uppercase tracking-wider text-muted-foreground">Density</span>
          {([
            { id: 'comfortable', label: 'Comfortable' },
            { id: 'compact', label: 'Compact' },
          ] as { id: Density; label: string }[]).map((mode) => (
            <button
              key={mode.id}
              onClick={() => onDensityChange(mode.id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                density === mode.id
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background border-border text-foreground hover:border-zinc-400'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function StationMetrics({ tickets }: { tickets: KdsTicket[] }) {
  const metrics = useMemo(() => {
    const map = new Map<string, { active: number; ready: number; overdue: number; avgAge: number; sumAge: number }>()

    tickets.forEach((ticket) => {
      const key = ticket.station?.name || 'Unassigned'
      const curr = map.get(key) || { active: 0, ready: 0, overdue: 0, avgAge: 0, sumAge: 0 }
      curr.active += 1
      if (ticket.status === 'ready') curr.ready += 1
      const age = getTicketAgeMins(ticket)
      curr.sumAge += age
      if (age >= warnMins) curr.overdue += 1
      map.set(key, curr)
    })

    return Array.from(map.entries()).map(([name, val]) => ({
      name,
      active: val.active,
      ready: val.ready,
      overdue: val.overdue,
      avgAge: val.active > 0 ? Math.round(val.sumAge / val.active) : 0,
    }))
  }, [tickets])

  if (metrics.length === 0) return null

  return (
    <section className="px-8 py-4 border-b border-border bg-background/60">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">Station throughput</div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.name} className="rounded border border-border bg-card p-3">
            <div className="text-sm font-semibold">{m.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Active {m.active} • Ready {m.ready} • Overdue {m.overdue}
            </div>
            <div className="text-xs mt-2">Avg age: <span className="font-semibold">{m.avgAge}m</span></div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function TicketCard({
  ticket,
  onStatusChange,
  onToggleItem,
  onFireCourse,
  onHoldCourse,
  density,
  activeStation,
}: {
  ticket: KdsTicket
  onStatusChange: (ticketId: string, status: string) => void
  onToggleItem: (ticketId: string, itemId: string, fulfilled: boolean) => void
  onFireCourse?: (courseId: string) => void
  onHoldCourse?: (courseId: string) => void
  density: Density
  activeStation: string
}) {
  const table = ticket.order?.tables?.length
    ? ticket.order.tables.map((t) => t.tableNumber).join(', ')
    : '—'

  const elapsed = getTicketAgeMins(ticket)
  const elapsedTone = elapsed >= criticalMins ? 'text-red-600' : elapsed >= warnMins ? 'text-orange-600' : 'text-muted-foreground'

  const urgent = !!ticket.order?.isUrgent
  const onHold = !!ticket.order?.onHold

  const isExpo = isExpoStation(activeStation) || (activeStation === 'all' && (isExpoStation(ticket.station?.name) || ticket.ticketType === 'expediter'))

  // Line cooks only see items assigned to their active station that are FIRED (not held),
  // while expo station sees the consolidated order ticket with all items (fired + held) and course fire controls.
  const visibleItems = isExpo
    ? ticket.items
    : activeStation === 'all'
      ? ticket.items.filter((item) => !item.isHeld)
      : ticket.items.filter((item) => isStationMatch(activeStation, item.station) && !item.isHeld)

  return (
    <div
      data-testid={`kds-ticket-${ticket.id}`}
      className={`rounded-lg border ${density === 'compact' ? 'p-3' : 'p-4'} ${
        urgent
          ? 'border-red-500 bg-red-500/10 shadow-sm shadow-red-500/20'
          : onHold
            ? 'border-yellow-500/40 bg-yellow-500/10'
            : 'border-border bg-secondary'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-lg font-medium">Table {table}</div>
          <div className="text-xs text-muted-foreground mt-1">
            #{ticket.order?.orderNumber || '—'} • {(ticket.order?.guestCount || 0)} guest{(ticket.order?.guestCount || 0) !== 1 ? 's' : ''} • {(ticket.order?.orderType || '').replace('_', ' ')}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <span className="font-semibold text-foreground">{ticket.station?.name || 'Prep'}</span>
            <span>•</span>
            <span className="uppercase text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-muted border">
              {isExpo ? 'EXPO CONSOLIDATED' : getTicketLane(ticket).toUpperCase()}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xs font-semibold ${elapsedTone}`}>{elapsed === 0 ? 'Just now' : `${elapsed}m`}</div>
          {urgent && <div className="text-[11px] font-semibold text-red-600 mt-1">URGENT</div>}
          {onHold && <div className="text-[11px] font-semibold text-yellow-700 mt-1">ON HOLD</div>}
          <div className="text-[11px] uppercase text-muted-foreground mt-1">{ticket.status.replace('_', ' ')}</div>
        </div>
      </div>

      {/* Course Pacing & Fire Actions Bar */}
      {ticket.order?.courses && ticket.order.courses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5 pb-2 border-b border-border/60" data-testid="kds-course-bar">
          {ticket.order.courses.map((course) => {
            const isHeld = Boolean(course.onHold || course.status === 'pending' || course.status === 'held')
            return (
              <div key={course.id} className="flex items-center gap-1">
                <span
                  data-testid={`course-badge-${course.id}`}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 ${
                    isHeld
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                  }`}
                >
                  <span>C{course.courseNumber}: {course.courseType}</span>
                  <span className="uppercase text-[9px]">({isHeld ? 'Held' : 'Fired'})</span>
                </span>
                {isHeld && onFireCourse && (
                  <button
                    type="button"
                    data-testid={`fire-course-btn-${course.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onFireCourse(course.id)
                    }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white transition-colors flex items-center gap-0.5 shadow-sm"
                  >
                    🔥 Fire C{course.courseNumber}
                  </button>
                )}
                {!isHeld && onHoldCourse && isExpo && (
                  <button
                    type="button"
                    data-testid={`hold-course-btn-${course.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onHoldCourse(course.id)
                    }}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Hold
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Items list */}
      <div className={density === 'compact' ? 'space-y-1.5 mb-2' : 'space-y-2 mb-3'} data-testid="kds-items-list">
        {visibleItems.map((item) => {
          const done = item.status === 'fulfilled'
          return (
            <button
              key={item.id}
              data-testid={`kds-item-${item.id}`}
              onClick={() => onToggleItem(ticket.id, item.id, !done)}
              className={`w-full text-left rounded border px-3 py-2 transition-colors ${
                done
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`text-sm flex items-center gap-2 ${done ? 'line-through text-muted-foreground' : ''}`}>
                  {item.courseNumber && (
                    <span
                      data-testid={`item-course-tag-${item.id}`}
                      className={`text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded border ${
                        item.isHeld
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
                          : 'border-blue-500/30 bg-blue-500/10 text-blue-700'
                      }`}
                    >
                      C{item.courseNumber}
                    </span>
                  )}
                  {item.isHeld && (
                    <span
                      data-testid={`item-held-tag-${item.id}`}
                      className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-700"
                    >
                      HELD
                    </span>
                  )}
                  {isExpo && (
                    <span
                      data-testid={`item-station-tag-${item.id}`}
                      className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-muted/90 border text-muted-foreground"
                    >
                      {item.station.replace('_', ' ')}
                    </span>
                  )}
                  <span>{item.quantity}x {item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isExpo && (
                    <span
                      data-testid={`item-status-tag-${item.id}`}
                      className={`text-[10px] uppercase font-semibold ${
                        done ? 'text-emerald-700' : item.status === 'in_progress' ? 'text-amber-600' : 'text-blue-600'
                      }`}
                    >
                      {done ? 'Fulfilled' : item.status === 'in_progress' ? 'In Prep' : 'New'}
                    </span>
                  )}
                  <span className={`text-[11px] uppercase ${done ? 'text-emerald-700 font-semibold' : 'text-muted-foreground'}`}>
                    {done ? 'Done' : 'Mark Done'}
                  </span>
                </div>
              </div>
              {item.notes && density === 'comfortable' && (
                <div className="text-xs italic text-muted-foreground mt-1">{item.notes}</div>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {ticket.status === 'new' && (
          <button
            onClick={() => onStatusChange(ticket.id, 'in_progress')}
            className="rounded border border-border px-3 py-1 text-xs hover:bg-muted"
          >
            Start
          </button>
        )}

        {ticket.status === 'in_progress' && (
          <button
            onClick={() => onStatusChange(ticket.id, 'ready')}
            className="rounded border border-emerald-500/40 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10"
          >
            Mark Ready
          </button>
        )}

        {ticket.status === 'ready' && (
          <>
            <button
              onClick={() => onStatusChange(ticket.id, 'served')}
              className="rounded border border-blue-500/40 px-3 py-1 text-xs text-blue-700 hover:bg-blue-500/10"
            >
              Bump / Served
            </button>
            <button
              onClick={() => onStatusChange(ticket.id, 'in_progress')}
              className="rounded border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              Recall
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function AllDayView({ tickets, activeStation }: { tickets: KdsTicket[]; activeStation: string }) {
  const isExpo = isExpoStation(activeStation)
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; station: string; qty: number; fulfilled: number; urgentOrders: number }>()

    tickets.forEach((ticket) => {
      const urgent = ticket.order?.isUrgent ? 1 : 0
      const items = isExpo || activeStation === 'all'
        ? ticket.items
        : ticket.items.filter((item) => isStationMatch(activeStation, item.station))

      items.forEach((item) => {
        const key = `${item.station}::${item.name}`
        const curr = map.get(key) || { name: item.name, station: item.station, qty: 0, fulfilled: 0, urgentOrders: 0 }
        curr.qty += item.quantity
        if (item.status === 'fulfilled') curr.fulfilled += item.quantity
        curr.urgentOrders += urgent
        map.set(key, curr)
      })
    })

    return Array.from(map.values()).sort((a, b) => b.qty - a.qty)
  }, [tickets, activeStation, isExpo])

  return (
    <section className="px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-medium">All Day</h2>
        <span className="text-sm text-muted-foreground">{rows.length} item line{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No active production items
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Item</div>
            <div className="col-span-2">Station</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Done</div>
            <div className="col-span-2 text-right">Remaining</div>
          </div>
          {rows.map((row, idx) => (
            <div key={`${row.station}-${row.name}-${idx}`} className="grid grid-cols-12 gap-2 px-4 py-3 border-t text-sm">
              <div className="col-span-4 font-medium">{row.name}</div>
              <div className="col-span-2 text-muted-foreground capitalize">{row.station.replace('_', ' ')}</div>
              <div className="col-span-2 text-right font-semibold">{row.qty}</div>
              <div className="col-span-2 text-right text-emerald-700 font-semibold">{row.fulfilled}</div>
              <div className="col-span-2 text-right font-semibold">{Math.max(0, row.qty - row.fulfilled)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function QueueView({
  tickets,
  onStatusChange,
  onToggleItem,
  onFireCourse,
  onHoldCourse,
  density,
  activeStation,
}: {
  tickets: KdsTicket[]
  onStatusChange: (ticketId: string, status: string) => void
  onToggleItem: (ticketId: string, itemId: string, fulfilled: boolean) => void
  onFireCourse?: (courseId: string) => void
  onHoldCourse?: (courseId: string) => void
  density: Density
  activeStation: string
}) {
  return (
    <section className="px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-medium">Queue</h2>
        <span className="text-sm text-muted-foreground">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
      </div>

      <div className={density === 'compact' ? 'space-y-2' : 'space-y-3'}>
        {tickets.length === 0 ? (
          <div className="rounded border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No active tickets for this station
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onStatusChange={onStatusChange}
              onToggleItem={onToggleItem}
              onFireCourse={onFireCourse}
              onHoldCourse={onHoldCourse}
              density={density}
              activeStation={activeStation}
            />
          ))
        )}
      </div>
    </section>
  )
}

export interface KDSClientProps {
  initialStation?: string
}

export function KDSClient({ initialStation }: KDSClientProps = {}) {
  let searchParamStation: string | null = null
  try {
    const searchParams = useSearchParams()
    searchParamStation = searchParams?.get('station') || null
  } catch {
    // In environments where useSearchParams is outside suspense/mock
  }

  const effectiveInitialStation = initialStation || searchParamStation || 'all'

  const [loading, setLoading] = useState(true)
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([])
  const [tickets, setTickets] = useState<KdsTicket[]>([])
  const [activeStation, setActiveStation] = useState(effectiveInitialStation)
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('all')
  const [laneFilter, setLaneFilter] = useState<LaneFilter>('all')
  const [density, setDensity] = useState<Density>('comfortable')
  const [viewMode, setViewMode] = useState<ViewMode>('tickets')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    if (initialStation) {
      setActiveStation(initialStation)
    } else if (searchParamStation) {
      setActiveStation(searchParamStation)
    }
  }, [initialStation, searchParamStation])

  const handleStationChange = (stationId: string) => {
    setActiveStation(stationId)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (stationId === 'all') {
        url.searchParams.delete('station')
      } else {
        url.searchParams.set('station', stationId)
      }
      window.history.replaceState({}, '', url.toString())
    }
  }

  const fetchKDS = async () => {
    try {
      const res: any = await request('/api/graphql', GET_KDS_DATA)

      setStations((res.kitchenStations || []).map((s: any) => ({ id: s.id, name: s.name })))
      setTickets((res.kitchenTickets || []).map((ticket: any) => ({
        ...ticket,
        items: Array.isArray(ticket.items) ? ticket.items : [],
      })))

      setMutationError(null)
    } catch (err) {
      console.error(err)
      setMutationError('KDS failed to load data. Check session and GraphQL logs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKDS()
    const poll = setInterval(fetchKDS, 10000)
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(clock)
    }
  }, [])

  const updateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const res: any = await request('/api/graphql', UPDATE_TICKET_STATUS, { ticketId, status })
      if (!res?.updateKitchenTicketStatus?.success) {
        setMutationError(res?.updateKitchenTicketStatus?.error || 'Failed to update ticket status')
        return
      }
      setMutationError(null)
      await fetchKDS()
    } catch (err) {
      console.error(err)
      setMutationError('Failed to update ticket status')
    }
  }

  const toggleItemFulfilled = async (ticketId: string, itemId: string, fulfilled: boolean) => {
    try {
      // Optimistic update so UI marks item immediately without closing entire order
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t
          const updatedItems = t.items.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: fulfilled ? ('fulfilled' as const) : ('in_progress' as const),
                  fulfilledAt: fulfilled ? new Date().toISOString() : null,
                }
              : i
          )
          return { ...t, items: updatedItems }
        })
      )

      const res: any = await request('/api/graphql', FULFILL_TICKET_ITEM, { ticketId, itemId, fulfilled })
      if (!res?.fulfillKitchenTicketItem?.success) {
        setMutationError(res?.fulfillKitchenTicketItem?.error || 'Failed to update item')
        await fetchKDS()
        return
      }
      setMutationError(null)
      await fetchKDS()
    } catch (err) {
      console.error(err)
      setMutationError('Failed to update item')
      await fetchKDS()
    }
  }

  const fireCourseAction = async (courseId: string) => {
    try {
      const res: any = await request('/api/graphql', FIRE_COURSE, { courseId })
      if (!res?.fireCourse?.success) {
        setMutationError(res?.fireCourse?.error || 'Failed to fire course')
        return
      }
      setMutationError(null)
      await fetchKDS()
    } catch (err) {
      console.error(err)
      setMutationError('Failed to fire course')
    }
  }

  const holdCourseAction = async (courseId: string) => {
    try {
      const res: any = await request('/api/graphql', HOLD_COURSE, { courseId })
      if (!res?.holdCourse?.success) {
        setMutationError(res?.holdCourse?.error || 'Failed to hold course')
        return
      }
      setMutationError(null)
      await fetchKDS()
    } catch (err) {
      console.error(err)
      setMutationError('Failed to hold course')
    }
  }

  const statusFiltered = useMemo(() => {
    if (activeStatus === 'ready') return tickets.filter((t) => t.status === 'ready')
    if (activeStatus === 'in-progress') return tickets.filter((t) => ['new', 'in_progress'].includes(t.status))
    return tickets
  }, [tickets, activeStatus])

  const laneFiltered = useMemo(() => {
    if (laneFilter === 'all') return statusFiltered
    return statusFiltered.filter((ticket) => getTicketLane(ticket) === laneFilter)
  }, [statusFiltered, laneFilter])

  const stationFiltered = useMemo(() => {
    if (activeStation === 'all') return sortTickets(laneFiltered)
    const isExpo = isExpoStation(activeStation)

    return sortTickets(
      laneFiltered.filter((ticket) => {
        if (isExpo) {
          // Expo sees all consolidated tickets or expo tickets
          return true
        }
        // Line cook prep station: only show tickets that have FIRED items assigned to this station
        return (
          ticket.items.some((item) => isStationMatch(activeStation, item.station) && !item.isHeld) ||
          isStationMatch(activeStation, ticket.station)
        )
      })
    )
  }, [laneFiltered, activeStation])

  const counts = useMemo(() => {
    const active = tickets.length
    const inProgress = tickets.filter((t) => ['new', 'in_progress'].includes(t.status)).length
    const ready = tickets.filter((t) => t.status === 'ready').length
    const urgent = tickets.filter((t) => !!t.order?.isUrgent).length
    const overdue = tickets.filter((t) => getTicketAgeMins(t) >= warnMins).length
    const critical = tickets.filter((t) => getTicketAgeMins(t) >= criticalMins).length
    return { active, inProgress, ready, urgent, overdue, critical }
  }, [tickets])

  const displayStations = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    TOAST_STANDARD_STATIONS.forEach((s) => map.set(normalizeStation(s.id), s))
    stations.forEach((s) => {
      const key = normalizeStation(s.name || s.id)
      if (!map.has(key)) {
        map.set(key, { id: s.id, name: s.name })
      }
    })
    return Array.from(map.values())
  }, [stations])

  const stationCounts = useMemo(() => {
    const out: Record<string, number> = { all: laneFiltered.length }
    displayStations.forEach((station) => {
      if (station.id === 'all') return
      const isExpo = isExpoStation(station.id) || isExpoStation(station.name)
      out[station.id] = laneFiltered.filter((ticket) => {
        if (isExpo) return true
        return (
          ticket.items.some((item) => isStationMatch(station.id, item.station)) ||
          isStationMatch(station.id, ticket.station)
        )
      }).length
    })
    return out
  }, [laneFiltered, displayStations])

  if (loading && tickets.length === 0) {
    return (
      <div className="flex justify-center p-8">
        <RefreshCw className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <KDSHeader now={now} activeStatus={activeStatus} onStatusChange={setActiveStatus} counts={counts} />
      <StationTabs
        stations={displayStations}
        activeStation={activeStation}
        stationCounts={stationCounts}
        onStationChange={handleStationChange}
      />
      <KDSViewControls
        laneFilter={laneFilter}
        onLaneFilterChange={setLaneFilter}
        density={density}
        onDensityChange={setDensity}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      {mutationError && (
        <div className="px-8 py-3 text-sm bg-amber-500/10 text-amber-900 border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>{mutationError}</span>
            <span className="text-xs text-muted-foreground">(Requires staff or admin authentication)</span>
          </div>
          <a
            href="/dashboard/signin"
            className="text-xs font-semibold px-3 py-1.5 rounded bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            Sign In with Admin Credentials &rarr;
          </a>
        </div>
      )}
      <StationMetrics tickets={stationFiltered} />
      {viewMode === 'all-day' ? (
        <AllDayView tickets={stationFiltered} activeStation={activeStation} />
      ) : (
        <QueueView
          tickets={stationFiltered}
          onStatusChange={updateTicketStatus}
          onToggleItem={toggleItemFulfilled}
          onFireCourse={fireCourseAction}
          onHoldCourse={holdCourseAction}
          density={density}
          activeStation={activeStation}
        />
      )}
    </div>
  )
}
export default KDSClient
