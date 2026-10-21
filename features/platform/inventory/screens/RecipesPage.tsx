'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
  Trash2,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Utensils,
  Scale,
  Timer,
  Layers,
  ArrowUpRight,
  Percent,
  Search,
  Sparkles,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Boxes,
  DollarSign,
  TrendingUp,
  ChefHat,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { cn } from '@/lib/utils'
import { convertUnits, calculateIngredientLineCost, STANDARD_UNITS } from '@/features/keystone/utils/unitConversion'

interface Recipe {
  id: string
  name: string
  menuItem: { id: string; name: string; price: string } | null
  recipeIngredients: RecipeIngredient[] | null
  yield: number
  prepTime: number | null
  instructions: string | null
  totalCost: number | null
  costPerServing: number | null
  foodCostPercentage: number | null
}

interface RecipeIngredient {
  ingredientId: string
  quantity: number
  unit: string
}

interface Ingredient {
  id: string
  name: string
  unit: string
  category?: string | null
  costPerUnit: string | null
  currentStock?: string | number | null
  parLevel?: string | number | null
}

interface MenuItem {
  id: string
  name: string
  price: string
  category?: { id: string; name: string } | null
}

const GET_RECIPES_AND_INVENTORY = gql`
  query GetRecipesAndInventory {
    recipes(orderBy: { name: asc }, take: 200) {
      id
      name
      menuItem { id name price }
      recipeIngredients
      yield
      prepTime
      instructions
      totalCost
      costPerServing
      foodCostPercentage
    }
    ingredients(orderBy: { name: asc }, take: 300) {
      id
      name
      unit
      category
      costPerUnit
      currentStock
      parLevel
    }
    menuItems(orderBy: { name: asc }, take: 300) {
      id
      name
      price
      category { id name }
    }
  }
`

const CREATE_RECIPE = gql`
  mutation CreateRecipe($data: RecipeCreateInput!) {
    createRecipe(data: $data) { id name }
  }
`

const UPDATE_RECIPE = gql`
  mutation UpdateRecipe($id: ID!, $data: RecipeUpdateInput!) {
    updateRecipe(where: { id: $id }, data: $data) { id name }
  }
`

const DELETE_RECIPE = gql`
  mutation DeleteRecipe($id: ID!) {
    deleteRecipe(where: { id: $id }) { id }
  }
`

function getFoodCostColor(percentage: number | null): string {
  if (!percentage || percentage <= 0) return 'text-muted-foreground'
  if (percentage <= 28) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
  if (percentage <= 35) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
  return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
}

