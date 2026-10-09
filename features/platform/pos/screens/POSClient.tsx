'use client'

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  Plus,
  Minus,
  X,
  ShoppingCart,
  AlertCircle,
  RefreshCw,
  Check,
  Utensils,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { cn } from '@/lib/utils'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { calculateItemPriceWithModifiers } from '@/features/keystone/modifierUtils'
import { TimeClockModal } from '@/features/platform/staff/components/TimeClockModal'
import { HardwareSettingsModal } from '@/features/platform/hardware/components/HardwareSettingsModal'
import { printKitchen } from '@/features/platform/hardware/printerService'
import { formatCurrency } from '@/features/storefront/lib/currency'
import { OfflineBanner, OfflineStatusPill } from '../components/OfflineBanner'
import { OfflineSyncModal } from '../components/OfflineSyncModal'
import { useOfflineSync } from '../offline/useOfflineSync'
import { enqueuePOSOrder } from '../offline/syncEngine'
import { cachePOSCatalog, getCachedPOSCatalog } from '../offline/offlineStorage'

interface Table {
  id: string
  tableNumber: string
  capacity: number
  status: string
}

interface MenuCategory {
  id: string
  name: string
}

interface MenuModifier {
  id: string
  name: string
  modifierGroup: string
  modifierGroupLabel?: string | null
  required: boolean
  minSelections: number
  maxSelections: number
  priceAdjustment: string
  defaultSelected: boolean
}

interface MenuItem {
  id: string
  name: string
  price: string
  available: boolean
  thumbnail?: string | null
  station?: string | null
  kitchenStation?: string | null
  category: { id: string; name: string } | null
  modifiers: MenuModifier[]
}

interface CartItem {
  menuItem: MenuItem
  quantity: number
  courseNumber: number
  seatNumber?: number
  station: string
  modifierIds: string[]
  specialInstructions: string
  isHeld?: boolean
}

const GET_DATA = gql`
  query GetPOSData {
    tables(where: { status: { in: ["available", "occupied"] } }, orderBy: { tableNumber: asc }) {
      id tableNumber capacity status
    }
    menuCategories(orderBy: { sortOrder: asc }) { id name }
    menuItems(orderBy: { name: asc }) {
      id name price available thumbnail station kitchenStation
      category { id name }
      modifiers {
        id name modifierGroup modifierGroupLabel required
        minSelections maxSelections priceAdjustment defaultSelected
      }
    }
    storeSettings {
      taxRate
      currencyCode
      locale
    }
  }
`

const CREATE_POS_ORDER = gql`
  mutation CreatePOSOrder(
    $orderType: String!
    $guestCount: Int
    $tableIds: [ID!]
    $isUrgent: Boolean
    $specialInstructions: String
    $items: [POSOrderItemInput!]!
  ) {
    createPOSOrder(
      orderType: $orderType
      guestCount: $guestCount
      tableIds: $tableIds
      isUrgent: $isUrgent
      specialInstructions: $specialInstructions
      items: $items
    ) {
      id
      orderNumber
    }
  }
`

