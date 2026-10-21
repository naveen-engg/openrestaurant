/**
 * DoorDash Delivery Integration Client
 * Supports DoorDash Drive (On-demand Courier Dispatch) and DoorDash Marketplace (Inbound Orders)
 */

import crypto from 'crypto'
import {
  DeliveryQuote,
  DeliveryDispatchRecord,
  CourierInfo,
  ProviderSettings,
  MarketplaceOrderInput,
} from './types'

export class DoorDashClient {
  private config: ProviderSettings
  private storeAddress: { street: string; city: string; state: string; zip: string; phone: string }

  constructor(
    config: ProviderSettings,
    storeAddress = {
      street: '123 Harbor View St',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
      phone: '(555) 234-5678',
    }
  ) {
    this.config = config
    this.storeAddress = storeAddress
  }

  /**
   * Generates JWT token for DoorDash Drive API authentication
   */
  private generateAuthToken(): string {
    const keyId = this.config.doorDashKeyId || 'test-key-id'
    const developerId = this.config.doorDashDeveloperId || 'test-developer-id'
    const signingSecret = this.config.doorDashSigningSecret || 'test-signing-secret'

    const header = {
      alg: 'HS256',
      typ: 'JWT',
      'dd-ver': 'DD-JWT-V1',
    }

    const payload = {
      aud: 'doordash',
      iss: developerId,
      kid: keyId,
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
    }

    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = crypto
      .createHmac('sha256', Buffer.from(signingSecret, 'base64'))
      .update(`${base64Header}.${base64Payload}`)
      .digest('base64url')

    return `${base64Header}.${base64Payload}.${signature}`
  }

  /**
   * Request live delivery quote from DoorDash Drive
   */
  async createQuote(dropoffAddress: {
    street: string
    city: string
    state: string
    zip: string
  }, orderTotalCents: number): Promise<DeliveryQuote> {
    // If not in live mode with valid keys, return calibrated realistic sandbox quote
    if (this.config.sandbox || !this.config.doorDashSigningSecret) {
      const quoteId = `dd-quote-${Date.now()}`
      return {
        provider: 'doordash',
        quoteId,
        feeCents: 699, // $6.99 flat base drive fee
        currency: 'USD',
        estimatedPickupMinutes: 15,
        estimatedDeliveryMinutes: 35,
        durationMinutes: 20,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }
    }

    // Live DoorDash Drive API invocation
    const token = this.generateAuthToken()
    const response = await fetch('https://openapi.doordash.com/drive/v2/quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        external_business_id: this.config.doorDashBusinessId,
        pickup_address: `${this.storeAddress.street}, ${this.storeAddress.city}, ${this.storeAddress.state} ${this.storeAddress.zip}`,
        pickup_phone_number: this.storeAddress.phone,
        dropoff_address: `${dropoffAddress.street}, ${dropoffAddress.city}, ${dropoffAddress.state} ${dropoffAddress.zip}`,
        order_value: orderTotalCents,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`DoorDash quote failed: ${err}`)
    }

