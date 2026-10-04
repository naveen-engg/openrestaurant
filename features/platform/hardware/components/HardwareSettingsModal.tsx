'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Printer,
  Receipt,
  Utensils,
  DollarSign,
  Bell,
  RefreshCw,
  CheckCircle2,
  Sliders,
  Eye,
  Check,
} from 'lucide-react'
import {
  HardwareSettings,
  loadHardwareSettings,
  saveHardwareSettings,
  printReceipt,
  printKitchen,
  triggerCashDrawerKick,
  renderReceiptHTML,
} from '../printerService'
import { ESCPOSReceiptData, ESCPOSKitchenTicketData } from '../escposGenerator'

interface HardwareSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTestPrintReceipt?: () => void
  onTestPrintKitchen?: () => void
  onTestKickDrawer?: () => void
}

export function HardwareSettingsModal({
  open,
  onOpenChange,
  onTestPrintReceipt,
  onTestPrintKitchen,
  onTestKickDrawer,
}: HardwareSettingsModalProps) {
  const [settings, setSettings] = useState<HardwareSettings>(loadHardwareSettings)
  const [activeTab, setActiveTab] = useState<'receipt' | 'kitchen' | 'drawer' | 'preview'>('receipt')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (open) {
      setSettings(loadHardwareSettings())
      setStatusMessage(null)
    }
  }, [open])

  const handleSave = () => {
    saveHardwareSettings(settings)
    setStatusMessage('Hardware configuration saved successfully!')
    setTimeout(() => onOpenChange(false), 800)
  }

  const sampleReceiptData: ESCPOSReceiptData = {
    restaurantName: 'Openfront Bistro',
    restaurantAddress: '123 Market Street, Suite 400',
    restaurantPhone: '(555) 839-2041',
    orderNumber: '1048',
    serverName: 'Alice S.',
    tableName: 'T2',
    orderType: 'dine_in',
    createdAt: new Date().toISOString(),
    items: [
      {
        name: 'Classic Smash Burger',
        quantity: 2,
        priceCents: 1600,
        modifiers: [{ name: 'Extra Cheddar', priceCents: 200 }, { name: 'Medium Rare' }],
        specialInstructions: 'Allergy: No sesame seeds',
      },
      {
        name: 'Truffle Fries',
        quantity: 1,
        priceCents: 900,
      },
      {
        name: 'Draft IPA',
        quantity: 2,
        priceCents: 800,
      },
    ],
    subtotalCents: 5900,
    taxCents: 516,
    tipCents: 1180,
    totalCents: 7596,
    payments: [{ method: 'Visa', amountCents: 7596, reference: '****4242' }],
    footerMessage: 'Thank you for dining with us!',
  }

  const sampleKitchenData: ESCPOSKitchenTicketData = {
    ticketNumber: 'K-1048',
    orderNumber: '1048',
    tableName: 'T2',
    orderType: 'dine_in',
    serverName: 'Alice S.',
    guestCount: 3,
    isUrgent: true,
    createdAt: new Date().toISOString(),
    stationName: 'Hot Line',
    specialInstructions: 'Guest has flight in 45m',
    items: [
      {
        name: 'Classic Smash Burger',
        quantity: 2,
        priceCents: 1600,
        courseNumber: 1,
        seatNumber: 1,
        modifiers: [{ name: 'Extra Cheddar' }, { name: 'Medium Rare' }],
        specialInstructions: 'NO ONIONS',
      },
      {
        name: 'Truffle Fries',
        quantity: 1,
        priceCents: 900,
        courseNumber: 1,
        seatNumber: 2,
      },
    ],
  }

  const handleTestReceipt = async () => {
    try {
      setTesting(true)
      await printReceipt(sampleReceiptData, settings.receiptPrinter)
      if (onTestPrintReceipt) onTestPrintReceipt()
      setStatusMessage('Test receipt dispatched to printer!')
    } finally {
      setTesting(false)
    }
  }

  const handleTestKitchen = async () => {
    try {
      setTesting(true)
      await printKitchen(sampleKitchenData, settings.kitchenPrinter)
      if (onTestPrintKitchen) onTestPrintKitchen()
      setStatusMessage('Test kitchen prep ticket dispatched to printer!')
    } finally {
      setTesting(false)
    }
  }

  const handleTestDrawer = async () => {
    try {
      setTesting(true)
      await triggerCashDrawerKick()
      if (onTestKickDrawer) onTestKickDrawer()
      setStatusMessage('Cash drawer kick pulse sent (ESC p 0 25 250)!')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="shrink-0 pb-2">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg font-bold">Hardware & ESC/POS Printers</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure direct ESC/POS thermal printers (80mm/58mm), network TCP ports (9100), and cash drawer kick triggers.
          </DialogDescription>
        </DialogHeader>

        {statusMessage && (
          <div className="px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 shrink-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-4 shrink-0 mb-3">
            <TabsTrigger value="receipt" onClick={() => setActiveTab('receipt')} className="text-xs gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              Receipt Printer
            </TabsTrigger>
            <TabsTrigger value="kitchen" onClick={() => setActiveTab('kitchen')} className="text-xs gap-1.5">
              <Utensils className="h-3.5 w-3.5" />
              Kitchen Printer
            </TabsTrigger>
            <TabsTrigger value="drawer" onClick={() => setActiveTab('drawer')} className="text-xs gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Cash Drawer
            </TabsTrigger>
            <TabsTrigger value="preview" onClick={() => setActiveTab('preview')} className="text-xs gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Live Preview
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Receipt Printer */}
          <TabsContent value="receipt" forceMount className={`flex-1 overflow-y-auto space-y-4 pr-1 ${activeTab !== 'receipt' ? 'hidden' : ''}`}>
            <div className="space-y-3 p-3 rounded-lg border bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-bold">Printer Connection Type</Label>
                  <p className="text-xs text-muted-foreground">Choose transport protocol for receipt dispatch</p>
                </div>
                <div className="flex gap-1.5">
                  {(['browser', 'network', 'usb'] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={settings.receiptPrinter.type === t ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          receiptPrinter: { ...prev.receiptPrinter, type: t },
                        }))
                      }
                      className="text-xs h-7 uppercase font-semibold"
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>

              {settings.receiptPrinter.type === 'network' && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <Label className="text-xs">Printer IP Address</Label>
                    <Input
                      value={settings.receiptPrinter.ipAddress || ''}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          receiptPrinter: { ...prev.receiptPrinter, ipAddress: e.target.value },
                        }))
                      }
                      placeholder="192.168.1.200"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Raw TCP Port</Label>
                    <Input
                      type="number"
                      value={settings.receiptPrinter.port || 9100}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          receiptPrinter: { ...prev.receiptPrinter, port: Number(e.target.value) },
                        }))
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <Label className="text-xs">Thermal Roll Width</Label>
                  <div className="flex gap-2 mt-1">
                    <Button
                      type="button"
                      variant={settings.receiptPrinter.columnWidth === 42 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          receiptPrinter: { ...prev.receiptPrinter, columnWidth: 42 },
                        }))
                      }
                      className="text-xs h-7 flex-1"
                    >
                      80mm (42 Col)
                    </Button>
                    <Button
                      type="button"
                      variant={settings.receiptPrinter.columnWidth === 32 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          receiptPrinter: { ...prev.receiptPrinter, columnWidth: 32 },
                        }))
                      }
                      className="text-xs h-7 flex-1"
                    >
                      58mm (32 Col)
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Auto-Cut Paper</Label>
                    <p className="text-[11px] text-muted-foreground">Send GS V 1 partial cut</p>
                  </div>
                  <Switch
                    checked={settings.receiptPrinter.autoCut}
                    onCheckedChange={(checked) =>
                      setSettings((prev) => ({
                        ...prev,
                        receiptPrinter: { ...prev.receiptPrinter, autoCut: checked },
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div>
                <div className="font-semibold text-xs">Verify Receipt Output</div>
                <div className="text-[11px] text-muted-foreground">Prints complete itemized guest check with totals & tip guide</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestReceipt}
                disabled={testing}
                className="text-xs h-8 gap-1.5 font-bold"
              >
                <Printer className="h-3.5 w-3.5" />
                Test Receipt Print
              </Button>
            </div>
          </TabsContent>

          {/* TAB 2: Kitchen Printer */}
          <TabsContent value="kitchen" forceMount className={`flex-1 overflow-y-auto space-y-4 pr-1 ${activeTab !== 'kitchen' ? 'hidden' : ''}`}>
            <div className="space-y-3 p-3 rounded-lg border bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-bold">Kitchen Printer Type</Label>
                  <p className="text-xs text-muted-foreground">Line cook ticket printer on expo or stations</p>
                </div>
                <div className="flex gap-1.5">
                  {(['browser', 'network', 'usb'] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={settings.kitchenPrinter.type === t ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          kitchenPrinter: { ...prev.kitchenPrinter, type: t },
                        }))
                      }
                      className="text-xs h-7 uppercase font-semibold"
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>

              {settings.kitchenPrinter.type === 'network' && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <Label className="text-xs">Kitchen Printer IP</Label>
                    <Input
                      value={settings.kitchenPrinter.ipAddress || ''}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          kitchenPrinter: { ...prev.kitchenPrinter, ipAddress: e.target.value },
                        }))
                      }
                      placeholder="192.168.1.201"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Raw Port</Label>
                    <Input
                      type="number"
                      value={settings.kitchenPrinter.port || 9100}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          kitchenPrinter: { ...prev.kitchenPrinter, port: Number(e.target.value) },
                        }))
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div>
                <div className="font-semibold text-xs">Verify Kitchen Ticket Output</div>
                <div className="text-[11px] text-muted-foreground">Prints high-contrast cook ticket with seat numbers, courses, and rush buzzer</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestKitchen}
                disabled={testing}
                className="text-xs h-8 gap-1.5 font-bold"
              >
                <Utensils className="h-3.5 w-3.5" />
                Test Kitchen Print
              </Button>
            </div>
          </TabsContent>

          {/* TAB 3: Cash Drawer */}
          <TabsContent value="drawer" forceMount className={`flex-1 overflow-y-auto space-y-4 pr-1 ${activeTab !== 'drawer' ? 'hidden' : ''}`}>
            <div className="p-3 rounded-lg border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-bold">Auto-Kick Drawer on Cash Payment</Label>
                  <p className="text-xs text-muted-foreground">Triggers standard 24V pulse to printer DK port when cash tender is logged</p>
                </div>
                <Switch
                  checked={settings.autoKickDrawerOnCash}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, autoKickDrawerOnCash: checked }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div>
                <div className="font-semibold text-xs">Manual Drawer Kick Pulse</div>
                <div className="text-[11px] text-muted-foreground">Sends ESC p 0 25 250 command to trigger cash solenoid</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestDrawer}
                disabled={testing}
                className="text-xs h-8 gap-1.5 font-bold"
              >
                <DollarSign className="h-3.5 w-3.5" />
                Kick Drawer Now
              </Button>
            </div>
          </TabsContent>

          {/* TAB 4: Live Preview */}
          <TabsContent value="preview" forceMount className={`flex-1 overflow-y-auto pr-1 ${activeTab !== 'preview' ? 'hidden' : ''}`}>
            <div className="p-3 rounded-lg border bg-muted/20 flex flex-col items-center">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Simulated 80mm Thermal Receipt (Monospace Font / Dot Matrix Layout)
              </div>
              <div
                className="w-[320px] bg-white text-black p-4 font-mono text-xs rounded shadow-md border border-neutral-300 leading-tight space-y-1.5"
                style={{ fontFamily: "'Courier New', Courier, monospace" }}
              >
                <div className="text-center font-bold text-sm">Openfront Bistro</div>
                <div className="text-center text-[10px]">123 Market Street, Suite 400</div>
                <div className="border-t-2 border-black my-1" />
                <div className="flex justify-between font-bold">
                  <span>Check: #1048</span>
                  <span>Table: T2</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Server: Alice S.</span>
                  <span>Dine-In</span>
                </div>
                <div className="border-t border-dashed border-black my-1" />
                <div className="flex justify-between font-bold">
                  <span>2x Classic Smash Burger</span>
                  <span>$32.00</span>
                </div>
                <div className="pl-3 text-[10px] text-neutral-600">+ Extra Cheddar ($2.00)</div>
                <div className="pl-3 text-[10px] text-neutral-600">* Note: Allergy: No sesame</div>
                <div className="flex justify-between font-bold">
                  <span>1x Truffle Fries</span>
                  <span>$9.00</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>2x Draft IPA</span>
                  <span>$16.00</span>
                </div>
                <div className="border-t border-dashed border-black my-1" />
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>$59.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax (8.75%)</span>
                  <span>$5.16</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-black pt-1">
                  <span>TOTAL</span>
                  <span>$75.96</span>
                </div>
                <div className="border-t border-dashed border-black my-1" />
                <div className="flex justify-between text-[11px]">
                  <span>Paid: VISA (****4242)</span>
                  <span>$75.96</span>
                </div>
                <div className="border-t-2 border-black my-1" />
                <div className="text-center text-[10px] font-bold">Thank you for dining with us!</div>
                <div className="text-center text-[9px] text-neutral-500">ESC/POS Powered by Openfront POS</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 pt-3 flex items-center justify-between sm:justify-between border-t mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            className="text-xs h-8 gap-1 font-bold"
          >
            <Check className="h-3.5 w-3.5" />
            Save Hardware Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
