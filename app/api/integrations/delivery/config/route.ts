import { NextRequest, NextResponse } from 'next/server'
import { deliveryService } from '@/features/integrations/delivery/deliveryService'

export async function GET() {
  try {
    const config = deliveryService.getConfig()
    return NextResponse.json({ success: true, config })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const updated = deliveryService.saveConfig(body)
    return NextResponse.json({ success: true, config: updated })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
}
