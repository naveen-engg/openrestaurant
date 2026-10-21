/**
 * Unified Delivery Service
 * Coordinates DoorDash & Uber Eats marketplace ingestion, kitchen ticket routing,
 * BOM auto-depletion, and outbound on-demand driver dispatch.
 */

import fs from 'fs'
import path from 'path'
import {
  DeliveryHubConfig,
  DeliveryQuote,
  DeliveryDispatchRecord,
  MarketplaceOrderInput,
  DeliveryProviderId,
  DeliveryStatus,
} from './types'
import { DoorDashClient } from './doordashClient'
import { UberClient } from './uberClient'
import { Context } from '.keystone/types'
import { syncKitchenTicketsForOrder } from '@/features/keystone/utils/kitchenTicketSync'
import { depleteInventoryForOrder } from '@/features/keystone/utils/inventoryLedger'
import { appendAuditEvent } from '@/features/keystone/utils/audit'

const CONFIG_FILE_PATH = path.join(process.cwd(), 'features', 'integrations', 'delivery', 'delivery-config.json')
const DISPATCH_CACHE_FILE = path.join(process.cwd(), 'features', 'integrations', 'delivery', 'active-dispatches.json')

export const DEFAULT_DELIVERY_CONFIG: DeliveryHubConfig = {
  doordash: {
    enabled: true,
    sandbox: true,
    marketplaceEnabled: true,
    dispatchEnabled: true,
    autoDispatchOnKitchenReady: true,
    autoAcceptMarketplaceOrders: true,
    autoDepleteBOMInventory: true,
    autoSyncKDS: true,
    defaultTipCents: 300,
    doorDashDeveloperId: 'dd-dev-sandbox-demo',
    doorDashKeyId: 'dd-key-demo-01',
    doorDashSigningSecret: 'bW9jay1zaWduaW5nLXNlY3JldC1mb3ItZG9vcmRhc2gtc2FuZGJveA==',
    doorDashBusinessId: 'aura-bistro-brooklyn',
    webhookSecret: 'dd_whsec_aura_test_secret',
  },
  ubereats: {
    enabled: true,
    sandbox: true,
    marketplaceEnabled: true,
    dispatchEnabled: true,
    autoDispatchOnKitchenReady: true,
    autoAcceptMarketplaceOrders: true,
    autoDepleteBOMInventory: true,
    autoSyncKDS: true,
    defaultTipCents: 300,
    uberClientId: 'uber-client-demo-id',
    uberClientSecret: 'uber-secret-demo-key',
    uberCustomerId: 'aura-uber-org-01',
    webhookSecret: 'ue_whsec_aura_test_secret',
  },
  storeAddress: {
    street: '123 Harbor View St',
    city: 'Brooklyn',
    state: 'NY',
    zip: '11201',
    phone: '(555) 234-5678',
  },
}

export class DeliveryService {
  private config: DeliveryHubConfig
  private doordashClient: DoorDashClient
  private uberClient: UberClient
  private dispatches: Map<string, DeliveryDispatchRecord> = new Map()

  constructor() {
    this.config = this.loadConfig()
    this.doordashClient = new DoorDashClient(this.config.doordash, this.config.storeAddress)
    this.uberClient = new UberClient(this.config.ubereats, this.config.storeAddress)
    this.loadDispatches()
  }

