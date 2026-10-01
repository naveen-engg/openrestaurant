'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Users,
  Clock,
  Sparkles,
  Save,
  RotateCcw,
  Move,
  Layers,
  CheckCircle2,
  AlertTriangle,
  MoveHorizontal,
  Plus,
  UtensilsCrossed,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/features/storefront/lib/currency'
import {
  getTableTurnTimeMinutes,
  getTableTurnTimeTier,
  getTableServiceStatus,
  getTableDimensions,
  getAutoArrangedPositions,
  getSmartTablePositions,
  type TableShape,
  type TableStatus,
  type TableServiceStatus,
} from '@/features/keystone/tableUtils'

export interface FloorPlanTable {
  id: string
  tableNumber: string
  capacity: number
  status: TableStatus
  shape?: TableShape | null
  positionX?: number | null
  positionY?: number | null
  section?: { id: string; name: string } | null
  floor?: { id: string; name: string } | null
}

export interface FloorPlanOrder {
  id: string
  orderNumber: string
  status: string
  total: number
  guestCount: number
  createdAt: string
  tables: { id: string; tableNumber: string }[]
  payments?: { amount: number; status: string }[]
}

interface CommercialFloorPlanProps {
  tables: FloorPlanTable[]
  orders: FloorPlanOrder[]
  currencyCode?: string
  locale?: string
  onSelectTable: (table: FloorPlanTable) => void
  onQuickCleanTable?: (tableId: string) => Promise<void>
  onSaveTablePositions?: (updates: Array<{ id: string; x: number; y: number }>) => Promise<void>
  onStartOrder?: (tableId: string) => void
}

const CANVAS_WIDTH = 1100
const CANVAS_HEIGHT = 720

