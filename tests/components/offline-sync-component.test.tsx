import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OfflineBanner, OfflineStatusPill } from '@/features/platform/pos/components/OfflineBanner'
import { OfflineSyncModal } from '@/features/platform/pos/components/OfflineSyncModal'
import { OfflineOrderPayload } from '@/features/platform/pos/offline/offlineStorage'

describe('Stage 7: Offline-First Mode & Sync Queue (Component Tests)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders OfflineStatusPill in online state with cloud connected indicator', () => {
    const handleOpen = vi.fn()
    render(
      <OfflineStatusPill
        isOnline={true}
        pendingCount={0}
        isSyncing={false}
        onClick={handleOpen}
      />
    )

    expect(screen.getByText('Cloud Online')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cloud Online'))
    expect(handleOpen).toHaveBeenCalledTimes(1)
  })

  it('renders OfflineStatusPill in offline mode with amber badge and pending count', () => {
    render(
      <OfflineStatusPill
        isOnline={false}
        pendingCount={3}
        isSyncing={false}
        onClick={vi.fn()}
      />
    )

    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders OfflineStatusPill in syncing state with spinner', () => {
    render(
      <OfflineStatusPill
        isOnline={true}
        pendingCount={2}
        isSyncing={true}
        onClick={vi.fn()}
      />
    )

    expect(screen.getByText('Syncing...')).toBeInTheDocument()
  })

  it('does not render OfflineBanner when online and 0 orders are queued', () => {
    const { container } = render(
      <OfflineBanner
        isOnline={true}
        pendingCount={0}
        isSyncing={false}
        onOpenSyncModal={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders OfflineBanner when offline and invokes modal and sync callbacks', () => {
    const handleOpen = vi.fn()
    const handleSync = vi.fn()

    render(
      <OfflineBanner
        isOnline={false}
        pendingCount={2}
        isSyncing={false}
        onOpenSyncModal={handleOpen}
        onSyncNow={handleSync}
      />
    )

    expect(screen.getByText('OFFLINE MODE')).toBeInTheDocument()
    expect(screen.getByText(/Terminal is offline\. 2 orders saved locally/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Queue Details/i }))
    expect(handleOpen).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Sync Now/i }))
    expect(handleSync).toHaveBeenCalledTimes(1)
  })

  it('renders OfflineSyncModal with network metrics and queued orders', () => {
    const mockOrders: OfflineOrderPayload[] = [
      {
        clientOrderId: 'off_1001_xyz',
        createdAt: new Date().toISOString(),
        orderType: 'dine_in',
        guestCount: 4,
        tableIds: ['table-2'],
        tableNumbers: ['T2'],
        isUrgent: false,
        specialInstructions: null,
        items: [
          {
            menuItemId: 'item-1',
            name: 'Smash Burger',
            price: 1500,
            quantity: 2,
            courseNumber: 1,
            seatNumber: 1,
            station: 'hot_line',
            modifierIds: [],
            modifierNames: ['Extra Pickles'],
          },
        ],
        subtotalCents: 3000,
        taxCents: 260,
        totalCents: 3260,
        syncStatus: 'QUEUED',
        syncAttempts: 0,
      },
      {
        clientOrderId: 'off_1002_abc',
        createdAt: new Date().toISOString(),
        orderType: 'takeout',
        guestCount: 1,
        tableIds: [],
        tableNumbers: [],
        isUrgent: true,
        specialInstructions: null,
        items: [
          {
            menuItemId: 'item-2',
            name: 'Draft IPA',
            price: 800,
            quantity: 1,
            courseNumber: 1,
            seatNumber: 1,
            station: 'bar',
            modifierIds: [],
          },
        ],
        subtotalCents: 800,
        taxCents: 70,
        totalCents: 870,
        syncStatus: 'SYNCED',
        syncAttempts: 1,
        serverOrderId: 'srv-order-555',
      },
    ]

    render(
      <OfflineSyncModal
        open={true}
        onOpenChange={vi.fn()}
        isOnline={false}
        onToggleOnline={vi.fn()}
        orders={mockOrders}
        isSyncing={false}
        onSyncNow={vi.fn()}
        onClearSynced={vi.fn()}
        onExportBackup={vi.fn()}
      />
    )

    expect(screen.getByText('Offline Queue & Sync Hub')).toBeInTheDocument()
    expect(screen.getByText('Offline Mode')).toBeInTheDocument()
    expect(screen.getByText('Pending Sync')).toBeInTheDocument()
    expect(screen.getByText('Synced Local')).toBeInTheDocument()

    // Tickets in list
    expect(screen.getByText('off_1001_xyz')).toBeInTheDocument()
    expect(screen.getByText('$32.60')).toBeInTheDocument()
    expect(screen.getByText(/2x Smash Burger/i)).toBeInTheDocument()

    expect(screen.getByText('off_1002_abc')).toBeInTheDocument()
    expect(screen.getByText('Cloud Order ID: srv-order-555')).toBeInTheDocument()
  })

  it('triggers onSyncNow, onClearSynced, and onExportBackup from modal footer buttons', async () => {
    const handleSync = vi.fn().mockResolvedValue({ synced: 1, failed: 0 })
    const handleClear = vi.fn().mockResolvedValue(1)
    const handleExport = vi.fn().mockResolvedValue(undefined)
    const handleToggle = vi.fn()

    const mockOrders: OfflineOrderPayload[] = [
      {
        clientOrderId: 'off_2001',
        createdAt: new Date().toISOString(),
        orderType: 'takeout',
        guestCount: 1,
        tableIds: [],
        isUrgent: false,
        items: [{ menuItemId: '1', name: 'Coffee', price: 400, quantity: 1, courseNumber: 1, station: 'bar', modifierIds: [] }],
        subtotalCents: 400,
        taxCents: 35,
        totalCents: 435,
        syncStatus: 'QUEUED',
        syncAttempts: 0,
      },
      {
        clientOrderId: 'off_2002',
        createdAt: new Date().toISOString(),
        orderType: 'takeout',
        guestCount: 1,
        tableIds: [],
        isUrgent: false,
        items: [{ menuItemId: '2', name: 'Tea', price: 400, quantity: 1, courseNumber: 1, station: 'bar', modifierIds: [] }],
        subtotalCents: 400,
        taxCents: 35,
        totalCents: 435,
        syncStatus: 'SYNCED',
        syncAttempts: 1,
        serverOrderId: 'srv-2',
      },
    ]

    render(
      <OfflineSyncModal
        open={true}
        onOpenChange={vi.fn()}
        isOnline={false}
        onToggleOnline={handleToggle}
        orders={mockOrders}
        isSyncing={false}
        onSyncNow={handleSync}
        onClearSynced={handleClear}
        onExportBackup={handleExport}
      />
    )

    // Simulate toggle
    fireEvent.click(screen.getByRole('button', { name: /Simulate Online/i }))
    expect(handleToggle).toHaveBeenCalledWith(true)

    // Sync Now
    fireEvent.click(screen.getByRole('button', { name: /Sync All/i }))
    expect(handleSync).toHaveBeenCalledTimes(1)

    // Clear Synced
    fireEvent.click(screen.getByRole('button', { name: /Clear 1 Synced/i }))
    expect(handleClear).toHaveBeenCalledTimes(1)

    // Export Backup
    fireEvent.click(screen.getByRole('button', { name: /Export Backup \(JSON\)/i }))
    expect(handleExport).toHaveBeenCalledTimes(1)
  })
})