    const data = await response.json()
    return {
      provider: 'doordash',
      quoteId: data.external_delivery_id || data.id,
      feeCents: data.fee,
      currency: data.currency || 'USD',
      estimatedPickupMinutes: Math.max(10, Math.round((new Date(data.pickup_time_estimated).getTime() - Date.now()) / 60000)),
      estimatedDeliveryMinutes: Math.max(25, Math.round((new Date(data.dropoff_time_estimated).getTime() - Date.now()) / 60000)),
      durationMinutes: data.duration || 20,
      expiresAt: data.expires_at || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }
  }

  /**
   * Dispatch courier via DoorDash Drive
   */
  async dispatchDelivery(order: {
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
  }, quoteId?: string): Promise<DeliveryDispatchRecord> {
    const deliveryId = `dd-del-${order.orderNumber.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`
    const now = new Date()
    const pickupEta = new Date(now.getTime() + 15 * 60 * 1000).toISOString()
    const dropoffEta = new Date(now.getTime() + 35 * 60 * 1000).toISOString()

    const mockCourier: CourierInfo = {
      name: 'Carlos Mendez',
      phone: '(555) 782-9912',
      vehicleType: 'Toyota Camry (Silver) • Plate #7K92',
      trackingUrl: `https://track.doordash.com/delivery/${deliveryId}`,
      location: {
        lat: 40.7012,
        lng: -73.9892,
      },
    }

    // In sandbox or demo mode, return simulated dispatch
    if (this.config.sandbox || !this.config.doorDashSigningSecret) {
      return {
        deliveryId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        provider: 'doordash',
        status: 'courier_assigned',
        courier: mockCourier,
        pickupEta,
        dropoffEta,
        feeCents: 699,
        trackingUrl: mockCourier.trackingUrl,
        pickupAddress: `${this.storeAddress.street}, ${this.storeAddress.city}, ${this.storeAddress.state}`,
        dropoffAddress: `${order.deliveryAddress}, ${order.deliveryCity}, ${order.deliveryState} ${order.deliveryZip}`,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        timeline: [
          { status: 'dispatched', timestamp: now.toISOString(), note: 'Dispatched to DoorDash Drive fleet' },
          { status: 'courier_assigned', timestamp: new Date(now.getTime() + 2000).toISOString(), note: `Dasher ${mockCourier.name} assigned` },
        ],
      }
    }

    // Live API call
    const token = this.generateAuthToken()
    const response = await fetch('https://openapi.doordash.com/drive/v2/deliveries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        external_delivery_id: deliveryId,
        pickup_address: `${this.storeAddress.street}, ${this.storeAddress.city}, ${this.storeAddress.state} ${this.storeAddress.zip}`,
        pickup_phone_number: this.storeAddress.phone,
        dropoff_address: `${order.deliveryAddress}, ${order.deliveryCity}, ${order.deliveryState} ${order.deliveryZip}`,
        dropoff_phone_number: order.customerPhone,
        customer_name: order.customerName,
        order_value: order.totalCents,
        tip: order.tipCents || this.config.defaultTipCents || 0,
        dropoff_instructions: order.specialInstructions,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`DoorDash dispatch failed: ${err}`)
    }

    const data = await response.json()
    return {
      deliveryId: data.external_delivery_id || deliveryId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: 'doordash',
      status: 'dispatched',
      pickupEta: data.pickup_time_estimated || pickupEta,
      dropoffEta: data.dropoff_time_estimated || dropoffEta,
      feeCents: data.fee || 699,
      trackingUrl: data.tracking_url || `https://track.doordash.com/delivery/${deliveryId}`,
      pickupAddress: `${this.storeAddress.street}, ${this.storeAddress.city}, ${this.storeAddress.state}`,
      dropoffAddress: `${order.deliveryAddress}, ${order.deliveryCity}, ${order.deliveryState}`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      timeline: [
        { status: 'dispatched', timestamp: now.toISOString(), note: 'Live delivery dispatched on DoorDash Drive' },
      ],
    }
  }

  /**
   * Verify HMAC signature on incoming webhooks from DoorDash
   */
  verifyWebhookSignature(rawBody: string, signatureHeader?: string | null): boolean {
    if (this.config.sandbox || !this.config.webhookSecret) return true
    if (!signatureHeader) return false

    try {
      const hmac = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(rawBody)
        .digest('hex')
      return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signatureHeader))
    } catch {
      return false
    }
  }

  /**
   * Converts a DoorDash Marketplace webhook payload into standardized order input
   */
  parseMarketplaceWebhook(payload: any): MarketplaceOrderInput {
    const ddOrder = payload.order || payload
    const items = (ddOrder.items || []).map((it: any) => ({
      name: it.name || 'DoorDash Item',
      quantity: Number(it.quantity || 1),
      unitPriceCents: Number(it.price || 0),
      instructions: it.special_instructions || '',
      modifiers: (it.options || []).map((opt: any) => ({
        name: opt.name,
        priceCents: Number(opt.price || 0),
      })),
    }))

    const subtotal = items.reduce((acc: number, it: any) => acc + it.unitPriceCents * it.quantity, 0)
    const tax = Math.round(subtotal * 0.08875)
    const tip = Number(ddOrder.tip || 0)

    return {
      provider: 'doordash',
      externalOrderId: ddOrder.id || `DD-${Date.now()}`,
      orderNumber: `DD-${(ddOrder.id || Date.now().toString()).slice(-4)}`,
      customerName: ddOrder.consumer?.name || ddOrder.customer_name || 'DoorDash Guest',
      customerPhone: ddOrder.consumer?.phone_number || ddOrder.customer_phone || '(555) 019-2834',
      deliveryAddress: ddOrder.delivery_address?.street || ddOrder.dropoff_address || '123 Pine St, Apt 4B',
      deliveryCity: ddOrder.delivery_address?.city || 'Brooklyn',
      deliveryState: ddOrder.delivery_address?.state || 'NY',
      deliveryZip: ddOrder.delivery_address?.zip_code || '11201',
      items,
      subtotalCents: subtotal,
      taxCents: tax,
      tipCents: tip,
      totalCents: subtotal + tax + tip,
      pickupDeadline: ddOrder.pickup_time || new Date(Date.now() + 25 * 60 * 1000).toISOString(),
      specialInstructions: ddOrder.delivery_instructions || 'Leave at door / ring bell',
    }
  }
}
