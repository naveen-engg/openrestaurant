'use client'

import React from 'react'
import { Wifi, WifiOff, RefreshCw, Database, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface OfflineBannerProps {
  isOnline: boolean
  pendingCount: number
  isSyncing: boolean
  onOpenSyncModal: () => void
  onSyncNow?: () => void
}

export function OfflineBanner({
  isOnline,
  pendingCount,
  isSyncing,
  onOpenSyncModal,
  onSyncNow,
}: OfflineBannerProps) {
  // If online and no pending orders, render nothing or a compact status pill
  const showBanner = !isOnline || pendingCount > 0

  if (!showBanner) {
    return null
  }

  return (
    <div
      role="status"
      aria-label="Offline Mode Notification"
      className={`w-full px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm font-medium border-b shrink-0 transition-colors ${
        !isOnline
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-300'
          : pendingCount > 0
          ? 'bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300'
          : 'bg-muted border-border text-foreground'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {!isOnline ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-200 text-xs font-semibold shrink-0">
            <WifiOff className="h-3.5 w-3.5" />
            <span>OFFLINE MODE</span>
          </div>
        ) : isSyncing ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-900 dark:text-blue-200 text-xs font-semibold shrink-0">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span>SYNCING</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 text-xs font-semibold shrink-0">
            <Wifi className="h-3.5 w-3.5" />
            <span>ONLINE</span>
          </div>
        )}

        <span className="truncate">
          {!isOnline
            ? pendingCount > 0
              ? `Terminal is offline. ${pendingCount} order${pendingCount === 1 ? '' : 's'} saved locally and will auto-sync on reconnect.`
              : 'Terminal is offline. Orders will be saved securely to local terminal storage.'
            : isSyncing
            ? `Reconnected to cloud. Synchronizing ${pendingCount} pending order${pendingCount === 1 ? '' : 's'}...`
            : `${pendingCount} offline order${pendingCount === 1 ? '' : 's'} waiting in queue.`}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {pendingCount > 0 && onSyncNow && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSyncNow}
            disabled={isSyncing}
            className="h-7 text-xs gap-1.5 border-current hover:bg-background/80"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onOpenSyncModal}
          className="h-7 text-xs gap-1.5 font-semibold"
        >
          <Database className="h-3 w-3" />
          Queue Details ({pendingCount})
        </Button>
      </div>
    </div>
  )
}

/**
 * Compact pill for POS header navbar
 */
export function OfflineStatusPill({
  isOnline,
  pendingCount,
  isSyncing,
  onClick,
}: {
  isOnline: boolean
  pendingCount: number
  isSyncing: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
        !isOnline
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
          : pendingCount > 0
          ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20'
          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
      }`}
      title={
        !isOnline
          ? 'Offline Mode - Click to manage sync queue'
          : pendingCount > 0
          ? `${pendingCount} orders pending sync - Click to view`
          : 'Connected to Cloud - Click to view offline diagnostics'
      }
    >
      {!isOnline ? (
        <>
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Offline</span>
          {pendingCount > 0 && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] border-amber-500/40 ml-0.5">
              {pendingCount}
            </Badge>
          )}
        </>
      ) : isSyncing ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
          <span>Syncing...</span>
        </>
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Cloud Online</span>
          {pendingCount > 0 && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] border-blue-500/40 ml-0.5">
              {pendingCount}
            </Badge>
          )}
        </>
      )}
    </button>
  )
}
