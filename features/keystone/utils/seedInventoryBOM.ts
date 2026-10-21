/**
 * seedInventoryBOM.ts
 * Automatically seeds vendors, raw ingredients with stock levels and reorder parameters,
 * links ingredients to purchase orders and vendors, and creates complete
 * Bill of Materials (BOM) for every menu item in the restaurant.
 */

import type { Context } from ".keystone/types";

export interface VendorSeedDef {
  name: string;
  contact: string;
  email: string;
  phone: string;
  paymentTerms: string;
  leadTime: number;
}

export interface IngredientSeedDef {
  name: string;
  category: "produce" | "meat" | "dairy" | "dry_goods" | "beverages" | "spices" | "seafood" | "furniture" | "tableware" | "glassware" | "disposables" | "smallwares" | "other";
  unit: "lb" | "oz" | "kg" | "liter" | "gallon" | "each" | "case" | "box" | "pack" | "set";
  costPerUnit: string;
  currentStock: string;
  parLevel: string;
  reorderPoint: string;
  reorderQuantity: string;
  sku: string;
  vendorName: string;
}

export const STANDARD_VENDORS: VendorSeedDef[] = [
  {
    name: "Halperns' Prime Meats & Seafood",
    contact: "Sarah Jenkins",
    email: "wholesale@halpernsmeats.com",
    phone: "(555) 456-7812",
    paymentTerms: "Net 15",
    leadTime: 1,
  },
  {
    name: "FarmFresh Organic Produce",
    contact: "Emilio Rivera",
    email: "dispatch@farmfreshorganic.com",
    phone: "(555) 789-3321",
    paymentTerms: "Net 14",
    leadTime: 1,
  },
  {
    name: "Golden Crust Artisanal Bakery",
    contact: "David Becker",
    email: "bakery@goldencrustsupply.com",
    phone: "(555) 334-1189",
    paymentTerms: "Net 7",
    leadTime: 2,
  },
  {
    name: "Sysco Metro Foods",
    contact: "Marcus Vance",
    email: "orders@syscometro.com",
    phone: "(555) 234-8890",
    paymentTerms: "Net 30",
    leadTime: 2,
  },
  {
    name: "Beverage Alliance Wholesale",
    contact: "Chloe Chen",
    email: "accounts@bevdistributors.com",
    phone: "(555) 912-4433",
    paymentTerms: "COD",
    leadTime: 3,
  },
  {
    name: "Grand Restaurant Supply & Equipment Co.",
    contact: "Robert Sterling",
    email: "commercial@grandrestaurantsupply.com",
    phone: "(555) 678-2200",
    paymentTerms: "Net 30",
    leadTime: 3,
  },
  {
    name: "Steelite & Libbey Hospitality Tableware",
    contact: "Elena Rostova",
    email: "tableware@steelite-hospitality.com",
    phone: "(555) 789-5544",
    paymentTerms: "Net 30",
    leadTime: 2,
  },
  {
    name: "EcoPak Sustainable Disposables",
    contact: "Liam Gallagher",
    email: "orders@ecopaksupply.com",
    phone: "(555) 890-1122",
    paymentTerms: "Net 14",
    leadTime: 1,
  },
];

