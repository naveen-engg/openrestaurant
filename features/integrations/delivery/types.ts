/**
 * Delivery Integrations Types
 * Unified schemas for DoorDash (Drive & Marketplace) and Uber Eats (Direct & Marketplace)
 */

export type DeliveryProviderId = 'doordash' | 'ubereats'

export type DeliveryStatus =
  | 'quoted'
  | 'dispatched'
  | 'courier_assigned'
  | 'at_store'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'

export interface CourierInfo {
  name: string
  phone: string
  vehicleType: string
  trackingUrl: string
  location?: {
    lat: number
    lng: number
  }
}

export interface DeliveryQuote {
  provider: DeliveryProviderId
  quoteId: string
  feeCents: number
  currency: string
  estimatedPickupMinutes: number
  estimatedDeliveryMinutes: number
  durationMinutes: number
  expiresAt: string
}

export interface DeliveryDispatchRecord {
  deliveryId: string
  orderId: string
  orderNumber: string
  provider: DeliveryProviderId
  status: DeliveryStatus
  courier?: CourierInfo
  pickupEta: string
  dropoffEta: string
  feeCents: number
  trackingUrl: string
  pickupAddress: string
  dropoffAddress: string
  createdAt: string
  updatedAt: string
  timeline: Array<{
    status: DeliveryStatus
    timestamp: string
    note: string
  }>
}

export interface ProviderSettings {
  enabled: boolean
  sandbox: boolean
  marketplaceEnabled: boolean
  dispatchEnabled: boolean
  autoDispatchOnKitchenReady: boolean
  autoAcceptMarketplaceOrders: boolean
  autoDepleteBOMInventory: boolean
  autoSyncKDS: boolean
  defaultTipCents: number
  // DoorDash specific
  doorDashDeveloperId?: string
  doorDashKeyId?: string
  doorDashSigningSecret?: string
  doorDashBusinessId?: string
  // Uber specific
  uberClientId?: string
  uberClientSecret?: string
  uberCustomerId?: string
  // Webhook
  webhookSecret?: string
}

export interface DeliveryHubConfig {
  doordash: ProviderSettings
  ubereats: ProviderSettings
  storeAddress: {
    street: string
    city: string
    state: string
    zip: string
    phone: string
  }
}

export interface MarketplaceItemInput {
  name: string
  quantity: number
  unitPriceCents: number
  instructions?: string
  modifiers?: Array<{
    name: string
    priceCents: number
  }>
}

export interface MarketplaceOrderInput {
  provider: DeliveryProviderId
  externalOrderId: string
  orderNumber: string
  customerName: string
  customerPhone: string
  deliveryAddress: string
  deliveryCity: string
  deliveryState: string
  deliveryZip: string
  items: MarketplaceItemInput[]
  subtotalCents: number
  taxCents: number
  tipCents: number
  totalCents: number
  pickupDeadline: string
  specialInstructions?: string
}
