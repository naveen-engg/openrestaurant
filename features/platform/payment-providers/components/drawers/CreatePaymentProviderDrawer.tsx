'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import SingleSelect, { SingleSelectOption } from '@/components/ui/single-select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createPaymentProvider } from '../../actions'

interface CreatePaymentProviderDrawerProps {
  open: boolean
  onClose: () => void
  onCreate?: () => void
}

// Payment provider presets
const PAYMENT_PROVIDER_PRESETS = [
  { 
    id: 'terminal', 
    name: 'PAX / Dejavoo Terminal (BYO Processor)', 
    description: 'Semi-integrated EMV/NFC card terminal adapter supporting Dejavoo SPIN (Cloud REST), PAX POSLink (Local LAN HTTP), and Simulated Hardware Reader mode.',
    icon: '📟',
    envVars: ['TERMINAL_PROTOCOL', 'DEJAVOO_TPN', 'DEJAVOO_AUTH_KEY', 'PAX_TERMINAL_IP']
  },
  { 
    id: 'manual', 
    name: 'Cash / Manual Tender', 
    description: 'Cash and manual in-house tender method for restaurant POS and delivery orders.',
    icon: '👋',
    envVars: []
  },
  { 
    id: 'stripe', 
    name: 'Stripe', 
    description: 'For Stripe to work, you need to add these environment variables to your .env file:',
    icon: '💳',
    envVars: ['NEXT_PUBLIC_STRIPE_KEY', 'STRIPE_SECRET_KEY']
  },
  { 
    id: 'paypal', 
    name: 'PayPal', 
    description: 'For PayPal to work, you need to add these environment variables to your .env file:',
    icon: '🟦',
    envVars: ['NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']
  }
]

