'use client'

import React, { useState, useEffect } from 'react'
import {
  Truck,
  Car,
  Navigation,
  Clock,
  Phone,
  ExternalLink,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Settings,
  DollarSign,
  ChefHat,
  Boxes,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Send,
  Zap,
  MapPin,
  Flame,
  Check,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { DeliveryDispatchRecord, DeliveryHubConfig, DeliveryQuote } from '@/features/integrations/delivery/types'

export function DeliveryHubPage() {
  const [activeTab, setActiveTab] = useState<'radar' | 'marketplace' | 'dispatch' | 'settings' | 'simulator'>('radar')
  const [config, setConfig] = useState<DeliveryHubConfig | null>(null)
  const [dispatches, setDispatches] = useState<DeliveryDispatchRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulationLog, setSimulationLog] = useState<string[]>([])
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Dispatch comparison state
  const [quoteAddress, setQuoteAddress] = useState({
    street: '185 Montague St',
    city: 'Brooklyn',
    state: 'NY',
    zip: '11201',
  })
  const [quoteOrderTotal, setQuoteOrderTotal] = useState(3850)
  const [quotes, setQuotes] = useState<DeliveryQuote[]>([])
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  const [dispatchingProvider, setDispatchingProvider] = useState<'doordash' | 'ubereats' | null>(null)

  // Load initial data
  const fetchData = async () => {
    setLoading(true)
    try {
      const [cfgRes, dispRes] = await Promise.all([
        fetch('/api/integrations/delivery/config'),
        fetch('/api/integrations/delivery/dispatches'),
      ])
      const cfgData = await cfgRes.json()
      const dispData = await dispRes.json()

      if (cfgData.success) setConfig(cfgData.config)
      if (dispData.success) setDispatches(dispData.dispatches || [])
    } catch (err: any) {
      console.error('Failed to load delivery hub data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(() => {
      fetch('/api/integrations/delivery/dispatches')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.dispatches) {
            setDispatches(data.dispatches)
          }
        })
        .catch(() => {})
    }, 8000)
    return () => clearInterval(timer)
  }, [])

  const logSim = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setSimulationLog((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 49)])
  }

  // Request live quotes
  const handleFetchQuotes = async () => {
    setLoadingQuotes(true)
    setMessage(null)
    try {
      const res = await fetch('/api/integrations/delivery/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dropoffAddress: quoteAddress,
          orderTotalCents: quoteOrderTotal,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setQuotes(data.quotes)
        logSim(`Retrieved ${data.quotes.length} live delivery quotes for ${quoteAddress.street}`)
      } else {
        setMessage({ text: data.error || 'Failed to get quotes', type: 'error' })
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setLoadingQuotes(false)
    }
  }

  // Quick Dispatch
  const handleQuickDispatch = async (provider: 'doordash' | 'ubereats', quoteId?: string) => {
    setDispatchingProvider(provider)
    setMessage(null)
    try {
      const orderNum = `ORD-${Math.floor(1000 + Math.random() * 9000)}`
      const res = await fetch('/api/integrations/delivery/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          quoteId,
          order: {
            orderNumber: orderNum,
            customerName: 'Marcus Vance',
            customerPhone: '(555) 349-2041',
            deliveryAddress: quoteAddress.street,
            deliveryCity: quoteAddress.city,
            deliveryState: quoteAddress.state,
            deliveryZip: quoteAddress.zip,
            totalCents: quoteOrderTotal,
            tipCents: 400,
            specialInstructions: 'Ring bell 2B, leave at door.',
          },
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ text: `Courier dispatched via ${provider.toUpperCase()} (${data.dispatch.deliveryId})!`, type: 'success' })
        logSim(`Dispatched courier via ${provider.toUpperCase()} (ID: ${data.dispatch.deliveryId})`)
        fetchData()
        setActiveTab('radar')
      } else {
        setMessage({ text: data.error || 'Dispatch failed', type: 'error' })
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setDispatchingProvider(null)
    }
  }

  // Simulate Inbound Marketplace Order
  const handleSimulateInbound = async (provider: 'doordash' | 'ubereats') => {
    setSimulating(true)
    setMessage(null)
    try {
      const res = await fetch('/api/integrations/delivery/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inject_marketplace_order',
          provider,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ text: data.message, type: 'success' })
        logSim(`Injected ${provider.toUpperCase()} marketplace order ${data.result.orderNumber}: KDS tickets created, BOM inventory depleted.`)
        fetchData()
      } else {
        setMessage({ text: data.error || 'Simulation failed', type: 'error' })
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setSimulating(false)
    }
  }

  // Advance courier status
  const handleAdvanceStatus = async (deliveryId: string) => {
    try {
      const res = await fetch('/api/integrations/delivery/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance_courier_status',
          deliveryId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        logSim(data.message)
        setDispatches((prev) =>
          prev.map((d) => (d.deliveryId === deliveryId ? data.dispatch : d))
        )
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Save Settings
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!config) return
    setSavingConfig(true)
    setMessage(null)
    try {
      const res = await fetch('/api/integrations/delivery/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (data.success) {
        setConfig(data.config)
        setMessage({ text: 'Delivery Hub configuration saved successfully!', type: 'success' })
        logSim('Updated DoorDash & Uber provider credentials and automation settings.')
      } else {
        setMessage({ text: data.error || 'Failed to save', type: 'error' })
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setSavingConfig(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'courier_assigned':
        return <Badge className="bg-amber-500/15 text-amber-600 border border-amber-500/30">Courier Assigned</Badge>
      case 'at_store':
        return <Badge className="bg-purple-500/15 text-purple-600 border border-purple-500/30">At Restaurant</Badge>
      case 'picked_up':
        return <Badge className="bg-blue-500/15 text-blue-600 border border-blue-500/30 animate-pulse">In Transit</Badge>
      case 'delivered':
        return <Badge className="bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">Delivered</Badge>
      case 'cancelled':
        return <Badge className="bg-red-500/15 text-red-600 border border-red-500/30">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const activeDispatches = dispatches.filter((d) => d.status !== 'delivered' && d.status !== 'cancelled')
  const completedDispatches = dispatches.filter((d) => d.status === 'delivered')

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 pb-16">
      {/* Header Breadcrumbs & Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <PageBreadcrumbs
            items={[
              { type: 'link', label: 'Dashboard', href: '/dashboard' },
              { type: 'page', label: 'Delivery Hub' },
            ]}
          />
          <div className="mt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-red-500/20">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    Delivery & Marketplace Hub
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gradient-to-r from-red-500/10 to-amber-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                      DoorDash • Uber Eats
                    </span>
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Dual-channel logistics: on-demand white-label fleet dispatch and marketplace aggregation.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={loading}
                className="gap-1.5 text-xs h-9"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => handleSimulateInbound('doordash')}
                disabled={simulating}
                className="gap-1.5 text-xs h-9 bg-red-600 hover:bg-red-700 text-white shadow-sm"
              >
                <Zap className="h-3.5 w-3.5" />
                + Inbound DoorDash Order
              </Button>
              <Button
                size="sm"
                onClick={() => handleSimulateInbound('ubereats')}
                disabled={simulating}
                className="gap-1.5 text-xs h-9 bg-slate-900 hover:bg-black text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 shadow-sm"
              >
                <Zap className="h-3.5 w-3.5" />
                + Inbound Uber Order
              </Button>
            </div>
          </div>

          {/* Banner notification */}
          {message && (
            <div
              className={`mt-4 p-3 rounded-lg flex items-center gap-2.5 text-xs font-medium ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 sm:gap-2 mt-5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-px">
            <button
              onClick={() => setActiveTab('radar')}
              className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'radar'
                  ? 'border-red-600 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Navigation className="h-4 w-4" />
              Active Fleet Radar
              {activeDispatches.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs font-semibold bg-red-600 text-white">
                  {activeDispatches.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('dispatch')}
              className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'dispatch'
                  ? 'border-red-600 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Car className="h-4 w-4" />
              Live Quote & Dispatch
            </button>

            <button
              onClick={() => setActiveTab('marketplace')}
              className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'marketplace'
                  ? 'border-red-600 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ChefHat className="h-4 w-4" />
              Marketplace & KDS Sync
            </button>

            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'simulator'
                  ? 'border-red-600 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Webhook Simulator
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'border-red-600 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Settings className="h-4 w-4" />
              Provider Credentials
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Real-time KPI Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Couriers</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{activeDispatches.length}</p>
                <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live GPS tracking active
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center">
                <Car className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">DoorDash Drive</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {config?.doordash?.enabled ? 'Online' : 'Disabled'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {config?.doordash?.sandbox ? 'Sandbox Mode' : 'Production Live'}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center font-bold text-xs">
                DD
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Uber Direct</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {config?.ubereats?.enabled ? 'Online' : 'Disabled'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {config?.ubereats?.sandbox ? 'Sandbox Mode' : 'Production Live'}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                UBER
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Automation Pipeline</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">100%</p>
                <p className="text-[11px] text-slate-500 mt-0.5">KDS Sync & BOM Depletion</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* TAB 1: FLEET RADAR */}
        {activeTab === 'radar' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Active Courier Radar</h2>
                <p className="text-xs text-slate-500">
                  Real-time status of on-demand drivers assigned through DoorDash Drive and Uber Direct.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveTab('dispatch')}
                className="text-xs gap-1"
              >
                + New Fleet Dispatch
              </Button>
            </div>

            {activeDispatches.length === 0 ? (
              <Card className="border-dashed border-2 border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-12 text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                  <Navigation className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">No active courier deliveries</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  All couriers have completed their routes or no on-demand dispatches are currently in flight.
                </p>
                <div className="flex justify-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setActiveTab('dispatch')}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs"
                  >
                    Compare Quotes & Dispatch
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickDispatch('doordash')}
                    className="text-xs"
                  >
                    Quick DoorDash Test
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {activeDispatches.map((record) => (
                  <Card
                    key={record.deliveryId}
                    className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div
                      className={`h-1.5 w-full ${
                        record.provider === 'doordash' ? 'bg-red-600' : 'bg-slate-900 dark:bg-emerald-500'
                      }`}
                    />
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                          Order {record.orderNumber}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                              record.provider === 'doordash'
                                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-emerald-400'
                            }`}
                          >
                            {record.provider === 'doordash' ? 'DoorDash Drive' : 'Uber Direct'}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        {getStatusBadge(record.status)}
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          ETA: {new Date(record.dropoffEta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 pt-2 text-xs space-y-3">
                      {/* Courier Information */}
                      {record.courier && (
                        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2.5 border border-slate-100 dark:border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between font-medium">
                            <span className="text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Car className="h-3.5 w-3.5 text-slate-500" />
                              {record.courier.name}
                            </span>
                            <span className="text-slate-500 font-mono text-[11px]">{record.courier.phone}</span>
                          </div>
                          <p className="text-[11px] text-slate-500">{record.courier.vehicleType}</p>
                        </div>
                      )}

                      {/* Addresses */}
                      <div className="space-y-1">
                        <p className="text-slate-400 text-[10px] uppercase font-semibold">Destination</p>
                        <p className="text-slate-700 dark:text-slate-300 font-medium truncate flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                          {record.dropoffAddress}
                        </p>
                      </div>

                      {/* Fee & Action */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          ${(record.feeCents / 100).toFixed(2)} Fee
                        </span>
                        <div className="flex items-center gap-1.5">
                          {record.trackingUrl && (
                            <a
                              href={record.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-red-600 hover:text-red-700 dark:text-red-400 font-medium flex items-center gap-1 hover:underline"
                            >
                              Live Map <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAdvanceStatus(record.deliveryId)}
                            className="h-7 text-[11px] px-2 gap-1"
                          >
                            Step Status <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Completed history */}
            {completedDispatches.length > 0 && (
              <div className="mt-10">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Recently Delivered</h3>
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5">Order</th>
                        <th className="px-4 py-2.5">Carrier</th>
                        <th className="px-4 py-2.5">Courier</th>
                        <th className="px-4 py-2.5">Delivered At</th>
                        <th className="px-4 py-2.5">Fee</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {completedDispatches.slice(0, 5).map((d) => (
                        <tr key={d.deliveryId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-2.5 font-medium">{d.orderNumber}</td>
                          <td className="px-4 py-2.5 uppercase font-medium">{d.provider}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{d.courier?.name || 'Assigned Driver'}</td>
                          <td className="px-4 py-2.5 text-slate-500">{new Date(d.updatedAt).toLocaleTimeString()}</td>
                          <td className="px-4 py-2.5 font-medium">${(d.feeCents / 100).toFixed(2)}</td>
                          <td className="px-4 py-2.5">{getStatusBadge(d.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LIVE QUOTE & DISPATCH */}
        {activeTab === 'dispatch' && (
          <div className="max-w-4xl space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Comparative Courier Dispatch</h2>
              <p className="text-xs text-slate-500">
                Compare real-time rates and pickup ETAs between DoorDash Drive and Uber Direct for on-demand customer delivery.
              </p>
            </div>

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">1. Delivery Dropoff Destination</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Street Address</label>
                    <Input
                      value={quoteAddress.street}
                      onChange={(e) => setQuoteAddress({ ...quoteAddress, street: e.target.value })}
                      placeholder="e.g. 185 Montague St, Apt 4"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">ZIP Code</label>
                    <Input
                      value={quoteAddress.zip}
                      onChange={(e) => setQuoteAddress({ ...quoteAddress, zip: e.target.value })}
                      placeholder="11201"
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">City / State</label>
                    <Input
                      value={`${quoteAddress.city}, ${quoteAddress.state}`}
                      readOnly
                      className="text-xs bg-slate-50 dark:bg-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Order Total (Cents)</label>
                    <Input
                      type="number"
                      value={quoteOrderTotal}
                      onChange={(e) => setQuoteOrderTotal(Number(e.target.value))}
                      className="text-xs"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleFetchQuotes}
                  disabled={loadingQuotes}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs gap-1.5"
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  {loadingQuotes ? 'Querying DoorDash & Uber...' : 'Get Live Courier Quotes'}
                </Button>
              </CardContent>
            </Card>

            {quotes.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">2. Select Logistics Provider</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {quotes.map((q) => {
                    const isDoorDash = q.provider === 'doordash'
                    return (
                      <Card
                        key={q.quoteId}
                        className={`border-2 transition-all cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 ${
                          isDoorDash ? 'border-red-500/40 bg-red-50/20' : 'border-slate-700/40 bg-slate-50/20'
                        }`}
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                              {isDoorDash ? 'DoorDash Drive' : 'Uber Direct'}
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Best Rate
                              </span>
                            </span>
                            <span className="text-xl font-bold text-slate-900 dark:text-white">
                              ${(q.feeCents / 100).toFixed(2)}
                            </span>
                          </div>
                          <CardDescription className="text-xs">
                            Estimated pickup in {q.estimatedPickupMinutes} min • Dropoff in {q.estimatedDeliveryMinutes} min
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                          <div className="text-xs space-y-1 mb-4 text-slate-500">
                            <div className="flex justify-between">
                              <span>Estimated Transit:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{q.durationMinutes} minutes</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Quote Valid For:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">15 minutes</span>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleQuickDispatch(q.provider, q.quoteId)}
                            disabled={dispatchingProvider !== null}
                            className={`w-full text-xs font-semibold ${
                              isDoorDash
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-slate-900 hover:bg-black text-white dark:bg-emerald-600 dark:hover:bg-emerald-700'
                            }`}
                          >
                            {dispatchingProvider === q.provider ? 'Dispatching...' : `Dispatch with ${isDoorDash ? 'DoorDash' : 'Uber'}`}
                          </Button>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MARKETPLACE & KDS SYNC */}
        {activeTab === 'marketplace' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Marketplace Order Ingestion & Routing</h2>
              <p className="text-xs text-slate-500">
                Inbound customer orders placed on DoorDash Marketplace and Uber Eats apps are automatically accepted, routed to KDS, and deplete BOM inventory.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="p-5 pb-2">
                  <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center mb-2">
                    <ChefHat className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-sm font-semibold">1. Instant KDS Ticket Routing</CardTitle>
                  <CardDescription className="text-xs">
                    Inbound orders are automatically split by kitchen station (Prep, Grill, Fryer, Assembly) based on menu item tags.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-2">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between font-medium">
                      <span>Kitchen Sync:</span>
                      <span className="text-emerald-600 flex items-center gap-1">
                        <Check className="h-3 w-3" /> Active
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Cooks see incoming marketplace tickets immediately on the Kitchen Display System.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Feature 2 */}
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="p-5 pb-2">
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mb-2">
                    <Boxes className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-sm font-semibold">2. BOM Inventory Auto-Depletion</CardTitle>
                  <CardDescription className="text-xs">
                    Each marketplace order depletes raw ingredients (flour, cheese, meat) using defined Bill of Materials recipes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-2">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between font-medium">
                      <span>Recipe Ledger:</span>
                      <span className="text-emerald-600 flex items-center gap-1">
                        <Check className="h-3 w-3" /> 100% Coverage
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Automatic FIFO stock adjustment prevents stockouts during peak delivery hours.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Feature 3 */}
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="p-5 pb-2">
                  <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center mb-2">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-sm font-semibold">3. Webhook Idempotency & HMAC</CardTitle>
                  <CardDescription className="text-xs">
                    Cryptographic signature validation prevents duplicate orders or replay attacks across all channels.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-2">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between font-medium">
                      <span>HMAC SHA-256:</span>
                      <span className="text-blue-600 font-mono text-[11px]">Validated</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      External order IDs are deduplicated to guarantee exactly-once order creation.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Test Triggers */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="p-5 pb-2">
                <CardTitle className="text-sm font-semibold">Test Inbound Marketplace Ingestion</CardTitle>
                <CardDescription className="text-xs">
                  Generate a simulated delivery marketplace order to verify KDS routing and BOM ledger updates in real time.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-2 flex flex-wrap gap-3">
                <Button
                  onClick={() => handleSimulateInbound('doordash')}
                  disabled={simulating}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs gap-1.5"
                >
                  <Flame className="h-3.5 w-3.5" />
                  Simulate DoorDash Inbound Order
                </Button>
                <Button
                  onClick={() => handleSimulateInbound('ubereats')}
                  disabled={simulating}
                  className="bg-slate-900 hover:bg-black text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 text-xs gap-1.5"
                >
                  <Car className="h-3.5 w-3.5" />
                  Simulate Uber Eats Inbound Order
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 4: WEBHOOK SIMULATOR CONSOLE */}
        {activeTab === 'simulator' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sandbox Webhook & Event Console</h2>
              <p className="text-xs text-slate-500">
                Trigger real-time webhook scenarios and observe live pipeline responses.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Triggers Column */}
              <div className="space-y-4">
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-xs font-semibold uppercase text-slate-500">Quick Simulation Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-2.5">
                    <Button
                      onClick={() => handleSimulateInbound('doordash')}
                      disabled={simulating}
                      variant="outline"
                      className="w-full justify-start text-xs h-9 gap-2 border-red-200 hover:bg-red-50 text-red-700 dark:border-red-900 dark:hover:bg-red-950/40 dark:text-red-300"
                    >
                      <Zap className="h-3.5 w-3.5 text-red-600" />
                      Inject DoorDash Marketplace Order
                    </Button>

                    <Button
                      onClick={() => handleSimulateInbound('ubereats')}
                      disabled={simulating}
                      variant="outline"
                      className="w-full justify-start text-xs h-9 gap-2 border-slate-200 hover:bg-slate-50 text-slate-800 dark:border-slate-800 dark:hover:bg-slate-800/40 dark:text-slate-300"
                    >
                      <Zap className="h-3.5 w-3.5 text-slate-700 dark:text-emerald-400" />
                      Inject Uber Eats Marketplace Order
                    </Button>

                    <Button
                      onClick={() => handleQuickDispatch('doordash')}
                      disabled={dispatchingProvider !== null}
                      variant="outline"
                      className="w-full justify-start text-xs h-9 gap-2"
                    >
                      <Car className="h-3.5 w-3.5 text-blue-600" />
                      Dispatch White-Label DoorDash Drive Courier
                    </Button>

                    <Button
                      onClick={() => handleQuickDispatch('ubereats')}
                      disabled={dispatchingProvider !== null}
                      variant="outline"
                      className="w-full justify-start text-xs h-9 gap-2"
                    >
                      <Car className="h-3.5 w-3.5 text-emerald-600" />
                      Dispatch White-Label Uber Direct Courier
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 dark:border-slate-800 shadow-sm p-4 text-xs space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-white">Active Webhook Endpoints</p>
                  <div className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <p className="p-1.5 rounded bg-slate-100 dark:bg-slate-900 truncate">
                      POST /api/integrations/delivery/doordash/webhook
                    </p>
                    <p className="p-1.5 rounded bg-slate-100 dark:bg-slate-900 truncate">
                      POST /api/integrations/delivery/ubereats/webhook
                    </p>
                  </div>
                </Card>
              </div>

              {/* Event Logs Console */}
              <div className="lg:col-span-2">
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-slate-950 text-slate-200 font-mono">
                  <div className="flex items-center justify-between p-3 border-b border-slate-800">
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Live Event Bus Console
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSimulationLog([])}
                      className="h-6 text-[11px] text-slate-400 hover:text-white"
                    >
                      Clear
                    </Button>
                  </div>
                  <CardContent className="p-4 h-[380px] overflow-y-auto text-xs space-y-1.5">
                    {simulationLog.length === 0 ? (
                      <p className="text-slate-500 italic">No events logged yet. Trigger a simulation or dispatch above.</p>
                    ) : (
                      simulationLog.map((log, i) => (
                        <div key={i} className="text-slate-300 border-l-2 border-red-500/50 pl-2 py-0.5 leading-relaxed">
                          {log}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: PROVIDER CREDENTIALS & AUTOMATION SETTINGS */}
        {activeTab === 'settings' && config && (
          <form onSubmit={handleSaveConfig} className="max-w-4xl space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Provider Credentials & Automation Rules</h2>
              <p className="text-xs text-slate-500">
                Configure DoorDash Drive developer keys, Uber Direct credentials, and fulfillment automation behaviors.
              </p>
            </div>

            {/* Automation Rules */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Automated Fulfillment Rules
                </CardTitle>
                <CardDescription className="text-xs">
                  Govern how inbound marketplace orders and outbound courier dispatches run without manual staff intervention.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Auto-Accept Inbound Marketplace Orders</p>
                    <p className="text-[11px] text-slate-500">Automatically accept orders from DoorDash & Uber Eats apps without requiring manager confirmation.</p>
                  </div>
                  <Switch
                    checked={config.doordash.autoAcceptMarketplaceOrders}
                    onCheckedChange={(val) =>
                      setConfig({
                        ...config,
                        doordash: { ...config.doordash, autoAcceptMarketplaceOrders: val },
                        ubereats: { ...config.ubereats, autoAcceptMarketplaceOrders: val },
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Instant Kitchen Ticket Routing (KDS)</p>
                    <p className="text-[11px] text-slate-500">Instantly generate and route prep tickets to corresponding kitchen stations.</p>
                  </div>
                  <Switch
                    checked={config.doordash.autoSyncKDS}
                    onCheckedChange={(val) =>
                      setConfig({
                        ...config,
                        doordash: { ...config.doordash, autoSyncKDS: val },
                        ubereats: { ...config.ubereats, autoSyncKDS: val },
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Bill of Materials (BOM) Auto-Depletion</p>
                    <p className="text-[11px] text-slate-500">Deduct raw food ingredients from kitchen inventory when an order arrives.</p>
                  </div>
                  <Switch
                    checked={config.doordash.autoDepleteBOMInventory}
                    onCheckedChange={(val) =>
                      setConfig({
                        ...config,
                        doordash: { ...config.doordash, autoDepleteBOMInventory: val },
                        ubereats: { ...config.ubereats, autoDepleteBOMInventory: val },
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Auto-Dispatch Courier When Kitchen Marks Ready</p>
                    <p className="text-[11px] text-slate-500">Trigger on-demand DoorDash / Uber driver dispatch automatically when cook clicks "Order Ready" on KDS.</p>
                  </div>
                  <Switch
                    checked={config.doordash.autoDispatchOnKitchenReady}
                    onCheckedChange={(val) =>
                      setConfig({
                        ...config,
                        doordash: { ...config.doordash, autoDispatchOnKitchenReady: val },
                        ubereats: { ...config.ubereats, autoDispatchOnKitchenReady: val },
                      })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* DoorDash Credentials Card */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-600" />
                    DoorDash Drive & Marketplace API
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Sandbox</span>
                    <Switch
                      checked={config.doordash.sandbox}
                      onCheckedChange={(val) =>
                        setConfig({
                          ...config,
                          doordash: { ...config.doordash, sandbox: val },
                        })
                      }
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Developer ID</label>
                    <Input
                      value={config.doordash.doorDashDeveloperId || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          doordash: { ...config.doordash, doorDashDeveloperId: e.target.value },
                        })
                      }
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Key ID (kid)</label>
                    <Input
                      value={config.doordash.doorDashKeyId || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          doordash: { ...config.doordash, doorDashKeyId: e.target.value },
                        })
                      }
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Base64 Signing Secret</label>
                    <Input
                      type="password"
                      value={config.doordash.doorDashSigningSecret || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          doordash: { ...config.doordash, doorDashSigningSecret: e.target.value },
                        })
                      }
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Business / Store ID</label>
                    <Input
                      value={config.doordash.doorDashBusinessId || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          doordash: { ...config.doordash, doorDashBusinessId: e.target.value },
                        })
                      }
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Uber Direct Credentials Card */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-slate-900 dark:bg-emerald-500" />
                    Uber Direct & Uber Eats Marketplace API
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Sandbox</span>
                    <Switch
                      checked={config.ubereats.sandbox}
                      onCheckedChange={(val) =>
                        setConfig({
                          ...config,
                          ubereats: { ...config.ubereats, sandbox: val },
                        })
                      }
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">OAuth Client ID</label>
                    <Input
                      value={config.ubereats.uberClientId || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          ubereats: { ...config.ubereats, uberClientId: e.target.value },
                        })
                      }
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">OAuth Client Secret</label>
                    <Input
                      type="password"
                      value={config.ubereats.uberClientSecret || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          ubereats: { ...config.ubereats, uberClientSecret: e.target.value },
                        })
                      }
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Customer Organization ID</label>
                  <Input
                    value={config.ubereats.uberCustomerId || ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        ubereats: { ...config.ubereats, uberCustomerId: e.target.value },
                      })
                    }
                    className="text-xs font-mono"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button
                type="submit"
                disabled={savingConfig}
                className="bg-red-600 hover:bg-red-700 text-white text-xs px-6"
              >
                {savingConfig ? 'Saving Settings...' : 'Save Configuration'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
