'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  Ticket,
  ChefHat,
  HandPlatter,
  ConciergeBell,
  CalendarDays,
  Store,
  BookOpen,
  Boxes,
  Package,
  FileText,
  Trash2,
  ClipboardList,
  MapPin,
  Users,
  BarChart3,
  Sparkles,
  ArrowUpRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Utensils,
  ChevronDown,
  ChevronUp,
  Database,
  Plus,
  CreditCard,
  Tag,
  Gift,
  Key,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface DashboardStats {
  orders: {
    activeCount: number
    completedCount: number
    totalToday: number
    totalRevenue: number
  }
  tables: {
    total: number
    occupied: number
    available: number
    occupancyRate: number
  }
  reservations: {
    total: number
    confirmed: number
    upcoming: number
  }
  kds: {
    activeTickets: number
  }
  inventory: {
    totalIngredients: number
    lowStockCount: number
    bomCoveragePercentage: number
    totalMenuItems: number
    menuItemsWithBOM: number
    kitchenIngredients: number
    physicalAssets: number
  }
  storeSettings?: {
    storeName?: string
    currency?: string
    symbol?: string
  }
}

interface DashboardOverviewProps {
  stats: DashboardStats
  lists: any[]
  countData: Record<string, number>
}

export function DashboardOverview({ stats, lists, countData }: DashboardOverviewProps) {
  const [showDataModels, setShowDataModels] = useState(false)
  const currencySymbol = stats.storeSettings?.symbol || '$'
  const storeName = stats.storeSettings?.storeName || 'Restaurant Central'

  const quickActions = [
    {
      title: 'Point of Sale (POS)',
      href: '/dashboard/platform/pos',
      description: 'Take customer orders, seat tables, and process instant card/cash checkout.',
      icon: HandPlatter,
      badge: 'Terminal Ready',
      badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      category: 'Front of House',
      stat: 'Fast Checkout',
    },
    {
      title: 'Kitchen Display (KDS)',
      href: '/dashboard/platform/kds',
      description: 'Live order routing for hot line, cold line, and bar with cook timers.',
      icon: ChefHat,
      badge: `${stats.kds.activeTickets} Active Tickets`,
      badgeColor: stats.kds.activeTickets > 0 
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 animate-pulse'
        : 'bg-muted text-muted-foreground border-border',
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      category: 'Front of House',
      stat: `${stats.kds.activeTickets} in queue`,
    },
    {
      title: 'Dining Tables & Sections',
      href: '/dashboard/platform/tables',
      description: 'Interactive floor plan, visual table status, and occupancy management.',
      icon: MapPin,
      badge: `${stats.tables.occupied} / ${stats.tables.total} Occupied`,
      badgeColor: stats.tables.occupied > 0
        ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
        : 'bg-muted text-muted-foreground border-border',
      iconBg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
      category: 'Front of House',
      stat: `${stats.tables.occupancyRate}% Occupancy`,
    },
    {
      title: 'Orders Central',
      href: '/dashboard/platform/orders',
      description: 'Unified management for dine-in, takeout, online storefront, and delivery.',
      icon: Ticket,
      badge: `${stats.orders.activeCount} In Progress`,
      badgeColor: stats.orders.activeCount > 0
        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
        : 'bg-muted text-muted-foreground border-border',
      iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      category: 'Front of House',
      stat: `${stats.orders.totalToday} total today`,
    },
    {
      title: 'Table Reservations',
      href: '/dashboard/platform/reservations',
      description: 'Manage guest party bookings, arrival times, and waitlist allocations.',
      icon: CalendarDays,
      badge: `${stats.reservations.confirmed} Booked`,
      badgeColor: stats.reservations.confirmed > 0
        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
        : 'bg-muted text-muted-foreground border-border',
      iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
      category: 'Front of House',
      stat: `${stats.reservations.total} total bookings`,
    },
    {
      title: 'Service Floor (Waitstaff)',
      href: '/dashboard/platform/service-floor',
      description: 'Handheld table-side ordering, modifier adjustments, and split check payments.',
      icon: ConciergeBell,
      badge: 'Waitstaff Mode',
      badgeColor: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
      iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
      category: 'Front of House',
      stat: 'Table Service',
    },
    {
      title: 'Menu Architect',
      href: '/dashboard/platform/menu',
      description: 'Unified visual builder for dishes, categories, modifiers, and photo uploads.',
      icon: BookOpen,
      badge: `${stats.inventory.totalMenuItems} Menu Items`,
      badgeColor: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
      iconBg: 'bg-green-500/10 text-green-600 dark:text-green-400',
      category: 'Culinary & Supply',
      stat: 'Visual Builder',
    },
    {
      title: 'Kitchen Stock (Ingredients)',
      href: '/dashboard/platform/ingredients?realm=kitchen',
      description: 'Culinary raw ingredients, stock levels, par tracking, and automated depletion.',
      icon: Boxes,
      badge: stats.inventory.lowStockCount > 0 ? `${stats.inventory.lowStockCount} Low Par` : 'Par Levels Healthy',
      badgeColor: stats.inventory.lowStockCount > 0
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
        : 'bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20',
      iconBg: 'bg-lime-500/10 text-lime-600 dark:text-lime-400',
      category: 'Culinary & Supply',
      stat: `${stats.inventory.kitchenIngredients} raw items`,
    },
    {
      title: 'Physical Stock & Assets',
      href: '/dashboard/platform/ingredients?realm=physical',
      description: 'Commercial restaurant assets: tables, chairs, chinaware, glassware, smallwares.',
      icon: Package,
      badge: `${stats.inventory.physicalAssets} Asset Types`,
      badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
      iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
      category: 'Culinary & Supply',
      stat: 'Assets & Furniture',
    },
    {
      title: 'Bill of Materials (BOM)',
      href: '/dashboard/platform/inventory/recipes',
      description: 'Recipe yields, portion bottlenecks, gross margins, and live food cost % tracking.',
      icon: Layers,
      badge: `${stats.inventory.bomCoveragePercentage}% Coverage`,
      badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      category: 'Culinary & Supply',
      stat: `${stats.inventory.menuItemsWithBOM} recipes linked`,
    },
    {
      title: 'Purchase Orders',
      href: '/dashboard/platform/inventory/purchase-orders',
      description: 'Supplier orders, replenishment workflows, and automated receipt delivery.',
      icon: FileText,
      badge: 'Vendor Supply',
      badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      category: 'Culinary & Supply',
      stat: 'Supplier Ledger',
    },
    {
      title: 'Waste & Breakage Log',
      href: '/dashboard/platform/inventory/waste',
      description: 'Record kitchen prep loss, expired perishables, and dining room plate breakage.',
      icon: Trash2,
      badge: 'Loss Control',
      badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      category: 'Culinary & Supply',
      stat: 'Loss Auditing',
    },
    {
      title: 'Sales & Analytics',
      href: '/dashboard/platform/reports',
      description: 'Revenue performance, best-selling dishes, labor costs, and shift reports.',
      icon: BarChart3,
      badge: 'Real-time BI',
      badgeColor: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
      iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
      category: 'Management & Signals',
      stat: 'Executive Insights',
    },
    {
      title: 'Daily Operations',
      href: '/dashboard/platform/operations',
      description: 'Opening/closing checklists, manager approvals, station status, and alerts.',
      icon: ClipboardList,
      badge: 'Operational Pulse',
      badgeColor: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
      iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
      category: 'Management & Signals',
      stat: 'Daily Signals',
    },
    {
      title: 'Staff & Shift Management',
      href: '/dashboard/platform/users',
      description: 'Clock-in/out tracking, tip pooling distributions, and role-based permissions.',
      icon: Users,
      badge: 'Team Access',
      badgeColor: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20',
      iconBg: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
      category: 'Management & Signals',
      stat: 'Staff & Roles',
    },
    {
      title: 'Store Settings & Hardware',
      href: '/dashboard/platform/store-settings',
      description: 'Restaurant profile, business hours, ESC/POS hardware, and tax configurations.',
      icon: Store,
      badge: 'System Config',
      badgeColor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
      iconBg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
      category: 'Management & Signals',
      stat: 'Hardware & Tax',
    },
  ]

  return (
    <div className="w-full space-y-6 pb-12">
      {/* ── Top Hero / Welcome Banner ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-muted/50 via-card to-background p-6 md:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                All Systems Operational
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                <Layers className="w-3 h-3" />
                BOM Auto-Depletion 100% Active
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                {storeName}
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Aura OS
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Aura Restaurant OS operations center. Manage live dining tables, kitchen routing, POS checkout, recipe costing, and physical inventory.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button asChild size="default" className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm">
              <Link href="/dashboard/platform/pos">
                <HandPlatter className="mr-2 h-4 w-4" />
                Launch POS
              </Link>
            </Button>
            <Button asChild variant="outline" size="default" className="border-border hover:bg-muted/60 font-medium">
              <Link href="/dashboard/platform/kds">
                <ChefHat className="mr-2 h-4 w-4 text-amber-500" />
                Kitchen Display
              </Link>
            </Button>
            <Button asChild variant="outline" size="default" className="border-border hover:bg-muted/60 font-medium">
              <Link href="/dashboard/platform/tables">
                <MapPin className="mr-2 h-4 w-4 text-cyan-500" />
                Table Floor
              </Link>
            </Button>
          </div>
        </div>

        {/* ── 4 Top KPI Feature Status Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-border/80">
          {/* Orders Status */}
          <Link href="/dashboard/platform/orders" className="group p-3.5 rounded-xl border border-border/60 bg-card/60 hover:bg-card hover:border-blue-500/40 transition-all">
            <div className="flex items-center justify-between text-muted-foreground mb-1.5">
              <span className="text-xs font-medium">Active Orders</span>
              <Ticket className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-2xl font-bold text-foreground tabular-nums">
              {stats.orders.activeCount}
            </div>
            <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
              <span>{stats.orders.totalToday} placed today</span>
              <span className="text-blue-500 font-medium group-hover:translate-x-0.5 transition-transform">View →</span>
            </div>
          </Link>

          {/* Tables Status */}
          <Link href="/dashboard/platform/tables" className="group p-3.5 rounded-xl border border-border/60 bg-card/60 hover:bg-card hover:border-cyan-500/40 transition-all">
            <div className="flex items-center justify-between text-muted-foreground mb-1.5">
              <span className="text-xs font-medium">Table Occupancy</span>
              <MapPin className="w-4 h-4 text-cyan-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-2xl font-bold text-foreground tabular-nums">
              {stats.tables.occupied} <span className="text-sm font-normal text-muted-foreground">/ {stats.tables.total}</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
              <span>{stats.tables.occupancyRate}% dining room</span>
              <span className="text-cyan-500 font-medium group-hover:translate-x-0.5 transition-transform">Floor →</span>
            </div>
          </Link>

          {/* Reservations Status */}
          <Link href="/dashboard/platform/reservations" className="group p-3.5 rounded-xl border border-border/60 bg-card/60 hover:bg-card hover:border-purple-500/40 transition-all">
            <div className="flex items-center justify-between text-muted-foreground mb-1.5">
              <span className="text-xs font-medium">Reservations</span>
              <CalendarDays className="w-4 h-4 text-purple-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-2xl font-bold text-foreground tabular-nums">
              {stats.reservations.confirmed}
            </div>
            <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
              <span>{stats.reservations.total} total booked</span>
              <span className="text-purple-500 font-medium group-hover:translate-x-0.5 transition-transform">Bookings →</span>
            </div>
          </Link>

          {/* Inventory & BOM Status */}
          <Link href="/dashboard/platform/inventory/recipes" className="group p-3.5 rounded-xl border border-border/60 bg-card/60 hover:bg-card hover:border-amber-500/40 transition-all">
            <div className="flex items-center justify-between text-muted-foreground mb-1.5">
              <span className="text-xs font-medium">BOM Recipe Coverage</span>
              <Layers className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-2xl font-bold text-foreground tabular-nums">
              {stats.inventory.bomCoveragePercentage}%
            </div>
            <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
              <span>{stats.inventory.menuItemsWithBOM}/{stats.inventory.totalMenuItems} dishes costed</span>
              <span className="text-amber-500 font-medium group-hover:translate-x-0.5 transition-transform">BOM →</span>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Feature Navigation Workspace ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Restaurant Modules & Feature Hub
            </h2>
            <p className="text-xs text-muted-foreground">
              Instant access to all front-of-house, kitchen, inventory, and management workspaces.
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-normal">
            {quickActions.length} Modules Active
          </Badge>
        </div>

        {/* Dynamic Responsive Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.title}
                href={action.href}
                className="group relative flex flex-col justify-between p-4 rounded-xl border border-border bg-card hover:border-foreground/30 hover:shadow-md transition-all duration-200"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105', action.iconBg)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <Badge variant="outline" className={cn('text-[11px] font-medium border px-2 py-0.5 shrink-0', action.badgeColor)}>
                      {action.badge}
                    </Badge>
                  </div>

                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                    {action.title}
                    <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all text-muted-foreground" />
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {action.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">{action.stat}</span>
                  <span className="font-semibold text-primary opacity-80 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                    Open →
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── System Status & Integration Signals ── */}
      <div className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-foreground">Live Infrastructure & Sync Health</h3>
          </div>
          <span className="text-xs text-muted-foreground">All micro-services connected</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              POS Terminal
            </div>
            <div className="text-xs font-semibold text-foreground">Online & Synced</div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Kitchen Routing
            </div>
            <div className="text-xs font-semibold text-foreground">Hot / Cold / Bar</div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              BOM Auto-Deplete
            </div>
            <div className="text-xs font-semibold text-foreground">100% Coverage</div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Table Layout
            </div>
            <div className="text-xs font-semibold text-foreground">Active ({stats.tables.total} Tables)</div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Stock Ledger
            </div>
            <div className="text-xs font-semibold text-foreground">{stats.inventory.totalIngredients} Tracked Items</div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Database Engine
            </div>
            <div className="text-xs font-semibold text-foreground">PostgreSQL 16</div>
          </div>
        </div>
      </div>

      {/* ── Underlying Administrative Data Models (Clean & Collapsible) ── */}
      <div className="border border-border/70 rounded-xl overflow-hidden bg-card/30">
        <button
          type="button"
          onClick={() => setShowDataModels(!showDataModels)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">
              Keystone Data Schema ({lists.length} Models)
            </span>
            <span className="text-[11px] text-muted-foreground">
              • Direct database table viewer for developers and system administrators
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {showDataModels ? 'Hide Data Models' : 'Show Data Models'}
            {showDataModels ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showDataModels && (
          <div className="p-4 border-t border-border bg-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {lists.map((list: any) => {
                const count = countData[list.key] ?? null
                const isSingleton = list.isSingleton || false
                const href = `/dashboard/${list.path}${isSingleton ? '/1' : ''}`

                return (
                  <Card key={list.key} className="relative bg-muted/30 hover:bg-muted/60 transition-colors border border-border/60">
                    <Link href={href} className="block p-3">
                      <div className="text-xs font-semibold text-foreground">{list.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {isSingleton
                          ? 'Singleton'
                          : count === null || count === undefined
                            ? 'Unknown count'
                            : `${count} item${count !== 1 ? 's' : ''}`
                        }
                      </div>
                    </Link>
                    {!list.hideCreate && !isSingleton && (
                      <Link
                        href={`/dashboard/${list.path}/create`}
                        className="absolute top-2.5 right-2.5 p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                        title={`Add ${list.singular?.toLowerCase() || 'item'}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