function parsePriceInDollars(rawPrice: string | number | null | undefined): number {
  const parsed = Number(rawPrice || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed > 100 ? parsed / 100 : parsed
}

export function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [seedNotice, setSeedNotice] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'configured' | 'missing'>('all')

  const [form, setForm] = useState({
    name: '',
    menuItemId: '',
    yield: 1,
    prepTime: 15,
    instructions: '',
    recipeIngredients: [] as RecipeIngredient[],
  })

  const ingredientMap = useMemo(() => {
    const map = new Map<string, Ingredient>()
    for (const ing of ingredients) {
      map.set(ing.id, ing)
    }
    return map
  }, [ingredients])

  const menuItemBOMMap = useMemo(() => {
    const map = new Map<string, Recipe>()
    for (const r of recipes) {
      if (r.menuItem?.id) {
        map.set(r.menuItem.id, r)
      }
    }
    return map
  }, [recipes])

  const fetchData = useCallback(async () => {
    try {
      const data = await request('/api/graphql', GET_RECIPES_AND_INVENTORY)
      setRecipes((data as any).recipes || [])
      setIngredients((data as any).ingredients || [])
      setMenuItems((data as any).menuItems || [])
    } catch (err) {
      console.error('Error fetching BOM recipes:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSeedBOMs = async () => {
    setSeeding(true)
    setSeedNotice(null)
    try {
      const res = await fetch('/api/platform/inventory/seed-boms', { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        setSeedNotice(`BOMs generated: ${json.recipesCreated} created, ${json.recipesUpdated} updated across ${json.totalMenuItems} menu items!`)
        await fetchData()
      } else {
        setSeedNotice(`Failed: ${json.error || 'Could not seed BOMs'}`)
      }
    } catch (err) {
      setSeedNotice(`Error: ${err instanceof Error ? err.message : 'Network error'}`)
    } finally {
      setSeeding(false)
      setTimeout(() => setSeedNotice(null), 8000)
    }
  }

  const resetForm = () => {
    setForm({
      name: '',
      menuItemId: '',
      yield: 1,
      prepTime: 15,
      instructions: '',
      recipeIngredients: [],
    })
    setEditingRecipe(null)
  }

  const handleOpenDialog = (recipe?: Recipe, presetMenuItem?: MenuItem) => {
    if (recipe) {
      setEditingRecipe(recipe)
      setForm({
        name: recipe.name,
        menuItemId: recipe.menuItem?.id || '',
        yield: recipe.yield || 1,
        prepTime: recipe.prepTime || 15,
        instructions: recipe.instructions || '',
        recipeIngredients: Array.isArray(recipe.recipeIngredients) ? [...recipe.recipeIngredients] : [],
      })
    } else if (presetMenuItem) {
      resetForm()
      setForm({
        name: `${presetMenuItem.name} BOM`,
        menuItemId: presetMenuItem.id,
        yield: 1,
        prepTime: 15,
        instructions: '',
        recipeIngredients: [],
      })
    } else {
      resetForm()
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    try {
      const data: any = {
        name: form.name.trim(),
        yield: Math.max(1, Number(form.yield) || 1),
        prepTime: Number(form.prepTime) || 0,
        instructions: form.instructions || null,
        recipeIngredients: form.recipeIngredients.filter(ri => ri.ingredientId && Number(ri.quantity) > 0),
      }

      if (form.menuItemId) {
        data.menuItem = { connect: { id: form.menuItemId } }
      }

      if (editingRecipe) {
        await request('/api/graphql', UPDATE_RECIPE, { id: editingRecipe.id, data })
      } else {
        await request('/api/graphql', CREATE_RECIPE, { data })
      }

      setDialogOpen(false)
      resetForm()
      fetchData()
    } catch (err) {
      console.error('Error saving BOM recipe:', err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Bill of Materials?')) return
    try {
      await request('/api/graphql', DELETE_RECIPE, { id })
      fetchData()
    } catch (err) {
      console.error('Error deleting BOM recipe:', err)
    }
  }

  const addIngredient = () => {
    const firstIng = ingredients[0]
    setForm({
      ...form,
      recipeIngredients: [
        ...form.recipeIngredients,
        { ingredientId: firstIng?.id || '', quantity: 1, unit: firstIng?.unit || 'each' },
      ],
    })
  }

  const removeIngredient = (index: number) => {
    const updated = [...form.recipeIngredients]
    updated.splice(index, 1)
    setForm({ ...form, recipeIngredients: updated })
  }

  const updateIngredient = (index: number, field: string, value: any) => {
    const updated = [...form.recipeIngredients]
    updated[index] = { ...updated[index], [field]: value }
    // If ingredient changed, default the unit to that ingredient's unit
    if (field === 'ingredientId') {
      const ing = ingredientMap.get(value)
      if (ing) {
        updated[index].unit = ing.unit
      }
    }
    setForm({ ...form, recipeIngredients: updated })
  }

  // Calculate live statistics
  const calculatePortionsInStock = (recipe: Recipe): { portions: number; bottleneck?: string } => {
    if (!recipe.recipeIngredients || !recipe.recipeIngredients.length) return { portions: 0 }
    const recipeYield = Math.max(1, recipe.yield || 1)
    let minPortions = Infinity
    let bottleneck: string | undefined = undefined

    for (const ri of recipe.recipeIngredients) {
      const ing = ingredientMap.get(ri.ingredientId)
      if (!ing) return { portions: 0, bottleneck: 'Unknown Ingredient' }
      const stock = Math.max(0, Number(ing.currentStock || 0))
      const reqPerServing = (Number(ri.quantity || 0)) / recipeYield
      if (reqPerServing <= 0) continue
      const reqInStockUnit = convertUnits(reqPerServing, ri.unit, ing.unit)
      if (reqInStockUnit <= 0) continue
      const possible = Math.floor(stock / reqInStockUnit)
      if (possible < minPortions) {
        minPortions = possible
        bottleneck = ing.name
      }
    }

    return {
      portions: minPortions === Infinity ? 0 : minPortions,
      bottleneck,
    }
  }

  // Calculate dialog preview costs
  const dialogCalculations = useMemo(() => {
    let totalCost = 0
    let minPortions = Infinity
    let bottleneck: string | undefined = undefined
    const recipeYield = Math.max(1, form.yield || 1)

    for (const ri of form.recipeIngredients) {
      if (!ri.ingredientId) continue
      const ing = ingredientMap.get(ri.ingredientId)
      if (!ing) continue

      const lineCost = calculateIngredientLineCost(
        Number(ri.quantity || 0),
        ri.unit || 'each',
        ing.costPerUnit,
        ing.unit || 'each'
      )
      totalCost += lineCost

      const stock = Math.max(0, Number(ing.currentStock || 0))
      const reqPerServing = (Number(ri.quantity || 0)) / recipeYield
      if (reqPerServing > 0) {
        const reqInStockUnit = convertUnits(reqPerServing, ri.unit, ing.unit)
        const possible = reqInStockUnit > 0 ? Math.floor(stock / reqInStockUnit) : 0
        if (possible < minPortions) {
          minPortions = possible
          bottleneck = ing.name
        }
      }
    }

    const selectedMenuItem = menuItems.find(m => m.id === form.menuItemId)
    const priceDollars = parsePriceInDollars(selectedMenuItem?.price)
    const costPerServing = totalCost / recipeYield
    const foodCostPct = priceDollars > 0 ? (costPerServing / priceDollars) * 100 : 0
    const marginDollars = priceDollars > 0 ? priceDollars - costPerServing : 0

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      costPerServing: Math.round(costPerServing * 100) / 100,
      priceDollars,
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      marginDollars: Math.round(marginDollars * 100) / 100,
      portionsAvailable: minPortions === Infinity ? 0 : minPortions,
      bottleneck,
    }
  }, [form, ingredientMap, menuItems])

  // Filtered recipes & items
  const configuredMenuItemsCount = recipes.filter(r => r.menuItem?.id).length
  const totalMenuItemsCount = menuItems.length
  const bomCoveragePct = totalMenuItemsCount > 0 ? Math.round((configuredMenuItemsCount / totalMenuItemsCount) * 100) : 0

  const avgFoodCost = recipes.length > 0
    ? recipes.reduce((s, r) => s + (r.foodCostPercentage || 0), 0) / recipes.length
    : 0

  const outOfStockCount = recipes.filter(r => calculatePortionsInStock(r).portions === 0).length

  // Filter recipes based on search and tab
  const displayItems = useMemo(() => {
    let list: Array<{ type: 'recipe'; recipe: Recipe } | { type: 'menuItem'; menuItem: MenuItem }> = []

    if (filterTab === 'all' || filterTab === 'configured') {
      for (const recipe of recipes) {
        list.push({ type: 'recipe', recipe })
      }
    }

    if (filterTab === 'all' || filterTab === 'missing') {
      for (const item of menuItems) {
        if (!menuItemBOMMap.has(item.id)) {
          list.push({ type: 'menuItem', menuItem: item })
        }
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(entry => {
        if (entry.type === 'recipe') {
          return (
            entry.recipe.name.toLowerCase().includes(q) ||
            entry.recipe.menuItem?.name.toLowerCase().includes(q)
          )
        } else {
          return entry.menuItem.name.toLowerCase().includes(q)
        }
      })
    }

    return list
  }, [filterTab, recipes, menuItems, menuItemBOMMap, searchQuery])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <RefreshCw className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Loading Bill of Materials & Inventory Ledger...
        </p>
      </div>
    )
  }

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'link' as const, label: 'Inventory', href: '/dashboard/platform/ingredients' },
    { type: 'page' as const, label: 'Bill of Materials' }
  ]

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Header Banner */}
      <div className="px-8 py-8 border-b bg-gradient-to-r from-emerald-500/10 via-amber-500/5 to-teal-500/10 dark:from-emerald-950/20 dark:to-background">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="p-2.5 rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-500/20">
                <ChefHat className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  Bill of Materials (BOM)
                </h1>
                <p className="text-sm font-medium text-muted-foreground">
                  Menu item ingredient recipes, yield costing, and automatic stock depletion on purchase
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleSeedBOMs}
              disabled={seeding}
              variant="outline"
              size="lg"
              className="rounded-2xl border-2 font-bold bg-white dark:bg-card hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 shadow-sm transition-all"
            >
              {seeding ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2 text-emerald-600" />
              )}
              {seeding ? 'Generating BOMs...' : 'Auto-Generate Menu BOMs'}
            </Button>

            <Button
              onClick={() => handleOpenDialog()}
              size="lg"
              className="rounded-2xl font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create BOM
            </Button>
          </div>
        </div>

        {seedNotice && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/30 text-emerald-900 dark:text-emerald-200 font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{seedNotice}</span>
          </div>
        )}

        {/* Real-time KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-3xl border-2 border-emerald-500/20 bg-card/80 backdrop-blur-sm shadow-sm hover:border-emerald-500/40 transition-all">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <PackageCheck className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">BOM Coverage</div>
                <div className="text-2xl font-black mt-0.5 flex items-baseline gap-2">
                  <span>{bomCoveragePct}%</span>
                  <span className="text-xs font-semibold text-muted-foreground">({configuredMenuItemsCount}/{totalMenuItemsCount})</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-2 border-amber-500/20 bg-card/80 backdrop-blur-sm shadow-sm hover:border-amber-500/40 transition-all">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Percent className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Avg Food Cost %</div>
                <div className="text-2xl font-black mt-0.5 text-amber-600 dark:text-amber-400">
                  {avgFoodCost > 0 ? `${avgFoodCost.toFixed(1)}%` : '—'}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-2 border-blue-500/20 bg-card/80 backdrop-blur-sm shadow-sm hover:border-blue-500/40 transition-all">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3.5 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Boxes className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Raw Ingredients</div>
                <div className="text-2xl font-black mt-0.5">
                  {ingredients.length}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-2 border-rose-500/20 bg-card/80 backdrop-blur-sm shadow-sm hover:border-rose-500/40 transition-all">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3.5 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Out of Stock BOMs</div>
                <div className="text-2xl font-black mt-0.5 text-rose-600 dark:text-rose-400">
                  {outOfStockCount}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-8 py-4 border-b bg-card flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-2xl w-full md:w-auto">
          <Button
            variant={filterTab === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilterTab('all')}
            className={cn("rounded-xl font-bold text-xs", filterTab === 'all' && "bg-emerald-600 text-white")}
          >
            All Items ({totalMenuItemsCount})
          </Button>
          <Button
            variant={filterTab === 'configured' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilterTab('configured')}
            className={cn("rounded-xl font-bold text-xs", filterTab === 'configured' && "bg-emerald-600 text-white")}
          >
            Configured BOMs ({recipes.length})
          </Button>
          <Button
            variant={filterTab === 'missing' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilterTab('missing')}
            className={cn("rounded-xl font-bold text-xs", filterTab === 'missing' && "bg-amber-600 text-white")}
          >
            Missing BOM ({totalMenuItemsCount - configuredMenuItemsCount})
          </Button>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu items or BOMs..."
            className="pl-10 h-10 rounded-2xl border-2 font-medium"
          />
        </div>
      </div>

      {/* Main Grid View */}
      <ScrollArea className="flex-1">
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {displayItems.length === 0 ? (
            <div className="col-span-full py-20 text-center border-2 border-dashed rounded-[2.5rem] bg-card p-8">
              <Utensils className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-black mb-2">No items found</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                No items match your filter. Click auto-generate or create your first Bill of Materials.
              </p>
              <Button onClick={handleSeedBOMs} className="rounded-2xl font-bold bg-emerald-600 text-white">
                <Sparkles className="h-4 w-4 mr-2" />
                Auto-Generate Default BOMs
              </Button>
            </div>
          ) : (
            displayItems.map((entry, idx) => {
              if (entry.type === 'recipe') {
                const recipe = entry.recipe
                const stockInfo = calculatePortionsInStock(recipe)
                const priceDollars = parsePriceInDollars(recipe.menuItem?.price)
                const costServing = recipe.costPerServing || 0
                const grossMargin = priceDollars > 0 ? priceDollars - costServing : 0

                return (
                  <Card
                    key={`recipe-${recipe.id}`}
                    onClick={() => handleOpenDialog(recipe)}
                    className="group rounded-3xl border-2 hover:border-emerald-500/40 bg-card shadow-sm hover:shadow-xl transition-all cursor-pointer overflow-hidden flex flex-col justify-between"
                  >
                    <div className="p-6 space-y-4">
                      {/* Top Row: Name and Food Cost Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                              BOM Active
                            </span>
                            {recipe.menuItem && (
                              <span className="text-xs font-bold text-muted-foreground truncate max-w-[150px]">
                                {recipe.menuItem.name}
                              </span>
                            )}
                          </div>
                          <h3 className="text-xl font-black tracking-tight group-hover:text-emerald-600 transition-colors">
                            {recipe.name}
                          </h3>
                        </div>

                        <Badge className={cn("rounded-xl px-2.5 py-1 text-xs font-black tracking-wider uppercase border", getFoodCostColor(recipe.foodCostPercentage))}>
                          {recipe.foodCostPercentage ? `${recipe.foodCostPercentage.toFixed(1)}% FC` : 'No Cost'}
                        </Badge>
                      </div>

                      {/* Stock Portion Availability Banner */}
                      <div className={cn(
                        "p-3 rounded-2xl flex items-center justify-between text-xs font-bold border",
                        stockInfo.portions > 10
                          ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20"
                          : stockInfo.portions > 0
                            ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/20"
                      )}>
                        <div className="flex items-center gap-2">
                          {stockInfo.portions > 10 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : stockInfo.portions > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-rose-600" />
                          )}
                          <span>
                            {stockInfo.portions > 0
                              ? `${stockInfo.portions} portions in stock`
                              : 'Out of stock'}
                          </span>
                        </div>
                        {stockInfo.bottleneck && (
                          <span className="text-[10px] opacity-75 truncate max-w-[120px]">
                            Limit: {stockInfo.bottleneck}
                          </span>
                        )}
                      </div>

                      {/* Financial KPI Grid */}
                      <div className="grid grid-cols-3 gap-2 bg-muted/30 p-3 rounded-2xl border">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Price</div>
                          <div className="font-black text-sm text-foreground mt-0.5">
                            ${priceDollars.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Cost/Serv</div>
                          <div className="font-black text-sm text-foreground mt-0.5">
                            ${costServing.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Margin</div>
                          <div className={cn("font-black text-sm mt-0.5", grossMargin >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            +${grossMargin.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Ingredients composition preview */}
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <Layers className="size-3" />
                          <span>Composition ({recipe.recipeIngredients?.length || 0} ingredients)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {((recipe.recipeIngredients as RecipeIngredient[]) || []).slice(0, 4).map((ri, riIdx) => {
                            const ing = ingredientMap.get(ri.ingredientId)
                            return (
                              <span key={riIdx} className="text-[10px] font-semibold bg-muted/60 px-2 py-0.5 rounded-lg border">
                                {ing?.name || 'Item'}: {ri.quantity} {ri.unit}
                              </span>
                            )
                          })}
                          {(recipe.recipeIngredients?.length || 0) > 4 && (
                            <span className="text-[10px] font-semibold bg-muted/60 px-2 py-0.5 rounded-lg text-muted-foreground">
                              +{(recipe.recipeIngredients?.length || 0) - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="px-6 py-3.5 bg-muted/20 border-t flex items-center justify-between text-xs font-bold text-muted-foreground">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Scale className="size-3 text-muted-foreground" /> Yield: {recipe.yield || 1}
                        </span>
                        <span className="flex items-center gap-1">
                          <Timer className="size-3 text-muted-foreground" /> {recipe.prepTime || 0}m
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-0.5 group-hover:underline">
                          Edit BOM <ArrowUpRight className="size-3" />
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); handleDelete(recipe.id) }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                )
              } else {
                // Missing BOM menu item
                const menuItem = entry.menuItem
                const priceDollars = parsePriceInDollars(menuItem.price)

                return (
                  <Card
                    key={`missing-${menuItem.id}`}
                    className="rounded-3xl border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col justify-between hover:border-amber-500 transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                          Missing BOM
                        </span>
                        <span className="font-black text-sm text-foreground">
                          ${priceDollars.toFixed(2)}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-xl font-black tracking-tight">{menuItem.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {menuItem.category?.name ? `Category: ${menuItem.category.name}` : 'Uncategorized'}
                        </p>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        This item does not have a recipe or Bill of Materials configured. Purchases of this item will not auto-deduct raw inventory.
                      </p>
                    </div>

                    <div className="pt-6">
                      <Button
                        onClick={() => handleOpenDialog(undefined, menuItem)}
                        className="w-full rounded-2xl font-black uppercase tracking-wider bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Configure BOM
                      </Button>
                    </div>
                  </Card>
                )
              }
            })
          )}
        </div>
      </ScrollArea>

      {/* BOM Editor Modal Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col rounded-[2.5rem] p-0 border-2 shadow-2xl">
          <DialogHeader className="p-8 pb-4 border-b bg-gradient-to-r from-emerald-500/10 via-background to-teal-500/10">
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
              <ChefHat className="h-6 w-6 text-emerald-600" />
              <span>{editingRecipe ? 'Edit Bill of Materials (BOM)' : 'Create Bill of Materials (BOM)'}</span>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 px-8 py-6">
            <div className="space-y-6">
              {/* Basic Linking Group */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Recipe / BOM Name *
                  </Label>
                  <Input
                    className="h-12 rounded-2xl border-2 px-4 font-bold"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Signature Wagyu Burger BOM"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Link to Menu Item
                  </Label>
                  <Select
                    value={form.menuItemId}
                    onValueChange={(val) => {
                      const item = menuItems.find(m => m.id === val)
                      setForm({
                        ...form,
                        menuItemId: val,
                        name: form.name ? form.name : `${item?.name || ''} BOM`,
                      })
                    }}
                  >
                    <SelectTrigger className="h-12 rounded-2xl border-2 px-4 font-bold">
                      <SelectValue placeholder="Choose Menu Item" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl max-h-60">
                      {menuItems.map((item) => (
                        <SelectItem key={item.id} value={item.id} className="rounded-xl font-medium">
                          {item.name} (${parsePriceInDollars(item.price).toFixed(2)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Yield and Prep Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Batch Yield (Servings Produced)
                  </Label>
                  <div className="relative">
                    <Scale className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min={1}
                      className="h-12 rounded-2xl border-2 pl-12 font-bold"
                      value={form.yield}
                      onChange={(e) => setForm({ ...form, yield: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Prep Time (Minutes)
                  </Label>
                  <div className="relative">
                    <Timer className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min={0}
                      className="h-12 rounded-2xl border-2 pl-12 font-bold"
                      value={form.prepTime}
                      onChange={(e) => setForm({ ...form, prepTime: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              {/* Ingredients Composition Table */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Component Raw Ingredients (BOM)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Raw materials auto-depleted from inventory on each sale
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addIngredient}
                    className="rounded-xl border-2 font-black text-xs h-9 bg-white dark:bg-card hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Ingredient
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {form.recipeIngredients.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-2xl bg-muted/20">
                      <Layers className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs font-bold text-muted-foreground">No ingredients added to this BOM yet.</p>
                      <Button type="button" variant="link" size="sm" onClick={addIngredient} className="text-emerald-600 font-bold">
                        Add first raw ingredient
                      </Button>
                    </div>
                  ) : (
                    form.recipeIngredients.map((ri, idx) => {
                      const ing = ingredientMap.get(ri.ingredientId)
                      const lineCost = ing
                        ? calculateIngredientLineCost(ri.quantity, ri.unit, ing.costPerUnit, ing.unit)
                        : 0

                      return (
                        <div
                          key={idx}
                          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-2xl border-2 bg-card hover:border-emerald-500/30 transition-all"
                        >
                          {/* Ingredient Selector */}
                          <div className="flex-1">
                            <Select
                              value={ri.ingredientId}
                              onValueChange={(val) => updateIngredient(idx, 'ingredientId', val)}
                            >
                              <SelectTrigger className="h-11 rounded-xl border font-bold">
                                <SelectValue placeholder="Choose Raw Ingredient" />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl max-h-60">
                                {ingredients.map((item) => (
                                  <SelectItem key={item.id} value={item.id} className="rounded-xl font-medium">
                                    {item.name} (${item.costPerUnit || '0.00'}/{item.unit}) • Stock: {item.currentStock || 0} {item.unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Quantity Input */}
                          <div className="w-24">
                            <Input
                              type="number"
                              step="any"
                              min={0.01}
                              value={ri.quantity}
                              onChange={(e) => updateIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              placeholder="Qty"
                              className="h-11 rounded-xl border font-bold text-center"
                            />
                          </div>

                          {/* Unit Selector */}
                          <div className="w-32">
                            <Select
                              value={ri.unit}
                              onValueChange={(val) => updateIngredient(idx, 'unit', val)}
                            >
                              <SelectTrigger className="h-11 rounded-xl border font-bold">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl">
                                {STANDARD_UNITS.map((u) => (
                                  <SelectItem key={u.value} value={u.value} className="rounded-xl font-medium">
                                    {u.value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Line Item Cost Display */}
                          <div className="w-24 text-right pr-2">
                            <div className="text-[9px] uppercase font-bold text-muted-foreground">Line Cost</div>
                            <div className="text-sm font-black text-foreground">
                              ${lineCost.toFixed(2)}
                            </div>
                          </div>

                          {/* Delete Button */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeIngredient(idx)}
                            className="h-9 w-9 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Real-Time Financial BOM Preview Box */}
              <div className="p-5 rounded-3xl border-2 border-emerald-500/20 bg-emerald-500/5 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span>Real-Time BOM Financial Analysis</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-card rounded-2xl border">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total Batch Cost</div>
                    <div className="text-lg font-black text-foreground mt-0.5">${dialogCalculations.totalCost.toFixed(2)}</div>
                  </div>

                  <div className="p-3 bg-card rounded-2xl border">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Cost / Portion</div>
                    <div className="text-lg font-black text-foreground mt-0.5">${dialogCalculations.costPerServing.toFixed(2)}</div>
                  </div>

                  <div className="p-3 bg-card rounded-2xl border">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Food Cost %</div>
                    <div className={cn("text-lg font-black mt-0.5", getFoodCostColor(dialogCalculations.foodCostPct).split(' ')[0])}>
                      {dialogCalculations.foodCostPct > 0 ? `${dialogCalculations.foodCostPct.toFixed(1)}%` : '—'}
                    </div>
                  </div>

                  <div className="p-3 bg-card rounded-2xl border">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Portions In Stock</div>
                    <div className="text-lg font-black text-foreground mt-0.5">
                      {dialogCalculations.portionsAvailable}
                    </div>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Culinary Assembly & Prep Instructions
                </Label>
                <Textarea
                  className="rounded-2xl border-2 p-4 min-h-[100px] resize-none font-medium leading-relaxed"
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder="Step-by-step preparation, cook temperatures, plating notes..."
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  onClick={handleSave}
                  className="w-full h-14 rounded-2xl text-base font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20"
                >
                  {editingRecipe ? 'Commit BOM Changes' : 'Save & Publish Bill of Materials'}
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RecipesPage
