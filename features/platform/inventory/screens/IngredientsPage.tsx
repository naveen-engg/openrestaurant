'use client'

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus,
  Search,
  X,
  Boxes,
  Package,
  ChefHat,
  AlertTriangle,
  CheckCircle2,
  Truck,
  ArrowUpRight,
  RefreshCw,
  FileText,
  DollarSign,
  TrendingDown,
  Layers,
  Edit2,
  Trash2,
  Sparkles,
  SlidersHorizontal,
  Armchair,
  UtensilsCrossed,
  GlassWater,
  Scroll,
  Wrench,
  ShoppingBag,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/features/storefront/lib/currency'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'

export type InventoryRealm = 'kitchen' | 'physical' | 'all'

interface Vendor {
  id: string
  name: string
  contact?: string | null
  email?: string | null
  phone?: string | null
  paymentTerms?: string | null
  leadTime?: number | null
}

interface PurchaseOrderLineItem {
  ingredientId?: string
  ingredientName?: string
  quantity?: number
  unit?: string
  unitCost?: number
  totalCost?: number
}

interface PurchaseOrder {
  id: string
  poNumber: string
  vendor?: { id: string; name: string } | null
  status: string
  orderDate: string
  expectedDelivery?: string | null
  receivedDate?: string | null
  lineItems?: PurchaseOrderLineItem[] | null
  totalCost?: number | null
}

interface Ingredient {
  id: string
  name: string
  unit: string
  category: string
  currentStock: number | null
  parLevel: number | null
  reorderPoint: number | null
  reorderQuantity: number | null
  costPerUnit: string | null
  sku?: string | null
  vendor?: Vendor | null
}

const PHYSICAL_CATEGORIES = new Set([
  'furniture',
  'tableware',
  'glassware',
  'disposables',
  'smallwares',
])

function isPhysicalItem(category: string): boolean {
  return PHYSICAL_CATEGORIES.has(category)
}

const UNIT_OPTIONS = [
  'each', 'lb', 'oz', 'kg', 'liter', 'gallon', 'case', 'box', 'pack', 'set'
]

const KITCHEN_CATEGORIES = [
  'produce', 'meat', 'dairy', 'dry_goods', 'beverages', 'spices', 'seafood', 'other'
]

const PHYSICAL_CATEGORY_LIST = [
  'furniture', 'tableware', 'glassware', 'disposables', 'smallwares'
]

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; dot: string; realm: 'kitchen' | 'physical' }> = {
  // Kitchen categories
  produce:     { label: 'Produce',             icon: Boxes,           dot: 'bg-lime-500',   realm: 'kitchen' },
  meat:        { label: 'Meat & Poultry',      icon: Boxes,           dot: 'bg-rose-500',   realm: 'kitchen' },
  dairy:       { label: 'Dairy & Eggs',        icon: Boxes,           dot: 'bg-blue-400',   realm: 'kitchen' },
  dry_goods:   { label: 'Dry Goods & Bakery',  icon: Boxes,           dot: 'bg-amber-500',  realm: 'kitchen' },
  beverages:   { label: 'Beverages & Bar',     icon: GlassWater,      dot: 'bg-cyan-500',   realm: 'kitchen' },
  spices:      { label: 'Spices & Seasonings', icon: Boxes,           dot: 'bg-orange-500', realm: 'kitchen' },
  seafood:     { label: 'Fresh Seafood',       icon: Boxes,           dot: 'bg-teal-500',   realm: 'kitchen' },
  other:       { label: 'Other Kitchen',       icon: Boxes,           dot: 'bg-zinc-400',   realm: 'kitchen' },

  // Physical Operating categories
  furniture:   { label: 'Tables & Chairs',     icon: Armchair,        dot: 'bg-purple-500', realm: 'physical' },
  tableware:   { label: 'Tableware & Plates',  icon: UtensilsCrossed, dot: 'bg-indigo-500', realm: 'physical' },
  glassware:   { label: 'Glassware & Barware', icon: GlassWater,      dot: 'bg-sky-500',    realm: 'physical' },
  disposables: { label: 'Paper & Tissues',     icon: Scroll,          dot: 'bg-emerald-500',realm: 'physical' },
  smallwares:  { label: 'Kitchen Smallwares',  icon: Wrench,          dot: 'bg-slate-500',  realm: 'physical' },
}

const GET_INVENTORY_DASHBOARD_DATA = gql`
  query GetInventoryDashboardData {
    ingredients(orderBy: { name: asc }, take: 400) {
      id
      name
      unit
      category
      currentStock
      parLevel
      reorderPoint
      reorderQuantity
      costPerUnit
      sku
      vendor {
        id
        name
        contact
        email
        phone
        leadTime
        paymentTerms
      }
    }
    vendors(orderBy: { name: asc }) {
      id
      name
      contact
      email
      phone
      paymentTerms
      leadTime
    }
    purchaseOrders(orderBy: { orderDate: desc }, take: 100) {
      id
      poNumber
      vendor { id name }
      status
      orderDate
      expectedDelivery
      receivedDate
      lineItems
      totalCost
    }
    storeSettings {
      currencyCode
      locale
    }
  }
`

const CREATE_INGREDIENT = gql`
  mutation CreateIngredient($data: IngredientCreateInput!) {
    createIngredient(data: $data) { id name }
  }
`

const UPDATE_INGREDIENT = gql`
  mutation UpdateIngredient($id: ID!, $data: IngredientUpdateInput!) {
    updateIngredient(where: { id: $id }, data: $data) { id name }
  }
`

const DELETE_INGREDIENT = gql`
  mutation DeleteIngredient($id: ID!) {
    deleteIngredient(where: { id: $id }) { id }
  }
`

