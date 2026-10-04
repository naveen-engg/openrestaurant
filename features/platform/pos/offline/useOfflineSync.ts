'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getAllOfflineOrders,
  clearSyncedOfflineOrders,
  OfflineOrderPayload,
} from './offlineStorage'
import {
  syncAllPendingOrders,
  OFFLINE_SYNC_EVENT,
  SyncResult,
  downloadOfflineOrdersBackup,
} from './syncEngine'

export interface UseOfflineSyncOptions {
  requestFn?: (url: string, query: any, variables: any) => Promise<any>
  createOrderMutation?: any
  autoSyncOnReconnect?: boolean
  onSyncComplete?: (result: SyncResult) => void
}

export function useOfflineSync(options?: UseOfflineSyncOptions) {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true
  })
  const [orders, setOrders] = useState<OfflineOrderPayload[]>([])
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options

  const refreshOrders = useCallback(async () => {
    try {
      const all = await getAllOfflineOrders()
      setOrders(all)
    } catch {
      // ignore
    }
  }, [])

  const syncNow = useCallback(async () => {
    const opts = optionsRef.current
    if (!opts?.requestFn || !opts?.createOrderMutation || isSyncing) return

    try {
      setIsSyncing(true)
      const res = await syncAllPendingOrders(opts.requestFn, opts.createOrderMutation)
      setLastSyncResult(res)
      await refreshOrders()
      if (opts.onSyncComplete) {
        opts.onSyncComplete(res)
      }
      return res
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, refreshOrders])

  useEffect(() => {
    refreshOrders()

    const handleOnline = () => {
      setIsOnline(true)
      if (optionsRef.current?.autoSyncOnReconnect !== false) {
        syncNow()
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    const handleCustomUpdate = () => {
      refreshOrders()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      window.addEventListener(OFFLINE_SYNC_EVENT, handleCustomUpdate)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        window.removeEventListener(OFFLINE_SYNC_EVENT, handleCustomUpdate)
      }
    }
  }, [refreshOrders, syncNow])

  const clearSynced = useCallback(async () => {
    const count = await clearSyncedOfflineOrders()
    await refreshOrders()
    return count
  }, [refreshOrders])

  const pendingCount = orders.filter(
    (o) => o.syncStatus === 'QUEUED' || o.syncStatus === 'FAILED'
  ).length

  return {
    isOnline,
    setIsOnline, // exposed for testing / manual toggle
    orders,
    pendingCount,
    isSyncing,
    lastSyncResult,
    syncNow,
    refreshOrders,
    clearSynced,
    exportBackup: downloadOfflineOrdersBackup,
  }
}