export const STANDARD_RAW_INGREDIENTS: IngredientSeedDef[] = [
  // Produce (FarmFresh Organic Produce)
  { name: "Romaine Lettuce Hearts", category: "produce", unit: "lb", costPerUnit: "1.80", currentStock: "5.00", parLevel: "20.00", reorderPoint: "10.00", reorderQuantity: "30.00", sku: "ING-LETTUCE", vendorName: "FarmFresh Organic Produce" },
  { name: "Vine-Ripened Tomatoes", category: "produce", unit: "lb", costPerUnit: "2.20", currentStock: "28.00", parLevel: "15.00", reorderPoint: "8.00", reorderQuantity: "25.00", sku: "ING-TOMATO", vendorName: "FarmFresh Organic Produce" },
  { name: "Yellow Onions", category: "produce", unit: "lb", costPerUnit: "0.95", currentStock: "45.00", parLevel: "25.00", reorderPoint: "15.00", reorderQuantity: "40.00", sku: "ING-ONION", vendorName: "FarmFresh Organic Produce" },
  { name: "Fresh Garlic Cloves", category: "produce", unit: "lb", costPerUnit: "3.50", currentStock: "12.00", parLevel: "8.00", reorderPoint: "4.00", reorderQuantity: "12.00", sku: "ING-GARLIC", vendorName: "FarmFresh Organic Produce" },
  { name: "Fresh Rosemary & Thyme", category: "produce", unit: "oz", costPerUnit: "0.75", currentStock: "25.00", parLevel: "20.00", reorderPoint: "10.00", reorderQuantity: "30.00", sku: "ING-HERBS", vendorName: "FarmFresh Organic Produce" },
  { name: "Honeycrisp Apples", category: "produce", unit: "lb", costPerUnit: "2.40", currentStock: "32.00", parLevel: "20.00", reorderPoint: "10.00", reorderQuantity: "30.00", sku: "ING-APPLE", vendorName: "FarmFresh Organic Produce" },
  { name: "Fresh Lemons", category: "produce", unit: "each", costPerUnit: "0.45", currentStock: "95.00", parLevel: "60.00", reorderPoint: "30.00", reorderQuantity: "80.00", sku: "ING-LEMON", vendorName: "FarmFresh Organic Produce" },
  { name: "Russet Burbank Potatoes", category: "produce", unit: "lb", costPerUnit: "0.85", currentStock: "140.00", parLevel: "80.00", reorderPoint: "40.00", reorderQuantity: "100.00", sku: "ING-POTATO", vendorName: "FarmFresh Organic Produce" },
  { name: "House Dill Pickles", category: "produce", unit: "lb", costPerUnit: "2.80", currentStock: "22.00", parLevel: "15.00", reorderPoint: "8.00", reorderQuantity: "20.00", sku: "ING-PICKLES", vendorName: "FarmFresh Organic Produce" },

  // Meat & Seafood (Halperns' Prime Meats & Seafood)
  { name: "American Wagyu Ground Beef", category: "meat", unit: "lb", costPerUnit: "9.50", currentStock: "8.50", parLevel: "40.00", reorderPoint: "20.00", reorderQuantity: "60.00", sku: "ING-WAGYU-BEEF", vendorName: "Halperns' Prime Meats & Seafood" },
  { name: "USDA Prime Ribeye Cut", category: "meat", unit: "lb", costPerUnit: "22.00", currentStock: "38.00", parLevel: "30.00", reorderPoint: "15.00", reorderQuantity: "35.00", sku: "ING-RIBEYE", vendorName: "Halperns' Prime Meats & Seafood" },
  { name: "Free-Range Chicken Breast", category: "meat", unit: "lb", costPerUnit: "4.50", currentStock: "48.00", parLevel: "30.00", reorderPoint: "15.00", reorderQuantity: "40.00", sku: "ING-CHICKEN", vendorName: "Halperns' Prime Meats & Seafood" },
  { name: "Wild Atlantic Salmon Fillet", category: "seafood", unit: "lb", costPerUnit: "14.50", currentStock: "0.00", parLevel: "20.00", reorderPoint: "10.00", reorderQuantity: "30.00", sku: "ING-SALMON", vendorName: "Halperns' Prime Meats & Seafood" },
  { name: "Applewood Smoked Bacon", category: "meat", unit: "lb", costPerUnit: "6.50", currentStock: "35.00", parLevel: "20.00", reorderPoint: "10.00", reorderQuantity: "30.00", sku: "ING-BACON", vendorName: "Halperns' Prime Meats & Seafood" },

  // Dairy & Staples (Sysco Metro Foods)
  { name: "Aged White Cheddar", category: "dairy", unit: "lb", costPerUnit: "7.00", currentStock: "26.00", parLevel: "20.00", reorderPoint: "10.00", reorderQuantity: "25.00", sku: "ING-CHEDDAR", vendorName: "Sysco Metro Foods" },
  { name: "Shaved Aged Parmesan", category: "dairy", unit: "lb", costPerUnit: "11.50", currentStock: "18.00", parLevel: "12.00", reorderPoint: "6.00", reorderQuantity: "15.00", sku: "ING-PARM", vendorName: "Sysco Metro Foods" },
  { name: "European Unsalted Butter", category: "dairy", unit: "lb", costPerUnit: "4.20", currentStock: "38.00", parLevel: "25.00", reorderPoint: "12.00", reorderQuantity: "35.00", sku: "ING-BUTTER", vendorName: "Sysco Metro Foods" },
  { name: "Farm Fresh Eggs", category: "dairy", unit: "each", costPerUnit: "0.35", currentStock: "180.00", parLevel: "120.00", reorderPoint: "60.00", reorderQuantity: "180.00", sku: "ING-EGGS", vendorName: "Sysco Metro Foods" },
  { name: "Whole Grade A Milk", category: "dairy", unit: "gallon", costPerUnit: "4.20", currentStock: "14.00", parLevel: "10.00", reorderPoint: "5.00", reorderQuantity: "15.00", sku: "ING-MILK", vendorName: "Sysco Metro Foods" },
  { name: "Madagascar Vanilla Ice Cream", category: "dairy", unit: "gallon", costPerUnit: "16.00", currentStock: "12.00", parLevel: "10.00", reorderPoint: "5.00", reorderQuantity: "12.00", sku: "ING-ICECREAM", vendorName: "Sysco Metro Foods" },
  { name: "Heavy Whipping Cream 36%", category: "dairy", unit: "liter", costPerUnit: "4.80", currentStock: "3.50", parLevel: "12.00", reorderPoint: "6.00", reorderQuantity: "18.00", sku: "ING-HEAVYCREAM", vendorName: "Sysco Metro Foods" },
  { name: "Creamy Caesar Dressing", category: "other", unit: "liter", costPerUnit: "9.00", currentStock: "14.00", parLevel: "10.00", reorderPoint: "5.00", reorderQuantity: "15.00", sku: "ING-CAESAR-DRESS", vendorName: "Sysco Metro Foods" },
  { name: "Black Truffle Garlic Aioli", category: "other", unit: "liter", costPerUnit: "14.50", currentStock: "2.00", parLevel: "8.00", reorderPoint: "4.00", reorderQuantity: "12.00", sku: "ING-TRUFFLE-AIOLI", vendorName: "Sysco Metro Foods" },
  { name: "Belgian Dark Chocolate 70%", category: "dry_goods", unit: "lb", costPerUnit: "8.50", currentStock: "28.00", parLevel: "20.00", reorderPoint: "10.00", reorderQuantity: "25.00", sku: "ING-CHOCOLATE", vendorName: "Sysco Metro Foods" },
  { name: "Pure Cane Granulated Sugar", category: "dry_goods", unit: "lb", costPerUnit: "1.10", currentStock: "45.00", parLevel: "30.00", reorderPoint: "15.00", reorderQuantity: "40.00", sku: "ING-SUGAR", vendorName: "Sysco Metro Foods" },
  { name: "All-Purpose Wheat Flour", category: "dry_goods", unit: "lb", costPerUnit: "0.65", currentStock: "90.00", parLevel: "60.00", reorderPoint: "30.00", reorderQuantity: "80.00", sku: "ING-FLOUR", vendorName: "Sysco Metro Foods" },
  { name: "Sea Salt & Tellicherry Pepper", category: "spices", unit: "oz", costPerUnit: "0.40", currentStock: "60.00", parLevel: "40.00", reorderPoint: "20.00", reorderQuantity: "50.00", sku: "ING-SALTPEPPER", vendorName: "Sysco Metro Foods" },
  { name: "Saigon Cinnamon & Brown Sugar", category: "spices", unit: "oz", costPerUnit: "0.85", currentStock: "28.00", parLevel: "20.00", reorderPoint: "10.00", reorderQuantity: "25.00", sku: "ING-CINNAMON", vendorName: "Sysco Metro Foods" },
  { name: "Rich Dark Chocolate Syrup", category: "dry_goods", unit: "liter", costPerUnit: "6.50", currentStock: "14.00", parLevel: "10.00", reorderPoint: "5.00", reorderQuantity: "12.00", sku: "ING-CHOCSYRUP", vendorName: "Sysco Metro Foods" },

  // Bakery (Golden Crust Artisanal Bakery)
  { name: "Artisanal Brioche Buns", category: "dry_goods", unit: "each", costPerUnit: "0.85", currentStock: "18.00", parLevel: "80.00", reorderPoint: "40.00", reorderQuantity: "100.00", sku: "ING-BRIOCHE", vendorName: "Golden Crust Artisanal Bakery" },
  { name: "Sourdough Herb Croutons", category: "dry_goods", unit: "lb", costPerUnit: "3.20", currentStock: "4.00", parLevel: "15.00", reorderPoint: "8.00", reorderQuantity: "20.00", sku: "ING-CROUTONS", vendorName: "Golden Crust Artisanal Bakery" },
  { name: "Flaky Pastry Pie Crust", category: "dry_goods", unit: "each", costPerUnit: "1.75", currentStock: "32.00", parLevel: "25.00", reorderPoint: "12.00", reorderQuantity: "35.00", sku: "ING-PIECRUST", vendorName: "Golden Crust Artisanal Bakery" },
  { name: "Artisan Bread Loaf", category: "dry_goods", unit: "each", costPerUnit: "2.50", currentStock: "28.00", parLevel: "20.00", reorderPoint: "10.00", reorderQuantity: "25.00", sku: "ING-BREAD", vendorName: "Golden Crust Artisanal Bakery" },

  // Beverages (Beverage Alliance Wholesale)
  { name: "Craft IPA Draft Beer Keg", category: "beverages", unit: "gallon", costPerUnit: "18.00", currentStock: "4.00", parLevel: "15.00", reorderPoint: "8.00", reorderQuantity: "25.00", sku: "ING-KEG-IPA", vendorName: "Beverage Alliance Wholesale" },
  { name: "Fountain Soda Syrup (Cola)", category: "beverages", unit: "gallon", costPerUnit: "22.00", currentStock: "14.00", parLevel: "10.00", reorderPoint: "5.00", reorderQuantity: "15.00", sku: "ING-SODA-SYRUP", vendorName: "Beverage Alliance Wholesale" },
  { name: "Organic Ceylon Black Tea Leaves", category: "beverages", unit: "lb", costPerUnit: "12.00", currentStock: "11.00", parLevel: "8.00", reorderPoint: "4.00", reorderQuantity: "10.00", sku: "ING-TEALEAVES", vendorName: "Beverage Alliance Wholesale" },

  // ─── Physical Operating Assets & Supplies (Non-Food Restaurant Stocks) ───
  // Furniture (Grand Restaurant Supply & Equipment Co.)
  { name: "Birch 4-Top Dining Tables", category: "furniture", unit: "each", costPerUnit: "280.00", currentStock: "24.00", parLevel: "25.00", reorderPoint: "22.00", reorderQuantity: "5.00", sku: "ASSET-TBL-4TOP", vendorName: "Grand Restaurant Supply & Equipment Co." },
  { name: "Upholstered Dining Chairs", category: "furniture", unit: "each", costPerUnit: "75.00", currentStock: "88.00", parLevel: "100.00", reorderPoint: "90.00", reorderQuantity: "15.00", sku: "ASSET-CHR-DINING", vendorName: "Grand Restaurant Supply & Equipment Co." },
  { name: "High-Top Bar Stools", category: "furniture", unit: "each", costPerUnit: "95.00", currentStock: "16.00", parLevel: "16.00", reorderPoint: "14.00", reorderQuantity: "4.00", sku: "ASSET-CHR-BARSTOOL", vendorName: "Grand Restaurant Supply & Equipment Co." },

  // Tableware & Chinaware (Steelite & Libbey Hospitality Tableware)
  { name: "Ceramic Entree Dinner Plates 10.5\"", category: "tableware", unit: "each", costPerUnit: "8.50", currentStock: "140.00", parLevel: "200.00", reorderPoint: "160.00", reorderQuantity: "60.00", sku: "ASSET-PLT-ENTREE", vendorName: "Steelite & Libbey Hospitality Tableware" },
  { name: "Porcelain Pasta & Salad Bowls", category: "tableware", unit: "each", costPerUnit: "7.25", currentStock: "110.00", parLevel: "150.00", reorderPoint: "120.00", reorderQuantity: "40.00", sku: "ASSET-BWL-PASTA", vendorName: "Steelite & Libbey Hospitality Tableware" },
  { name: "Heavyweight Stainless Flatware Sets", category: "tableware", unit: "set", costPerUnit: "4.50", currentStock: "180.00", parLevel: "200.00", reorderPoint: "185.00", reorderQuantity: "20.00", sku: "ASSET-FLATWARE-SET", vendorName: "Steelite & Libbey Hospitality Tableware" },

  // Glassware & Barware (Steelite & Libbey Hospitality Tableware)
  { name: "Draft Pint Glasses 16 oz", category: "glassware", unit: "each", costPerUnit: "2.40", currentStock: "85.00", parLevel: "150.00", reorderPoint: "100.00", reorderQuantity: "65.00", sku: "ASSET-GLS-PINT", vendorName: "Steelite & Libbey Hospitality Tableware" },
  { name: "Rocks Cocktail Glasses 11 oz", category: "glassware", unit: "each", costPerUnit: "3.10", currentStock: "95.00", parLevel: "120.00", reorderPoint: "100.00", reorderQuantity: "25.00", sku: "ASSET-GLS-ROCKS", vendorName: "Steelite & Libbey Hospitality Tableware" },
  { name: "Stemmed Red & White Wine Goblets", category: "glassware", unit: "each", costPerUnit: "4.20", currentStock: "60.00", parLevel: "100.00", reorderPoint: "70.00", reorderQuantity: "40.00", sku: "ASSET-GLS-WINE", vendorName: "Steelite & Libbey Hospitality Tableware" },

  // Paper & Disposables (EcoPak Sustainable Disposables)
  { name: "Kraft Paper Dinner Tissues (Case of 2000)", category: "disposables", unit: "case", costPerUnit: "42.00", currentStock: "4.00", parLevel: "12.00", reorderPoint: "6.00", reorderQuantity: "8.00", sku: "DISP-TISSUE-KRAFT", vendorName: "EcoPak Sustainable Disposables" },
  { name: "Linen-Feel Guest Napkins (Case of 1000)", category: "disposables", unit: "case", costPerUnit: "48.00", currentStock: "3.00", parLevel: "10.00", reorderPoint: "5.00", reorderQuantity: "7.00", sku: "DISP-NAPKIN-LINEN", vendorName: "EcoPak Sustainable Disposables" },
  { name: "Biodegradable Takeout Containers (Pack of 200)", category: "disposables", unit: "pack", costPerUnit: "36.00", currentStock: "6.00", parLevel: "15.00", reorderPoint: "8.00", reorderQuantity: "9.00", sku: "DISP-BOX-TAKEOUT", vendorName: "EcoPak Sustainable Disposables" },

  // Kitchen Smallwares (Grand Restaurant Supply & Equipment Co.)
  { name: "Heavy-Duty Stainless Steel Tongs 12\"", category: "smallwares", unit: "each", costPerUnit: "6.50", currentStock: "18.00", parLevel: "20.00", reorderPoint: "18.00", reorderQuantity: "5.00", sku: "SML-TONGS-12IN", vendorName: "Grand Restaurant Supply & Equipment Co." },
];