const ADJUST_INVENTORY = gql`
  mutation AdjustInventory(
    $ingredientId: ID!
    $quantity: String!
    $reason: String!
    $idempotencyKey: String!
  ) {
    adjustInventory(
      ingredientId: $ingredientId
      quantity: $quantity
      reason: $reason
      idempotencyKey: $idempotencyKey
    ) {
      success
      error
    }
  }
`

const CREATE_PO = gql`
  mutation CreatePO($data: PurchaseOrderCreateInput!) {
    createPurchaseOrder(data: $data) { id poNumber }
  }
`

const EMPTY_FORM = {
  name: '',
  realm: 'kitchen' as 'kitchen' | 'physical',
  category: 'produce',
  unit: 'lb',
  currentStock: '0',
  parLevel: '20',
  reorderPoint: '10',
  reorderQuantity: '20',
  costPerUnit: '0',
  sku: '',
  vendorId: '',
}

function IngredientsContent() {
  const searchParams = useSearchParams()
  const initialRealmParam = searchParams?.get('realm') as InventoryRealm | null

  const [realm, setRealm] = useState<InventoryRealm>(
    initialRealmParam === 'physical' || initialRealmParam === 'all'
      ? initialRealmParam
      : 'kitchen'
  )

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [currencyConfig, setCurrencyConfig] = useState({ currencyCode: 'USD', locale: 'en-US' })
  const [loading, setLoading] = useState(true)

  // Filtering state
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out' | 'on_order' | 'healthy'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Adjust stock dialog
  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null)
  const [adjustMode, setAdjustMode] = useState<'new_count' | 'delta'>('new_count')
  const [adjustInput, setAdjustInput] = useState('')
  const [adjustReason, setAdjustReason] = useState('Physical stock count verification')
  const [isAdjusting, setIsAdjusting] = useState(false)

  // Quick PO dialog
  const [poTarget, setPoTarget] = useState<Ingredient | null>(null)
  const [poQuantity, setPoQuantity] = useState('10')
  const [poVendorId, setPoVendorId] = useState('')
  const [isCreatingPO, setIsCreatingPO] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res: any = await request('/api/graphql', GET_INVENTORY_DASHBOARD_DATA)
      setIngredients(res.ingredients || [])
      setVendors(res.vendors || [])
      setPurchaseOrders(res.purchaseOrders || [])
      if (res.storeSettings) {
        setCurrencyConfig({
          currencyCode: res.storeSettings.currencyCode || 'USD',
          locale: res.storeSettings.locale || 'en-US',
        })
      }
    } catch (err) {
      console.error('Failed to load inventory data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Map of active in-flight purchase orders by ingredient ID
  const inFlightPOByIngredient = useMemo(() => {
    const map = new Map<
      string,
      {
        poId: string
        poNumber: string
        vendorName: string
        quantity: number
        status: string
        expectedDelivery: string | null
      }
    >()

    for (const po of purchaseOrders) {
      if (['sent', 'confirmed', 'shipped'].includes(po.status) && Array.isArray(po.lineItems)) {
        for (const line of po.lineItems) {
          if (line.ingredientId) {
            const existing = map.get(line.ingredientId)
            map.set(line.ingredientId, {
              poId: po.id,
              poNumber: po.poNumber,
              vendorName: po.vendor?.name || 'Supplier',
              quantity: (existing?.quantity || 0) + Number(line.quantity || 0),
              status: po.status,
              expectedDelivery: po.expectedDelivery || null,
            })
          }
        }
      }
    }
    return map
  }, [purchaseOrders])

  // Filter ingredients by the active Realm (Kitchen vs Physical vs All)
  const realmIngredients = useMemo(() => {
    if (realm === 'kitchen') {
      return ingredients.filter((i) => !isPhysicalItem(i.category))
    }
    if (realm === 'physical') {
      return ingredients.filter((i) => isPhysicalItem(i.category))
    }
    return ingredients
  }, [ingredients, realm])

  // Compute metrics for the active Realm
  const realmMetrics = useMemo(() => {
    let totalValuation = 0
    let outOfStockCount = 0
    let lowStockCount = 0
    let optimalCount = 0
    let nextRequiredRestockCost = 0
    let onOrderItemsCount = 0
    let onOrderValuation = 0

    const shortages: Array<{
      ingredient: Ingredient
      deficit: number
      restockCost: number
      stockPercentage: number
      inFlightPO?: {
        poId: string
        poNumber: string
        vendorName: string
        quantity: number
        status: string
        expectedDelivery: string | null
      }
    }> = []

    for (const ing of realmIngredients) {
      const stock = Number(ing.currentStock || 0)
      const par = Number(ing.parLevel || 0)
      const reorderPt = Number(ing.reorderPoint || par * 0.5)
      const cost = Number(ing.costPerUnit || 0)

      totalValuation += Math.max(0, stock) * cost

      const inFlight = inFlightPOByIngredient.get(ing.id)
      if (inFlight) {
        onOrderItemsCount += 1
        onOrderValuation += inFlight.quantity * cost
      }

      if (stock <= 0) {
        outOfStockCount += 1
      } else if (stock < par || stock <= reorderPt) {
        lowStockCount += 1
      } else {
        optimalCount += 1
      }

      // Calculate deficit for Next Required Replenishments
      if (stock < par) {
        const deficit = Math.max(0, par - stock)
        const restockCost = deficit * cost
        const stockPercentage = par > 0 ? Math.min(100, Math.round((stock / par) * 100)) : 100

        nextRequiredRestockCost += restockCost

        shortages.push({
          ingredient: ing,
          deficit,
          restockCost,
          stockPercentage,
          inFlightPO: inFlight,
        })
      }
    }

    // Sort shortages: out-of-stock first, then lowest stock percentage
    shortages.sort((a, b) => {
      const aStock = Number(a.ingredient.currentStock || 0)
      const bStock = Number(b.ingredient.currentStock || 0)
      if (aStock === 0 && bStock > 0) return -1
      if (bStock === 0 && aStock > 0) return 1
      return a.stockPercentage - b.stockPercentage
    })

    return {
      totalValuation,
      outOfStockCount,
      lowStockCount,
      optimalCount,
      nextRequiredRestockCost,
      onOrderItemsCount,
      onOrderValuation,
      shortages,
    }
  }, [realmIngredients, inFlightPOByIngredient])

  // Filtered ingredients for the data table
  const filteredIngredients = useMemo(() => {
    return realmIngredients.filter((item) => {
      const stock = Number(item.currentStock || 0)
      const par = Number(item.parLevel || 0)
      const reorderPt = Number(item.reorderPoint || par * 0.5)
      const inFlight = inFlightPOByIngredient.has(item.id)

      // Status filter
      if (statusFilter === 'out' && stock > 0) return false
      if (statusFilter === 'low' && (stock <= 0 || stock >= par)) return false
      if (statusFilter === 'on_order' && !inFlight) return false
      if (statusFilter === 'healthy' && stock < par) return false

      // Category filter
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = item.name.toLowerCase().includes(q)
        const matchSku = item.sku?.toLowerCase().includes(q)
        const matchVendor = item.vendor?.name.toLowerCase().includes(q)
        const matchCat = (CATEGORY_META[item.category]?.label || item.category).toLowerCase().includes(q)
        if (!matchName && !matchSku && !matchVendor && !matchCat) return false
      }

      return true
    })
  }, [realmIngredients, statusFilter, categoryFilter, searchQuery, inFlightPOByIngredient])

  // 1-Click Batch Order Generation for all low items in the current realm
  const handleAutoGenerateRestockPOs = async () => {
    const itemsNeedingPO = realmMetrics.shortages.filter((s) => {
      // If already covered by in-flight PO, skip
      const inFlightQty = s.inFlightPO?.quantity || 0
      return s.deficit > inFlightQty
    })

    if (itemsNeedingPO.length === 0) {
      alert('All low items in this inventory realm are already covered by in-flight purchase orders!')
      return
    }

    // Group by vendor
    const byVendor: Record<string, { vendor: Vendor; items: typeof itemsNeedingPO }> = {}
    for (const shortage of itemsNeedingPO) {
      const v = shortage.ingredient.vendor || vendors[0]
      if (!v) continue
      if (!byVendor[v.id]) {
        byVendor[v.id] = { vendor: v, items: [] }
      }
      byVendor[v.id].items.push(shortage)
    }

    try {
      let createdCount = 0
      for (const group of Object.values(byVendor)) {
        const poNumber = `PO-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
        const lineItems = group.items.map((it) => {
          const qty = Math.max(1, Math.round(it.deficit))
          const cost = Number(it.ingredient.costPerUnit || 0)
          return {
            ingredientId: it.ingredient.id,
            ingredientName: it.ingredient.name,
            quantity: qty,
            unit: it.ingredient.unit,
            unitCost: cost,
            totalCost: Math.round(qty * cost * 100) / 100,
          }
        })

        await request('/api/graphql', CREATE_PO, {
          data: {
            poNumber,
            orderDate: new Date().toISOString(),
            expectedDelivery: new Date(Date.now() + (group.vendor.leadTime || 2) * 24 * 60 * 60 * 1000).toISOString(),
            status: 'draft',
            notes: `Auto-generated par replenishment draft for ${group.vendor.name}`,
            vendor: { connect: { id: group.vendor.id } },
            lineItems,
          },
        })
        createdCount += 1
      }

      setActionNotice(`Created ${createdCount} draft Purchase Order(s) for low ${realm} stock!`)
      await fetchData()
      setTimeout(() => setActionNotice(null), 6000)
    } catch (err) {
      console.error('Error generating restock POs:', err)
      alert('Failed to generate restock purchase orders.')
    }
  }

  // Handle Quick PO dialog
  const openQuickPO = (item: Ingredient) => {
    setPoTarget(item)
    const def = Math.max(1, Math.round(Number(item.parLevel || 20) - Number(item.currentStock || 0)))
    setPoQuantity(String(def > 0 ? def : (item.reorderQuantity || 10)))
    setPoVendorId(item.vendor?.id || vendors[0]?.id || '')
  }

  const handleCreateQuickPO = async () => {
    if (!poTarget) return
    setIsCreatingPO(true)
    try {
      const qty = parseFloat(poQuantity) || 1
      const cost = Number(poTarget.costPerUnit || 0)
      const poNumber = `PO-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`

      const lineItems = [
        {
          ingredientId: poTarget.id,
          ingredientName: poTarget.name,
          quantity: qty,
          unit: poTarget.unit,
          unitCost: cost,
          totalCost: Math.round(qty * cost * 100) / 100,
        },
      ]

      await request('/api/graphql', CREATE_PO, {
        data: {
          poNumber,
          orderDate: new Date().toISOString(),
          status: 'sent',
          notes: `Quick order for ${poTarget.name}`,
          ...(poVendorId ? { vendor: { connect: { id: poVendorId } } } : {}),
          lineItems,
        },
      })

      setActionNotice(`Purchase Order ${poNumber} submitted to vendor for ${poTarget.name}!`)
      setPoTarget(null)
      await fetchData()
      setTimeout(() => setActionNotice(null), 5000)
    } catch (err) {
      console.error(err)
      alert('Failed to create purchase order')
    } finally {
      setIsCreatingPO(false)
    }
  }

  // Handle Adjust Stock dialog
  const openAdjustStock = (item: Ingredient) => {
    setAdjustTarget(item)
    setAdjustMode('new_count')
    setAdjustInput(item.currentStock?.toString() || '0')
    setAdjustReason('Physical stock count verification')
  }

  const handleSaveStockAdjustment = async () => {
    if (!adjustTarget) return
    setIsAdjusting(true)

    try {
      const current = Number(adjustTarget.currentStock || 0)
      let delta = 0
      if (adjustMode === 'new_count') {
        const target = parseFloat(adjustInput) || 0
        delta = target - current
      } else {
        delta = parseFloat(adjustInput) || 0
      }

      if (delta === 0) {
        setAdjustTarget(null)
        setIsAdjusting(false)
        return
      }

      const idempotencyKey = `manual-adj:${adjustTarget.id}:${Date.now()}`
      await request('/api/graphql', ADJUST_INVENTORY, {
        ingredientId: adjustTarget.id,
        quantity: delta.toFixed(2),
        reason: adjustReason.trim() || 'Manual stock level adjustment',
        idempotencyKey,
      })

      setActionNotice(`Stock level updated for ${adjustTarget.name}!`)
      setAdjustTarget(null)
      await fetchData()
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err) {
      console.error(err)
      alert('Failed to adjust stock')
    } finally {
      setIsAdjusting(false)
    }
  }

  // Handle Create / Edit Ingredient Dialog
  const openCreateDialog = () => {
    setEditingIngredient(null)
    setForm({
      ...EMPTY_FORM,
      realm: realm === 'physical' ? 'physical' : 'kitchen',
      category: realm === 'physical' ? 'furniture' : 'produce',
      unit: realm === 'physical' ? 'each' : 'lb',
      vendorId: vendors[0]?.id || '',
    })
    setCreateDialogOpen(true)
  }

  const openEditDialog = (item: Ingredient) => {
    setEditingIngredient(item)
    const isPhys = isPhysicalItem(item.category)
    setForm({
      name: item.name,
      realm: isPhys ? 'physical' : 'kitchen',
      category: item.category || (isPhys ? 'furniture' : 'produce'),
      unit: item.unit || 'each',
      currentStock: item.currentStock?.toString() ?? '0',
      parLevel: item.parLevel?.toString() ?? '20',
      reorderPoint: item.reorderPoint?.toString() ?? '10',
      reorderQuantity: item.reorderQuantity?.toString() ?? '20',
      costPerUnit: item.costPerUnit?.toString() ?? '0',
      sku: item.sku ?? '',
      vendorId: item.vendor?.id || '',
    })
    setCreateDialogOpen(true)
  }

  const handleSaveIngredient = async () => {
    if (!form.name.trim()) return
    setIsSaving(true)
    try {
      const data: any = {
        name: form.name.trim(),
        unit: form.unit,
        category: form.category,
        currentStock: form.currentStock ? parseFloat(form.currentStock).toFixed(2) : '0.00',
        parLevel: form.parLevel ? parseFloat(form.parLevel).toFixed(2) : null,
        reorderPoint: form.reorderPoint ? parseFloat(form.reorderPoint).toFixed(2) : null,
        reorderQuantity: form.reorderQuantity ? parseFloat(form.reorderQuantity).toFixed(2) : null,
        costPerUnit: form.costPerUnit ? parseFloat(form.costPerUnit).toFixed(2) : null,
        sku: form.sku.trim(),
        ...(form.vendorId ? { vendor: { connect: { id: form.vendorId } } } : {}),
      }

      if (editingIngredient) {
        await request('/api/graphql', UPDATE_INGREDIENT, { id: editingIngredient.id, data })
      } else {
        await request('/api/graphql', CREATE_INGREDIENT, { data })
      }

      setCreateDialogOpen(false)
      await fetchData()
    } catch (err) {
      console.error(err)
      alert('Failed to save ingredient')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteIngredient = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inventory item?')) return
    setDeletingId(id)
    try {
      await request('/api/graphql', DELETE_INGREDIENT, { id })
      await fetchData()
    } catch (err) {
      console.error(err)
      alert('Failed to delete item')
    } finally {
      setDeletingId(null)
    }
  }

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: realm === 'physical' ? 'Physical Stock & Assets' : 'Inventory & Stocks' },
  ]

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-background overflow-y-auto">
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Top Banner & Realm Switcher */}
      <div className="px-6 py-6 border-b bg-gradient-to-r from-emerald-500/10 via-sky-500/5 to-indigo-500/10 dark:from-emerald-950/20 dark:to-background shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={cn(
                "p-2.5 rounded-2xl text-white shadow-md transition-all",
                realm === 'kitchen' && "bg-emerald-600 shadow-emerald-500/20",
                realm === 'physical' && "bg-indigo-600 shadow-indigo-500/20",
                realm === 'all' && "bg-slate-700 shadow-slate-500/20",
              )}>
                {realm === 'kitchen' ? (
                  <Boxes className="h-6 w-6" />
                ) : realm === 'physical' ? (
                  <Package className="h-6 w-6" />
                ) : (
                  <Layers className="h-6 w-6" />
                )}
              </span>
              <div>
                <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                  <span>
                    {realm === 'kitchen' && 'Kitchen Stock & Culinary Ingredients'}
                    {realm === 'physical' && 'Physical Stocks, Assets & Operating Supplies'}
                    {realm === 'all' && 'Master Restaurant Inventory'}
                  </span>
                  <Badge variant="outline" className="font-bold text-xs uppercase px-2 py-0.5 border-2">
                    {realm === 'kitchen' ? 'Food & Drink' : realm === 'physical' ? 'Physical Assets' : 'All Realms'}
                  </Badge>
                </h1>
                <p className="text-sm font-medium text-muted-foreground mt-0.5">
                  {realm === 'kitchen'
                    ? 'Culinary pantry ingredients, food cost yields, and automated BOM depletion'
                    : realm === 'physical'
                    ? 'Restaurant furniture (tables & chairs), chinaware, glassware, dinner tissues, and operating supplies'
                    : 'Unified tracking across all kitchen and physical restaurant inventory'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* 1-Click Auto Reorder POs button */}
            <Button
              onClick={handleAutoGenerateRestockPOs}
              disabled={realmMetrics.shortages.length === 0}
              variant="outline"
              size="lg"
              className="rounded-2xl border-2 font-bold bg-white dark:bg-card hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 shadow-sm transition-all"
            >
              <Sparkles className="h-4 w-4 mr-2 text-emerald-600" />
              Auto-Generate Restock POs ({realmMetrics.shortages.length})
            </Button>

            <Button
              onClick={openCreateDialog}
              size="lg"
              className={cn(
                "rounded-2xl font-black uppercase tracking-wider text-white shadow-lg transition-all hover:scale-105 active:scale-95",
                realm === 'physical' ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
              )}
            >
              <Plus className="h-5 w-5 mr-2" />
              New {realm === 'physical' ? 'Asset' : 'Item'}
            </Button>
          </div>
        </div>

        {/* Major Realm Switcher Bar (Kitchen vs Physical vs All) */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border/40">
          <div className="inline-flex p-1.5 bg-background/80 dark:bg-card/80 backdrop-blur-md rounded-2xl border-2 shadow-sm gap-1">
            <button
              onClick={() => { setRealm('kitchen'); setCategoryFilter('all') }}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all",
                realm === 'kitchen'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20 scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <ChefHat className="h-4 w-4" />
              <span>🍳 Kitchen Stock ({ingredients.filter(i => !isPhysicalItem(i.category)).length})</span>
            </button>

            <button
              onClick={() => { setRealm('physical'); setCategoryFilter('all') }}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all",
                realm === 'physical'
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Package className="h-4 w-4" />
              <span>🪑 Physical Stock & Assets ({ingredients.filter(i => isPhysicalItem(i.category)).length})</span>
            </button>

            <button
              onClick={() => { setRealm('all'); setCategoryFilter('all') }}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all",
                realm === 'all'
                  ? "bg-slate-700 text-white shadow-md scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Layers className="h-4 w-4" />
              <span>🌐 All ({ingredients.length})</span>
            </button>
          </div>

          <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <span>Linked Vendors: <strong className="text-foreground">{vendors.length}</strong></span>
            <span>•</span>
            <span>Active POs in transit: <strong className="text-foreground">{purchaseOrders.filter(po => ['sent', 'confirmed', 'shipped'].includes(po.status)).length}</strong></span>
          </div>
        </div>

        {actionNotice && (
          <div className="mt-4 p-4 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/30 text-emerald-900 dark:text-emerald-200 font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Real-Time Realm Executive KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
          <Card className="rounded-3xl border-2 border-emerald-500/20 bg-card/90 backdrop-blur-sm shadow-sm hover:border-emerald-500/40 transition-all">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <DollarSign className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current Stock Value</div>
                <div className="text-xl font-black mt-0.5 truncate text-foreground">
                  {formatCurrency(realmMetrics.totalValuation, currencyConfig)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-2 border-rose-500/20 bg-card/90 backdrop-blur-sm shadow-sm hover:border-rose-500/40 transition-all">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Out of Stock</div>
                <div className="text-xl font-black mt-0.5 text-rose-600 dark:text-rose-400">
                  {realmMetrics.outOfStockCount} item{realmMetrics.outOfStockCount !== 1 ? 's' : ''}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-2 border-amber-500/20 bg-card/90 backdrop-blur-sm shadow-sm hover:border-amber-500/40 transition-all">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <TrendingDown className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Below Par (Low)</div>
                <div className="text-xl font-black mt-0.5 text-amber-600 dark:text-amber-400">
                  {realmMetrics.lowStockCount} item{realmMetrics.lowStockCount !== 1 ? 's' : ''}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-2 border-blue-500/20 bg-card/90 backdrop-blur-sm shadow-sm hover:border-blue-500/40 transition-all">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Truck className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">On Order In-Flight</div>
                <div className="text-xl font-black mt-0.5 text-blue-600 dark:text-blue-400">
                  {realmMetrics.onOrderItemsCount} item{realmMetrics.onOrderItemsCount !== 1 ? 's' : ''}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-2 border-purple-500/20 bg-card/90 backdrop-blur-sm shadow-sm hover:border-purple-500/40 transition-all">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Next Reorder Cost</div>
                <div className="text-xl font-black mt-0.5 text-purple-600 dark:text-purple-400">
                  {formatCurrency(realmMetrics.nextRequiredRestockCost, currencyConfig)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── NEXT REQUIRED REPLENISHMENTS & SHORTAGES ACTION BOARD ─── */}
      {realmMetrics.shortages.length > 0 && (
        <div className="px-6 py-6 border-b bg-amber-500/5 dark:bg-amber-950/10 shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-500 text-white shadow-md">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-black tracking-tight text-foreground flex items-center gap-2">
                  <span>🚨 Next Required Replenishments & Shortages</span>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold">
                    {realmMetrics.shortages.length} item{realmMetrics.shortages.length !== 1 ? 's' : ''} below par
                  </Badge>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Items currently requiring purchase orders or stock replenishment to maintain operating par levels
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold text-muted-foreground mr-2">Estimated Restock Budget:</span>
              <span className="text-lg font-black text-amber-700 dark:text-amber-400 tabular-nums">
                {formatCurrency(realmMetrics.nextRequiredRestockCost, currencyConfig)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {realmMetrics.shortages.map((shortage) => {
              const ing = shortage.ingredient
              const stock = Number(ing.currentStock || 0)
              const par = Number(ing.parLevel || 0)
              const isOut = stock <= 0
              const categoryMeta = CATEGORY_META[ing.category] || { label: ing.category, icon: Boxes, dot: 'bg-zinc-400', realm: 'kitchen' }
              const CatIcon = categoryMeta.icon

              return (
                <Card
                  key={ing.id}
                  className={cn(
                    "rounded-2xl border-2 transition-all hover:shadow-md",
                    isOut
                      ? "border-rose-500/40 bg-card shadow-rose-500/5"
                      : "border-amber-500/30 bg-card shadow-amber-500/5"
                  )}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", categoryMeta.dot)} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {categoryMeta.label}
                          </span>
                          {ing.sku && (
                            <span className="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                              {ing.sku}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-black text-foreground truncate" title={ing.name}>
                          {ing.name}
                        </h3>
                      </div>

                      {isOut ? (
                        <Badge variant="destructive" className="font-black text-[10px] uppercase shrink-0">
                          Empty (0)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 font-bold text-[10px] uppercase shrink-0">
                          {shortage.stockPercentage}% of Par
                        </Badge>
                      )}
                    </div>

                    {/* Stock Meter */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">Current Stock:</span>
                        <span className={cn("font-bold tabular-nums", isOut ? "text-rose-600" : "text-amber-600")}>
                          {stock} / {par} {ing.unit}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", isOut ? "bg-rose-500" : "bg-amber-500")}
                          style={{ width: `${Math.max(2, shortage.stockPercentage)}%` }}
                        />
                      </div>
                    </div>

                    {/* Shortage & Cost */}
                    <div className="p-2.5 rounded-xl bg-muted/40 border text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-muted-foreground">Next Required:</span>
                        <span className="font-black text-rose-600 dark:text-rose-400 tabular-nums">
                          +{shortage.deficit} {ing.unit}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                        <span>Restock Cost:</span>
                        <span className="font-semibold text-foreground">
                          {formatCurrency(shortage.restockCost, currencyConfig)}
                        </span>
                      </div>
                    </div>

                    {/* Vendor and In-Flight PO */}
                    <div className="text-[11px] space-y-1 pt-1">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="truncate">Supplier:</span>
                        <span className="font-bold text-foreground truncate max-w-[140px]">
                          {ing.vendor?.name || 'Unassigned'}
                        </span>
                      </div>

                      {shortage.inFlightPO ? (
                        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold text-[10px]">
                          <Truck className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            On order: {shortage.inFlightPO.quantity} {ing.unit} ({shortage.inFlightPO.poNumber})
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold text-[10px]">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>No active PO - Reorder Needed</span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1 border-t">
                      <Button
                        size="sm"
                        onClick={() => openQuickPO(ing)}
                        className="flex-1 h-8 text-xs font-bold bg-foreground text-background hover:opacity-90 rounded-xl"
                      >
                        <Truck className="h-3.5 w-3.5 mr-1" />
                        Create PO
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAdjustStock(ing)}
                        className="h-8 px-2.5 text-xs font-bold rounded-xl"
                        title="Adjust inventory count"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="px-6 py-4 border-b bg-card flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter pills */}
          <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-2xl">
            <Button
              variant={statusFilter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('all')}
              className={cn("rounded-xl font-bold text-xs h-8", statusFilter === 'all' && "bg-foreground text-background")}
            >
              All Items ({realmIngredients.length})
            </Button>
            <Button
              variant={statusFilter === 'low' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('low')}
              className={cn("rounded-xl font-bold text-xs h-8 text-amber-600", statusFilter === 'low' && "bg-amber-600 text-white")}
            >
              Below Par ({realmMetrics.lowStockCount})
            </Button>
            <Button
              variant={statusFilter === 'out' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('out')}
              className={cn("rounded-xl font-bold text-xs h-8 text-rose-600", statusFilter === 'out' && "bg-rose-600 text-white")}
            >
              Out of Stock ({realmMetrics.outOfStockCount})
            </Button>
            <Button
              variant={statusFilter === 'on_order' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('on_order')}
              className={cn("rounded-xl font-bold text-xs h-8 text-blue-600", statusFilter === 'on_order' && "bg-blue-600 text-white")}
            >
              On Order ({realmMetrics.onOrderItemsCount})
            </Button>
            <Button
              variant={statusFilter === 'healthy' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('healthy')}
              className={cn("rounded-xl font-bold text-xs h-8 text-emerald-600", statusFilter === 'healthy' && "bg-emerald-600 text-white")}
            >
              Healthy ({realmMetrics.optimalCount})
            </Button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${realm} items, vendors, SKU…`}
            className="pl-9 pr-8 h-10 rounded-2xl border-2 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="px-6 py-2.5 border-b bg-card/60 overflow-x-auto flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setCategoryFilter('all')}
          className={cn(
            "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            categoryFilter === 'all'
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          All Categories
        </button>

        {(realm === 'kitchen'
          ? KITCHEN_CATEGORIES
          : realm === 'physical'
          ? PHYSICAL_CATEGORY_LIST
          : [...KITCHEN_CATEGORIES, ...PHYSICAL_CATEGORY_LIST]
        ).map((cat) => {
          const meta = CATEGORY_META[cat] || { label: cat, dot: 'bg-zinc-400' }
          const count = realmIngredients.filter((i) => i.category === cat).length
          if (count === 0 && realm !== 'all') return null

          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                categoryFilter === cat
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", meta.dot)} />
              <span>{meta.label}</span>
              <span className="text-[10px] opacity-70 tabular-nums">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Main Stock Data Table */}
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin mb-3 text-emerald-600" />
            <p className="font-semibold text-sm">Loading restaurant stock ledger...</p>
          </div>
        ) : filteredIngredients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-3xl bg-card">
            <Boxes className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-base font-bold text-foreground">No inventory items found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
              {searchQuery
                ? `No items matched your search query "${searchQuery}".`
                : `No items in ${realm} stock match the current filter.`}
            </p>
            <Button onClick={openCreateDialog} size="sm" className="rounded-xl font-bold">
              <Plus className="h-4 w-4 mr-1.5" />
              Add First {realm === 'physical' ? 'Asset' : 'Item'}
            </Button>
          </div>
        ) : (
          <div className="rounded-3xl border-2 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-3.5 px-4 font-black">Item & SKU</th>
                    <th className="py-3.5 px-4 font-black">Category</th>
                    <th className="py-3.5 px-4 font-black">Primary Supplier</th>
                    <th className="py-3.5 px-4 font-black">Current Stock</th>
                    <th className="py-3.5 px-4 font-black">Par Level</th>
                    <th className="py-3.5 px-4 font-black">Unit Cost</th>
                    <th className="py-3.5 px-4 font-black">Stock Value</th>
                    <th className="py-3.5 px-4 font-black">Status</th>
                    <th className="py-3.5 px-4 font-black text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredIngredients.map((item) => {
                    const stock = Number(item.currentStock || 0)
                    const par = Number(item.parLevel || 0)
                    const reorderPt = Number(item.reorderPoint || par * 0.5)
                    const cost = Number(item.costPerUnit || 0)
                    const lineValue = Math.max(0, stock) * cost
                    const isOut = stock <= 0
                    const isLow = stock < par
                    const pct = par > 0 ? Math.min(100, Math.round((stock / par) * 100)) : 100

                    const inFlight = inFlightPOByIngredient.get(item.id)
                    const catMeta = CATEGORY_META[item.category] || { label: item.category, dot: 'bg-zinc-400' }

                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <span className={cn(
                              "p-2 rounded-xl text-white shrink-0",
                              isPhysicalItem(item.category) ? "bg-indigo-600" : "bg-emerald-600"
                            )}>
                              {isPhysicalItem(item.category) ? <Package size={14} /> : <Boxes size={14} />}
                            </span>
                            <div>
                              <div className="font-bold text-foreground text-sm flex items-center gap-2">
                                <span>{item.name}</span>
                                {item.sku && (
                                  <span className="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                    {item.sku}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                <span>Unit: <strong className="text-foreground">{item.unit}</strong></span>
                                {item.reorderPoint && (
                                  <>
                                    <span>•</span>
                                    <span>Reorder Trigger: {item.reorderPoint} {item.unit}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", catMeta.dot)} />
                            <span className="font-semibold text-foreground text-xs">{catMeta.label}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {item.vendor ? (
                            <div>
                              <div className="font-bold text-foreground">{item.vendor.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {item.vendor.leadTime ? `${item.vendor.leadTime}d lead time` : 'Direct supplier'}
                                {item.vendor.phone && ` • ${item.vendor.phone}`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">Unassigned</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="space-y-1 max-w-[120px]">
                            <div className="flex items-baseline justify-between">
                              <span className={cn(
                                "font-black text-sm tabular-nums",
                                isOut ? "text-rose-600 font-extrabold" : isLow ? "text-amber-600 font-bold" : "text-emerald-700 dark:text-emerald-400"
                              )}>
                                {stock}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-semibold">{item.unit}</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  isOut ? "bg-rose-500" : isLow ? "bg-amber-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 tabular-nums font-semibold text-muted-foreground">
                          {par > 0 ? `${par} ${item.unit}` : '—'}
                        </td>

                        <td className="py-3.5 px-4 tabular-nums font-medium text-foreground">
                          {cost > 0 ? `$${cost.toFixed(2)} / ${item.unit}` : '—'}
                        </td>

                        <td className="py-3.5 px-4 tabular-nums font-bold text-foreground">
                          {formatCurrency(lineValue, currencyConfig)}
                        </td>

                        <td className="py-3.5 px-4">
                          {isOut ? (
                            <Badge variant="destructive" className="font-black text-[10px] uppercase">
                              Empty (0)
                            </Badge>
                          ) : inFlight ? (
                            <Badge variant="outline" className="border-blue-500 text-blue-600 bg-blue-500/10 font-bold text-[10px] uppercase flex items-center gap-1">
                              <Truck className="h-3 w-3" />
                              <span>On Order ({inFlight.quantity})</span>
                            </Badge>
                          ) : isLow ? (
                            <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-500/10 font-bold text-[10px] uppercase">
                              Low Stock
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-500/10 font-bold text-[10px] uppercase">
                              Healthy
                            </Badge>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAdjustStock(item)}
                              className="h-8 px-2 text-xs font-bold rounded-xl"
                              title="Adjust stock quantity"
                            >
                              <SlidersHorizontal size={13} className="mr-1" />
                              Count
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openQuickPO(item)}
                              className="h-8 px-2 text-xs font-bold rounded-xl text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Order from vendor"
                            >
                              <Truck size={13} className="mr-1" />
                              Order
                            </Button>

                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditDialog(item)}
                              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                            >
                              <Edit2 size={13} />
                            </Button>

                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={deletingId === item.id}
                              onClick={() => handleDeleteIngredient(item.id)}
                              className="h-8 w-8 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ─── ADJUST STOCK COUNT DIALOG ─── */}
      <Dialog open={!!adjustTarget} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-emerald-600" />
              <span>Adjust Stock: {adjustTarget?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {adjustTarget && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-2xl bg-muted border flex items-center justify-between text-xs">
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Current Recorded Stock</div>
                  <div className="text-lg font-black text-foreground">
                    {adjustTarget.currentStock || 0} {adjustTarget.unit}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Par Level Target</div>
                  <div className="text-lg font-black text-foreground">
                    {adjustTarget.parLevel || '—'} {adjustTarget.unit}
                  </div>
                </div>
              </div>

              {/* Adjust mode toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-2xl">
                <Button
                  type="button"
                  variant={adjustMode === 'new_count' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => { setAdjustMode('new_count'); setAdjustInput(adjustTarget.currentStock?.toString() || '0') }}
                  className="rounded-xl font-bold text-xs"
                >
                  Set Actual Count
                </Button>
                <Button
                  type="button"
                  variant={adjustMode === 'delta' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => { setAdjustMode('delta'); setAdjustInput('+10') }}
                  className="rounded-xl font-bold text-xs"
                >
                  Add / Deduct (±)
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {adjustMode === 'new_count' ? `New Total Physical Count (${adjustTarget.unit})` : `Quantity Delta (e.g. +10 or -5 ${adjustTarget.unit})`}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adjustInput}
                  onChange={(e) => setAdjustInput(e.target.value)}
                  className="h-11 rounded-xl text-base font-bold"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Adjustment Reason & Audit Note
                </Label>
                <Select value={adjustReason} onValueChange={setAdjustReason}>
                  <SelectTrigger className="h-10 rounded-xl font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="Physical stock count verification">Physical Stock Count Verification</SelectItem>
                    <SelectItem value="Direct vendor delivery received">Direct Vendor Delivery Received</SelectItem>
                    <SelectItem value="Broken tableware / glass replacement">Broken Tableware / Glass Breakage</SelectItem>
                    <SelectItem value="Culinary kitchen prep consumption">Kitchen Prep Consumption</SelectItem>
                    <SelectItem value="Stock discrepancy audit correction">Audit Discrepancy Correction</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAdjustTarget(null)} className="rounded-xl font-bold">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveStockAdjustment}
                  disabled={isAdjusting || !adjustInput}
                  className="rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isAdjusting ? 'Updating...' : 'Commit Stock Adjustment'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── QUICK PURCHASE ORDER DIALOG ─── */}
      <Dialog open={!!poTarget} onOpenChange={(open) => !open && setPoTarget(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              <span>Create Purchase Order for {poTarget?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {poTarget && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-2xl bg-muted border space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Stock:</span>
                  <span className="font-bold text-foreground">{poTarget.currentStock || 0} {poTarget.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Par Level Target:</span>
                  <span className="font-bold text-foreground">{poTarget.parLevel || '—'} {poTarget.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Unit Cost:</span>
                  <span className="font-bold text-foreground">${poTarget.costPerUnit || '0.00'}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Order Quantity ({poTarget.unit})
                </Label>
                <Input
                  type="number"
                  value={poQuantity}
                  onChange={(e) => setPoQuantity(e.target.value)}
                  className="h-11 rounded-xl text-base font-bold"
                  placeholder="10"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Supplier / Vendor
                </Label>
                <Select value={poVendorId} onValueChange={setPoVendorId}>
                  <SelectTrigger className="h-11 rounded-xl font-medium">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.leadTime || 2}d lead time)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs flex justify-between items-center font-bold">
                <span className="text-blue-900 dark:text-blue-200">Total Purchase Value:</span>
                <span className="text-base font-black text-blue-700 dark:text-blue-300">
                  {formatCurrency((parseFloat(poQuantity) || 0) * Number(poTarget.costPerUnit || 0), currencyConfig)}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPoTarget(null)} className="rounded-xl font-bold">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateQuickPO}
                  disabled={isCreatingPO || !poQuantity}
                  className="rounded-xl font-black bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
                >
                  {isCreatingPO ? 'Creating...' : 'Submit Purchase Order'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── CREATE / EDIT INGREDIENT DIALOG ─── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Boxes className="h-5 w-5 text-emerald-600" />
              <span>{editingIngredient ? 'Edit Inventory Item' : 'New Inventory Item'}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Realm toggle */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inventory Realm</Label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-2xl">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, realm: 'kitchen', category: 'produce' }))}
                  className={cn(
                    "py-2 rounded-xl text-xs font-bold transition-all",
                    form.realm === 'kitchen' ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🍳 Kitchen Stock (Culinary)
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, realm: 'physical', category: 'furniture', unit: 'each' }))}
                  className={cn(
                    "py-2 rounded-xl text-xs font-bold transition-all",
                    form.realm === 'physical' ? "bg-indigo-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🪑 Physical Stock (Asset/Supply)
                </button>
              </div>
            </div>

            {/* Name & SKU */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Item Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={form.realm === 'physical' ? "e.g. Upholstered Dining Chairs" : "e.g. American Wagyu Ground Beef"}
                  className="h-10 rounded-xl font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SKU / Code</Label>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  placeholder="e.g. ASSET-01"
                  className="h-10 rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            {/* Category & Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-10 rounded-xl font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {(form.realm === 'kitchen' ? KITCHEN_CATEGORIES : PHYSICAL_CATEGORY_LIST).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_META[c]?.label || c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stock Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger className="h-10 rounded-xl font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Vendor Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Primary Supplier / Vendor</Label>
              <Select value={form.vendorId} onValueChange={(v) => setForm((f) => ({ ...f, vendorId: v }))}>
                <SelectTrigger className="h-10 rounded-xl font-medium">
                  <SelectValue placeholder="Select primary vendor" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.paymentTerms || 'Net 30'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stock, Par, and Reorder Points */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Initial Stock</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.currentStock}
                  onChange={(e) => setForm((f) => ({ ...f, currentStock: e.target.value }))}
                  className="h-10 rounded-xl font-bold"
                  placeholder="0"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Par Level</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.parLevel}
                  onChange={(e) => setForm((f) => ({ ...f, parLevel: e.target.value }))}
                  className="h-10 rounded-xl font-bold"
                  placeholder="20"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reorder Pt</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.reorderPoint}
                  onChange={(e) => setForm((f) => ({ ...f, reorderPoint: e.target.value }))}
                  className="h-10 rounded-xl font-bold"
                  placeholder="10"
                />
              </div>
            </div>

            {/* Unit cost */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cost Per Unit ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.costPerUnit}
                onChange={(e) => setForm((f) => ({ ...f, costPerUnit: e.target.value }))}
                placeholder="2.50"
                className="h-10 rounded-xl font-bold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="rounded-xl font-bold">
                Cancel
              </Button>
              <Button
                onClick={handleSaveIngredient}
                disabled={isSaving || !form.name.trim()}
                className="rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving ? 'Saving...' : editingIngredient ? 'Commit Changes' : 'Create Item'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function IngredientsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground font-semibold">Loading restaurant stock ledger...</div>}>
      <IngredientsContent />
    </Suspense>
  )
}

export default IngredientsPage
