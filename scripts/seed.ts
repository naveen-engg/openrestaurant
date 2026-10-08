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

  // 5. Menu Items with Stations & Photos
  const itemsToCreate = [
    {
      name: 'Classic Cheeseburger',
      category: 'Food',
      price: 1400,
      station: 'hot_line',
      kitchenStation: 'grill',
      imagePath: '/images/classic-hamburger-with-lettuce-tomato.jpg',
    },
    {
      name: 'Double Cheeseburger',
      category: 'Food',
      price: 1750,
      station: 'hot_line',
      kitchenStation: 'grill',
      imagePath: '/images/double-cheeseburger-with-sauce-and-toppings.jpg',
    },
    {
      name: 'Bacon BBQ Burger',
      category: 'Food',
      price: 1650,
      station: 'hot_line',
      kitchenStation: 'grill',
      imagePath: '/images/bacon-bbq-burger-onion-rings.png',
    },
    {
      name: 'Prime Ribeye Steak',
      category: 'Food',
      price: 3400,
      station: 'hot_line',
      kitchenStation: 'grill',
      imagePath: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Artisan Wagyu Burger',
      category: 'Food',
      price: 1850,
      station: 'hot_line',
      kitchenStation: 'grill',
      imagePath: '/images/western-burger-with-bbq-and-bacon.jpg',
    },
    {
      name: 'Mushroom Swiss Burger',
      category: 'Food',
      price: 1600,
      station: 'hot_line',
      kitchenStation: 'grill',
      imagePath: '/images/mushroom-swiss-burger.png',
    },
    {
      name: 'Crispy Chicken Sandwich',
      category: 'Food',
      price: 1450,
      station: 'hot_line',
      kitchenStation: 'fryer',
      imagePath: '/images/crispy-chicken-sandwich-with-pickles.jpg',
    },
    {
      name: 'Chicken Tenders Basket',
      category: 'Food',
      price: 1300,
      station: 'hot_line',
      kitchenStation: 'fryer',
      imagePath: '/images/chicken-tenders-basket.jpg',
    },
    {
      name: 'Crispy French Fries',
      category: 'Food',
      price: 600,
      station: 'hot_line',
      kitchenStation: 'fryer',
      imagePath: '/images/golden-french-fries.jpg',
    },
    {
      name: 'Loaded Fries',
      category: 'Food',
      price: 850,
      station: 'hot_line',
      kitchenStation: 'fryer',
      imagePath: '/images/loaded-fries.png',
    },
    {
      name: 'Crispy Onion Rings',
      category: 'Food',
      price: 700,
      station: 'hot_line',
      kitchenStation: 'fryer',
      imagePath: '/images/crispy-onion-rings.png',
    },
    {
      name: 'Caesar Salad',
      category: 'Food',
      price: 1100,
      station: 'cold_prep',
      kitchenStation: 'salad',
      imagePath: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Craft IPA Beer',
      category: 'Beverages',
      price: 750,
      station: 'bar',
      kitchenStation: 'bar',
      imagePath: 'https://images.unsplash.com/photo-1608270105072-c2084931a74d?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Old Fashioned Cocktail',
      category: 'Beverages',
      price: 1400,
      station: 'bar',
      kitchenStation: 'bar',
      imagePath: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Fountain Soda',
      category: 'Beverages',
      price: 350,
      station: 'bar',
      kitchenStation: 'bar',
      imagePath: '/images/fountain-soda-drink-cup.jpg',
    },
    {
      name: 'Fresh Iced Tea',
      category: 'Beverages',
      price: 350,
      station: 'bar',
      kitchenStation: 'bar',
      imagePath: '/images/iced-tea-glass.png',
    },
    {
      name: 'Molten Chocolate Cake',
      category: 'Dessert',
      price: 950,
      station: 'dessert',
      kitchenStation: 'dessert',
      imagePath: '/images/brownie-sundae-with-ice-cream.jpg',
    },
    {
      name: 'Warm Apple Pie a la Mode',
      category: 'Dessert',
      price: 900,
      station: 'dessert',
      kitchenStation: 'dessert',
      imagePath: '/images/warm-apple-pie-with-ice-cream.jpg',
    },
    {
      name: 'Thick Handspun Shake',
      category: 'Dessert',
      price: 750,
      station: 'dessert',
      kitchenStation: 'dessert',
      imagePath: '/images/thick-milkshake-with-whipped-cream.jpg',
    },
  ]

  const menuItemMap: Record<string, any> = {}
  for (const item of itemsToCreate) {
    const existing = await sudo.query.MenuItem.findMany({
      where: { name: { equals: item.name } },
      query: 'id name station menuItemImages { id }',
    })
    
    let currentItem: any
    if (existing.length > 0) {
      currentItem = existing[0]
      menuItemMap[item.name] = currentItem
    } else {
      console.log(`Creating Menu Item: ${item.name} (${item.station})`)
      currentItem = await sudo.db.MenuItem.createOne({
        data: {
          name: item.name,
          price: item.price,
          station: item.station,
          kitchenStation: item.kitchenStation,
          available: true,
          category: { connect: { id: categoryMap[item.category].id } },
        },
      })
      menuItemMap[item.name] = currentItem
    }

    // Attach image if item does not already have an image attached
    if (item.imagePath && (!currentItem.menuItemImages || currentItem.menuItemImages.length === 0)) {
      const existingImg = await sudo.query.MenuItemImage.findMany({
        where: { menuItems: { some: { id: { equals: currentItem.id } } } },
        query: 'id',
      }).catch(() => [])

      if (existingImg.length === 0) {
        console.log(`Attaching photo to ${item.name}: ${item.imagePath}`)
        await sudo.db.MenuItemImage.createOne({
          data: {
            imagePath: item.imagePath,
            altText: `${item.name} photo`,
            menuItems: { connect: [{ id: currentItem.id }] },
          },
        })
      }
    }
  }

  // 5a. Seed Commercial Modifiers for Steaks, Burgers, Salads
  const modifiersToSeed = [
    // Prime Ribeye Steak: Temperature (Required 1 of 1)
    { menuItemName: 'Prime Ribeye Steak', name: 'Rare', group: 'temperature', label: 'Meat Temperature', req: true, min: 1, max: 1, price: 0, def: false },
    { menuItemName: 'Prime Ribeye Steak', name: 'Medium Rare', group: 'temperature', label: 'Meat Temperature', req: true, min: 1, max: 1, price: 0, def: true },
    { menuItemName: 'Prime Ribeye Steak', name: 'Medium', group: 'temperature', label: 'Meat Temperature', req: true, min: 1, max: 1, price: 0, def: false },
    { menuItemName: 'Prime Ribeye Steak', name: 'Medium Well', group: 'temperature', label: 'Meat Temperature', req: true, min: 1, max: 1, price: 0, def: false },
    { menuItemName: 'Prime Ribeye Steak', name: 'Well Done', group: 'temperature', label: 'Meat Temperature', req: true, min: 1, max: 1, price: 0, def: false },
    // Prime Ribeye Steak: Crust & Butter (Optional, max 2)
    { menuItemName: 'Prime Ribeye Steak', name: 'Blue Cheese Crust', group: 'addons', label: 'Crust & Butter', req: false, min: 0, max: 2, price: 300, def: false },
    { menuItemName: 'Prime Ribeye Steak', name: 'Truffle Herb Butter', group: 'addons', label: 'Crust & Butter', req: false, min: 0, max: 2, price: 250, def: false },
    { menuItemName: 'Prime Ribeye Steak', name: 'Grilled Shrimp Skewer', group: 'addons', label: 'Crust & Butter', req: false, min: 0, max: 2, price: 700, def: false },
    // Prime Ribeye Steak: Side Choice (Required 1 of 1)
    { menuItemName: 'Prime Ribeye Steak', name: 'Roasted Garlic Mash', group: 'sides', label: 'Included Side', req: true, min: 1, max: 1, price: 0, def: true },
    { menuItemName: 'Prime Ribeye Steak', name: 'Truffle Parmesan Fries', group: 'sides', label: 'Included Side', req: true, min: 1, max: 1, price: 250, def: false },
    { menuItemName: 'Prime Ribeye Steak', name: 'Charred Asparagus', group: 'sides', label: 'Included Side', req: true, min: 1, max: 1, price: 300, def: false },

    // Artisan Wagyu Burger: Temperature (Required 1 of 1)
    { menuItemName: 'Artisan Wagyu Burger', name: 'Medium Rare', group: 'temperature', label: 'Burger Temp', req: true, min: 1, max: 1, price: 0, def: false },
    { menuItemName: 'Artisan Wagyu Burger', name: 'Medium', group: 'temperature', label: 'Burger Temp', req: true, min: 1, max: 1, price: 0, def: true },
    { menuItemName: 'Artisan Wagyu Burger', name: 'Well Done', group: 'temperature', label: 'Burger Temp', req: true, min: 1, max: 1, price: 0, def: false },
    // Artisan Wagyu Burger: Cheese (Required 1 of 1)
    { menuItemName: 'Artisan Wagyu Burger', name: 'Aged White Cheddar', group: 'cheese', label: 'Cheese Choice', req: true, min: 1, max: 1, price: 0, def: true },
    { menuItemName: 'Artisan Wagyu Burger', name: 'Swiss Cheese', group: 'cheese', label: 'Cheese Choice', req: true, min: 1, max: 1, price: 100, def: false },
    { menuItemName: 'Artisan Wagyu Burger', name: 'Smoked Pepper Jack', group: 'cheese', label: 'Cheese Choice', req: true, min: 1, max: 1, price: 0, def: false },
    { menuItemName: 'Artisan Wagyu Burger', name: 'No Cheese', group: 'cheese', label: 'Cheese Choice', req: true, min: 1, max: 1, price: 0, def: false },
    // Artisan Wagyu Burger: Extra Addons (Optional, max 3)
    { menuItemName: 'Artisan Wagyu Burger', name: 'Applewood Smoked Bacon', group: 'addons', label: 'Extra Toppings', req: false, min: 0, max: 3, price: 200, def: false },
    { menuItemName: 'Artisan Wagyu Burger', name: 'Fresh Hass Avocado', group: 'addons', label: 'Extra Toppings', req: false, min: 0, max: 3, price: 250, def: false },
    { menuItemName: 'Artisan Wagyu Burger', name: 'Sunny Side Up Egg', group: 'addons', label: 'Extra Toppings', req: false, min: 0, max: 3, price: 150, def: false },
    // Artisan Wagyu Burger: Removals (Optional, max 4)
    { menuItemName: 'Artisan Wagyu Burger', name: 'NO Caramelized Onions', group: 'removals', label: 'Removals', req: false, min: 0, max: 4, price: 0, def: false },
    { menuItemName: 'Artisan Wagyu Burger', name: 'NO House Pickles', group: 'removals', label: 'Removals', req: false, min: 0, max: 4, price: 0, def: false },
    { menuItemName: 'Artisan Wagyu Burger', name: 'NO Truffle Aioli', group: 'removals', label: 'Removals', req: false, min: 0, max: 4, price: 0, def: false },

    // Caesar Salad: Protein Add-on (Optional, max 1)
    { menuItemName: 'Caesar Salad', name: 'Grilled Herb Chicken', group: 'addons', label: 'Add Protein', req: false, min: 0, max: 1, price: 600, def: false },
    { menuItemName: 'Caesar Salad', name: 'Blackened Wild Salmon', group: 'addons', label: 'Add Protein', req: false, min: 0, max: 1, price: 900, def: false },
    { menuItemName: 'Caesar Salad', name: 'Jumbo Garlic Prawns', group: 'addons', label: 'Add Protein', req: false, min: 0, max: 1, price: 800, def: false },
    // Caesar Salad: Dressing Prep
    { menuItemName: 'Caesar Salad', name: 'Dressing on Side', group: 'dressings', label: 'Dressing Prep', req: false, min: 0, max: 1, price: 0, def: false },
    { menuItemName: 'Caesar Salad', name: 'Extra Dressing', group: 'dressings', label: 'Dressing Prep', req: false, min: 0, max: 1, price: 75, def: false },
  ]

  for (const mod of modifiersToSeed) {
    const parentItem = menuItemMap[mod.menuItemName]
    if (!parentItem) continue
    const existing = await sudo.query.MenuItemModifier.findMany({
      where: {
        menuItem: { id: { equals: parentItem.id } },
        name: { equals: mod.name },
      },
      query: 'id',
    })
    if (existing.length === 0) {
      await sudo.db.MenuItemModifier.createOne({
        data: {
          name: mod.name,
          modifierGroup: mod.group,
          modifierGroupLabel: mod.label,
          required: mod.req,
          minSelections: mod.min,
          maxSelections: mod.max,
          priceAdjustment: mod.price,
          defaultSelected: mod.def,
          menuItem: { connect: { id: parentItem.id } },
        },
      })
    }
  }

  // 5b. Sections
  const sectionNames = ['Main Dining Room', 'Patio & Terrace', 'Bar & Lounge']
  const sectionMap: Record<string, any> = {}
  for (const name of sectionNames) {
    const existing = await sudo.query.Section.findMany({
      where: { name: { equals: name } },
      query: 'id name',
    })
    if (existing.length > 0) {
      sectionMap[name] = existing[0]
    } else {
      sectionMap[name] = await sudo.db.Section.createOne({
        data: { name },
      })
    }
  }

  // 6. Tables with spatial floor plan coordinates & shapes
  const tableConfigs = [
    { num: '1', cap: 2, shape: 'square', x: 140, y: 140, section: 'Main Dining Room' },
    { num: '2', cap: 2, shape: 'square', x: 320, y: 140, section: 'Main Dining Room' },
    { num: '3', cap: 4, shape: 'round', x: 500, y: 140, section: 'Main Dining Room' },
    { num: '4', cap: 6, shape: 'rectangle', x: 220, y: 320, section: 'Main Dining Room' },
    { num: '10', cap: 4, shape: 'round', x: 740, y: 140, section: 'Patio & Terrace' },
    { num: '12', cap: 6, shape: 'rectangle', x: 760, y: 320, section: 'Patio & Terrace' },
  ]
  const tableMap: Record<string, any> = {}
  for (const cfg of tableConfigs) {
    const existing = await sudo.query.Table.findMany({
      where: { tableNumber: { equals: cfg.num } },
      query: 'id tableNumber positionX positionY',
    })
    const secId = sectionMap[cfg.section]?.id
    if (existing.length > 0) {
      tableMap[cfg.num] = existing[0]
      if (!existing[0].positionX || existing[0].positionX < 20) {
        await sudo.db.Table.updateOne({
          where: { id: existing[0].id },
          data: {
            positionX: cfg.x,
            positionY: cfg.y,
            shape: cfg.shape,
            capacity: cfg.cap,
            ...(secId ? { section: { connect: { id: secId } } } : {}),
          },
        })
      }
    } else {
      tableMap[cfg.num] = await sudo.db.Table.createOne({
        data: {
          tableNumber: cfg.num,
          capacity: cfg.cap,
          status: 'available',
          shape: cfg.shape,
          positionX: cfg.x,
          positionY: cfg.y,
          ...(secId ? { section: { connect: { id: secId } } } : {}),
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

    // Course 1 (Appetizers & Drinks) - Fired
    const course1 = await sudo.db.OrderCourse.createOne({
      data: {
        order: { connect: { id: order.id } },
        courseNumber: 1,
        courseType: 'appetizers',
        status: 'fired',
        onHold: false,
        fireTime: new Date().toISOString(),
      },
    })

    // Course 2 (Mains) - Held (Toast course pacing)
    const course2 = await sudo.db.OrderCourse.createOne({
      data: {
        order: { connect: { id: order.id } },
        courseNumber: 2,
        courseType: 'mains',
        status: 'pending',
        onHold: true,
      },
    })

    const sampleItems = [
      { item: menuItemMap['Craft IPA Beer'], qty: 2, note: 'Chilled glasses', course: course1, isHeld: false },
      { item: menuItemMap['Caesar Salad'], qty: 1, note: 'Dressing on side', course: course1, isHeld: false },
      { item: menuItemMap['Prime Ribeye Steak'], qty: 1, note: 'Medium rare', course: course2, isHeld: true },
    ]

    const nowIso = new Date().toISOString()
    for (const s of sampleItems) {
      if (!s.item) continue
      await sudo.db.OrderItem.createOne({
        data: {
          order: { connect: { id: order.id } },
          course: { connect: { id: s.course.id } },
          menuItem: { connect: { id: s.item.id } },
          quantity: s.qty,
          price: s.item.price || 1000,
          itemNameSnapshot: s.item.name,
          station: s.item.station,
          kitchenStationSnapshot: s.item.station,
          specialInstructions: s.note,
          courseNumber: s.course.courseNumber,
          sentToKitchen: s.isHeld ? null : nowIso,
          firedAt: s.isHeld ? null : nowIso,
          kitchenStatus: s.isHeld ? 'held' : 'new',
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
