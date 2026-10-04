/**
 * Openfront POS - Offline Sync Engine
 * Manages order enqueueing, background sync replay, network connectivity listeners,
 * and offline order audit exports.
 */

import {
  saveOfflineOrder,
  getAllOfflineOrders,
  getPendingOfflineOrders,
  clearSyncedOfflineOrders,
  OfflineOrderPayload,
  OfflineOrderItem,
} from './offlineStorage'

export const OFFLINE_SYNC_EVENT = 'openfront:pos:offline-sync-updated'

export function emitSyncUpdate(orders?: OfflineOrderPayload[]) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(OFFLINE_SYNC_EVENT, {
        detail: { orders },
      })
    )
  }
}

export function generateClientOrderId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `off_${timestamp}_${random}`
}

export interface EnqueueOrderInput {
  orderType: 'dine_in' | 'takeout'
  guestCount: number
  tableIds: string[]
  tableNumbers?: string[]
  isUrgent: boolean
  specialInstructions?: string | null
  items: Array<{
    menuItem: { id: string; name: string; price: number | string; station?: string; kitchenStation?: string }
    quantity: number
    courseNumber: number
    seatNumber?: number
    station?: string
    modifierIds: string[]
    modifierNames?: string[]
    specialInstructions?: string | null
    isHeld?: boolean
  }>
  subtotalCents: number
  taxCents: number
  totalCents: number
}

/**
 * Enqueue an order for offline storage
 */
export async function enqueuePOSOrder(input: EnqueueOrderInput): Promise<OfflineOrderPayload> {
  const clientOrderId = generateClientOrderId()
  const now = new Date().toISOString()

  const formattedItems: OfflineOrderItem[] = input.items.map((item) => ({
    menuItemId: item.menuItem.id,
    name: item.menuItem.name,
    price: Number(item.menuItem.price || 0),
    quantity: item.quantity,
    courseNumber: item.courseNumber,
    seatNumber: item.seatNumber || 1,
    station: item.station || item.menuItem.station || item.menuItem.kitchenStation || 'hot_line',
    modifierIds: item.modifierIds,
    modifierNames: item.modifierNames || [],
    specialInstructions: item.specialInstructions || null,
    isHeld: Boolean(item.isHeld),
  }))

  const payload: OfflineOrderPayload = {
    clientOrderId,
    createdAt: now,
    orderType: input.orderType,
    guestCount: input.guestCount,
    tableIds: input.tableIds,
    tableNumbers: input.tableNumbers || [],
    isUrgent: input.isUrgent,
    specialInstructions: input.specialInstructions || null,
    items: formattedItems,
    subtotalCents: input.subtotalCents,
    taxCents: input.taxCents,
    totalCents: input.totalCents,
    syncStatus: 'QUEUED',
    syncAttempts: 0,
    lastError: null,
  }

  await saveOfflineOrder(payload)
  emitSyncUpdate()
  return payload
}

export interface SyncResult {
  total: number
  synced: number
  failed: number
  errors: Array<{ clientOrderId: string; error: string }>
}

/**
 * Replay and synchronize all pending offline orders
 */
export async function syncAllPendingOrders(
  requestFn: (url: string, query: any, variables: any) => Promise<any>,
  createOrderMutation: any
): Promise<SyncResult> {
  const pending = await getPendingOfflineOrders()
  const result: SyncResult = {
    total: pending.length,
    synced: 0,
    failed: 0,
    errors: [],
  }

  if (pending.length === 0) {
    return result
  }

  for (const order of pending) {
    try {
      // Mark as SYNCING
      order.syncStatus = 'SYNCING'
      order.syncAttempts += 1
      await saveOfflineOrder(order)
      emitSyncUpdate()

      const res = await requestFn('/api/graphql', createOrderMutation, {
        orderType: order.orderType,
        guestCount: order.guestCount,
        tableIds: order.tableIds,
        isUrgent: order.isUrgent,
        specialInstructions: order.specialInstructions,
        items: order.items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          courseNumber: i.courseNumber,
          seatNumber: i.seatNumber || 1,
          station: i.station,
          modifierIds: i.modifierIds,
          specialInstructions: i.specialInstructions || null,
          isHeld: Boolean(i.isHeld),
        })),
      })

      const serverId = res?.createPOSOrder?.id || res?.data?.createPOSOrder?.id || 'synced'
      order.syncStatus = 'SYNCED'
      order.serverOrderId = serverId
      order.lastError = null
      await saveOfflineOrder(order)
      result.synced += 1
    } catch (err: any) {
      const errorMessage = err?.message || String(err)
      order.syncStatus = 'FAILED'
      order.lastError = errorMessage
      await saveOfflineOrder(order)
      result.failed += 1
      result.errors.push({ clientOrderId: order.clientOrderId, error: errorMessage })
    }
  }

  emitSyncUpdate()
  return result
}

/**
 * Export all offline orders as formatted JSON for disaster recovery / audit
 */
export async function exportOfflineOrdersJSON(): Promise<string> {
  const all = await getAllOfflineOrders()
  const exportPayload = {
    exportVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    totalOrders: all.length,
    orders: all,
  }
  return JSON.stringify(exportPayload, null, 2)
}

/**
 * Trigger browser file download of the offline orders audit JSON
 */
export async function downloadOfflineOrdersBackup(): Promise<void> {
  const json = await exportOfflineOrdersJSON()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `openfront_pos_offline_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