export const SAMPLE_PURCHASE_ORDERS = [
  {
    poNumber: "PO-94101",
    vendorName: "Halperns' Prime Meats & Seafood",
    status: "received",
    orderDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    expectedDelivery: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    receivedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "Weekly butcher cut delivery - inspected and received at loading dock.",
    items: [
      { ingredientName: "USDA Prime Ribeye Cut", quantity: 35, unit: "lb", unitCost: 22.00 },
      { ingredientName: "Applewood Smoked Bacon", quantity: 20, unit: "lb", unitCost: 6.50 },
      { ingredientName: "Free-Range Chicken Breast", quantity: 30, unit: "lb", unitCost: 4.50 },
    ],
  },
  {
    poNumber: "PO-94102",
    vendorName: "FarmFresh Organic Produce",
    status: "received",
    orderDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    expectedDelivery: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    receivedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "Fresh produce delivery. Cold chain verified.",
    items: [
      { ingredientName: "Russet Burbank Potatoes", quantity: 100, unit: "lb", unitCost: 0.85 },
      { ingredientName: "Yellow Onions", quantity: 30, unit: "lb", unitCost: 0.95 },
      { ingredientName: "Vine-Ripened Tomatoes", quantity: 20, unit: "lb", unitCost: 2.20 },
      { ingredientName: "Fresh Lemons", quantity: 60, unit: "each", unitCost: 0.45 },
    ],
  },
  {
    poNumber: "PO-94103",
    vendorName: "Halperns' Prime Meats & Seafood",
    status: "shipped",
    orderDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    expectedDelivery: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    receivedDate: null,
    notes: "URGENT replenishment for low Wagyu beef and zero stock Atlantic Salmon.",
    items: [
      { ingredientName: "American Wagyu Ground Beef", quantity: 35, unit: "lb", unitCost: 9.50 },
      { ingredientName: "Wild Atlantic Salmon Fillet", quantity: 20, unit: "lb", unitCost: 14.50 },
    ],
  },
  {
    poNumber: "PO-94104",
    vendorName: "Golden Crust Artisanal Bakery",
    status: "confirmed",
    orderDate: new Date().toISOString(),
    expectedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    receivedDate: null,
    notes: "Restock of brioche burger buns and croutons for kitchen line.",
    items: [
      { ingredientName: "Artisanal Brioche Buns", quantity: 70, unit: "each", unitCost: 0.85 },
      { ingredientName: "Sourdough Herb Croutons", quantity: 15, unit: "lb", unitCost: 3.20 },
    ],
  },
  {
    poNumber: "PO-94105",
    vendorName: "Sysco Metro Foods",
    status: "draft",
    orderDate: new Date().toISOString(),
    expectedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    receivedDate: null,
    notes: "Draft replenishment order for low dairy and signature sauces.",
    items: [
      { ingredientName: "Heavy Whipping Cream 36%", quantity: 10, unit: "liter", unitCost: 4.80 },
      { ingredientName: "Black Truffle Garlic Aioli", quantity: 6, unit: "liter", unitCost: 14.50 },
    ],
  },
  // Physical Stock Purchase Orders
  {
    poNumber: "PO-94201",
    vendorName: "Steelite & Libbey Hospitality Tableware",
    status: "received",
    orderDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    expectedDelivery: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    receivedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "Replacement dinnerware and glassware received and stocked in service pantry.",
    items: [
      { ingredientName: "Ceramic Entree Dinner Plates 10.5\"", quantity: 50, unit: "each", unitCost: 8.50 },
      { ingredientName: "Rocks Cocktail Glasses 11 oz", quantity: 30, unit: "each", unitCost: 3.10 },
    ],
  },
  {
    poNumber: "PO-94202",
    vendorName: "EcoPak Sustainable Disposables",
    status: "shipped",
    orderDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    expectedDelivery: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    receivedDate: null,
    notes: "Weekly guest napkins, dinner tissues, and takeout boxes order. Fast dispatch.",
    items: [
      { ingredientName: "Kraft Paper Dinner Tissues (Case of 2000)", quantity: 8, unit: "case", unitCost: 42.00 },
      { ingredientName: "Linen-Feel Guest Napkins (Case of 1000)", quantity: 6, unit: "case", unitCost: 48.00 },
      { ingredientName: "Biodegradable Takeout Containers (Pack of 200)", quantity: 8, unit: "pack", unitCost: 36.00 },
    ],
  },
  {
    poNumber: "PO-94203",
    vendorName: "Grand Restaurant Supply & Equipment Co.",
    status: "confirmed",
    orderDate: new Date().toISOString(),
    expectedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    receivedDate: null,
    notes: "Replacement dining room chairs and 4-top table.",
    items: [
      { ingredientName: "Upholstered Dining Chairs", quantity: 12, unit: "each", unitCost: 75.00 },
      { ingredientName: "Birch 4-Top Dining Tables", quantity: 1, unit: "each", unitCost: 280.00 },
    ],
  },
  {
    poNumber: "PO-94204",
    vendorName: "Steelite & Libbey Hospitality Tableware",
    status: "draft",
    orderDate: new Date().toISOString(),
    expectedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    receivedDate: null,
    notes: "Draft replenishment order for low draft pint glasses and pasta bowls.",
    items: [
      { ingredientName: "Draft Pint Glasses 16 oz", quantity: 60, unit: "each", unitCost: 2.40 },
      { ingredientName: "Porcelain Pasta & Salad Bowls", quantity: 30, unit: "each", unitCost: 7.25 },
    ],
  },
];

