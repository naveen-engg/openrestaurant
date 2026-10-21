import { NextRequest, NextResponse } from 'next/server'
import { deliveryService } from '@/features/integrations/delivery/deliveryService'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { dropoffAddress, orderTotalCents = 2500 } = body

    if (!dropoffAddress || !dropoffAddress.street || !dropoffAddress.zip) {
      return NextResponse.json(
        { success: false, error: 'dropoffAddress with street and zip is required' },
        { status: 400 }
      )
    }

    const quotes = await deliveryService.getQuotes(dropoffAddress, orderTotalCents)
    return NextResponse.json({ success: true, quotes })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