export function CreatePaymentProviderDrawer({ 
  open, 
  onClose, 
  onCreate
}: CreatePaymentProviderDrawerProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string>('terminal')
  const [providerName, setProviderName] = useState<string>('PAX / Dejavoo Smart Terminal')
  const [terminalProtocol, setTerminalProtocol] = useState<'simulated' | 'dejavoo_spin' | 'pax_poslink'>('simulated')
  const [dejavooTpn, setDejavooTpn] = useState<string>('')
  const [dejavooAuthKey, setDejavooAuthKey] = useState<string>('')
  const [paxIpAddress, setPaxIpAddress] = useState<string>('192.168.1.210')
  const [paxPort, setPaxPort] = useState<string>('10009')

  const selectedProvider = PAYMENT_PROVIDER_PRESETS.find(p => p.id === selectedPreset)

  // Get preset options for single select
  const getPresetOptions = (): SingleSelectOption[] => {
    return PAYMENT_PROVIDER_PRESETS.map(preset => ({
      value: preset.id,
      label: preset.name,
      flag: preset.icon,
      description: preset.description,
    }))
  }

  const handlePresetSelect = useCallback((presetId: string) => {
    const preset = PAYMENT_PROVIDER_PRESETS.find(p => p.id === presetId)
    if (preset) {
      setSelectedPreset(presetId)
      setProviderName(presetId === 'terminal' ? 'PAX / Dejavoo Smart Terminal' : `${preset.name} Provider`)
    }
  }, [])

  const validateForm = () => {
    if (!selectedPreset) {
      toast.error('Please select a payment provider')
      return false
    }
    
    if (!providerName.trim()) {
      toast.error('Please enter a provider name')
      return false
    }

    return true
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)
    
    try {
      // Build provider data with function fields based on selection
      const providerCodes: Record<string, string> = {
        terminal: 'pp_terminal_terminal',
        stripe: 'pp_stripe_stripe',
        paypal: 'pp_paypal_paypal',
        manual: 'pp_system_default',
      }
      let providerData: any = {
        name: providerName,
        code: providerCodes[selectedPreset],
        isInstalled: true
      }

      // Add function fields based on provider type
      if (selectedPreset === 'terminal') {
        providerData = {
          ...providerData,
          createPaymentFunction: 'terminal',
          capturePaymentFunction: 'terminal',
          refundPaymentFunction: 'terminal',
          getPaymentStatusFunction: 'terminal',
          generatePaymentLinkFunction: 'terminal',
          handleWebhookFunction: 'terminal',
          credentials: {
            protocol: terminalProtocol,
            ...(terminalProtocol === 'dejavoo_spin' ? { tpn: dejavooTpn, authKey: dejavooAuthKey } : {}),
            ...(terminalProtocol === 'pax_poslink' ? { ipAddress: paxIpAddress, port: Number(paxPort) || 10009 } : {}),
          },
          metadata: {
            protocol: terminalProtocol,
            promptTipOnTerminal: true,
          },
        }
      } else if (selectedPreset === 'stripe') {
        providerData = {
          ...providerData,
          createPaymentFunction: 'stripe',
          capturePaymentFunction: 'stripe',
          refundPaymentFunction: 'stripe',
          getPaymentStatusFunction: 'stripe',
          generatePaymentLinkFunction: 'stripe',
          handleWebhookFunction: 'stripe'
        }
      } else if (selectedPreset === 'paypal') {
        providerData = {
          ...providerData,
          createPaymentFunction: 'paypal',
          capturePaymentFunction: 'paypal',
          refundPaymentFunction: 'paypal',
          getPaymentStatusFunction: 'paypal',
          generatePaymentLinkFunction: 'paypal',
          handleWebhookFunction: 'paypal'
        }
      } else if (selectedPreset === 'manual') {
        providerData = {
          ...providerData,
          createPaymentFunction: 'manual',
          capturePaymentFunction: 'manual',
          refundPaymentFunction: 'manual',
          getPaymentStatusFunction: 'manual',
          generatePaymentLinkFunction: 'manual',
          handleWebhookFunction: 'manual'
        }
      }
      
      const result = await createPaymentProvider(providerData)
      
      if (result.success) {
        toast.success(`${providerName} created successfully`)
        onCreate?.()
        onClose()
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to create payment provider')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create payment provider')
    } finally {
      setLoading(false)
    }
  }, [selectedPreset, providerName, terminalProtocol, dejavooTpn, dejavooAuthKey, paxIpAddress, paxPort, onCreate, onClose, router])

  const handleClose = useCallback(() => {
    if (!loading) {
      onClose()
    }
  }, [loading, onClose])

  const isFormValid = () => {
    return selectedPreset && providerName.trim()
  }

  return (
    <Drawer open={open} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DrawerContent>
        <DrawerHeader className="flex-shrink-0">
          <DrawerTitle>Connect Payment Provider</DrawerTitle>
          <DrawerDescription>
            Select a payment provider preset (PAX / Dejavoo Terminal, Stripe, PayPal, or Cash)
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {/* Provider Preset Selection */}
              <div>
                <SingleSelect
                  label="Payment Provider Preset"
                  value={selectedPreset}
                  onChange={handlePresetSelect}
                  options={getPresetOptions()}
                  placeholder="Choose a payment provider"
                  searchPlaceholder="Search providers..."
                  emptyIndicator="No providers found"
                />
              </div>

              {selectedProvider && (
                <>
                  {/* Provider Name */}
                  <div>
                    <Label htmlFor="providerName" className="text-sm font-medium">
                      Provider Name
                    </Label>
                    <Input
                      id="providerName"
                      value={providerName}
                      onChange={(e) => setProviderName(e.target.value)}
                      placeholder="Enter provider name"
                      className="mt-1"
                    />
                  </div>

                  {/* Terminal Protocol Options when PAX / Dejavoo Terminal is selected */}
                  {selectedPreset === 'terminal' && (
                    <div className="space-y-4 p-4 rounded-lg border bg-card">
                      <div>
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Default Terminal Hardware Protocol
                        </Label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {(
                            [
                              { id: 'simulated', label: 'Simulated Reader' },
                              { id: 'dejavoo_spin', label: 'Dejavoo SPIN' },
                              { id: 'pax_poslink', label: 'PAX POSLink' },
                            ] as const
                          ).map((opt) => (
                            <Button
                              key={opt.id}
                              type="button"
                              size="sm"
                              variant={terminalProtocol === opt.id ? 'default' : 'outline'}
                              onClick={() => setTerminalProtocol(opt.id)}
                              className="text-xs"
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {terminalProtocol === 'dejavoo_spin' && (
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                          <div>
                            <Label className="text-xs">Dejavoo TPN</Label>
                            <Input
                              value={dejavooTpn}
                              onChange={(e) => setDejavooTpn(e.target.value)}
                              placeholder="203948571029"
                              className="h-8 text-xs font-mono mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">SPIN AuthKey</Label>
                            <Input
                              type="password"
                              value={dejavooAuthKey}
                              onChange={(e) => setDejavooAuthKey(e.target.value)}
                              placeholder="SPIN AuthKey"
                              className="h-8 text-xs font-mono mt-1"
                            />
                          </div>
                        </div>
                      )}

                      {terminalProtocol === 'pax_poslink' && (
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                          <div>
                            <Label className="text-xs">PAX Local IP</Label>
                            <Input
                              value={paxIpAddress}
                              onChange={(e) => setPaxIpAddress(e.target.value)}
                              placeholder="192.168.1.210"
                              className="h-8 text-xs font-mono mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">POSLink Port</Label>
                            <Input
                              value={paxPort}
                              onChange={(e) => setPaxPort(e.target.value)}
                              placeholder="10009"
                              className="h-8 text-xs font-mono mt-1"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Provider Info */}
                  {selectedProvider && (
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        {selectedProvider.description}
                      </p>
                      {selectedProvider.envVars.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {selectedProvider.envVars.map((envVar, index) => (
                            <div key={index}>
                              <code className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded font-mono text-xs">
                                {envVar}
                              </code>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </>
              )}
            </div>
          </div>

          <DrawerFooter className="flex-shrink-0 border-t">
            <div className="flex gap-2 justify-end">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading || !isFormValid()}
                className="min-w-[120px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Provider'
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