export function POSClient() {
  const [data, setData] = useState<{
    tables: Table[]
    categories: MenuCategory[]
    items: MenuItem[]
    storeSettings: { taxRate?: string | null; currencyCode?: string | null; locale?: string | null } | null
  }>({ tables: [], categories: [], items: [], storeSettings: null })

  const currencyConfig = React.useMemo(() => ({
    currencyCode: data.storeSettings?.currencyCode || 'USD',
    locale: data.storeSettings?.locale || 'en-US',
  }), [data.storeSettings])

  const formatMoney = (cents: number) => {
    return formatCurrency(cents, currencyConfig)
  }

  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [orderType, setOrderType] = useState<'dine_in' | 'takeout'>('dine_in')
  const [guestCount, setGuestCount] = useState(1)
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false)
  const [isUrgent, setIsUrgent] = useState(false)
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [configuringItem, setConfiguringItem] = useState<MenuItem | null>(null)
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [itemInstructions, setItemInstructions] = useState('')
  const [modifierError, setModifierError] = useState<string | null>(null)
  const [timeClockOpen, setTimeClockOpen] = useState(false)
  const [offlineModalOpen, setOfflineModalOpen] = useState(false)
  const [hardwareModalOpen, setHardwareModalOpen] = useState(false)

  const offlineSync = useOfflineSync({
    requestFn: request,
    createOrderMutation: CREATE_POS_ORDER,
    autoSyncOnReconnect: true,
  })

  const fetchData = async () => {
    try {
      const res: any = await request('/api/graphql', GET_DATA)
      const catalogData = {
        tables: res.tables || [],
        categories: res.menuCategories || [],
        items: res.menuItems || [],
        storeSettings: res.storeSettings || null,
      }
      setData(catalogData)
      await cachePOSCatalog(catalogData).catch(() => {})
    } catch (err) {
      console.warn('Live fetch failed, loading POS catalog from offline cache:', err)
      const cached = await getCachedPOSCatalog().catch(() => null)
      if (cached) {
        setData({
          tables: cached.tables || [],
          categories: cached.categories || [],
          items: cached.items || [],
          storeSettings: cached.storeSettings || null,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const i = setInterval(fetchData, 30_000)
    return () => clearInterval(i)
  }, [])

  const appendConfiguredItem = (menuItem: MenuItem, modifierIds: string[], instructions = '') => {
    const signature = [...modifierIds].sort().join(':')
    const defaultStation = menuItem.station || menuItem.kitchenStation || 'hot_line'
    const catName = menuItem.category?.name?.toLowerCase() || ''
    const defaultCourse = catName.includes('dessert') ? 3 : (catName.includes('food') || catName.includes('main') || catName.includes('entree')) ? 2 : 1
    const defaultHeld = defaultCourse > 1

    const existing = cart.findIndex(
      (item) =>
        item.menuItem.id === menuItem.id &&
        item.courseNumber === defaultCourse &&
        [...item.modifierIds].sort().join(':') === signature &&
        item.specialInstructions === instructions
    )
    if (existing >= 0) {
      const next = [...cart]
      next[existing].quantity += 1
      setCart(next)
    } else {
      setCart([...cart, {
        menuItem,
        quantity: 1,
        courseNumber: defaultCourse,
        station: defaultStation,
        modifierIds,
        specialInstructions: instructions,
        isHeld: defaultHeld,
      }])
    }
  }

  const addToCart = (menuItem: MenuItem) => {
    if (!menuItem.available) return
    if (!menuItem.modifiers?.length) {
      appendConfiguredItem(menuItem, [])
      return
    }
    setConfiguringItem(menuItem)
    setSelectedModifierIds(
      menuItem.modifiers.filter((modifier) => modifier.defaultSelected).map((modifier) => modifier.id)
    )
    setItemInstructions('')
    setModifierError(null)
  }

  const modifierGroups = configuringItem
    ? Object.entries(
        configuringItem.modifiers.reduce<Record<string, MenuModifier[]>>((groups, modifier) => {
          const key = modifier.modifierGroup || 'addons'
          groups[key] = [...(groups[key] || []), modifier]
          return groups
        }, {})
      )
    : []

  const toggleModifier = (modifier: MenuModifier) => {
    setModifierError(null)
    setSelectedModifierIds((current) => {
      if (current.includes(modifier.id)) return current.filter((id) => id !== modifier.id)
      const maximum = Math.max(1, modifier.maxSelections || 1)
      if (maximum === 1) {
        // Radio swap: replace any other selection from the same group
        const otherIdsInGroup = new Set(
          configuringItem?.modifiers
            .filter((m) => m.modifierGroup === modifier.modifierGroup)
            .map((m) => m.id) || []
        )
        const cleaned = current.filter((id) => !otherIdsInGroup.has(id))
        return [...cleaned, modifier.id]
      }
      const groupSelected = configuringItem?.modifiers.filter(
        (candidate) => candidate.modifierGroup === modifier.modifierGroup && current.includes(candidate.id)
      ) || []
      if (groupSelected.length >= maximum) {
        return current
      }
      return [...current, modifier.id]
    })
  }

  const confirmConfiguredItem = () => {
    if (!configuringItem) return
    for (const [group, modifiers] of modifierGroups) {
      const selectedCount = modifiers.filter((modifier) => selectedModifierIds.includes(modifier.id)).length
      const minimum = Math.max(
        modifiers.some((modifier) => modifier.required) ? 1 : 0,
        ...modifiers.map((modifier) => Number(modifier.minSelections || 0))
      )
      if (selectedCount < minimum) {
        setModifierError(`Select at least ${minimum} option${minimum === 1 ? '' : 's'} from ${modifiers[0]?.modifierGroupLabel || group}`)
        return
      }
    }
    appendConfiguredItem(configuringItem, selectedModifierIds, itemInstructions.trim())
    setConfiguringItem(null)
  }

  const handleSaveOfflineOrder = async (notice?: string) => {
    const selectedTableNumbers = selectedTables.map((id) => {
      const t = data.tables.find((tbl) => tbl.id === id)
      return t ? `T${t.tableNumber}` : id
    })

    const queued = await enqueuePOSOrder({
      orderType,
      guestCount,
      tableIds: orderType === 'dine_in' ? selectedTables : [],
      tableNumbers: selectedTableNumbers,
      isUrgent,
      specialInstructions: specialInstructions || null,
      items: cart.map((item) => ({
        menuItem: item.menuItem,
        quantity: item.quantity,
        courseNumber: item.courseNumber,
        seatNumber: item.seatNumber,
        station: item.station,
        modifierIds: item.modifierIds,
        modifierNames: item.menuItem.modifiers
          .filter((m) => item.modifierIds.includes(m.id))
          .map((m) => m.name),
        specialInstructions: item.specialInstructions,
        isHeld: item.isHeld,
      })),
      subtotalCents: cartSubtotal,
      taxCents: cartTax,
      totalCents: cartTotal,
    })

    setCart([])
    setSelectedTables([])
    setIsUrgent(false)
    setSpecialInstructions('')
    alert(notice || `Order saved offline (Ticket #${queued.clientOrderId}). It will automatically sync when reconnected!`)
  }

  const submitOrder = async () => {
    if (cart.length === 0 || submitting || (orderType === 'dine_in' && selectedTables.length === 0)) return

    // If terminal is currently in offline mode, save directly to local queue
    if (!offlineSync.isOnline) {
      await handleSaveOfflineOrder()
      return
    }

    try {
      setSubmitting(true)
      const res: any = await request('/api/graphql', CREATE_POS_ORDER, {
        orderType,
        guestCount,
        tableIds: orderType === 'dine_in' ? selectedTables : [],
        isUrgent,
        specialInstructions: specialInstructions || null,
        items: cart.map((item) => ({
          menuItemId: item.menuItem.id,
          quantity: item.quantity,
          courseNumber: item.courseNumber,
          seatNumber: item.seatNumber || 1,
          station: item.station || item.menuItem.station || item.menuItem.kitchenStation || 'hot_line',
          modifierIds: item.modifierIds,
          specialInstructions: item.specialInstructions || null,
          isHeld: Boolean(item.isHeld),
        })),
      })
      // Automatically dispatch kitchen print ticket
      printKitchen({
        ticketNumber: res?.createPOSOrder?.orderNumber || 'ORD',
        orderNumber: res?.createPOSOrder?.orderNumber || 'ORD',
        tableName: selectedTableObjects.map((t) => `T${t.tableNumber}`).join(', ') || 'Takeout',
        orderType,
        guestCount,
        isUrgent,
        createdAt: new Date().toISOString(),
        items: cart.map((i) => ({
          name: i.menuItem.name,
          quantity: i.quantity,
          priceCents: Number(i.menuItem.price || 0),
          courseNumber: i.courseNumber,
          seatNumber: i.seatNumber,
          modifiers: i.menuItem.modifiers
            .filter((m) => i.modifierIds.includes(m.id))
            .map((m) => ({ name: m.name })),
          specialInstructions: i.specialInstructions,
        })),
      }).catch((e) => console.warn('Kitchen printer notice:', e))

      setCart([])
      setSelectedTables([])
      setIsUrgent(false)
      setSpecialInstructions('')
      alert('Order sent to kitchen!')
    } catch (err: any) {
      console.warn('Network request failed, falling back to offline queue:', err)
      await handleSaveOfflineOrder(`Cloud unreachable (${err?.message || 'Network error'}). Order safely saved offline.`)
    } finally {
      setSubmitting(false)
    }
  }

  const cartSubtotal = cart.reduce((sum, item) => {
    const modifierTotal = item.menuItem.modifiers
      .filter((modifier) => item.modifierIds.includes(modifier.id))
      .reduce((modifierSum, modifier) => modifierSum + Number(modifier.priceAdjustment || 0), 0)
    return sum + (Number(item.menuItem.price || 0) + modifierTotal) * item.quantity
  }, 0)
  const taxRate = Number(data.storeSettings?.taxRate || 0)
  const cartTax = Math.round(cartSubtotal * (taxRate / 100))
  const cartTotal = cartSubtotal + cartTax
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0)

  const selectedTableObjects = selectedTables
    .map((id) => data.tables.find((t) => t.id === id))
    .filter((t): t is Table => Boolean(t))

  const filteredItems =
    selectedCategory === 'all'
      ? data.items
      : data.items.filter((i) => i.category?.id === selectedCategory)

  const availableTables = data.tables.filter((t) => t.status === 'available').length

  const canSend =
    cart.length > 0 &&
    !submitting &&
    (orderType === 'takeout' || selectedTables.length > 0)

  if (loading) {
    return (
      // h-screen + overflow-hidden = self-contained viewport lock, no parent chain dependency
      <div className="flex flex-col bg-background overflow-hidden" style={{ height: '100svh' }}>
        <PageBreadcrumbs items={breadcrumbs} />
        <div className="flex items-center justify-center flex-1">
          <RefreshCw className="animate-spin text-muted-foreground h-5 w-5" />
        </div>
      </div>
    )
  }

  return (
    /*
     * Layout contract:
     * - Root is exactly 100svh, overflow-hidden → no page-level scroll ever
     * - flex-col: breadcrumbs (shrink-0) → header (shrink-0) → 3-panel (flex-1 min-h-0)
     * - 3-panel flex row: left sidebar (overflow-y-auto) | center (overflow-y-auto) | right (flex-col overflow-hidden)
     * - Right cart: fixed header/config/table rows (shrink-0) + scrollable items (flex-1 min-h-0 overflow-y-auto) + fixed footer (shrink-0)
     */
    <div className="flex flex-col bg-background overflow-hidden" style={{ height: '100svh' }}>
      <PageBreadcrumbs items={breadcrumbs} />
      <OfflineBanner
        isOnline={offlineSync.isOnline}
        pendingCount={offlineSync.pendingCount}
        isSyncing={offlineSync.isSyncing}
        onOpenSyncModal={() => setOfflineModalOpen(true)}
        onSyncNow={offlineSync.syncNow}
      />

      {/* Page header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Point of Sale</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.items.filter((i) => i.available).length} items available
            {' · '}
            {availableTables} table{availableTables !== 1 ? 's' : ''} open
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OfflineStatusPill
            isOnline={offlineSync.isOnline}
            pendingCount={offlineSync.pendingCount}
            isSyncing={offlineSync.isSyncing}
            onClick={() => setOfflineModalOpen(true)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTimeClockOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <Clock className="h-3.5 w-3.5 text-primary" />
            Time Clock
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHardwareModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <Printer className="h-3.5 w-3.5 text-primary" />
            Hardware
          </Button>
        </div>
      </div>

      {/* 3-panel body — flex-1 min-h-0 ensures it fills remaining height and can shrink */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT: Category sidebar ── */}
        <div className="w-40 xl:w-48 shrink-0 border-r border-border overflow-y-auto flex flex-col">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'w-full text-left px-4 py-3 text-sm flex items-center justify-between border-b border-border transition-colors shrink-0',
              selectedCategory === 'all'
                ? 'bg-muted font-medium'
                : 'hover:bg-muted/30 text-muted-foreground'
            )}
          >
            <span>All Items</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {data.items.length}
            </span>
          </button>
          {data.categories.map((cat) => {
            const count = data.items.filter((i) => i.category?.id === cat.id).length
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'w-full text-left px-4 py-3 text-sm flex items-center justify-between border-b border-border transition-colors shrink-0',
                  selectedCategory === cat.id
                    ? 'bg-muted font-medium'
                    : 'hover:bg-muted/30 text-muted-foreground'
                )}
              >
                <span className="truncate">{cat.name}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums ml-2 shrink-0">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── CENTER: Item grid — only this scrolls ── */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Utensils size={28} className="text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No items in this category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 divide-x divide-y border-b border-border">
              {filteredItems.map((item) => {
                const imageSrc = item.thumbnail
                const imageAlt = item.name
                return (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    disabled={!item.available}
                    className={cn(
                      'flex flex-col text-left bg-card group',
                      item.available
                        ? 'cursor-pointer hover:bg-muted/20'
                        : 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <div className="aspect-video bg-muted overflow-hidden w-full">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={imageAlt}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Utensils size={20} className="text-muted-foreground/20" />
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold leading-tight">{item.name}</p>
                        <p className="text-sm font-semibold shrink-0">
                          {formatMoney(parseInt(item.price))}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full', item.available ? 'bg-emerald-500' : 'bg-red-400')} />
                        <span className="text-[11px] text-muted-foreground">
                          {item.available ? 'Available' : "86'd"}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT: Cart panel — flex-col + overflow-hidden locks it to available height ── */}
        <div className="w-72 xl:w-80 shrink-0 flex flex-col border-l border-border bg-background overflow-hidden">

          {/* Cart header — fixed */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart size={14} className="text-muted-foreground" />
              <span className="text-sm font-semibold">
                Order{cartItemCount > 0 ? ` (${cartItemCount})` : ''}
              </span>
            </div>
            {cart.length > 0 && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setCart([])}
              >
                Clear
              </button>
            )}
          </div>

          {/* Order config strip — fixed */}
          <div className="grid grid-cols-2 divide-x border-b border-border shrink-0">
            <div className="px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Type</p>
              <div className="flex items-center border border-border rounded overflow-hidden text-[10px]">
                <button
                  onClick={() => setOrderType('dine_in')}
                  className={cn(
                    'flex-1 py-1.5 font-semibold uppercase tracking-wider transition-colors',
                    orderType === 'dine_in' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  Dine-in
                </button>
                <button
                  onClick={() => setOrderType('takeout')}
                  className={cn(
                    'flex-1 py-1.5 font-semibold uppercase tracking-wider transition-colors border-l border-border',
                    orderType === 'takeout' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  Takeout
                </button>
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Guests</p>
              <div className="flex items-center gap-2">
                <button
                  className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
                >
                  <Minus size={10} />
                </button>
                <span className="text-sm font-semibold w-6 text-center tabular-nums">{guestCount}</span>
                <button
                  className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => setGuestCount((g) => g + 1)}
                >
                  <Plus size={10} />
                </button>
              </div>
            </div>
          </div>

          {/* Table selector — fixed, dine-in only */}
          {orderType === 'dine_in' && (
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Table</p>
              <Popover open={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
                <PopoverTrigger asChild>
                  <button className="w-full text-left text-xs border border-border rounded px-3 py-2 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <span className={selectedTables.length > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      {selectedTables.length > 0
                        ? selectedTableObjects.map((t) => `T${t.tableNumber}`).join(', ')
                        : 'Select table(s)…'}
                    </span>
                    <span className="text-muted-foreground text-[10px]">▾</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Tables</p>
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {data.tables.map((t) => {
                      const sel = selectedTables.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          onClick={() =>
                            setSelectedTables((prev) =>
                              prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                            )
                          }
                          className={cn(
                            'relative border rounded py-2 text-xs font-semibold transition-colors',
                            sel ? 'border-foreground bg-foreground text-background' : 'border-border hover:border-foreground/40'
                          )}
                        >
                          {sel && <Check size={9} className="absolute top-0.5 right-0.5" />}
                          T{t.tableNumber}
                        </button>
                      )
                    })}
                  </div>
                  <Button size="sm" className="w-full h-8 text-xs" onClick={() => setTablePopoverOpen(false)}>
                    Done
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Cart items — the ONLY scrollable section in the right panel */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 bg-muted/40">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <ShoppingCart size={28} className="text-muted-foreground/20 mb-3" />
                <p className="text-xs text-muted-foreground">Cart is empty</p>
                <p className="text-xs text-muted-foreground/50 mt-0.5">Tap an item on the left to add</p>
              </div>
            ) : (
              <div className="space-y-2 py-1">
                {cart.map((item, idx) => (
                  <div key={idx} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    {/* Name + remove */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded overflow-hidden bg-muted shrink-0">
                          {item.menuItem.thumbnail ? (
                            <img
                              src={item.menuItem.thumbnail}
                              alt={item.menuItem.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{item.menuItem.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {formatMoney(
                                Number(item.menuItem.price || 0) +
                                item.menuItem.modifiers
                                  .filter((modifier) => item.modifierIds.includes(modifier.id))
                                  .reduce((sum, modifier) => sum + Number(modifier.priceAdjustment || 0), 0)
                              )} each
                            </span>
                            <span className="text-[9px] uppercase tracking-wider font-mono px-1 py-0.2 rounded bg-muted/80 text-muted-foreground border text-center">
                              {(item.station || item.menuItem.station || 'hot_line').replace('_', ' ')}
                            </span>
                          </div>
                          {item.modifierIds.length > 0 && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {item.menuItem.modifiers
                                .filter((modifier) => item.modifierIds.includes(modifier.id))
                                .map((modifier) => modifier.name)
                                .join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => { const n = [...cart]; n.splice(idx, 1); setCart(n) }}
                        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    {/* Qty + course + total */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                          onClick={() => { const n = [...cart]; n[idx].quantity = Math.max(1, n[idx].quantity - 1); setCart(n) }}
                        >
                          <Minus size={10} />
                        </button>
                        <span className="text-xs font-semibold w-6 text-center tabular-nums">{item.quantity}</span>
                        <button
                          className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                          onClick={() => { const n = [...cart]; n[idx].quantity += 1; setCart(n) }}
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-0.5">
                          {([1, 2, 3] as const).map((c) => (
                            <button
                              key={c}
                              onClick={() => {
                                const n = [...cart]
                                n[idx].courseNumber = c
                                n[idx].isHeld = c > 1 ? (n[idx].isHeld ?? true) : false
                                setCart(n)
                              }}
                              className={cn(
                                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors border',
                                item.courseNumber === c
                                  ? 'border-foreground/30 bg-muted text-foreground'
                                  : 'border-transparent text-muted-foreground hover:border-border'
                              )}
                            >
                              <span className={cn('w-1.5 h-1.5 rounded-full', courseColors[c])} />
                              {courseLabels[c]}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          data-testid={`cart-hold-toggle-${idx}`}
                          onClick={() => {
                            const n = [...cart]
                            n[idx].isHeld = !n[idx].isHeld
                            setCart(n)
                          }}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border transition-colors',
                            item.isHeld
                              ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                              : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                          )}
                        >
                          {item.isHeld ? 'Held' : 'Fire'}
                        </button>
                      </div>
                      <span className="text-xs font-semibold tabular-nums">
                        {formatMoney((
                          Number(item.menuItem.price || 0) +
                          item.menuItem.modifiers
                            .filter((modifier) => item.modifierIds.includes(modifier.id))
                            .reduce((sum, modifier) => sum + Number(modifier.priceAdjustment || 0), 0)
                        ) * item.quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order footer — always pinned at bottom */}
          <div className="border-t border-border px-4 py-4 space-y-3 shrink-0 bg-background">
            {/* Urgent */}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="pos-urgent"
                checked={isUrgent}
                onCheckedChange={(v: any) => setIsUrgent(v)}
              />
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle size={12} className={isUrgent ? 'text-orange-500' : ''} />
                <span className={isUrgent ? 'text-orange-600 font-semibold' : ''}>Mark as urgent</span>
              </span>
            </label>

            {/* Special instructions */}
            <Textarea
              placeholder="Special instructions…"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="h-14 text-xs resize-none"
            />

            {/* Totals */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(cartSubtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax ({taxRate.toFixed(2)}%)</span>
                <span className="tabular-nums">{formatMoney(cartTax)}</span>
              </div>
              <div className="flex justify-between font-semibold text-sm border-t border-border pt-1.5 mt-1.5">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(cartTotal)}</span>
              </div>
            </div>

            {/* Send to Kitchen — styled to match the Type toggle */}
            <button
              onClick={submitOrder}
              disabled={!canSend}
              className={cn(
                'w-full border border-border rounded overflow-hidden py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all',
                canSend
                  ? 'bg-foreground text-background hover:opacity-90 cursor-pointer'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              {submitting ? 'Sending…' : 'Send to Kitchen'}
            </button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(configuringItem)} onOpenChange={(open) => !open && setConfiguringItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-base font-semibold">
                Customize {configuringItem?.name}
              </DialogTitle>
              {configuringItem && (
                <span className="font-bold text-sm text-foreground bg-muted px-2 py-0.5 rounded border border-border">
                  {formatMoney(
                    calculateItemPriceWithModifiers(
                      Number(configuringItem.price || 0),
                      configuringItem.modifiers.filter((m) => selectedModifierIds.includes(m.id))
                    )
                  )}
                </span>
              )}
            </div>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-5 overflow-y-auto py-2 pr-1">
            {modifierGroups.map(([group, modifiers]) => {
              const minimum = Math.max(
                modifiers.some((modifier) => modifier.required) ? 1 : 0,
                ...modifiers.map((modifier) => Number(modifier.minSelections || 0))
              )
              const maximum = Math.min(
                ...modifiers.map((modifier) => Math.max(1, Number(modifier.maxSelections || 1)))
              )
              const selectedCount = modifiers.filter((modifier) => selectedModifierIds.includes(modifier.id)).length
              const isSatisfied = selectedCount >= minimum

              return (
                <div key={group} className="space-y-2 p-3 rounded-lg border border-border/80 bg-card/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Label className="font-semibold text-xs">
                        {modifiers[0]?.modifierGroupLabel || group}
                      </Label>
                      {minimum > 0 && !isSatisfied && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.2 rounded border border-rose-200 dark:border-rose-800">
                          Required
                        </span>
                      )}
                      {minimum > 0 && isSatisfied && (
                        <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-0.5">
                          <Check size={9} /> Done
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {minimum > 0 ? `Choose ${minimum}` : 'Optional'} · max {maximum}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {modifiers.map((modifier) => {
                      const selected = selectedModifierIds.includes(modifier.id)
                      const isRadio = maximum === 1
                      return (
                        <button
                          key={modifier.id}
                          type="button"
                          onClick={() => toggleModifier(modifier)}
                          className={cn(
                            'rounded-lg border p-2.5 text-left text-xs transition-all relative flex flex-col justify-between min-h-[52px]',
                            selected
                              ? 'border-foreground bg-foreground/10 text-foreground font-semibold shadow-xs ring-1 ring-foreground/20'
                              : 'border-border hover:bg-muted/40 text-foreground/90'
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate">{modifier.name}</span>
                            {selected && (
                              <CheckCircle2 size={13} className="shrink-0 text-foreground" />
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1 text-[11px]">
                            {Number(modifier.priceAdjustment || 0) !== 0 ? (
                              <span className={cn(
                                'font-medium',
                                Number(modifier.priceAdjustment) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                              )}>
                                {Number(modifier.priceAdjustment) > 0 ? '+' : ''}{formatMoney(Number(modifier.priceAdjustment))}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">Included</span>
                            )}
                            {isRadio && <span className="text-[9px] uppercase tracking-wider text-muted-foreground">1-choice</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Quick Notes & Instructions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pos-item-instructions" className="text-xs font-semibold">Special Instructions</Label>
                <div className="flex items-center gap-1">
                  {['ALLERGY', 'ON SIDE', 'EXTRA CRISPY', 'NO SALT'].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setItemInstructions((prev) => (prev ? `${prev}, ${chip}` : chip))}
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-border bg-muted/60 hover:bg-muted text-muted-foreground transition-colors"
                    >
                      +{chip}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                id="pos-item-instructions"
                value={itemInstructions}
                maxLength={500}
                onChange={(event) => setItemInstructions(event.target.value)}
                placeholder="Allergy notes, extra crispy, sauce on the side..."
                className="text-xs resize-none h-14"
              />
            </div>
            {modifierError && (
              <p className="text-xs text-destructive flex items-center gap-1 font-medium bg-destructive/10 p-2 rounded border border-destructive/20">
                <AlertTriangle size={12} /> {modifierError}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setConfiguringItem(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmConfiguredItem} className="bg-foreground text-background hover:opacity-90">
              Add to Check • {configuringItem && formatMoney(
                calculateItemPriceWithModifiers(
                  Number(configuringItem.price || 0),
                  configuringItem.modifiers.filter((m) => selectedModifierIds.includes(m.id))
                )
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TimeClockModal
        open={timeClockOpen}
        onOpenChange={setTimeClockOpen}
      />

      <OfflineSyncModal
        open={offlineModalOpen}
        onOpenChange={setOfflineModalOpen}
        isOnline={offlineSync.isOnline}
        onToggleOnline={offlineSync.setIsOnline}
        orders={offlineSync.orders}
        isSyncing={offlineSync.isSyncing}
        onSyncNow={offlineSync.syncNow}
        onClearSynced={offlineSync.clearSynced}
        onExportBackup={offlineSync.exportBackup}
        currencyCode={currencyConfig.currencyCode}
        locale={currencyConfig.locale}
      />

      <HardwareSettingsModal
        open={hardwareModalOpen}
        onOpenChange={setHardwareModalOpen}
      />
    </div>
  )
}