/**
 * Recipes / Bill of Materials configurations for standard menu items
 */
export const MENU_ITEM_BOM_DEFINITIONS: Record<
  string,
  {
    name: string;
    yield: number;
    prepTime: number;
    instructions: string;
    ingredients: Array<{ ingredientName: string; quantity: number; unit: string }>;
  }
> = {
  "Artisan Wagyu Burger": {
    name: "Artisan Wagyu Burger BOM",
    yield: 1,
    prepTime: 12,
    instructions:
      "1. Toast Brioche Bun on flat-top with a dab of butter.\n2. Sear 8 oz Wagyu patty on high heat for 3.5 min per side to desired temp.\n3. Melt 1.5 oz Aged White Cheddar on top of patty during last minute.\n4. Slather 1 oz Truffle Aioli on top and bottom buns.\n5. Layer caramelized onions, house pickles, and assembled burger.",
    ingredients: [
      { ingredientName: "Artisanal Brioche Buns", quantity: 1, unit: "each" },
      { ingredientName: "American Wagyu Ground Beef", quantity: 8, unit: "oz" },
      { ingredientName: "Aged White Cheddar", quantity: 1.5, unit: "oz" },
      { ingredientName: "Black Truffle Garlic Aioli", quantity: 1, unit: "fl_oz" },
      { ingredientName: "Yellow Onions", quantity: 2, unit: "oz" },
      { ingredientName: "House Dill Pickles", quantity: 1, unit: "oz" },
      { ingredientName: "Sea Salt & Tellicherry Pepper", quantity: 0.1, unit: "oz" },
    ],
  },
  "Prime Ribeye Steak": {
    name: "Prime Ribeye Steak BOM",
    yield: 1,
    prepTime: 18,
    instructions:
      "1. Season 16 oz USDA Prime Ribeye generously with coarse sea salt and cracked pepper.\n2. Cast-iron sear for 4 min per side for medium rare.\n3. Baste with 1.5 oz European unsalted butter, fresh rosemary, and crushed garlic during final minute.\n4. Rest steak for 5 minutes prior to carving and plating.",
    ingredients: [
      { ingredientName: "USDA Prime Ribeye Cut", quantity: 16, unit: "oz" },
      { ingredientName: "European Unsalted Butter", quantity: 1.5, unit: "oz" },
      { ingredientName: "Fresh Garlic Cloves", quantity: 0.5, unit: "oz" },
      { ingredientName: "Fresh Rosemary & Thyme", quantity: 0.2, unit: "oz" },
      { ingredientName: "Sea Salt & Tellicherry Pepper", quantity: 0.2, unit: "oz" },
    ],
  },
  "Crispy Chicken Sandwich": {
    name: "Crispy Chicken Sandwich BOM",
    yield: 1,
    prepTime: 10,
    instructions:
      "1. Dredge 7 oz chicken breast in seasoned flour wash, fry at 360F until 165F internal.\n2. Toast brioche bun.\n3. Add 4 dill pickle slices, slather 1 fl oz aioli, and serve.",
    ingredients: [
      { ingredientName: "Free-Range Chicken Breast", quantity: 7, unit: "oz" },
      { ingredientName: "Artisanal Brioche Buns", quantity: 1, unit: "each" },
      { ingredientName: "House Dill Pickles", quantity: 1.5, unit: "oz" },
      { ingredientName: "Black Truffle Garlic Aioli", quantity: 1, unit: "fl_oz" },
      { ingredientName: "All-Purpose Wheat Flour", quantity: 2, unit: "oz" },
      { ingredientName: "Farm Fresh Eggs", quantity: 1, unit: "each" },
    ],
  },
  "Pan-Seared Atlantic Salmon": {
    name: "Pan-Seared Atlantic Salmon BOM",
    yield: 1,
    prepTime: 14,
    instructions:
      "1. Heat pan to medium-high with a touch of butter.\n2. Sear salmon skin-side down for 5 min until crispy.\n3. Flip and cook 3 min more. Finish with fresh lemon squeeze and fresh dill.",
    ingredients: [
      { ingredientName: "Wild Atlantic Salmon Fillet", quantity: 8, unit: "oz" },
      { ingredientName: "European Unsalted Butter", quantity: 1, unit: "oz" },
      { ingredientName: "Fresh Lemons", quantity: 0.5, unit: "each" },
      { ingredientName: "Sea Salt & Tellicherry Pepper", quantity: 0.1, unit: "oz" },
    ],
  },
  "Classic Caesar Salad": {
    name: "Classic Caesar Salad BOM",
    yield: 1,
    prepTime: 6,
    instructions:
      "1. Wash and chop 6 oz Romaine Lettuce Hearts.\n2. Toss in large chilled bowl with 2 fl oz Creamy Caesar Dressing.\n3. Top with 1.5 oz Sourdough Croutons and 1 oz Shaved Parmesan.",
    ingredients: [
      { ingredientName: "Romaine Lettuce Hearts", quantity: 6, unit: "oz" },
      { ingredientName: "Creamy Caesar Dressing", quantity: 2, unit: "fl_oz" },
      { ingredientName: "Shaved Aged Parmesan", quantity: 1, unit: "oz" },
      { ingredientName: "Sourdough Herb Croutons", quantity: 1.5, unit: "oz" },
    ],
  },
  "Truffle Parmesan Fries": {
    name: "Truffle Parmesan Fries BOM",
    yield: 1,
    prepTime: 7,
    instructions:
      "1. Fry 12 oz cut Russet potatoes at 375F until golden and crisp.\n2. Toss immediately with 1 oz Shaved Parmesan, sea salt, and serve with 1.5 fl oz Truffle Aioli for dipping.",
    ingredients: [
      { ingredientName: "Russet Burbank Potatoes", quantity: 12, unit: "oz" },
      { ingredientName: "Shaved Aged Parmesan", quantity: 1, unit: "oz" },
      { ingredientName: "Black Truffle Garlic Aioli", quantity: 1.5, unit: "fl_oz" },
      { ingredientName: "Sea Salt & Tellicherry Pepper", quantity: 0.1, unit: "oz" },
    ],
  },
  "Warm Apple Pie a la Mode": {
    name: "Warm Apple Pie a la Mode BOM",
    yield: 1,
    prepTime: 8,
    instructions:
      "1. Warm one slice of flaky apple pie for 45 sec.\n2. Top with a generous 4 fl oz scoop of Madagascar Vanilla Ice Cream.\n3. Dust with cinnamon sugar.",
    ingredients: [
      { ingredientName: "Honeycrisp Apples", quantity: 6, unit: "oz" },
      { ingredientName: "Flaky Pastry Pie Crust", quantity: 1, unit: "each" },
      { ingredientName: "Pure Cane Granulated Sugar", quantity: 1.5, unit: "oz" },
      { ingredientName: "Saigon Cinnamon & Brown Sugar", quantity: 0.2, unit: "oz" },
      { ingredientName: "European Unsalted Butter", quantity: 0.5, unit: "oz" },
      { ingredientName: "Madagascar Vanilla Ice Cream", quantity: 4, unit: "fl_oz" },
    ],
  },
  "Thick Handspun Shake": {
    name: "Thick Handspun Shake BOM",
    yield: 1,
    prepTime: 4,
    instructions:
      "1. Add 8 fl oz Madagascar Vanilla Ice Cream, 4 fl oz whole milk, and 2 fl oz dark chocolate syrup to stainless spindle collar.\n2. Blend on medium for 30s until creamy and thick.\n3. Pour into frosted soda glass and crown with whipped heavy cream.",
    ingredients: [
      { ingredientName: "Madagascar Vanilla Ice Cream", quantity: 8, unit: "fl_oz" },
      { ingredientName: "Whole Grade A Milk", quantity: 4, unit: "fl_oz" },
      { ingredientName: "Rich Dark Chocolate Syrup", quantity: 2, unit: "fl_oz" },
      { ingredientName: "Heavy Whipping Cream 36%", quantity: 2, unit: "fl_oz" },
    ],
  },
  "Double Cheeseburger": {
    name: "Double Cheeseburger BOM",
    yield: 1,
    prepTime: 10,
    instructions:
      "1. Toast Brioche Bun on flat-top.\n2. Smash two 4 oz Wagyu patties, top each with White Cheddar.\n3. Stack patties, add pickles, onions, and signature aioli.",
    ingredients: [
      { ingredientName: "Artisanal Brioche Buns", quantity: 1, unit: "each" },
      { ingredientName: "American Wagyu Ground Beef", quantity: 8, unit: "oz" },
      { ingredientName: "Aged White Cheddar", quantity: 2, unit: "oz" },
      { ingredientName: "House Dill Pickles", quantity: 1, unit: "oz" },
      { ingredientName: "Yellow Onions", quantity: 1.5, unit: "oz" },
      { ingredientName: "Black Truffle Garlic Aioli", quantity: 1, unit: "fl_oz" },
    ],
  },
  "Bacon BBQ Burger": {
    name: "Bacon BBQ Burger BOM",
    yield: 1,
    prepTime: 11,
    instructions:
      "1. Toast Brioche Bun.\n2. Grill 8 oz Wagyu patty with cheddar cheese.\n3. Crisp 3 strips of smoked bacon.\n4. Top with fried crispy onion rings and serve.",
    ingredients: [
      { ingredientName: "Artisanal Brioche Buns", quantity: 1, unit: "each" },
      { ingredientName: "American Wagyu Ground Beef", quantity: 8, unit: "oz" },
      { ingredientName: "Applewood Smoked Bacon", quantity: 3, unit: "oz" },
      { ingredientName: "Aged White Cheddar", quantity: 1.5, unit: "oz" },
      { ingredientName: "Yellow Onions", quantity: 3, unit: "oz" },
    ],
  },
  "Mushroom Swiss Burger": {
    name: "Mushroom Swiss Burger BOM",
    yield: 1,
    prepTime: 11,
    instructions:
      "1. Toast Brioche Bun.\n2. Cook 8 oz Wagyu patty.\n3. Melt aged cheddar and top with caramelized onions and garlic butter sauce.",
    ingredients: [
      { ingredientName: "Artisanal Brioche Buns", quantity: 1, unit: "each" },
      { ingredientName: "American Wagyu Ground Beef", quantity: 8, unit: "oz" },
      { ingredientName: "Aged White Cheddar", quantity: 1.5, unit: "oz" },
      { ingredientName: "European Unsalted Butter", quantity: 0.5, unit: "oz" },
      { ingredientName: "Fresh Garlic Cloves", quantity: 0.25, unit: "oz" },
    ],
  },
  "Chicken Tenders Basket": {
    name: "Chicken Tenders Basket BOM",
    yield: 1,
    prepTime: 8,
    instructions:
      "1. Cut 8 oz chicken breast into strips.\n2. Batter in seasoned egg wash and flour.\n3. Fry until golden and serve alongside 6 oz Russet fries.",
    ingredients: [
      { ingredientName: "Free-Range Chicken Breast", quantity: 8, unit: "oz" },
      { ingredientName: "All-Purpose Wheat Flour", quantity: 3, unit: "oz" },
      { ingredientName: "Farm Fresh Eggs", quantity: 1, unit: "each" },
      { ingredientName: "Russet Burbank Potatoes", quantity: 6, unit: "oz" },
    ],
  },
  "Loaded Fries": {
    name: "Loaded Fries BOM",
    yield: 1,
    prepTime: 8,
    instructions:
      "1. Fry 10 oz Russet potatoes to golden crisp.\n2. Melt 2 oz aged white cheddar over hot fries.\n3. Crumble 2 oz crispy bacon and drizzle with 1 fl oz garlic aioli.",
    ingredients: [
      { ingredientName: "Russet Burbank Potatoes", quantity: 10, unit: "oz" },
      { ingredientName: "Aged White Cheddar", quantity: 2, unit: "oz" },
      { ingredientName: "Applewood Smoked Bacon", quantity: 2, unit: "oz" },
      { ingredientName: "Black Truffle Garlic Aioli", quantity: 1, unit: "fl_oz" },
    ],
  },
  "Crispy Onion Rings": {
    name: "Crispy Onion Rings BOM",
    yield: 1,
    prepTime: 6,
    instructions:
      "1. Slice large yellow onions into 1/2 inch thick rings.\n2. Dip in batter and flour, deep fry until golden brown.\n3. Season with salt and pepper.",
    ingredients: [
      { ingredientName: "Yellow Onions", quantity: 8, unit: "oz" },
      { ingredientName: "All-Purpose Wheat Flour", quantity: 3, unit: "oz" },
      { ingredientName: "Whole Grade A Milk", quantity: 2, unit: "fl_oz" },
      { ingredientName: "Sea Salt & Tellicherry Pepper", quantity: 0.1, unit: "oz" },
    ],
  },
  "Craft IPA Beer": {
    name: "Craft IPA Beer BOM",
    yield: 1,
    prepTime: 1,
    instructions: "Pour 16 fl oz chilled craft IPA directly from draft tap into cold pint glass with 1-inch foam head.",
    ingredients: [
      { ingredientName: "Craft IPA Draft Beer Keg", quantity: 16, unit: "fl_oz" },
    ],
  },
  "Old Fashioned Cocktail": {
    name: "Old Fashioned Cocktail BOM",
    yield: 1,
    prepTime: 3,
    instructions:
      "1. Muddle brown sugar with bitters.\n2. Add large clear ice cube.\n3. Express fresh lemon and orange oils across glass rim.",
    ingredients: [
      { ingredientName: "Saigon Cinnamon & Brown Sugar", quantity: 0.25, unit: "oz" },
      { ingredientName: "Fresh Lemons", quantity: 0.25, unit: "each" },
    ],
  },
  "Fountain Soda": {
    name: "Fountain Soda BOM",
    yield: 1,
    prepTime: 1,
    instructions: "Fill glass with ice and dispense 16 fl oz carbonated soda from fountain head.",
    ingredients: [
      { ingredientName: "Fountain Soda Syrup (Cola)", quantity: 3, unit: "fl_oz" },
    ],
  },
  "Fresh Iced Tea": {
    name: "Fresh Iced Tea BOM",
    yield: 1,
    prepTime: 2,
    instructions:
      "1. Brew fresh organic Ceylon black tea leaves in hot urn and chill.\n2. Pour 14 fl oz over ice in tall beverage glass.\n3. Garnish with a freshly sliced lemon wheel.",
    ingredients: [
      { ingredientName: "Organic Ceylon Black Tea Leaves", quantity: 0.5, unit: "oz" },
      { ingredientName: "Fresh Lemons", quantity: 0.25, unit: "each" },
    ],
  },
};

