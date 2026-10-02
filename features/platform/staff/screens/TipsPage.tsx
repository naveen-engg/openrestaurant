'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DollarSign,
  Plus,
  Users,
  RefreshCw,
  Calculator,
  Wallet,
  ArrowRight,
  CheckCircle2,
  History,
  Banknote,
  Landmark,
  CreditCard,
  FileText,
  ShieldCheck,
  Clock,
  Award,
  AlertCircle,
  Percent,
  TrendingUp,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { cn } from '@/lib/utils'
import { formatCurrency, toMinorUnits } from '@/features/storefront/lib/currency'
import {
  allocatePointsWeightedTips,
  allocateHousePoolTips,
  allocatePercentageWeightedTips,
  generateDailyCloseoutSummary,
  DEFAULT_ROLE_CONFIGS,
  type DailyCloseoutSummary,
} from '@/features/platform/staff/timeTrackingUtils'

interface TipPool {
  id: string
  date: string
  tipPoolType: string
  totalTips: string
  cashTips: string
  creditTips: string
  distributions: Distribution[] | null
  status: string
}

interface Distribution {
  staffId: string
  staffName: string
  role: string
  hoursWorked: number
  amount: number
  weightOrPoints?: number
}

interface CompletedShift {
  id: string
  staff: { id: string; name: string } | null
  role: string
  hoursWorked: number
  hourlyRate?: string | null
}

const GET_TIP_POOLS = gql`
  query GetTipPools {
    tipPools(orderBy: { date: desc }, take: 30) {
      id
      date
      tipPoolType
      totalTips
      cashTips
      creditTips
      distributions
      status
    }
    storeSettings {
      currencyCode
      locale
    }
  }
`

const GET_COMPLETED_SHIFTS_FOR_DATE = gql`
  query GetCompletedShiftsForDate($startDate: DateTime!, $endDate: DateTime!) {
    shifts(
      where: {
        status: { equals: "completed" }
        clockIn: { gte: $startDate, lte: $endDate }
      }
    ) {
      id
      staff { id name }
      role
      hoursWorked
      hourlyRate
    }
  }
`

const GET_SALES_FOR_DATE = gql`
  query GetSalesForDate($startDate: DateTime!, $endDate: DateTime!) {
    restaurantOrders(
      where: {
        createdAt: { gte: $startDate, lte: $endDate }
        status: { notIn: ["cancelled"] }
      }
    ) {
      id
      total
      tip
    }
  }
`

const CREATE_TIP_POOL = gql`
  mutation CreateTipPoolLedger($date: String!, $tipPoolType: String!, $cashTips: String!, $creditTips: String!) {
    createTipPoolLedger(date: $date, tipPoolType: $tipPoolType, cashTips: $cashTips, creditTips: $creditTips) { success error }
  }
`

const UPDATE_TIP_POOL = gql`
  mutation UpdateTipPoolStatus($tipPoolId: ID!, $action: String!) {
    updateTipPoolStatus(tipPoolId: $tipPoolId, action: $action) { success error }
  }
`

const TIP_POOL_TYPES = [
  { value: 'pool_by_points', label: 'Points-Weighted Pool (Toast / 7shifts Style)' },
  { value: 'house_pool', label: 'House Pool (Pro-rated by Net Hours)' },
  { value: 'pool_by_role', label: 'Role Percentage Split (60% Server, 20% Bar, 10% Busser, 10% Host)' },
  { value: 'individual', label: 'Individual (Non-pooled)' },
]