export function CommercialFloorPlan({
  tables,
  orders,
  currencyCode = 'USD',
  locale = 'en-US',
  onSelectTable,
  onQuickCleanTable,
  onSaveTablePositions,
  onStartOrder,
}: CommercialFloorPlanProps) {
  const [editMode, setEditMode] = useState(false)
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  // Map of active orders by table ID
  const activeOrdersByTable = useMemo(() => {
    const map = new Map<string, FloorPlanOrder>()
    for (const order of orders) {
      for (const t of order.tables || []) {
        if (!map.has(t.id)) {
          map.set(t.id, order)
        }
      }
    }
    return map
  }, [orders])

  // Extract unique sections
  const sections = useMemo(() => {
    const seen = new Set<string>()
    const list: Array<{ id: string; name: string }> = []
    for (const t of tables) {
      if (t.section && !seen.has(t.section.id)) {
        seen.add(t.section.id)
        list.push(t.section)
      }
    }
    return list
  }, [tables])

  // Compute smart positions for all tables whenever tables change
  useEffect(() => {
    const smart = getSmartTablePositions(tables, CANVAS_WIDTH, CANVAS_HEIGHT)
    const posMap: Record<string, { x: number; y: number }> = {}
    for (const t of smart) {
      posMap[t.id] = { x: t.positionX, y: t.positionY }
    }
    setLocalPositions(posMap)
    setHasUnsavedChanges(false)
  }, [tables])

  // Filter tables by selected section
  const visibleTables = useMemo(() => {
    if (selectedSection === 'all') return tables
    return tables.filter(t => t.section?.id === selectedSection)
  }, [tables, selectedSection])

  // Handle Drag Start
  const handlePointerDown = (tableId: string, e: React.PointerEvent) => {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()

    const currentPos = localPositions[tableId] || { x: 100, y: 100 }
    if (!canvasRef.current) return
    const canvasRect = canvasRef.current.getBoundingClientRect()

    setDraggingId(tableId)
    setDragOffset({
      x: e.clientX - canvasRect.left - currentPos.x,
      y: e.clientY - canvasRect.top - currentPos.y,
    })
  }

  // Handle Drag Move
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!editMode || !draggingId || !canvasRef.current) return
    e.preventDefault()

    const canvasRect = canvasRef.current.getBoundingClientRect()
    const rawX = e.clientX - canvasRect.left - dragOffset.x
    const rawY = e.clientY - canvasRect.top - dragOffset.y

    // Snap to 10px grid
    const snappedX = Math.round(rawX / 10) * 10
    const snappedY = Math.round(rawY / 10) * 10

    // Constrain within bounds
    const clampedX = Math.max(40, Math.min(CANVAS_WIDTH - 160, snappedX))
    const clampedY = Math.max(40, Math.min(CANVAS_HEIGHT - 120, snappedY))

    setLocalPositions(prev => ({
      ...prev,
      [draggingId]: { x: clampedX, y: clampedY },
    }))
    setHasUnsavedChanges(true)
  }

  // Handle Drag End
  const handlePointerUp = () => {
    if (draggingId) {
      setDraggingId(null)
    }
  }

  // Auto-arrange all tables
  const handleAutoArrange = () => {
    const auto = getAutoArrangedPositions(tables, CANVAS_WIDTH, CANVAS_HEIGHT)
    const posMap: Record<string, { x: number; y: number }> = {}
    for (const t of auto) {
      posMap[t.id] = { x: t.positionX, y: t.positionY }
    }
    setLocalPositions(posMap)
    setHasUnsavedChanges(true)
  }

  // Reset to saved layout
  const handleResetLayout = () => {
    const smart = getSmartTablePositions(tables, CANVAS_WIDTH, CANVAS_HEIGHT)
    const posMap: Record<string, { x: number; y: number }> = {}
    for (const t of smart) {
      posMap[t.id] = { x: t.positionX, y: t.positionY }
    }
    setLocalPositions(posMap)
    setHasUnsavedChanges(false)
  }

  // Save layout to backend
  const handleSaveLayout = async () => {
    if (!onSaveTablePositions) return
    setIsSaving(true)
    try {
      const updates = tables.map(t => ({
        id: t.id,
        x: localPositions[t.id]?.x ?? t.positionX ?? 100,
        y: localPositions[t.id]?.y ?? t.positionY ?? 100,
      }))
      await onSaveTablePositions(updates)
      setHasUnsavedChanges(false)
      setEditMode(false)
    } catch (err) {
      console.error('Failed to save table positions:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toast-Style Floor Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border border-border">
        <div className="flex items-center gap-3">
          {sections.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-muted-foreground" />
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger className="h-8 text-xs w-[140px] bg-background">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Sections</SelectItem>
                  {sections.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Status Legend Pills */}
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium text-[11px] border border-emerald-200 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Available
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-medium text-[11px] border border-rose-200 dark:border-rose-800">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Occupied
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-medium text-[11px] border border-amber-200 dark:border-amber-800">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Reserved
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-[11px] border border-zinc-300 dark:border-zinc-700">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              Cleaning
            </span>
          </div>
        </div>

        {/* Arrange Tables & Editing Controls */}
        <div className="flex items-center gap-2">
          {!editMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode(true)}
              className="h-8 text-xs font-medium"
            >
              <Move className="w-3.5 h-3.5 mr-1.5" />
              Arrange Tables
            </Button>
          ) : (
            <div className="flex items-center gap-2 animate-in fade-in duration-150">
              <Badge variant="secondary" className="text-[11px] bg-primary/10 text-primary border-primary/20">
                Arrange Mode
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoArrange}
                className="h-8 text-xs font-medium"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                Auto-Arrange
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetLayout}
                className="h-8 text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSaveLayout}
                disabled={!hasUnsavedChanges || isSaving}
                className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {isSaving ? 'Saving...' : 'Save Layout'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditMode(false)
                  handleResetLayout()
                }}
                className="h-8 text-xs text-muted-foreground"
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Floor Canvas Container */}
      <div className="relative w-full overflow-x-auto rounded-2xl border border-border shadow-sm bg-gradient-to-br from-zinc-50/80 via-white to-zinc-100/60 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950/80">
        <div
          ref={canvasRef}
          style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
          className={cn(
            'relative select-none',
            editMode && 'cursor-crosshair bg-grid-pattern'
          )}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Floor Architecture & Section Background Zones */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Main Dining Room Zone */}
            <div className="absolute left-6 top-6 w-[640px] h-[670px] rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-900/20 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 dark:text-zinc-600 tracking-wider uppercase">
                <span>Main Dining Room</span>
                <span className="text-[10px] lowercase font-normal opacity-70">indoor seating</span>
              </div>
            </div>

            {/* Patio & Terrace Zone */}
            <div className="absolute right-6 top-6 w-[380px] h-[400px] rounded-2xl border border-dashed border-sky-200/80 dark:border-sky-950/60 bg-sky-50/20 dark:bg-sky-950/10 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-sky-600/70 dark:text-sky-400/60 tracking-wider uppercase">
                <span>Patio & Terrace</span>
                <span className="text-[10px] lowercase font-normal opacity-70">outdoor</span>
              </div>
            </div>

            {/* Bar & High Tops Zone */}
            <div className="absolute right-6 bottom-6 w-[380px] h-[240px] rounded-2xl border border-dashed border-amber-200/80 dark:border-amber-950/60 bg-amber-50/20 dark:bg-amber-950/10 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-700/70 dark:text-amber-400/60 tracking-wider uppercase">
                <span>Bar & High Tops</span>
                <span className="text-[10px] lowercase font-normal opacity-70">cocktails & drinks</span>
              </div>
            </div>

            {/* Kitchen & Service Pass Marker */}
            <div className="absolute left-[240px] bottom-6 w-[220px] py-1 px-3 rounded-full border border-zinc-300 dark:border-zinc-700 bg-background/90 text-center shadow-xs">
              <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground flex items-center justify-center gap-1.5">
                <UtensilsCrossed size={11} /> Kitchen Pass
              </p>
            </div>
          </div>

          {/* Grid pattern when in arrange mode */}
          {editMode && (
            <svg className="absolute inset-0 pointer-events-none opacity-20 w-full h-full">
              <defs>
                <pattern id="canvas-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#canvas-grid)" />
            </svg>
          )}

          {/* Render Table Elements */}
          {visibleTables.map(table => {
            const pos = localPositions[table.id] || {
              x: table.positionX && table.positionX > 20 ? table.positionX : 120,
              y: table.positionY && table.positionY > 20 ? table.positionY : 120,
            }
            const activeOrder = activeOrdersByTable.get(table.id)
            const serviceStatus = getTableServiceStatus(activeOrder, table.status)
            const shape: TableShape = table.shape || (table.capacity >= 6 ? 'rectangle' : table.capacity === 4 ? 'round' : 'square')
            const dim = getTableDimensions(shape, table.capacity)
            const turnMinutes = activeOrder ? getTableTurnTimeMinutes(activeOrder.createdAt) : 0
            const turnTier = getTableTurnTimeTier(turnMinutes)
            const isDragging = draggingId === table.id

            return (
              <div
                key={table.id}
                style={{
                  position: 'absolute',
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  width: `${dim.width}px`,
                  height: `${dim.height}px`,
                  transform: 'translate(-50%, -50%)',
                }}
                onPointerDown={e => handlePointerDown(table.id, e)}
                onClick={e => {
                  if (!editMode) {
                    e.stopPropagation()
                    onSelectTable(table)
                  }
                }}
                className={cn(
                  'group select-none transition-shadow duration-150',
                  editMode ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-primary/60' : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
                  isDragging && 'z-50 shadow-2xl scale-105 opacity-90 ring-2 ring-primary'
                )}
              >
                {/* Visual Chairs around table */}
                <TableChairs shape={shape} capacity={table.capacity} />

                {/* Table Top Surface Card */}
                <div
                  className={cn(
                    'w-full h-full flex flex-col items-center justify-center p-2 text-center transition-all duration-200 shadow-sm relative overflow-hidden',
                    shape === 'round' ? 'rounded-full' : shape === 'square' ? 'rounded-2xl' : 'rounded-xl',
                    // Available status
                    table.status === 'available' &&
                      'bg-white dark:bg-zinc-900 border-2 border-emerald-500/80 text-zinc-900 dark:text-zinc-100 hover:border-emerald-600 hover:shadow-emerald-500/10 hover:shadow-md',
                    // Occupied status
                    table.status === 'occupied' &&
                      'bg-rose-50/90 dark:bg-rose-950/40 border-2 border-rose-500 text-rose-950 dark:text-rose-100 shadow-xs hover:border-rose-600',
                    // Reserved status
                    table.status === 'reserved' &&
                      'bg-amber-50/80 dark:bg-amber-950/40 border-2 border-amber-500 text-amber-950 dark:text-amber-100 hover:border-amber-600',
                    // Cleaning status
                    table.status === 'cleaning' &&
                      'bg-zinc-100 dark:bg-zinc-800 border-2 border-dashed border-zinc-400 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300'
                  )}
                >
                  {/* Table Number Header */}
                  <div className="flex items-center justify-center gap-1 font-bold text-sm tracking-tight leading-none">
                    <span>Table {table.tableNumber}</span>
                    {table.capacity > 0 && (
                      <span className="text-[10px] font-normal text-muted-foreground flex items-center gap-0.5">
                        <Users size={9} /> {table.capacity}
                      </span>
                    )}
                  </div>

                  {/* Active Order Details if Occupied */}
                  {table.status === 'occupied' && activeOrder ? (
                    <div className="flex flex-col items-center gap-0.5 mt-0.5 leading-tight">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="font-semibold text-foreground">#{activeOrder.orderNumber}</span>
                        <span>·</span>
                        <span>{activeOrder.guestCount || 1} guests</span>
                      </div>
                      <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                        {formatCurrency(activeOrder.total, currencyCode, locale)}
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Turn Timer Badge */}
                        <span
                          className={cn(
                            'px-1.5 py-0.2 rounded-full text-[9px] font-medium border flex items-center gap-0.5',
                            turnTier === 'alert'
                              ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/80 dark:text-rose-200 animate-pulse'
                              : turnTier === 'warning'
                              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/80 dark:text-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/80 dark:text-emerald-200'
                          )}
                        >
                          <Clock size={8} /> {turnMinutes}m
                        </span>

                        {/* Service phase tag */}
                        <span className="text-[9px] uppercase font-bold tracking-wider opacity-80">
                          {serviceStatus === 'check_dropped' ? 'chk' : serviceStatus === 'paid' ? 'paid' : 'dine'}
                        </span>
                      </div>
                    </div>
                  ) : table.status === 'cleaning' ? (
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                        Needs Bus
                      </span>
                      {onQuickCleanTable && !editMode && (
                        <button
                          type="button"
                          aria-label="Mark Clean"
                          onClick={e => {
                            e.stopPropagation()
                            onQuickCleanTable(table.id)
                          }}
                          className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 hover:bg-emerald-500 hover:text-white text-zinc-800 dark:text-zinc-200 text-[10px] font-medium transition-colors flex items-center gap-1"
                        >
                          <Sparkles size={9} /> Mark Clean
                        </button>
                      )}
                    </div>
                  ) : table.status === 'reserved' ? (
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mt-1 uppercase tracking-wider">
                      Reserved
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                      Available
                    </span>
                  )}
                </div>

                {/* Edit Mode Drag Coordinate Tooltip */}
                {editMode && isDragging && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 text-white text-[10px] font-mono whitespace-nowrap shadow-md pointer-events-none">
                    X: {Math.round(pos.x)}, Y: {Math.round(pos.y)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Renders small chair notches around a table shape
 */
function TableChairs({ shape, capacity }: { shape: TableShape; capacity: number }) {
  if (shape === 'round') {
    const chairCount = Math.min(8, Math.max(2, capacity))
    return (
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: chairCount }).map((_, i) => {
          const angle = (i * 360) / chairCount
          return (
            <span
              key={i}
              style={{
                transform: `rotate(${angle}deg) translate(0, -100%)`,
                transformOrigin: 'center center',
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700"
            />
          )
        })}
      </div>
    )
  }

  if (shape === 'square') {
    return (
      <div className="absolute inset-0 pointer-events-none">
        {/* Top & Bottom */}
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        {/* Left & Right */}
        <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span className="absolute -right-2 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-full bg-zinc-300 dark:bg-zinc-700" />
      </div>
    )
  }

  // Rectangle / Booth
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top chairs */}
      <div className="absolute -top-2 left-0 right-0 flex justify-around px-3">
        <span className="w-5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span className="w-5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        {capacity >= 6 && <span className="w-5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />}
      </div>
      {/* Bottom chairs */}
      <div className="absolute -bottom-2 left-0 right-0 flex justify-around px-3">
        <span className="w-5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span className="w-5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        {capacity >= 6 && <span className="w-5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />}
      </div>
    </div>
  )
}