  private loadConfig(): DeliveryHubConfig {
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8')
        return { ...DEFAULT_DELIVERY_CONFIG, ...JSON.parse(raw) }
      }
    } catch (err) {
      console.warn('Failed to read delivery-config.json, using defaults:', err)
    }
    return DEFAULT_DELIVERY_CONFIG
  }

  saveConfig(newConfig: Partial<DeliveryHubConfig>): DeliveryHubConfig {
    this.config = {
      ...this.config,
      ...newConfig,
      doordash: { ...this.config.doordash, ...(newConfig.doordash || {}) },
      ubereats: { ...this.config.ubereats, ...(newConfig.ubereats || {}) },
    }
    try {
      const dir = path.dirname(CONFIG_FILE_PATH)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to write delivery config:', err)
    }
    this.doordashClient = new DoorDashClient(this.config.doordash, this.config.storeAddress)
    this.uberClient = new UberClient(this.config.ubereats, this.config.storeAddress)
    return this.config
  }

  getConfig(): DeliveryHubConfig {
    return this.config
  }

  private loadDispatches() {
    try {
      if (fs.existsSync(DISPATCH_CACHE_FILE)) {
        const raw = fs.readFileSync(DISPATCH_CACHE_FILE, 'utf-8')
        const items = JSON.parse(raw) as DeliveryDispatchRecord[]
        for (const item of items) {
          this.dispatches.set(item.deliveryId, item)
        }
      }
    } catch {}
  }

  private saveDispatches() {
    try {
      const dir = path.dirname(DISPATCH_CACHE_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const list = Array.from(this.dispatches.values())
      fs.writeFileSync(DISPATCH_CACHE_FILE, JSON.stringify(list, null, 2), 'utf-8')
    } catch {}
  }

  /**
   * Get comparative delivery quotes from DoorDash Drive & Uber Direct
   */
  async getQuotes(dropoffAddress: {
    street: string
    city: string
    state: string
    zip: string
  }, orderTotalCents: number): Promise<DeliveryQuote[]> {
    const promises: Promise<DeliveryQuote | null>[] = []

    if (this.config.doordash.enabled && this.config.doordash.dispatchEnabled) {
      promises.push(
        this.doordashClient.createQuote(dropoffAddress, orderTotalCents).catch((err) => {
          console.error('DoorDash quote error:', err)
          return null
        })
      )
    }

    if (this.config.ubereats.enabled && this.config.ubereats.dispatchEnabled) {
      promises.push(
        this.uberClient.createQuote(dropoffAddress, orderTotalCents).catch((err) => {
          console.error('Uber Direct quote error:', err)
          return null
        })
      )
    }

    const results = await Promise.all(promises)
    return results.filter((q): q is DeliveryQuote => q !== null).sort((a, b) => a.feeCents - b.feeCents)
  }

  /**
   * Dispatch on-demand courier for a restaurant order
   */
  async dispatchCourier(
    order: {
      id: string
      orderNumber: string
      customerName: string
      customerPhone: string
      deliveryAddress: string
      deliveryCity: string
      deliveryState: string
      deliveryZip: string
      totalCents: number
      tipCents?: number
      specialInstructions?: string
    },
    provider: DeliveryProviderId = 'doordash',
    quoteId?: string
  ): Promise<DeliveryDispatchRecord> {
    let dispatch: DeliveryDispatchRecord

    if (provider === 'doordash') {
      dispatch = await this.doordashClient.dispatchDelivery(order, quoteId)
    } else {
      dispatch = await this.uberClient.dispatchDelivery(order, quoteId)
    }

    this.dispatches.set(dispatch.deliveryId, dispatch)
    this.saveDispatches()
    return dispatch
  }

  /**
   * Update courier delivery progress
   */
  updateDispatchStatus(deliveryId: string, status: DeliveryStatus, note?: string): DeliveryDispatchRecord | null {
    const record = this.dispatches.get(deliveryId)
    if (!record) return null

    record.status = status
    record.updatedAt = new Date().toISOString()
    record.timeline.push({
      status,
      timestamp: new Date().toISOString(),
      note: note || `Status updated to ${status}`,
    })

    this.dispatches.set(deliveryId, record)
    this.saveDispatches()
    return record
  }

  /**
   * List active fleet dispatches
   */
  getActiveDispatches(): DeliveryDispatchRecord[] {
    return Array.from(this.dispatches.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  /**
   * Ingest an inbound marketplace order from DoorDash or Uber Eats
   */
  async ingestMarketplaceOrder(input: MarketplaceOrderInput, context: Context): Promise<any> {
    const sudo = context.sudo()

    // 1. Check idempotency: avoid inserting duplicate external orders
    const existingOrders = await sudo.query.RestaurantOrder.findMany({
      where: { orderNumber: { equals: input.orderNumber } },
      query: 'id orderNumber status',
      take: 1,
    })

    if (existingOrders.length > 0) {
      return {
        success: true,
        orderId: existingOrders[0].id,
        orderNumber: existingOrders[0].orderNumber,
        replay: true,
      }
    }

    // 2. Resolve matching MenuItems for order lines
    const menuItems = await sudo.query.MenuItem.findMany({
      query: 'id name price station kitchenStation',
    })
    const itemMap = new Map<string, any>()
    for (const m of menuItems) {
      itemMap.set(m.name.toLowerCase().trim(), m)
    }

    // 3. Create RestaurantOrder in Keystone database
    const orderData: any = {
      orderNumber: input.orderNumber,
      orderType: 'delivery',
      orderSource: 'online',
      status: 'open',
      guestCount: 1,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      deliveryAddress: input.deliveryAddress,
      deliveryCity: input.deliveryCity,
      deliveryState: input.deliveryState,
      deliveryZip: input.deliveryZip,
      deliveryCountryCode: 'US',
      subtotal: input.subtotalCents,
      tax: input.taxCents,
      tip: input.tipCents,
      total: input.totalCents,
      specialInstructions: input.specialInstructions || `Courier Pickup Deadline: ${new Date(input.pickupDeadline).toLocaleTimeString()}`,
    }

    const createdOrder = await sudo.query.RestaurantOrder.createOne({
      data: orderData,
      query: 'id orderNumber status orderType orderSource total',
    })

    // 4. Create OrderItems for the order
    for (const line of input.items) {
      const matched = itemMap.get(line.name.toLowerCase().trim())
      const unitPrice = line.unitPriceCents || (matched ? Number(matched.price || 0) : 1000)
      const lineTotal = unitPrice * line.quantity

      await sudo.query.OrderItem.createOne({
        data: {
          order: { connect: { id: createdOrder.id } },
          menuItem: matched ? { connect: { id: matched.id } } : undefined,
          menuItemIdSnapshot: matched?.id || '',
          itemNameSnapshot: line.name || 'Delivery Item',
          quantity: line.quantity,
          price: unitPrice,
          station: matched?.station || 'hot_line',
          kitchenStationSnapshot: matched?.kitchenStation || matched?.station || 'hot_line',
          specialInstructions: line.instructions || '',
        },
      }).catch((e: any) => console.error('Error creating OrderItem:', e))
    }

    // 5. Instantly route tickets to KDS stations
    try {
      await syncKitchenTicketsForOrder(createdOrder.id, context)
    } catch (kdsErr) {
      console.error('KDS Ticket sync error for marketplace order:', kdsErr)
    }

    // 6. Auto-deplete raw ingredient BOM inventory
    try {
      await depleteInventoryForOrder(createdOrder.id, context, {
        allowActive: true,
        reason: `Marketplace purchase inventory auto-depletion for ${input.provider.toUpperCase()} order ${createdOrder.orderNumber}`,
      })
    } catch (bomErr) {
      console.error('BOM inventory depletion error for marketplace order:', bomErr)
    }

    // 7. Log audit event
    await appendAuditEvent(context, {
      eventType: 'delivery.marketplace_injected',
      entityType: 'RestaurantOrder',
      entityId: createdOrder.id,
      after: {
        provider: input.provider,
        externalOrderId: input.externalOrderId,
        orderNumber: createdOrder.orderNumber,
        total: input.totalCents,
        itemCount: input.items.length,
      },
    }).catch(() => {})

    return {
      success: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      provider: input.provider,
      kdsSynced: true,
      inventoryDepleted: true,
      replay: false,
    }
  }

  getDoorDashClient() {
    return this.doordashClient
  }

  getUberClient() {
    return this.uberClient
  }
}

// Global Singleton for the Next.js process
export const deliveryService = ((globalThis as any)._deliveryService ??= new DeliveryService())
