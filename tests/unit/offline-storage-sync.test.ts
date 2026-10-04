import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveOfflineOrder,
  getAllOfflineOrders,
  getPendingOfflineOrders,
  deleteOfflineOrder,
  clearSyncedOfflineOrders,
  cachePOSCatalog,
  getCachedPOSCatalog,
  _resetMemoryStoresForTesting,
  OfflineOrderPayload,
} from '@/features/platform/pos/offline/offlineStorage'
import {
  enqueuePOSOrder,
  syncAllPendingOrders,
  exportOfflineOrdersJSON,
  generateClientOrderId,
} from '@/features/platform/pos/offline/syncEngine'

describe('Stage 7: Offline-First Mode & Background Sync Queue (Unit Tests)', () => {
  beforeEach(() => {
    _resetMemoryStoresForTesting()
    vi.restoreAllMocks()
  })

  it('generates unique client order IDs with expected prefix and timestamp', () => {
    const id1 = generateClientOrderId()
    const id2 = generateClientOrderId()
    expect(id1).toMatch(/^off_\d+_[a-z0-9]+$/)
    expect(id2).toMatch(/^off_\d+_[a-z0-9]+$/)
    expect(id1).not.toBe(id2)
  })

  it('enqueues a POS order into local storage with initial QUEUED status', async () => {
    const order = await enqueuePOSOrder({
      orderType: 'dine_in',
      guestCount: 3,
      tableIds: ['table-1', 'table-2'],
      tableNumbers: ['T1', 'T2'],
      isUrgent: true,
      specialInstructions: 'Quick table turn requested',
      items: [
        {
          menuItem: { id: 'item-burger', name: 'Smash Burger', price: 1600, station: 'hot_line' },
          quantity: 2,
          courseNumber: 2,
          seatNumber: 1,
          station: 'hot_line',
          modifierIds: ['mod-cheese'],
          modifierNames: ['Extra Cheddar'],
          specialInstructions: 'No onions',
          isHeld: false,
        },
        {
          menuItem: { id: 'item-beer', name: 'Draft IPA', price: 800, station: 'bar' },
          quantity: 1,
          courseNumber: 1,
          seatNumber: 2,
          station: 'bar',
          modifierIds: [],
          modifierNames: [],
          specialInstructions: null,
          isHeld: false,
        },
      ],
      subtotalCents: 4000,
      taxCents: 350,
      totalCents: 4350,
    })

    expect(order.clientOrderId).toBeDefined()
    expect(order.syncStatus).toBe('QUEUED')
    expect(order.syncAttempts).toBe(0)
    expect(order.tableNumbers).toEqual(['T1', 'T2'])
    expect(order.items.length).toBe(2)
    expect(order.totalCents).toBe(4350)

    const pending = await getPendingOfflineOrders()
    expect(pending.length).toBe(1)
    expect(pending[0].clientOrderId).toBe(order.clientOrderId)
  })

  it('replays and synchronizes pending orders when network connection succeeds', async () => {
    await enqueuePOSOrder({
      orderType: 'takeout',
      guestCount: 1,
      tableIds: [],
      tableNumbers: [],
      isUrgent: false,
      specialInstructions: null,
      items: [
        {
          menuItem: { id: 'item-fries', name: 'Truffle Fries', price: 900 },
          quantity: 1,
          courseNumber: 1,
          modifierIds: [],
          specialInstructions: null,
        },
      ],
      subtotalCents: 900,
      taxCents: 75,
      totalCents: 975,
    })

    const mockRequest = vi.fn().mockResolvedValue({
      createPOSOrder: { id: 'server-order-999', orderNumber: 'ORD-999' },
    })

    const result = await syncAllPendingOrders(mockRequest, 'CREATE_POS_ORDER_MUTATION')

    expect(result.total).toBe(1)
    expect(result.synced).toBe(1)
    expect(result.failed).toBe(0)
    expect(mockRequest).toHaveBeenCalledTimes(1)

    const all = await getAllOfflineOrders()
    expect(all[0].syncStatus).toBe('SYNCED')
    expect(all[0].serverOrderId).toBe('server-order-999')

    const pending = await getPendingOfflineOrders()
    expect(pending.length).toBe(0)
  })

  it('marks orders as FAILED and captures lastError when network request rejects', async () => {
    await enqueuePOSOrder({
      orderType: 'dine_in',
      guestCount: 2,
      tableIds: ['table-5'],
      isUrgent: false,
      specialInstructions: null,
      items: [
        {
          menuItem: { id: 'item-wings', name: 'Hot Wings', price: 1400 },
          quantity: 1,
          courseNumber: 1,
          modifierIds: [],
        },
      ],
      subtotalCents: 1400,
      taxCents: 120,
      totalCents: 1520,
    })

    const mockFailingRequest = vi.fn().mockRejectedValue(new Error('Gateway Timeout (504)'))

    const result = await syncAllPendingOrders(mockFailingRequest, 'CREATE_POS_ORDER')

    expect(result.total).toBe(1)
    expect(result.synced).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.errors[0].error).toContain('Gateway Timeout')

    const all = await getAllOfflineOrders()
    expect(all[0].syncStatus).toBe('FAILED')
    expect(all[0].syncAttempts).toBe(1)
    expect(all[0].lastError).toContain('Gateway Timeout (504)')

    // A FAILED order is still in the pending queue ready for retry
    const pending = await getPendingOfflineOrders()
    expect(pending.length).toBe(1)
  })

  it('retries a previously FAILED order on next sync cycle', async () => {
    const order = await enqueuePOSOrder({
      orderType: 'takeout',
      guestCount: 1,
      tableIds: [],
      isUrgent: false,
      specialInstructions: null,
      items: [
        {
          menuItem: { id: 'item-salad', name: 'Caesar Salad', price: 1100 },
          quantity: 1,
          courseNumber: 1,
          modifierIds: [],
        },
      ],
      subtotalCents: 1100,
      taxCents: 90,
      totalCents: 1190,
    })

    // Step 1: First sync attempt fails
    const mockFail = vi.fn().mockRejectedValue(new Error('Network Offline'))
    await syncAllPendingOrders(mockFail, 'CREATE_ORDER')

    const failedState = await getAllOfflineOrders()
    expect(failedState[0].syncStatus).toBe('FAILED')
    expect(failedState[0].syncAttempts).toBe(1)

    // Step 2: Second sync attempt succeeds
    const mockSuccess = vi.fn().mockResolvedValue({
      createPOSOrder: { id: 'server-recovered-88', orderNumber: 'ORD-88' },
    })
    const retryResult = await syncAllPendingOrders(mockSuccess, 'CREATE_ORDER')

    expect(retryResult.synced).toBe(1)
    const recoveredState = await getAllOfflineOrders()
    expect(recoveredState[0].syncStatus).toBe('SYNCED')
    expect(recoveredState[0].syncAttempts).toBe(2)
    expect(recoveredState[0].serverOrderId).toBe('server-recovered-88')
    expect(recoveredState[0].lastError).toBeNull()
  })

  it('clears synced orders while preserving un-synced queue items', async () => {
    // Add two orders
    const o1 = await enqueuePOSOrder({
      orderType: 'takeout',
      guestCount: 1,
      tableIds: [],
      isUrgent: false,
      items: [{ menuItem: { id: '1', name: 'Item 1', price: 100 }, quantity: 1, courseNumber: 1, modifierIds: [] }],
      subtotalCents: 100,
      taxCents: 10,
      totalCents: 110,
    })

    const o2 = await enqueuePOSOrder({
      orderType: 'takeout',
      guestCount: 1,
      tableIds: [],
      isUrgent: false,
      items: [{ menuItem: { id: '2', name: 'Item 2', price: 200 }, quantity: 1, courseNumber: 1, modifierIds: [] }],
      subtotalCents: 200,
      taxCents: 20,
      totalCents: 220,
    })

    // Manually mark o1 as SYNCED
    o1.syncStatus = 'SYNCED'
    await saveOfflineOrder(o1)

    const beforeClear = await getAllOfflineOrders()
    expect(beforeClear.length).toBe(2)

    const clearedCount = await clearSyncedOfflineOrders()
    expect(clearedCount).toBe(1)

    const afterClear = await getAllOfflineOrders()
    expect(afterClear.length).toBe(1)
    expect(afterClear[0].clientOrderId).toBe(o2.clientOrderId)
    expect(afterClear[0].syncStatus).toBe('QUEUED')
  })

  it('caches and retrieves POS catalog data for instant offline terminal boots', async () => {
    const catalog = {
      tables: [{ id: 'tbl-1', tableNumber: '1', capacity: 4, status: 'available' }],
      categories: [{ id: 'cat-mains', name: 'Mains' }],
      items: [{ id: 'item-steak', name: 'Ribeye Steak', price: 3800, available: true }],
      storeSettings: { taxRate: '8.75', currencyCode: 'USD', locale: 'en-US' },
    }

    await cachePOSCatalog(catalog)
    const cached = await getCachedPOSCatalog()

    expect(cached).not.toBeNull()
    expect(cached?.tables.length).toBe(1)
    expect(cached?.items[0].name).toBe('Ribeye Steak')
    expect(cached?.cachedAt).toBeDefined()
  })

  it('exports offline orders JSON with metadata and valid schema', async () => {
    await enqueuePOSOrder({
      orderType: 'takeout',
      guestCount: 1,
      tableIds: [],
      isUrgent: false,
      items: [{ menuItem: { id: '1', name: 'Soda', price: 300 }, quantity: 1, courseNumber: 1, modifierIds: [] }],
      subtotalCents: 300,
      taxCents: 25,
      totalCents: 325,
    })

    const jsonString = await exportOfflineOrdersJSON()
    const parsed = JSON.parse(jsonString)

    expect(parsed.exportVersion).toBe('1.0.0')
    expect(parsed.totalOrders).toBe(1)
    expect(Array.isArray(parsed.orders)).toBe(true)
    expect(parsed.orders[0].items[0].name).toBe('Soda')
  })
})
