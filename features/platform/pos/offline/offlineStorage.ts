/**
 * Openfront POS - Offline Storage & Local Persistence Engine
 * Supports IndexedDB with transparent in-memory / localStorage fallback for SSR and tests.
 */

export interface OfflineOrderItem {
  menuItemId: string
  name: string
  price: number
  quantity: number
  courseNumber: number
  seatNumber?: number
  station: string
  modifierIds: string[]
  modifierNames?: string[]
  specialInstructions?: string | null
  isHeld?: boolean
}

export interface OfflineOrderPayload {
  clientOrderId: string
  createdAt: string
  orderType: 'dine_in' | 'takeout'
  guestCount: number
  tableIds: string[]
  tableNumbers?: string[]
  isUrgent: boolean
  specialInstructions?: string | null
  items: OfflineOrderItem[]
  subtotalCents: number
  taxCents: number
  totalCents: number
  syncStatus: 'QUEUED' | 'SYNCING' | 'SYNCED' | 'FAILED'
  syncAttempts: number
  lastError?: string | null
  serverOrderId?: string | null
}

export interface CachedPOSCatalog {
  tables: any[]
  categories: any[]
  items: any[]
  storeSettings: any
  cachedAt: string
}

const DB_NAME = 'openfront_pos_db'
const DB_VERSION = 1
const ORDERS_STORE = 'offline_orders'
const CATALOG_STORE = 'pos_catalog'

// In-memory fallback for Node/Vitest environments without native IndexedDB
const memoryOrderStore: Map<string, OfflineOrderPayload> = new Map()
let memoryCatalogStore: CachedPOSCatalog | null = null

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error('IndexedDB unavailable'))
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase
      if (!db.objectStoreNames.contains(ORDERS_STORE)) {
        const orderStore = db.createObjectStore(ORDERS_STORE, { keyPath: 'clientOrderId' })
        orderStore.createIndex('syncStatus', 'syncStatus', { unique: false })
        orderStore.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = (event: any) => {
      resolve(event.target.result as IDBDatabase)
    }

    request.onerror = (event: any) => {
      reject(event.target.error)
    }
  })
}

/**
 * Save or update an offline order in local storage
 */
export async function saveOfflineOrder(order: OfflineOrderPayload): Promise<void> {
  if (!isIndexedDBAvailable()) {
    memoryOrderStore.set(order.clientOrderId, { ...order })
    try {
      if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
        window.localStorage.setItem(`offline_order_${order.clientOrderId}`, JSON.stringify(order))
      }
    } catch {
      // ignore localStorage quota errors
    }
    return
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ORDERS_STORE], 'readwrite')
    const store = tx.objectStore(ORDERS_STORE)
    const request = store.put(order)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Get all offline orders stored locally
 */
export async function getAllOfflineOrders(): Promise<OfflineOrderPayload[]> {
  if (!isIndexedDBAvailable()) {
    return Array.from(memoryOrderStore.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ORDERS_STORE], 'readonly')
    const store = tx.objectStore(ORDERS_STORE)
    const request = store.getAll()

    request.onsuccess = () => {
      const orders = (request.result as OfflineOrderPayload[]) || []
      resolve(
        orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      )
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * Get pending (QUEUED or FAILED) offline orders ready for synchronization
 */
export async function getPendingOfflineOrders(): Promise<OfflineOrderPayload[]> {
  const all = await getAllOfflineOrders()
  return all.filter((o) => o.syncStatus === 'QUEUED' || o.syncStatus === 'FAILED')
}

/**
 * Delete a specific offline order by clientOrderId
 */
export async function deleteOfflineOrder(clientOrderId: string): Promise<void> {
  if (!isIndexedDBAvailable()) {
    memoryOrderStore.delete(clientOrderId)
    try {
      if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.removeItem === 'function') {
        window.localStorage.removeItem(`offline_order_${clientOrderId}`)
      }
    } catch {
      // ignore
    }
    return
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ORDERS_STORE], 'readwrite')
    const store = tx.objectStore(ORDERS_STORE)
    const request = store.delete(clientOrderId)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Remove all successfully SYNCED orders from local storage
 */
export async function clearSyncedOfflineOrders(): Promise<number> {
  const all = await getAllOfflineOrders()
  const synced = all.filter((o) => o.syncStatus === 'SYNCED')
  for (const order of synced) {
    await deleteOfflineOrder(order.clientOrderId)
  }
  return synced.length
}

/**
 * Cache POS Catalog (tables, items, categories, settings) for offline instant reload
 */
export async function cachePOSCatalog(catalog: Omit<CachedPOSCatalog, 'cachedAt'>): Promise<void> {
  const payload: CachedPOSCatalog = {
    ...catalog,
    cachedAt: new Date().toISOString(),
  }

  if (!isIndexedDBAvailable()) {
    memoryCatalogStore = payload
    try {
      if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
        window.localStorage.setItem('pos_catalog_cache', JSON.stringify(payload))
      }
    } catch {
      // ignore
    }
    return
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([CATALOG_STORE], 'readwrite')
    const store = tx.objectStore(CATALOG_STORE)
    const request = store.put({ key: 'latest', ...payload })

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Retrieve cached POS catalog when offline
 */
export async function getCachedPOSCatalog(): Promise<CachedPOSCatalog | null> {
  if (!isIndexedDBAvailable()) {
    if (memoryCatalogStore) return memoryCatalogStore
    try {
      if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
        const item = window.localStorage.getItem('pos_catalog_cache')
        return item ? JSON.parse(item) : null
      }
    } catch {
      return null
    }
    return null
  }

  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction([CATALOG_STORE], 'readonly')
      const store = tx.objectStore(CATALOG_STORE)
      const request = store.get('latest')

      request.onsuccess = () => {
        if (request.result) {
          const { key, ...rest } = request.result
          resolve(rest as CachedPOSCatalog)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

/**
 * Helper to clear test in-memory stores
 */
export function _resetMemoryStoresForTesting(): void {
  memoryOrderStore.clear()
  memoryCatalogStore = null
}
