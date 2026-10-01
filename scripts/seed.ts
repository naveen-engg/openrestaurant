import { keystoneContext } from '../features/keystone/context'
import { syncKitchenTicketsForOrder } from '../features/keystone/utils/kitchenTicketSync'

export async function seedDatabase() {
  const sudo = keystoneContext.sudo()
  console.log('--- Starting Restaurant Database Seeding ---')

  // 1. Role & Admin User
  const existingRoles = await sudo.query.Role.findMany({
    where: { name: { equals: 'Admin' } },
    query: 'id name',
  }).catch(() => [])

  let adminRole = existingRoles[0]

  if (!adminRole) {
    console.log('Creating Admin role...')
    adminRole = await sudo.db.Role.createOne({
      data: {
        name: 'Admin',
        canAccessDashboard: true,
        canReadOrders: true,
        canManageOrders: true,
        canReadPayments: true,
        canManagePayments: true,
        canReadProducts: true,
        canManageProducts: true,
        canReadCart: true,
        canManageCart: true,
        canReadInventory: true,
        canManageInventory: true,
        canReadUsers: true,
        canManageUsers: true,
        canSeeOtherPeople: true,
        canEditOtherPeople: true,
        canManagePeople: true,
        canReadRoles: true,
        canManageRoles: true,
        canReadKitchen: true,
        canManageKitchen: true,
        canReadTables: true,
        canManageTables: true,
        canReadStaff: true,
        canManageStaff: true,
        canManageSettings: true,
        canManageOnboarding: true,
        canReadVendors: true,
        canManageVendors: true,
        canReadGiftCards: true,
        canManageGiftCards: true,
        canReadDiscounts: true,
        canManageDiscounts: true,
      },
    })
  }

  const existingUser = await sudo.query.User.findOne({
    where: { email: 'admin@openfront.dev' },
    query: 'id email',
  }).catch(() => null)

  let adminUser = existingUser
  if (!existingUser) {
    console.log('Creating Admin user: admin@openfront.dev / Password123!')
    adminUser = await sudo.db.User.createOne({
      data: {
        name: 'Restaurant Admin',
        email: 'admin@openfront.dev',
        password: 'Password123!',
        role: { connect: { id: adminRole.id } },
        isActive: true,
      },
    })
  }

  // 2. Store Settings
  const existingSettings = await sudo.query.StoreSettings.findMany({
    query: 'id',
    take: 1,
  }).catch(() => [])

  if (existingSettings.length === 0) {
    console.log('Creating default StoreSettings...')
    await sudo.db.StoreSettings.createOne({
      data: {
        name: 'Openfront Bistro',
        currencyCode: 'USD',
        taxRate: '8.75',
        locale: 'en-US',
        timezone: 'America/New_York',
      },
    })
  }

  // 3. Kitchen Stations
  const stationsToCreate = [
    { name: 'Hot Line', displayOrder: 1 },
    { name: 'Cold Prep', displayOrder: 2 },
    { name: 'Bar', displayOrder: 3 },
    { name: 'Dessert', displayOrder: 4 },
    { name: 'Expo', displayOrder: 5 },
  ]

  const stationMap: Record<string, any> = {}
  for (const s of stationsToCreate) {
    const existing = await sudo.query.KitchenStation.findMany({
      where: { name: { equals: s.name } },
      query: 'id name',
    })
    if (existing.length > 0) {
      stationMap[s.name] = existing[0]
    } else {
      console.log(`Creating Kitchen Station: ${s.name}`)
      stationMap[s.name] = await sudo.db.KitchenStation.createOne({
        data: {
          name: s.name,
          isActive: true,
          displayOrder: s.displayOrder,
        },
      })
    }
  }

  // 4. Menu Categories
  const categories = ['Food', 'Beverages', 'Dessert']
  const categoryMap: Record<string, any> = {}
  for (const catName of categories) {
    const existing = await sudo.query.MenuCategory.findMany({
      where: { name: { equals: catName } },
      query: 'id name',
    })
    if (existing.length > 0) {
      categoryMap[catName] = existing[0]
    } else {
      console.log(`Creating Menu Category: ${catName}`)
      categoryMap[catName] = await sudo.db.MenuCategory.createOne({
        data: { name: catName },
      })
    }
  }

  // 5. Menu Items with Stations
  const itemsToCreate = [
    {
      name: 'Classic Cheeseburger',
      category: 'Food',
      price: 1400,
      station: 'hot_line',
      kitchenStation: 'grill',
    },
    {
      name: 'Prime Ribeye Steak',
      category: 'Food',
      price: 3400,
      station: 'hot_line',
      kitchenStation: 'grill',
    },
    {
      name: 'Crispy French Fries',
      category: 'Food',
      price: 600,
      station: 'hot_line',
      kitchenStation: 'fryer',
    },
    {
      name: 'Caesar Salad',
      category: 'Food',
      price: 1100,
      station: 'cold_prep',
      kitchenStation: 'salad',
    },
    {
      name: 'Craft IPA Beer',
      category: 'Beverages',
      price: 750,
      station: 'bar',
      kitchenStation: 'bar',
    },
    {
      name: 'Old Fashioned Cocktail',
      category: 'Beverages',
      price: 1400,
      station: 'bar',
      kitchenStation: 'bar',
    },
    {
      name: 'Molten Chocolate Cake',
      category: 'Dessert',
      price: 950,
      station: 'dessert',
      kitchenStation: 'dessert',
    },
  ]

  const menuItemMap: Record<string, any> = {}
  for (const item of itemsToCreate) {
    const existing = await sudo.query.MenuItem.findMany({
      where: { name: { equals: item.name } },
      query: 'id name station',
    })
    if (existing.length > 0) {
      menuItemMap[item.name] = existing[0]
    } else {
      console.log(`Creating Menu Item: ${item.name} (${item.station})`)
      menuItemMap[item.name] = await sudo.db.MenuItem.createOne({
        data: {
          name: item.name,
          price: item.price,
          station: item.station,
          kitchenStation: item.kitchenStation,
          available: true,
          category: { connect: { id: categoryMap[item.category].id } },
        },
      })
    }
  }

  // 6. Tables
  const tableNumbers = ['1', '2', '3', '4', '10', '12']
  const tableMap: Record<string, any> = {}
  for (const num of tableNumbers) {
    const existing = await sudo.query.Table.findMany({
      where: { tableNumber: { equals: num } },
      query: 'id tableNumber',
    })
    if (existing.length > 0) {
      tableMap[num] = existing[0]
    } else {
      tableMap[num] = await sudo.db.Table.createOne({
        data: {
          tableNumber: num,
          capacity: 4,
          status: 'available',
        },
      })
    }
  }

  // 7. Sample Initial Active Order for Table 12
  const existingOrders = await sudo.query.RestaurantOrder.findMany({
    where: { status: { in: ['sent_to_kitchen', 'in_progress'] } },
    query: 'id orderNumber',
    take: 1,
  })

  if (existingOrders.length === 0) {
    console.log('Creating sample multi-station kitchen order for Table 12...')
    const order = await sudo.db.RestaurantOrder.createOne({
      data: {
        orderNumber: '20261001-0101',
        orderType: 'dine_in',
        orderSource: 'pos',
        status: 'sent_to_kitchen',
        guestCount: 2,
        subtotal: 5250,
        tax: 460,
        total: 5710,
        tables: { connect: [{ id: tableMap['12'].id }] },
        server: adminUser ? { connect: { id: adminUser.id } } : undefined,
      },
    })

    // Add Course
    const course = await sudo.db.OrderCourse.createOne({
      data: {
        order: { connect: { id: order.id } },
        courseNumber: 1,
        courseType: 'mains',
        status: 'pending',
      },
    })

    // Items across Bar, Hot Line, and Cold Prep
    const sampleItems = [
      { item: menuItemMap['Craft IPA Beer'], qty: 2, note: 'Chilled glasses' },
      { item: menuItemMap['Prime Ribeye Steak'], qty: 1, note: 'Medium rare' },
      { item: menuItemMap['Caesar Salad'], qty: 1, note: 'Dressing on side' },
    ]

    for (const s of sampleItems) {
      if (!s.item) continue
      await sudo.db.OrderItem.createOne({
        data: {
          order: { connect: { id: order.id } },
          course: { connect: { id: course.id } },
          menuItem: { connect: { id: s.item.id } },
          quantity: s.qty,
          price: s.item.price || 1000,
          itemNameSnapshot: s.item.name,
          station: s.item.station,
          kitchenStationSnapshot: s.item.station,
          specialInstructions: s.note,
        },
      })
    }

    // Sync kitchen tickets so they appear immediately in KDS
    await syncKitchenTicketsForOrder(order.id, keystoneContext as any)
    console.log('Sample kitchen order created and routed to tickets!')
  }

  console.log('--- Database Seeding Complete ---')
  console.log('Credentials:')
  console.log('Email:    admin@openfront.dev')
  console.log('Password: Password123!')
}

seedDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed error:', err)
    process.exit(1)
  })