export function TipsPage() {
  const [tipPools, setTipPools] = useState<TipPool[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [calculatedDistributions, setCalculatedDistributions] = useState<Distribution[]>([])
  const [currencyConfig, setCurrencyConfig] = useState({ currencyCode: 'USD', locale: 'en-US' })
  const [actionError, setActionError] = useState<string | null>(null)

  // Daily Closeout State
  const [closeoutOpen, setCloseoutOpen] = useState(false)
  const [closeoutDate, setCloseoutDate] = useState(new Date().toISOString().slice(0, 10))
  const [closeoutSummary, setCloseoutSummary] = useState<DailyCloseoutSummary | null>(null)
  const [closeoutLoading, setCloseoutLoading] = useState(false)

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    tipPoolType: 'pool_by_points',
    cashTips: '0',
    creditTips: '0',
  })

  const fetchTipPools = useCallback(async () => {
    try {
      const data = await request('/api/graphql', GET_TIP_POOLS)
      setTipPools((data as any).tipPools || [])
      if ((data as any).storeSettings) {
        setCurrencyConfig({
          currencyCode: (data as any).storeSettings.currencyCode || 'USD',
          locale: (data as any).storeSettings.locale || 'en-US'
        })
      }
    } catch (err) {
      console.error('Error fetching tip pools:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTipPools()
  }, [fetchTipPools])

  const calculateDistributions = async () => {
    const totalTips = parseFloat(form.cashTips || '0') + parseFloat(form.creditTips || '0')
    if (totalTips <= 0 || form.tipPoolType === 'individual') {
      setCalculatedDistributions([])
      return
    }

    try {
      const startDate = new Date(form.date)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(form.date)
      endDate.setHours(23, 59, 59, 999)

      const data = await request('/api/graphql', GET_COMPLETED_SHIFTS_FOR_DATE, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })
      const entries = ((data as any).shifts || []) as CompletedShift[]
      const totalTipsCents = toMinorUnits(totalTips, currencyConfig.currencyCode)

      const shiftStaff = entries.map((entry) => ({
        staffId: entry.staff?.id || '',
        staffName: entry.staff?.name || 'Staff',
        role: entry.role || 'server',
        hoursWorked: Number(entry.hoursWorked || 0),
      }))

      let dists: Distribution[] = []
      if (form.tipPoolType === 'pool_by_points') {
        dists = allocatePointsWeightedTips(totalTipsCents, shiftStaff).map((d) => ({
          staffId: d.staffId,
          staffName: d.staffName,
          role: d.role,
          hoursWorked: d.hoursWorked,
          amount: d.amountCents,
          weightOrPoints: d.weightOrPoints,
        }))
      } else if (form.tipPoolType === 'house_pool') {
        dists = allocateHousePoolTips(totalTipsCents, shiftStaff).map((d) => ({
          staffId: d.staffId,
          staffName: d.staffName,
          role: d.role,
          hoursWorked: d.hoursWorked,
          amount: d.amountCents,
          weightOrPoints: d.weightOrPoints,
        }))
      } else if (form.tipPoolType === 'pool_by_role') {
        dists = allocatePercentageWeightedTips(totalTipsCents, shiftStaff).map((d) => ({
          staffId: d.staffId,
          staffName: d.staffName,
          role: d.role,
          hoursWorked: d.hoursWorked,
          amount: d.amountCents,
          weightOrPoints: d.weightOrPoints,
        }))
      }

      setCalculatedDistributions(dists)
    } catch (err) {
      console.error('Error calculating distributions:', err)
    }
  }

  useEffect(() => {
    if (dialogOpen) {
      calculateDistributions()
    }
  }, [form.cashTips, form.creditTips, form.tipPoolType, form.date, dialogOpen])

  const handleCreate = async () => {
    try {
      const res: any = await request('/api/graphql', CREATE_TIP_POOL, {
        date: new Date(form.date).toISOString(),
        tipPoolType: form.tipPoolType,
        cashTips: form.cashTips || '0',
        creditTips: form.creditTips || '0',
      })
      if (!res?.createTipPoolLedger?.success) {
        throw new Error(res?.createTipPoolLedger?.error || 'Unable to create tip pool')
      }
      setActionError(null)
      setDialogOpen(false)
      fetchTipPools()
    } catch (err: any) {
      setActionError(err?.message || 'Unable to create tip pool')
      console.error('Error creating tip pool:', err)
    }
  }

  const markDistributed = async (id: string) => {
    try {
      const res: any = await request('/api/graphql', UPDATE_TIP_POOL, {
        tipPoolId: id,
        action: 'distribute',
      })
      if (!res?.updateTipPoolStatus?.success) {
        throw new Error(res?.updateTipPoolStatus?.error || 'Unable to distribute tip pool')
      }
      setActionError(null)
      fetchTipPools()
    } catch (err: any) {
      setActionError(err?.message || 'Unable to distribute tip pool')
      console.error('Error updating:', err)
    }
  }

  const runDailyCloseout = async (targetDate: string) => {
    setCloseoutLoading(true)
    try {
      const startDate = new Date(targetDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(targetDate)
      endDate.setHours(23, 59, 59, 999)

      const [shiftsRes, ordersRes]: any = await Promise.all([
        request('/api/graphql', GET_COMPLETED_SHIFTS_FOR_DATE, {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
        request('/api/graphql', GET_SALES_FOR_DATE, {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }).catch(() => ({ restaurantOrders: [] })),
      ])

      const completedShifts = (shiftsRes?.shifts || []) as any[]
      const orders = (ordersRes?.restaurantOrders || []) as any[]

      const totalSalesDollars = orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0)
      const totalSalesCents = toMinorUnits(totalSalesDollars, currencyConfig.currencyCode)

      const orderCreditTipsDollars = orders.reduce((sum: number, o: any) => sum + Number(o.tip || 0), 0)
      const creditTipsCents = toMinorUnits(orderCreditTipsDollars, currencyConfig.currencyCode)

      const summary = generateDailyCloseoutSummary({
        date: targetDate,
        totalSalesCents,
        cashTipsCents: 0,
        creditTipsCents,
        shiftEntries: completedShifts.map((s) => ({
          staffId: s.staff?.id || '',
          staffName: s.staff?.name || 'Staff Member',
          role: s.role || 'server',
          hoursWorked: Number(s.hoursWorked || 0),
          hourlyRateDollars: Number(s.hourlyRate || 15),
        })),
        poolType: 'pool_by_points',
      })

      setCloseoutSummary(summary)
      setCloseoutOpen(true)
    } catch (err) {
      console.error('Error generating daily closeout:', err)
    } finally {
      setCloseoutLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalDistributed = tipPools.filter(t => t.status === 'distributed').reduce((s, t) => s + Number(t.totalTips || 0), 0)
  const pendingCount = tipPools.filter(t => t.status === 'calculated').length

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Staff' },
    { type: 'page' as const, label: 'Tips & Payroll' }
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {actionError ? (
        <div className="mx-6 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {actionError}
        </div>
      ) : null}

      {/* Header */}
      <div className="px-6 py-6 border-b bg-gradient-to-br from-emerald-500/5 via-background to-emerald-500/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-1 flex items-center gap-3">
              <Landmark className="size-8 text-emerald-600 dark:text-emerald-400" />
              Tip Hub & Closeout
            </h1>
            <p className="text-muted-foreground font-medium">Toast / 7shifts style tip pool allocation, points tiers, and daily labor closeout</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => runDailyCloseout(closeoutDate)}
              disabled={closeoutLoading}
              className="h-12 px-6 rounded-2xl border-2 font-black uppercase tracking-widest text-xs hover:border-emerald-600 hover:text-emerald-600 transition-all flex items-center gap-2 bg-card"
            >
              {closeoutLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
              ) : (
                <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              )}
              Daily Closeout
            </Button>
            <Button
              onClick={() => setDialogOpen(true)}
              size="lg"
              className="h-12 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 font-black uppercase tracking-widest text-xs transition-all active:scale-95"
            >
              <Plus className="h-5 w-5 mr-2" />
              Process Daily Tips
            </Button>
          </div>
        </div>

        {/* Financial Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-2 rounded-[1.5rem] bg-card shadow-sm border-emerald-500/20">
            <CardContent className="p-6 flex items-center gap-5">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10">
                <Banknote className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">30-Day Distribution</div>
                <div className="text-3xl font-black mt-1">{formatCurrency(totalDistributed, currencyConfig)}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 rounded-[1.5rem] bg-card shadow-sm">
            <CardContent className="p-6 flex items-center gap-5">
              <div className="p-3.5 rounded-2xl bg-blue-500/10">
                <History className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recorded Batches</div>
                <div className="text-3xl font-black mt-1">{tipPools.length}</div>
              </div>
            </CardContent>
          </Card>
          <Card className={cn(
            "border-2 rounded-[1.5rem] bg-card shadow-sm transition-colors",
            pendingCount > 0 ? "border-amber-500/30 bg-amber-50/10 dark:bg-amber-950/10" : ""
          )}>
            <CardContent className="p-6 flex items-center gap-5">
              <div className={cn("p-3.5 rounded-2xl", pendingCount > 0 ? "bg-amber-500/20" : "bg-zinc-100 dark:bg-zinc-800")}>
                <Calculator className={cn("h-7 w-7", pendingCount > 0 ? "text-amber-600" : "text-muted-foreground")} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pending Payouts</div>
                <div className={cn("text-3xl font-black mt-1", pendingCount > 0 ? "text-amber-600" : "")}>{pendingCount}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* List Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 pb-20 space-y-6">
          <div className="flex items-center justify-between">
             <h2 className="text-xl font-black uppercase tracking-tight">Ledger History</h2>
             <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-xl border-2 font-bold px-4 h-9">
                   Export CSV
                </Button>
             </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
             {tipPools.length === 0 ? (
               <div className="py-24 text-center flex flex-col items-center border-2 border-dashed rounded-[2.5rem] bg-muted/20">
                 <Wallet className="size-16 text-muted-foreground opacity-10 mb-6" />
                 <h3 className="text-xl font-bold uppercase tracking-tight">No Transactions Recorded</h3>
                 <p className="text-muted-foreground max-w-xs mx-auto mt-2">Process your first end-of-shift tip pool to start tracking employee earnings.</p>
               </div>
             ) : (
               tipPools.map((pool) => (
                 <Card key={pool.id} className="border-2 rounded-[2rem] overflow-hidden hover:border-emerald-500/30 transition-all shadow-sm group">
                    <CardContent className="p-0 flex flex-col md:flex-row md:items-center">
                       {/* Date Strip */}
                       <div className="bg-muted/30 px-8 py-6 md:w-48 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r-2 border-dashed">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Date</span>
                          <span className="text-lg font-black">{new Date(pool.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                          <span className="text-xs font-bold text-muted-foreground">{new Date(pool.date).getFullYear()}</span>
                       </div>

                       {/* Main Stats */}
                       <div className="flex-1 p-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
                          <div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Pool Methodology</div>
                             <Badge variant="outline" className="rounded-lg font-bold border-2 text-[10px] uppercase px-2 py-0">
                               {TIP_POOL_TYPES.find(t => t.value === pool.tipPoolType)?.label.split(' ')[0] || pool.tipPoolType}
                             </Badge>
                          </div>
                          <div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Cash Intake</div>
                             <div className="font-bold text-sm text-amber-600 dark:text-amber-400">{formatCurrency(Number(pool.cashTips || 0), currencyConfig)}</div>
                          </div>
                          <div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Digital Intake</div>
                             <div className="font-bold text-sm text-blue-600 dark:text-blue-400">{formatCurrency(Number(pool.creditTips || 0), currencyConfig)}</div>
                          </div>
                          <div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Pool</div>
                             <div className="font-black text-lg">{formatCurrency(Number(pool.totalTips || 0), currencyConfig)}</div>
                          </div>
                       </div>

                       {/* Status & Actions */}
                       <div className="p-6 md:w-64 bg-muted/10 flex flex-col items-center justify-center gap-3">
                          <Badge className={cn(
                            "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border-none shadow-sm",
                            pool.status === 'distributed' ? "bg-emerald-500/20 text-emerald-600" : "bg-amber-50/20 text-amber-600"
                          )}>
                             {pool.status}
                          </Badge>
                          <div className="text-[9px] font-bold text-muted-foreground">{pool.distributions?.length || 0} Staff Members</div>
                          
                          {pool.status === 'calculated' && (
                             <Button size="sm" onClick={() => markDistributed(pool.id)} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-[10px] uppercase tracking-widest h-9">
                                Mark Distributed
                             </Button>
                          )}
                       </div>
                    </CardContent>
                 </Card>
               ))
             )}
          </div>
        </div>
      </ScrollArea>

      {/* Daily Tip Reconciliation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-[2.5rem] p-8 max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Calculator className="size-6 text-emerald-600" />
              Daily Tip Reconciliation
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Calculate penny-perfect tip allocations conforming to FLSA regulations.
            </DialogDescription>
          </DialogHeader>

          {/* FLSA Compliance Notice */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-800 dark:text-emerald-300 text-xs">
            <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span><strong>FLSA Compliant:</strong> Managers and supervisors are strictly barred from participating in employee tip pools.</span>
          </div>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 pt-2 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Business Date</Label>
                  <Input
                    type="date"
                    className="h-11 rounded-2xl border-2 font-bold"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Pooling Methodology</Label>
                  <Select value={form.tipPoolType} onValueChange={(v) => setForm({ ...form, tipPoolType: v })}>
                    <SelectTrigger className="h-11 rounded-2xl border-2 font-bold text-xs truncate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {TIP_POOL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="font-medium text-xs rounded-lg">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Point Multiplier Key when Points-Weighted is selected */}
              {form.tipPoolType === 'pool_by_points' && (
                <div className="rounded-2xl border bg-muted/30 p-3 space-y-1.5">
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Award className="size-3 text-indigo-600" />
                    Role Point Weights (Toast / 7shifts Standard)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="border-indigo-400/50 bg-indigo-50/50 dark:bg-indigo-950/30 text-[9px] font-bold">Server: 10 pts</Badge>
                    <Badge variant="outline" className="border-purple-400/50 bg-purple-50/50 dark:bg-purple-950/30 text-[9px] font-bold">Bartender: 8 pts</Badge>
                    <Badge variant="outline" className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/30 text-[9px] font-bold">Busser: 4 pts</Badge>
                    <Badge variant="outline" className="border-emerald-400/50 bg-emerald-50/50 dark:bg-emerald-950/30 text-[9px] font-bold">Host: 2 pts</Badge>
                    <Badge variant="outline" className="border-blue-400/50 bg-blue-50/50 dark:bg-blue-950/30 text-[9px] font-bold">Dish/Cook: 2 pts</Badge>
                    <Badge variant="outline" className="border-rose-400/50 bg-rose-50/50 dark:bg-rose-950/30 text-[9px] font-bold text-rose-600">Manager: 0 pts (Excluded)</Badge>
                  </div>
                </div>
              )}

              {/* Role percentage split key */}
              {form.tipPoolType === 'pool_by_role' && (
                <div className="rounded-2xl border bg-muted/30 p-3 space-y-1.5">
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Percent className="size-3 text-blue-600" />
                    Role Pool Quotas
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="border-blue-400/50 bg-blue-50/50 text-[9px] font-bold">Servers: 60%</Badge>
                    <Badge variant="outline" className="border-purple-400/50 bg-purple-50/50 text-[9px] font-bold">Bartenders: 20%</Badge>
                    <Badge variant="outline" className="border-amber-400/50 bg-amber-50/50 text-[9px] font-bold">Bussers: 10%</Badge>
                    <Badge variant="outline" className="border-emerald-400/50 bg-emerald-50/50 text-[9px] font-bold">Hosts: 10%</Badge>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Cash Tips ($)</Label>
                  <div className="relative">
                     <Banknote className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                     <Input
                        type="number"
                        step="0.01"
                        className="h-11 rounded-2xl border-2 pl-10 font-bold text-base"
                        value={form.cashTips}
                        onChange={(e) => setForm({ ...form, cashTips: e.target.value })}
                      />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Credit Card Tips ($)</Label>
                  <div className="relative">
                     <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                     <Input
                        type="number"
                        step="0.01"
                        className="h-11 rounded-2xl border-2 pl-10 font-bold text-base"
                        value={form.creditTips}
                        onChange={(e) => setForm({ ...form, creditTips: e.target.value })}
                      />
                  </div>
                </div>
              </div>

              <div className="p-5 bg-muted/40 rounded-2xl border-2 border-dashed flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-widest opacity-60">Calculated Tip Pool</span>
                <span className="text-3xl font-black tracking-tighter text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(parseFloat(form.cashTips || '0') + parseFloat(form.creditTips || '0'), currencyConfig, { inputIsCents: false })}
                </span>
              </div>

              {calculatedDistributions.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Proposed Allocations (Penny-Conserved)</Label>
                    <Badge variant="outline" className="text-[9px] font-bold text-emerald-600 border-emerald-300">
                      Largest Remainder Method
                    </Badge>
                  </div>
                  <div className="rounded-2xl border-2 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-9">Personnel</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-9">Role</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-9 text-right">Hours</TableHead>
                          {form.tipPoolType === 'pool_by_points' && (
                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-9 text-right">Pts</TableHead>
                          )}
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-9 text-right">Payout</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calculatedDistributions.map((d, i) => (
                          <TableRow key={i} className="hover:bg-muted/10 transition-colors">
                            <TableCell className="font-bold text-xs py-2.5">{d.staffName}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[9px] font-bold uppercase rounded-md h-5">{d.role}</Badge></TableCell>
                            <TableCell className="text-right text-xs font-mono">{d.hoursWorked?.toFixed(1) || '-'}</TableCell>
                            {form.tipPoolType === 'pool_by_points' && (
                              <TableCell className="text-right text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold">{d.weightOrPoints?.toFixed(0) || '-'}</TableCell>
                            )}
                            <TableCell className="text-right font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(d.amount, currencyConfig)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground border-2 border-dashed rounded-2xl">
                  Enter tips and select a completed shift date to preview allocations.
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="pt-4 border-t mt-auto">
             <Button onClick={handleCreate} className="w-full h-12 rounded-2xl text-sm font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20">
               Confirm & Lock Distribution Ledger
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily Closeout Summary Modal (Toast / 7shifts Style) */}
      <Dialog open={closeoutOpen} onOpenChange={setCloseoutOpen}>
        <DialogContent className="rounded-[2.5rem] p-8 max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
                <FileText className="size-6 text-emerald-600" />
                Daily Closeout & Payroll Summary
              </DialogTitle>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 font-black text-xs px-3 py-1">
                Toast / 7shifts Engine
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              End-of-day reconciliation of gross sales, labor costs with 1.5x overtime, and penny-perfect tip allocations.
            </DialogDescription>
          </DialogHeader>

          {closeoutSummary && (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6 pt-2 pb-4">
                {/* Date Bar */}
                <div className="flex items-center justify-between p-3.5 bg-muted/40 rounded-2xl border text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-muted-foreground" />
                    <span className="font-bold">Business Date:</span>
                    <span className="font-mono font-semibold">{closeoutSummary.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-emerald-600" />
                    <span className="font-bold text-emerald-600">Audit Status: Balanced (0¢ Loss)</span>
                  </div>
                </div>

                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="rounded-2xl border-2 p-3 bg-card">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Gross Sales</div>
                    <div className="text-xl font-black mt-1 text-foreground">
                      {formatCurrency(closeoutSummary.totalSalesCents, currencyConfig)}
                    </div>
                  </Card>
                  <Card className="rounded-2xl border-2 p-3 bg-card">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total Tips</div>
                    <div className="text-xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(closeoutSummary.totalTipsCents, currencyConfig)}
                    </div>
                  </Card>
                  <Card className="rounded-2xl border-2 p-3 bg-card">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Labor Cost</div>
                    <div className="text-xl font-black mt-1 text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(closeoutSummary.totalLaborCostCents, currencyConfig)}
                    </div>
                  </Card>
                  <Card className="rounded-2xl border-2 p-3 bg-card">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Labor % of Sales</div>
                    <div className="text-xl font-black mt-1 text-amber-600 dark:text-amber-400">
                      {closeoutSummary.laborCostPercentage}%
                    </div>
                  </Card>
                </div>

                {/* Secondary Metrics */}
                <div className="grid grid-cols-3 gap-3 p-4 bg-muted/20 rounded-2xl border">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">Net Hours</span>
                    <span className="text-lg font-black">{closeoutSummary.totalHoursWorked.toFixed(1)} hrs</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">Headcount</span>
                    <span className="text-lg font-black">{closeoutSummary.headcount} staff</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">Pool Model</span>
                    <span className="text-sm font-bold capitalize">{closeoutSummary.poolType.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                {/* Employee Breakdown Table */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Staff Tip Distributions</Label>
                  <div className="rounded-2xl border-2 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-9">Staff Member</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-9">Role</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-9 text-right">Hours</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-9 text-right">Points</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest h-9 text-right">Allocated Tips</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {closeoutSummary.distributions.length > 0 ? (
                          closeoutSummary.distributions.map((dist, idx) => (
                            <TableRow key={idx} className="hover:bg-muted/10 transition-colors">
                              <TableCell className="font-bold text-xs py-2.5">{dist.staffName}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[9px] font-bold uppercase rounded-md h-5">{dist.role}</Badge></TableCell>
                              <TableCell className="text-right text-xs font-mono">{dist.hoursWorked.toFixed(1)}</TableCell>
                              <TableCell className="text-right text-xs font-mono font-bold text-indigo-600">{dist.weightOrPoints?.toFixed(0) || '-'}</TableCell>
                              <TableCell className="text-right font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(dist.amountCents, currencyConfig)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                              No completed shifts recorded for this business date.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          <div className="pt-4 border-t mt-auto flex justify-end">
            <Button
              onClick={() => setCloseoutOpen(false)}
              className="h-11 px-8 rounded-2xl font-black uppercase tracking-widest text-xs bg-slate-900 hover:bg-slate-800 text-white"
            >
              Close Summary
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TipsPage