/**
 * Executes the complete initialization and seeding of vendors, raw ingredients,
 * sample purchase orders, and BOM recipes.
 */
export async function seedInventoryBOM(context: Context) {
  const sudo = context.sudo();
  const results = {
    vendorsCreated: 0,
    vendorsExisting: 0,
    ingredientsCreated: 0,
    ingredientsUpdated: 0,
    ingredientsExisting: 0,
    purchaseOrdersCreated: 0,
    purchaseOrdersExisting: 0,
    recipesCreated: 0,
    recipesUpdated: 0,
    totalMenuItems: 0,
    errors: [] as string[],
  };

  // 1. Seed or find Vendors
  const vendorNameToId: Record<string, string> = {};
  for (const v of STANDARD_VENDORS) {
    try {
      const existing = await sudo.query.Vendor.findMany({
        where: { name: { equals: v.name } },
        query: "id name",
        take: 1,
      });

      if (existing.length > 0) {
        vendorNameToId[v.name] = existing[0].id;
        results.vendorsExisting += 1;
      } else {
        const created = await sudo.db.Vendor.createOne({
          data: {
            name: v.name,
            contact: v.contact,
            email: v.email,
            phone: v.phone,
            paymentTerms: v.paymentTerms,
            leadTime: v.leadTime,
          },
        });
        vendorNameToId[v.name] = created.id;
        results.vendorsCreated += 1;
      }
    } catch (err) {
      const msg = `Failed to seed vendor ${v.name}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(msg);
      results.errors.push(msg);
    }
  }

  // 2. Seed or update ingredients with vendor link and stock values
  const ingredientNameToId: Record<string, string> = {};

  for (const ing of STANDARD_RAW_INGREDIENTS) {
    try {
      const existing = await sudo.query.Ingredient.findMany({
        where: { name: { equals: ing.name } },
        query: "id name unit currentStock parLevel vendor { id }",
        take: 1,
      });

      const vendorId = vendorNameToId[ing.vendorName];

      if (existing.length > 0) {
        const existingIng = existing[0];
        ingredientNameToId[ing.name] = existingIng.id;
        results.ingredientsExisting += 1;

        // Update with full vendor connection, par levels, and stock
        await sudo.db.Ingredient.updateOne({
          where: { id: existingIng.id },
          data: {
            category: ing.category,
            unit: ing.unit,
            costPerUnit: ing.costPerUnit,
            currentStock: ing.currentStock,
            parLevel: ing.parLevel,
            reorderPoint: ing.reorderPoint,
            reorderQuantity: ing.reorderQuantity,
            sku: ing.sku,
            ...(vendorId ? { vendor: { connect: { id: vendorId } } } : {}),
          },
        });
        results.ingredientsUpdated += 1;
      } else {
        const created = await sudo.db.Ingredient.createOne({
          data: {
            name: ing.name,
            category: ing.category,
            unit: ing.unit,
            costPerUnit: ing.costPerUnit,
            currentStock: ing.currentStock,
            parLevel: ing.parLevel,
            reorderPoint: ing.reorderPoint,
            reorderQuantity: ing.reorderQuantity,
            sku: ing.sku,
            ...(vendorId ? { vendor: { connect: { id: vendorId } } } : {}),
          },
        });
        ingredientNameToId[ing.name] = created.id;
        results.ingredientsCreated += 1;
      }
    } catch (err) {
      const msg = `Failed to seed ingredient ${ing.name}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(msg);
      results.errors.push(msg);
    }
  }

  // Also query any other existing ingredients in the DB so custom ingredients can be matched
  const allIngredients = await sudo.query.Ingredient.findMany({
    query: "id name unit costPerUnit",
    take: 500,
  }).catch(() => []);

  for (const ing of allIngredients) {
    if (!ingredientNameToId[ing.name]) {
      ingredientNameToId[ing.name] = ing.id;
    }
  }

  // 3. Seed sample Purchase Orders linked to vendors and ingredients
  for (const samplePO of SAMPLE_PURCHASE_ORDERS) {
    try {
      const existing = await sudo.query.PurchaseOrder.findMany({
        where: { poNumber: { equals: samplePO.poNumber } },
        query: "id poNumber",
        take: 1,
      });

      if (existing.length === 0) {
        const vendorId = vendorNameToId[samplePO.vendorName];
        const lineItems = samplePO.items.map((item) => {
          const ingId = ingredientNameToId[item.ingredientName] || "";
          const totalCost = Math.round(item.quantity * item.unitCost * 100) / 100;
          return {
            ingredientId: ingId,
            ingredientName: item.ingredientName,
            quantity: item.quantity,
            unit: item.unit,
            unitCost: item.unitCost,
            totalCost,
          };
        });

        await sudo.db.PurchaseOrder.createOne({
          data: {
            poNumber: samplePO.poNumber,
            orderDate: samplePO.orderDate,
            expectedDelivery: samplePO.expectedDelivery,
            receivedDate: samplePO.receivedDate,
            status: samplePO.status,
            notes: samplePO.notes,
            lineItems,
            ...(vendorId ? { vendor: { connect: { id: vendorId } } } : {}),
          },
        });
        results.purchaseOrdersCreated += 1;
      } else {
        results.purchaseOrdersExisting += 1;
      }
    } catch (err) {
      const msg = `Failed to seed purchase order ${samplePO.poNumber}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(msg);
      results.errors.push(msg);
    }
  }

  // 4. Query all Menu Items in the restaurant
  const menuItems = await sudo.query.MenuItem.findMany({
    query: "id name price category { id name } station",
    take: 500,
  }).catch(() => []);

  results.totalMenuItems = menuItems.length;

  // 5. For each menu item, ensure a comprehensive Bill of Materials (Recipe) exists
  for (const menuItem of menuItems) {
    try {
      // Find configured definition or fallback
      let bomDef = MENU_ITEM_BOM_DEFINITIONS[menuItem.name];

      if (!bomDef) {
        // Fallback generator based on category or name keywords
        const catName = (menuItem.category?.name || "").toLowerCase();
        const itemName = menuItem.name.toLowerCase();

        if (itemName.includes("burger") || itemName.includes("sandwich")) {
          bomDef = {
            name: `${menuItem.name} BOM`,
            yield: 1,
            prepTime: 10,
            instructions: "Toast bun, cook patty/protein, assemble with sauce and garnishes.",
            ingredients: [
              { ingredientName: "Artisanal Brioche Buns", quantity: 1, unit: "each" },
              { ingredientName: "American Wagyu Ground Beef", quantity: 6, unit: "oz" },
              { ingredientName: "Aged White Cheddar", quantity: 1, unit: "oz" },
              { ingredientName: "House Dill Pickles", quantity: 1, unit: "oz" },
            ],
          };
        } else if (itemName.includes("steak") || itemName.includes("beef") || itemName.includes("meat")) {
          bomDef = {
            name: `${menuItem.name} BOM`,
            yield: 1,
            prepTime: 15,
            instructions: "Season cut, sear on high heat, baste with butter and herbs, rest before serving.",
            ingredients: [
              { ingredientName: "USDA Prime Ribeye Cut", quantity: 12, unit: "oz" },
              { ingredientName: "European Unsalted Butter", quantity: 1, unit: "oz" },
              { ingredientName: "Sea Salt & Tellicherry Pepper", quantity: 0.2, unit: "oz" },
            ],
          };
        } else if (catName.includes("salad") || itemName.includes("salad")) {
          bomDef = {
            name: `${menuItem.name} BOM`,
            yield: 1,
            prepTime: 5,
            instructions: "Toss crisp greens with house dressing, finish with parmesan and croutons.",
            ingredients: [
              { ingredientName: "Romaine Lettuce Hearts", quantity: 0.35, unit: "lb" },
              { ingredientName: "Creamy Caesar Dressing", quantity: 2, unit: "fl_oz" },
              { ingredientName: "Shaved Aged Parmesan", quantity: 1, unit: "oz" },
            ],
          };
        } else if (catName.includes("dessert") || itemName.includes("cake") || itemName.includes("pie")) {
          bomDef = {
            name: `${menuItem.name} BOM`,
            yield: 1,
            prepTime: 8,
            instructions: "Warm dessert portion, plate with scoop of vanilla ice cream and sauce.",
            ingredients: [
              { ingredientName: "Belgian Dark Chocolate 70%", quantity: 2, unit: "oz" },
              { ingredientName: "European Unsalted Butter", quantity: 1, unit: "oz" },
              { ingredientName: "Madagascar Vanilla Ice Cream", quantity: 3, unit: "fl_oz" },
            ],
          };
        } else if (catName.includes("beverage") || itemName.includes("beer") || itemName.includes("soda") || itemName.includes("tea")) {
          bomDef = {
            name: `${menuItem.name} BOM`,
            yield: 1,
            prepTime: 2,
            instructions: "Pour chilled beverage into proper glassware over ice if requested.",
            ingredients: [
              { ingredientName: "Craft IPA Draft Beer Keg", quantity: 16, unit: "fl_oz" },
            ],
          };
        } else {
          // General culinary base
          bomDef = {
            name: `${menuItem.name} BOM`,
            yield: 1,
            prepTime: 10,
            instructions: `Culinary preparation for ${menuItem.name}`,
            ingredients: [
              { ingredientName: "Artisanal Brioche Buns", quantity: 1, unit: "each" },
              { ingredientName: "European Unsalted Butter", quantity: 0.5, unit: "oz" },
            ],
          };
        }
      }

      // Convert ingredient names to ingredient IDs
      const recipeIngredients = bomDef.ingredients
        .map((ing) => {
          const ingredientId = ingredientNameToId[ing.ingredientName];
          if (!ingredientId) return null;
          return {
            ingredientId,
            quantity: ing.quantity,
            unit: ing.unit,
          };
        })
        .filter(Boolean);

      // Check if Recipe already exists for this menuItem
      const existingRecipes = await sudo.query.Recipe.findMany({
        where: { menuItem: { id: { equals: menuItem.id } } },
        query: "id name recipeIngredients",
        take: 1,
      });

      if (existingRecipes.length > 0) {
        const existingRecipe = existingRecipes[0];
        // If existing recipe has no ingredients or empty array, populate it
        const currentIngredients = Array.isArray(existingRecipe.recipeIngredients)
          ? existingRecipe.recipeIngredients
          : [];

        if (currentIngredients.length === 0) {
          await sudo.db.Recipe.updateOne({
            where: { id: existingRecipe.id },
            data: {
              name: bomDef.name,
              yield: bomDef.yield,
              prepTime: bomDef.prepTime,
              instructions: bomDef.instructions,
              recipeIngredients,
            },
          });
          results.recipesUpdated += 1;
        } else {
          results.recipesCreated += 0; // already configured
        }
      } else {
        // Create new Recipe linking to menuItem
        await sudo.db.Recipe.createOne({
          data: {
            name: bomDef.name,
            menuItem: { connect: { id: menuItem.id } },
            yield: bomDef.yield,
            prepTime: bomDef.prepTime,
            instructions: bomDef.instructions,
            recipeIngredients,
          },
        });
        results.recipesCreated += 1;
      }
    } catch (err) {
      const msg = `Failed to create BOM for menu item ${menuItem.name}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(msg);
      results.errors.push(msg);
    }
  }

  return {
    success: results.errors.length === 0,
    ...results,
  };
}
