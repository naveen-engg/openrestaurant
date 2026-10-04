'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  FileText,
} from 'lucide-react'
import { OfflineOrderPayload } from '../offline/offlineStorage'

interface OfflineSyncModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isOnline: boolean
  onToggleOnline?: (online: boolean) => void
  orders: OfflineOrderPayload[]
  isSyncing: boolean
  onSyncNow: () => Promise<any>
  onClearSynced: () => Promise<number>
  onExportBackup: () => Promise<void>
}

export function OfflineSyncModal({
  open,
  onOpenChange,
  isOnline,
  onToggleOnline,
  orders,
  isSyncing,
  onSyncNow,
  onClearSynced,
  onExportBackup,
}: OfflineSyncModalProps) {
  const [clearing, setClearing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const pendingOrders = orders.filter((o) => o.syncStatus === 'QUEUED' || o.syncStatus === 'FAILED')
  const syncedOrders = orders.filter((o) => o.syncStatus === 'SYNCED')
  const failedOrders = orders.filter((o) => o.syncStatus === 'FAILED')

  const handleSync = async () => {
    try {
      setSyncing(true)
      setSyncMessage(null)
      const res = await onSyncNow()
      if (res) {
        setSyncMessage(`Synced ${res.synced} order${res.synced === 1 ? '' : 's'}.${res.failed ? ` (${res.failed} failed)` : ''}`)
      }
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err.message || String(err)}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleClear = async () => {
    try {
      setClearing(true)
      const count = await onClearSynced()
      setSyncMessage(`Cleared ${count} synced order${count === 1 ? '' : 's'} from local memory.`)
    } finally {
      setClearing(false)
    }
  }

  const formatCents = (cents: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="shrink-0 pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <DialogTitle className="text-lg font-bold">Offline Queue & Sync Hub</DialogTitle>
            </div>
            {onToggleOnline && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onToggleOnline(!isOnline)}
                className="text-xs h-7 gap-1"
                title="Simulate network disconnect / reconnect"
              >
                {isOnline ? <WifiOff className="h-3 w-3 text-amber-500" /> : <Wifi className="h-3 w-3 text-emerald-500" />}
                <span>{isOnline ? 'Simulate Offline' : 'Simulate Online'}</span>
              </Button>
            )}
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Monitor local IndexedDB terminal storage, review queued offline tickets, and synchronize with Openfront cloud servers.
          </DialogDescription>
        </DialogHeader>

        {/* Status Metrics Strip */}
        <div className="grid grid-cols-4 gap-2.5 py-2 shrink-0">
          <div className="p-2.5 rounded-lg border bg-card flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Network</span>
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
              <span className={isOnline ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
                {isOnline ? 'Cloud Active' : 'Offline Mode'}
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg border bg-card flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pending Sync</span>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {pendingOrders.length}
            </span>
          </div>

          <div className="p-2.5 rounded-lg border bg-card flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Synced Local</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {syncedOrders.length}
            </span>
          </div>

          <div className="p-2.5 rounded-lg border bg-card flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sync Errors</span>
            <span className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              {failedOrders.length}
            </span>
          </div>
        </div>

        {syncMessage && (
          <div className="px-3 py-2 rounded-md bg-muted text-xs font-medium text-foreground flex items-center gap-2 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}

        {/* Orders Queue List */}
        <div className="flex-1 min-h-[220px] overflow-y-auto space-y-2.5 pr-1 border rounded-lg p-3 bg-muted/20">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-44 text-muted-foreground text-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500/70" />
              <div className="font-semibold text-sm">All Clean — No Local Orders in Queue</div>
              <div className="text-xs max-w-xs text-muted-foreground/80">
                Any orders placed while disconnected will automatically appear here and sync on reconnect.
              </div>
            </div>
          ) : (
            orders.map((order) => {
              const dateStr = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              return (
                <div
                  key={order.clientOrderId}
                  className="p-3 rounded-lg border bg-card text-card-foreground shadow-xs flex flex-col gap-2 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-bold text-foreground">
                        {order.clientOrderId}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          order.syncStatus === 'QUEUED'
                            ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
                            : order.syncStatus === 'SYNCING'
                            ? 'bg-blue-500/15 text-blue-700 border-blue-500/30 animate-pulse'
                            : order.syncStatus === 'SYNCED'
                            ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-700 border-rose-500/30'
                        }`}
                      >
                        {order.syncStatus}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {dateStr}
                      </span>
                    </div>

                    <div className="text-sm font-bold tabular-nums text-foreground shrink-0">
                      {formatCents(order.totalCents)}
                    </div>
                  </div>

                  {/* Destination and guest info */}
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {order.orderType === 'dine_in'
                        ? `Dine-In • Tables: ${order.tableNumbers?.join(', ') || order.tableIds.join(', ')}`
                        : 'Takeout'}
                    </span>
                    <span>•</span>
                    <span>{order.guestCount} guest{order.guestCount !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>{order.items.reduce((acc, i) => acc + i.quantity, 0)} items</span>
                  </div>

                  {/* Items summary */}
                  <div className="text-xs bg-muted/40 rounded p-2 text-foreground/90 space-y-1">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[11px]">
                        <span className="truncate">
                          {item.quantity}x {item.name}
                          {item.modifierNames && item.modifierNames.length > 0 && (
                            <span className="text-muted-foreground italic ml-1">
                              ({item.modifierNames.join(', ')})
                            </span>
                          )}
                          {item.seatNumber && <span className="text-muted-foreground ml-1">· Seat {item.seatNumber}</span>}
                        </span>
                        <span className="tabular-nums text-muted-foreground ml-2 shrink-0">
                          {formatCents(item.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {order.lastError && (
                    <div className="text-[11px] text-rose-600 bg-rose-500/10 rounded px-2 py-1 flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="truncate">{order.lastError}</span>
                    </div>
                  )}

                  {order.serverOrderId && (
                    <div className="text-[10px] text-emerald-600 font-mono flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      <span>Cloud Order ID: {order.serverOrderId}</span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer controls */}
        <DialogFooter className="shrink-0 pt-3 flex flex-wrap items-center justify-between gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportBackup}
              className="text-xs h-8 gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Export Backup (JSON)
            </Button>

            {syncedOrders.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={clearing}
                className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear {syncedOrders.length} Synced
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing || syncing || pendingOrders.length === 0}
              className="text-xs h-8 gap-1.5 font-bold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing || syncing ? 'animate-spin' : ''}`} />
              {isSyncing || syncing ? 'Syncing...' : `Sync All (${pendingOrders.length})`}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-8"
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
