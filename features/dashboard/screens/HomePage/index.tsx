/**
 * HomePage for Dashboard - Server Component
 * Queries real-time restaurant operational signals and renders the unified feature hub.
 */

import React from 'react'
import { PageContainer } from '../../components/PageContainer'
import { getAdminMetaAction, getListCounts } from '../../actions'
import { keystoneContext } from '@/features/keystone/context'
import { DashboardOverview, DashboardStats } from './DashboardOverview'

export async function HomePage() {
  const sudo = keystoneContext.sudo()

  // Parallel server-side fetch of Keystone metadata, counts, and live restaurant operational signals
  const [
    adminMetaResponse,
    orders,
    tables,
    reservations,
    menuItems,
    recipes,
    ingredients,
    storeSettingsList,
    kitchenTickets,
  ] = await Promise.all([
    getAdminMetaAction().catch(() => ({ success: false, data: null, error: null })),
    sudo.query.RestaurantOrder.findMany({
      query: 'id orderNumber status total createdAt',
      orderBy: { createdAt: 'desc' },
      take: 100,
    }).catch(() => []),
    sudo.query.Table.findMany({
      query: 'id tableNumber capacity status',
      orderBy: { tableNumber: 'asc' },
    }).catch(() => []),
    sudo.query.Reservation.findMany({
      query: 'id customerName partySize reservationDate status',
      take: 50,
      orderBy: { reservationDate: 'asc' },
    }).catch(() => []),
    sudo.query.MenuItem.findMany({
      query: 'id name available',
    }).catch(() => []),
    sudo.query.Recipe.findMany({
      query: 'id name menuItem { id }',
    }).catch(() => []),
    sudo.query.Ingredient.findMany({
      query: 'id name currentStock parLevel unit category',
    }).catch(() => []),
    sudo.query.StoreSettings.findMany({
      query: 'id storeName currency symbol timezone',
      take: 1,
    }).catch(() => []),
    sudo.query.KitchenTicket.findMany({
      where: { status: { in: ['new', 'in_progress'] } },
      query: 'id status',
    }).catch(() => []),
  ])

  // Process Orders Metrics
  const activeOrderStatuses = new Set(['open', 'sent_to_kitchen', 'in_progress', 'ready'])
  const activeOrders = orders.filter((o: any) => activeOrderStatuses.has(o.status))
  const completedOrders = orders.filter((o: any) => o.status === 'completed' || o.status === 'served')
  const totalRevenueCents = orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0)

  // Process Tables Metrics
  const totalTables = tables.length
  const occupiedTables = tables.filter((t: any) => t.status === 'occupied').length
  const availableTables = tables.filter((t: any) => t.status === 'available').length
  const occupancyRate = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0

  // Process Reservations Metrics
  const confirmedReservations = reservations.filter((r: any) => r.status === 'confirmed').length

  // Process Menu & BOM Metrics
  const totalMenuItems = menuItems.length
  const itemsWithBOM = new Set(recipes.map((r: any) => r.menuItem?.id).filter(Boolean))
  const bomCoveragePercentage = totalMenuItems > 0 
    ? Math.round((itemsWithBOM.size / totalMenuItems) * 100) 
    : 100

  // Process Inventory & Physical Stock Metrics
  const physicalCategories = new Set(['furniture', 'tableware', 'glassware', 'disposables', 'smallwares'])
  const kitchenIngredients = ingredients.filter((i: any) => !physicalCategories.has(i.category)).length
  const physicalAssets = ingredients.filter((i: any) => physicalCategories.has(i.category)).length
  const lowStockCount = ingredients.filter((i: any) => {
    const stock = Number(i.currentStock || 0)
    const par = Number(i.parLevel || 0)
    return par > 0 && stock <= par
  }).length

  const storeSettings = storeSettingsList[0] || null

  const stats: DashboardStats = {
    orders: {
      activeCount: activeOrders.length,
      completedCount: completedOrders.length,
      totalToday: orders.length,
      totalRevenue: totalRevenueCents / 100,
    },
    tables: {
      total: totalTables,
      occupied: occupiedTables,
      available: availableTables,
      occupancyRate,
    },
    reservations: {
      total: reservations.length,
      confirmed: confirmedReservations,
      upcoming: reservations.filter((r: any) => r.status === 'pending' || r.status === 'confirmed').length,
    },
    kds: {
      activeTickets: kitchenTickets.length,
    },
    inventory: {
      totalIngredients: ingredients.length,
      lowStockCount,
      bomCoveragePercentage,
      totalMenuItems,
      menuItemsWithBOM: itemsWithBOM.size,
      kitchenIngredients,
      physicalAssets,
    },
    storeSettings: {
      storeName: storeSettings?.storeName || 'The Rusty Anchor Bistro',
      currency: storeSettings?.currency || 'USD',
      symbol: storeSettings?.symbol || '$',
    },
  }

  // Handle Keystone data lists for administrative collapsible
  const adminMeta = adminMetaResponse.success ? adminMetaResponse.data : null
  const lists = adminMeta?.lists || []
  const enhancedLists = lists.filter((list: any) => !list.isHidden)

  let countData: Record<string, number> = {}
  if (enhancedLists.length > 0) {
    const countResponse = await getListCounts(enhancedLists)
    if (countResponse.success && countResponse.data) {
      countData = countResponse.data
    }
  }

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard' }
  ]

  return (
    <PageContainer title="Dashboard" breadcrumbs={breadcrumbs}>
      <div className="w-full max-w-7xl px-4 md:px-8 py-2 md:py-4">
        <DashboardOverview
          stats={stats}
          lists={enhancedLists}
          countData={countData}
        />
      </div>
    </PageContainer>
  )
}

export default HomePage