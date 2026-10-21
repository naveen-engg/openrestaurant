import { NextRequest, NextResponse } from 'next/server'
import { deliveryService } from '@/features/integrations/delivery/deliveryService'
import { keystoneContext } from '@/features/keystone/context'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order, provider = 'doordash', quoteId } = body

    if (!order || !order.deliveryAddress) {
      return NextResponse.json(
        { success: false, error: 'Order with deliveryAddress is required' },
        { status: 400 }
      )
    }

    const dispatch = await deliveryService.dispatchCourier(order, provider, quoteId)

    // If order has an ID in Keystone, update its delivery status in audit log or order metadata
    if (order.id) {
      try {
        const sudo = keystoneContext.sudo()
        await sudo.query.RestaurantOrder.updateOne({
          where: { id: order.id },
          data: {
            specialInstructions: `${order.specialInstructions || ''}\n[Courier Dispatched via ${provider.toUpperCase()}: ${dispatch.deliveryId}]`.trim(),
          },
        })
      } catch (dbErr) {
        console.warn('Could not update order with dispatch info:', dbErr)
      }
    }

    return NextResponse.json({ success: true, dispatch })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
