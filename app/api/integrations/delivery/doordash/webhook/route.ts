import { NextRequest, NextResponse } from 'next/server'
import { deliveryService } from '@/features/integrations/delivery/deliveryService'
import { keystoneContext } from '@/features/keystone/context'
import { DeliveryStatus } from '@/features/integrations/delivery/types'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-doordash-signature') || request.headers.get('x-signature')

  const ddClient = deliveryService.getDoorDashClient()
  if (!ddClient.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.event_type || payload.type || 'ORDER_CREATED'

  try {
    // 1. Courier status event (DoorDash Drive)
    if (eventType.includes('DELIVERY') || eventType.includes('DASHER') || payload.delivery_status) {
      const statusMap: Record<string, DeliveryStatus> = {
        'DASHER_CONFIRMED': 'courier_assigned',
        'DASHER_EN_ROUTE_TO_PICKUP': 'courier_assigned',
        'DASHER_ARRIVING_AT_PICKUP': 'at_store',
        'DASHER_PICKED_UP': 'picked_up',
        'DASHER_ARRIVING_AT_DROPOFF': 'picked_up',
        'DELIVERY_DELIVERED': 'delivered',
        'DELIVERY_CANCELLED': 'cancelled',
      }

      const rawStatus = (payload.delivery_status || payload.event_name || eventType).toUpperCase()
      const mapped = statusMap[rawStatus] || 'dispatched'
      const deliveryId = payload.external_delivery_id || payload.delivery_id

      if (deliveryId) {
        deliveryService.updateDispatchStatus(deliveryId, mapped, `DoorDash webhook: ${rawStatus}`)
      }

      return NextResponse.json({ success: true, processed: 'delivery_status_update', mappedStatus: mapped })
    }

    // 2. Inbound Marketplace Order (DoorDash Consumer App)
    const standardized = ddClient.parseMarketplaceWebhook(payload)
    const result = await deliveryService.ingestMarketplaceOrder(standardized, keystoneContext)

    return NextResponse.json({
      success: true,
      processed: 'marketplace_order_ingested',
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      kdsSynced: result.kdsSynced,
      inventoryDepleted: result.inventoryDepleted,
    })
  } catch (error: any) {
    console.error('DoorDash Webhook Error:', error)
    return NextResponse.json({ error: error.message || 'Webhook processing failed' }, { status: 500 })
  }
}
