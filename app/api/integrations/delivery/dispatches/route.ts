import { NextRequest, NextResponse } from 'next/server'
import { deliveryService } from '@/features/integrations/delivery/deliveryService'

export async function GET() {
  try {
    const dispatches = deliveryService.getActiveDispatches()
    return NextResponse.json({ success: true, dispatches })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { deliveryId, status, note } = body

    if (!deliveryId || !status) {
      return NextResponse.json(
        { success: false, error: 'deliveryId and status are required' },
        { status: 400 }
      )
    }

    const updated = deliveryService.updateDispatchStatus(deliveryId, status, note)
    if (!updated) {
      return NextResponse.json(
        { success: false, error: `Delivery record ${deliveryId} not found` },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, dispatch: updated })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
