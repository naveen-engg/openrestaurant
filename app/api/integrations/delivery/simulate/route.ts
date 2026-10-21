import { NextRequest, NextResponse } from 'next/server'
import { deliveryService } from '@/features/integrations/delivery/deliveryService'
import { keystoneContext } from '@/features/keystone/context'
import { DeliveryProviderId, DeliveryStatus, DeliveryDispatchRecord } from '@/features/integrations/delivery/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, provider = 'doordash', deliveryId, orderId } = body
    const sudo = keystoneContext.sudo()

    // Action 1: Inject simulated inbound marketplace order from DoorDash or Uber Eats
    if (action === 'inject_marketplace_order') {
      const p = (provider as DeliveryProviderId) === 'ubereats' ? 'ubereats' : 'doordash'
      const prefix = p === 'doordash' ? 'DD' : 'UE'
      const suffix = Math.floor(1000 + Math.random() * 9000).toString()

      // Look up real menu items in the database to match BOM recipes
      const menuItems = await sudo.query.MenuItem.findMany({
        take: 4,
        query: 'id name price',
      })

      const selectedItems = menuItems.length > 0 
        ? menuItems.slice(0, 2).map((m: any) => ({
            name: m.name,
            quantity: 1,
            unitPriceCents: Number(m.price || 1400),
            instructions: 'Extra crispy / sauce on the side',
          }))
        : [
            {
              name: 'Margherita Pizza',
              quantity: 1,
              unitPriceCents: 1600,
              instructions: 'Well done',
            },
            {
              name: 'Truffle Fries',
              quantity: 1,
              unitPriceCents: 850,
              instructions: 'Extra dip',
            },
          ]

      const subtotalCents = selectedItems.reduce((acc: number, it: any) => acc + it.unitPriceCents * it.quantity, 0)
      const taxCents = Math.round(subtotalCents * 0.08875)
      const tipCents = 400
      const totalCents = subtotalCents + taxCents + tipCents

      const names = [
        'Marcus Vance', 'Sarah Jenkins', 'Elena Rostova', 'David Chen', 'Maya Patel'
      ]
      const addresses = [
        '340 Court St, Apt 2B',
        '88 Montague St, Unit 5',
        '210 Joralemon St, Apt 11',
        '55 Prospect St, Floor 4',
      ]
      const randomName = names[Math.floor(Math.random() * names.length)]
      const randomAddress = addresses[Math.floor(Math.random() * addresses.length)]

      const marketplaceInput = {
        provider: p,
        externalOrderId: `${prefix}-EXT-${Date.now().toString().slice(-6)}`,
        orderNumber: `${prefix}-${suffix}`,
        customerName: randomName,
        customerPhone: '(555) ' + Math.floor(200 + Math.random() * 700) + '-' + Math.floor(1000 + Math.random() * 9000),
        deliveryAddress: randomAddress,
        deliveryCity: 'Brooklyn',
        deliveryState: 'NY',
        deliveryZip: '11201',
        items: selectedItems,
        subtotalCents,
        taxCents,
        tipCents,
        totalCents,
        pickupDeadline: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
        specialInstructions: 'Ring buzzer #2B upon courier arrival. Leave on doorstep if no answer.',
      }

      const result = await deliveryService.ingestMarketplaceOrder(marketplaceInput, keystoneContext)

      return NextResponse.json({
        success: true,
        message: `Successfully injected ${p.toUpperCase()} marketplace order ${result.orderNumber}!`,
        result,
      })
    }

    // Action 2: Advance simulated courier lifecycle
    if (action === 'advance_courier_status') {
      if (!deliveryId) {
        return NextResponse.json({ success: false, error: 'deliveryId is required' }, { status: 400 })
      }

      const active = deliveryService.getActiveDispatches().find((d: DeliveryDispatchRecord) => d.deliveryId === deliveryId)
      if (!active) {
        return NextResponse.json({ success: false, error: 'Dispatch record not found' }, { status: 404 })
      }

      const statusSequence: Record<string, DeliveryStatus> = {
        'quoted': 'dispatched',
        'dispatched': 'courier_assigned',
        'courier_assigned': 'at_store',
        'at_store': 'picked_up',
        'picked_up': 'delivered',
        'delivered': 'delivered',
        'cancelled': 'cancelled',
      }

      const currentStatus = active.status as DeliveryStatus
      const nextStatus = statusSequence[currentStatus] || 'delivered'
      const updated = deliveryService.updateDispatchStatus(
        deliveryId,
        nextStatus,
        `Simulated driver transition to ${nextStatus}`
      )

      return NextResponse.json({
        success: true,
        message: `Courier status advanced to ${nextStatus}`,
        dispatch: updated,
      })
    }

    // Action 3: Dispatch courier for an existing open order
    if (action === 'dispatch_open_order') {
      let targetOrder: any

      if (orderId) {
        targetOrder = await sudo.query.RestaurantOrder.findOne({
          where: { id: orderId },
          query: 'id orderNumber customerName customerPhone deliveryAddress deliveryCity deliveryState deliveryZip total specialInstructions',
        })
      } else {
        const openOrders = await sudo.query.RestaurantOrder.findMany({
          where: {
            status: { equals: 'open' },
            orderType: { equals: 'delivery' },
          },
          take: 1,
          query: 'id orderNumber customerName customerPhone deliveryAddress deliveryCity deliveryState deliveryZip total specialInstructions',
        })
        targetOrder = openOrders[0]
      }

      if (!targetOrder) {
        // Create an on-demand order to dispatch
        const mockNum = `ORD-${Math.floor(1000 + Math.random() * 9000)}`
        targetOrder = await sudo.query.RestaurantOrder.createOne({
          data: {
            orderNumber: mockNum,
            orderType: 'delivery',
            orderSource: 'online',
            status: 'open',
            customerName: 'Claire Beauchamp',
            customerPhone: '(555) 728-1934',
            deliveryAddress: '42 Willow St',
            deliveryCity: 'Brooklyn',
            deliveryState: 'NY',
            deliveryZip: '11201',
            total: 3450,
            specialInstructions: 'White-label web store delivery order',
          },
          query: 'id orderNumber customerName customerPhone deliveryAddress deliveryCity deliveryState deliveryZip total specialInstructions',
        })
      }

      const dispatch = await deliveryService.dispatchCourier(
        {
          id: targetOrder.id,
          orderNumber: targetOrder.orderNumber,
          customerName: targetOrder.customerName || 'Delivery Guest',
          customerPhone: targetOrder.customerPhone || '(555) 000-0000',
          deliveryAddress: targetOrder.deliveryAddress || '100 Atlantic Ave',
          deliveryCity: targetOrder.deliveryCity || 'Brooklyn',
          deliveryState: targetOrder.deliveryState || 'NY',
          deliveryZip: targetOrder.deliveryZip || '11201',
          totalCents: Number(targetOrder.total || 2500),
          specialInstructions: targetOrder.specialInstructions || '',
        },
        provider as DeliveryProviderId
      )

      return NextResponse.json({
        success: true,
        message: `Courier dispatched via ${(provider as string).toUpperCase()}`,
        dispatch,
      })
    }

    return NextResponse.json({ success: false, error: 'Unknown simulation action' }, { status: 400 })
  } catch (error: any) {
    console.error('Simulation error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
