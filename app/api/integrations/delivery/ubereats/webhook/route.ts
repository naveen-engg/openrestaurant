import { NextRequest, NextResponse } from 'next/server'
import { deliveryService } from '@/features/integrations/delivery/deliveryService'
import { keystoneContext } from '@/features/keystone/context'
import { DeliveryStatus } from '@/features/integrations/delivery/types'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-uber-signature') || request.headers.get('x-signature')

  const uberClient = deliveryService.getUberClient()
  if (!uberClient.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.event_type || payload.type || 'orders.notification'

  try {
    // 1. Courier status event (Uber Direct)
    if (eventType.includes('delivery') || payload.status || payload.delivery_id) {
      const statusMap: Record<string, DeliveryStatus> = {
        'pending': 'dispatched',
        'pickup': 'at_store',
        'pickup_complete': 'picked_up',
        'dropoff': 'picked_up',
        'delivered': 'delivered',
        'canceled': 'cancelled',
      }

      const rawStatus = (payload.status || eventType).toLowerCase()
      const mapped = statusMap[rawStatus] || 'dispatched'
      const deliveryId = payload.delivery_id || payload.id

      if (deliveryId) {
        deliveryService.updateDispatchStatus(deliveryId, mapped, `Uber Direct webhook: ${rawStatus}`)
      }

      return NextResponse.json({ success: true, processed: 'delivery_status_update', mappedStatus: mapped })
    }

    // 2. Inbound Marketplace Order (Uber Eats App)
    const standardized = uberClient.parseMarketplaceWebhook(payload)
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
    console.error('Uber Eats Webhook Error:', error)
    return NextResponse.json({ error: error.message || 'Webhook processing failed' }, { status: 500 })
  }
}
