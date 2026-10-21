'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Banknote,
  CreditCard,
  Gift,
  SplitSquareVertical,
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Trash2,
  Users,
  Receipt,
  Utensils,
  CheckCircle2,
  Wifi,
  Smartphone,
  Settings2,
  XCircle,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { formatCurrency, fromMinorUnits, toMinorUnits } from '@/features/storefront/lib/currency'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import {
  splitEvenly,
  splitBySeat,
  calculateBalanceDue,
  validateCheckoutPermitted,
  calculateChangeDue,
  type SplitGuestShare,
  type SeatBill,
  type SplitSeatItem,
} from '@/features/platform/pos/splitUtils'
import {
  loadHardwareSettings,
  PaymentTerminalDeviceConfig,
  DEFAULT_PAYMENT_TERMINAL_CONFIG,
} from '@/features/platform/hardware/printerService'
import { HardwareSettingsModal } from '@/features/platform/hardware/components/HardwareSettingsModal'

interface OrderItem {
  id: string
  quantity: number
  price: string
  itemNameSnapshot: string
  seatNumber?: number | null
  menuItem: {
    id: string
    name: string
  } | null
}

interface Payment {
  id: string
  amount: string
  status: string
  paymentMethod: string
  createdAt?: string
}

interface Order {
  id: string
  orderNumber: string
  status: string
  subtotal: string
  tax: string
  tip: string
  discount: string
  total: string
  paidAmount?: number
  balanceDue?: number
  paymentStatus?: string
  orderItems: OrderItem[]
  payments: Payment[]
  tables: {
    id: string
    tableNumber: string
  }[]
}

interface SplitPayment {
  id: string
  amount: number
  method: 'cash' | 'card' | 'gift_card'
  status: 'pending' | 'processing' | 'completed'
  giftCardCode?: string
}

const GET_ORDER = gql`
  query GetOrder($id: ID!) {
    restaurantOrder(where: { id: $id }) {
      id
      orderNumber
      status
      subtotal
      tax
      tip
      discount
      total
      paidAmount
      balanceDue
      paymentStatus
      orderItems {
        id
        quantity
        price
        itemNameSnapshot
        seatNumber
        menuItem {
          id
          name
        }
      }
      payments {
        id
        amount
        status
        paymentMethod
        createdAt
      }
      tables {
        id
        tableNumber
      }
    }
    storeSettings {
      currencyCode
      locale
      paymentProviders { provider publishableKey }
    }
  }
`

const UPDATE_ORDER_ITEM_SEAT = gql`
  mutation UpdateOrderItemSeat($orderItemId: ID!, $seatNumber: Int!) {
    updateOrderItemSeat(orderItemId: $orderItemId, seatNumber: $seatNumber) {
      success
      orderItemId
      seatNumber
      error
    }
  }
`

const SPLIT_CHECK_BY_GUEST = gql`
  mutation SplitCheckByGuest($orderId: String!, $guestCount: Int!) {
    splitCheckByGuest(orderId: $orderId, guestCount: $guestCount) {
      success
      newOrderIds
      error
    }
  }
`

const PROCESS_PAYMENT = gql`
  mutation ProcessPayment(
    $orderId: String!
    $amount: Int
    $paymentMethod: String!
    $tipAmount: Int
    $idempotencyKey: String!
    $terminalConfig: JSON
  ) {
    processPayment(
      orderId: $orderId
      amount: $amount
      paymentMethod: $paymentMethod
      tipAmount: $tipAmount
      idempotencyKey: $idempotencyKey
      terminalConfig: $terminalConfig
    ) {
      success
      paymentId
      clientSecret
      amount
      tipAmount
      remainingBalance
      cardBrand
      last4
      entryMode
      authCode
      error
    }
  }
`

const RECONCILE_PAYMENT = gql`
  mutation ReconcilePayment($paymentId: ID!) {
    reconcilePayment(paymentId: $paymentId) { success status error }
  }
`

function WebCardConfirmation({ paymentId, onComplete }: { paymentId: string; onComplete: () => Promise<void> }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (result.error) {
      setError(result.error.message || 'Card confirmation failed')
      setSubmitting(false)
      return
    }
    const reconciliation: any = await request('/api/graphql', RECONCILE_PAYMENT, { paymentId })
    if (!reconciliation?.reconcilePayment?.success) {
      setError(reconciliation?.reconcilePayment?.error || 'Payment is still awaiting provider confirmation')
      setSubmitting(false)
      return
    }
    await onComplete()
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={confirm} disabled={!stripe || !elements || submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Confirm secure web card payment
      </Button>
    </div>
  )
}

const GET_GIFT_CARD = gql`
  query LookupGiftCard($code: String!) {
    lookupGiftCard(code: $code)
  }
`

const REDEEM_GIFT_CARD = gql`
  mutation RedeemGiftCard($orderId: String!, $code: String!, $tipAmount: Int, $idempotencyKey: String!) {
    redeemGiftCard(
      orderId: $orderId
      code: $code
      tipAmount: $tipAmount
      idempotencyKey: $idempotencyKey
    ) { success paymentId amount remainingBalance error }
  }
`

interface PaymentClientProps {
  orderId: string
}

export function PaymentClient({ orderId }: PaymentClientProps) {
  const router = useRouter()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('cash')
  const [currencyConfig, setCurrencyConfig] = useState({ currencyCode: 'USD', locale: 'en-US' })
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null)
  const [cardSession, setCardSession] = useState<{ clientSecret: string; paymentId: string; splitId?: string } | null>(null)

  // Hardware Payment Terminal state (Option C: PAX / Dejavoo / Simulated)
  const [terminalConfig, setTerminalConfig] = useState<PaymentTerminalDeviceConfig>(DEFAULT_PAYMENT_TERMINAL_CONFIG)
  const [hardwareModalOpen, setHardwareModalOpen] = useState(false)
  const [terminalSession, setTerminalSession] = useState<{
    amountCents: number
    splitId?: string
    label?: string
  } | null>(null)
  const [terminalTipPreset, setTerminalTipPreset] = useState<number>(0) // percentage 0, 15, 18, 20
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const [lastTerminalApproval, setLastTerminalApproval] = useState<{
    cardBrand?: string
    last4?: string
    entryMode?: string
    authCode?: string
  } | null>(null)

  // Cash payment state
  const [cashReceived, setCashReceived] = useState<string>('')

  // Tip state
  const [tipAmount, setTipAmount] = useState<string>('0.00')

  // Gift card state
  const [giftCardCode, setGiftCardCode] = useState<string>('')
  const [giftCardBalance, setGiftCardBalance] = useState<number | null>(null)
  const [giftCardId, setGiftCardId] = useState<string | null>(null)
  const [giftCardError, setGiftCardError] = useState<string | null>(null)
  const [checkingGiftCard, setCheckingGiftCard] = useState(false)

  // Split payment state
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([])
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [newSplitAmount, setNewSplitAmount] = useState<string>('')
  const [newSplitMethod, setNewSplitMethod] = useState<'cash' | 'card' | 'gift_card'>('cash')

  // Toast / Clover Stage 5: Advanced Split Modes
  const [splitMode, setSplitMode] = useState<'even' | 'seat' | 'custom'>('even')
  const [evenGuests, setEvenGuests] = useState<number>(2)

  // Success dialog
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [changeAmount, setChangeAmount] = useState<number>(0)
  const attemptKeys = useRef<Record<string, string>>({})
  const getAttemptKey = (scope: string) => {
    if (!attemptKeys.current[scope]) attemptKeys.current[scope] = crypto.randomUUID()
    return attemptKeys.current[scope]
  }

  useEffect(() => {
    const hw = loadHardwareSettings()
    if (hw?.paymentTerminal) {
      setTerminalConfig(hw.paymentTerminal)
    }
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    try {
      setLoading(true)
      const data = await request('/api/graphql', GET_ORDER, { id: orderId })
      const nextOrder = (data as any).restaurantOrder
      const nextStoreSettings = (data as any).storeSettings || {}
      const nextCurrencyCode = nextStoreSettings.currencyCode || 'USD'
      const nextLocale = nextStoreSettings.locale || 'en-US'

      setOrder(nextOrder)
      setCurrencyConfig({
        currencyCode: nextCurrencyCode,
        locale: nextLocale,
      })
      const stripeConfig = nextStoreSettings.paymentProviders?.find((provider: any) => provider.provider === 'stripe')
      setStripePublishableKey(stripeConfig?.publishableKey || null)
      setTipAmount(fromMinorUnits(Number(nextOrder?.tip || 0), nextCurrencyCode).toFixed(2))
    } catch (err) {
      console.error('Error fetching order:', err)
    } finally {
      setLoading(false)
    }
  }

  const getCurrentTipCents = (): number => {
    if (!order) return 0
    return Number(order.tip || 0)
  }

  const getDesiredTipCents = (): number => {
    const currentTip = getCurrentTipCents()
    const requestedTip = toMinorUnits(tipAmount || '0', currencyConfig.currencyCode)
    return Math.max(currentTip, requestedTip)
  }

  const getOrderTotal = (): number => {
    if (!order) return 0
    const currentTip = getCurrentTipCents()
    const baseTotal = Math.max(0, Number(order.total || 0) - currentTip)
    return baseTotal + getDesiredTipCents()
  }

  const getAmountPaid = (): number => {
    if (!order) return 0
    return order.payments
      .filter((p) => p.status === 'succeeded')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0)
  }

  const getRemainingBalance = (): number => {
    return Math.max(0, getOrderTotal() - getAmountPaid())
  }

  const getSplitTotal = (): number => {
    return splitPayments.reduce((sum, p) => sum + p.amount, 0)
  }

  const getSplitRemaining = (): number => {
    return Math.max(0, getRemainingBalance() - getSplitTotal())
  }

  // Cash payment
  const processCashPayment = async () => {
    if (!order) return

    const total = getRemainingBalance()
    const receivedInCents = toMinorUnits(cashReceived || '0', currencyConfig.currencyCode)
    
    if (receivedInCents < total) {
      alert('Cash received is less than the total amount')
      return
    }

    setProcessing(true)
    try {
      const amountInCents = total
      const tipInCents = getDesiredTipCents()

      const result = await request('/api/graphql', PROCESS_PAYMENT, {
        orderId: order.id,
        amount: amountInCents,
        paymentMethod: 'cash',
        tipAmount: tipInCents,
        idempotencyKey: getAttemptKey('cash'),
      })

      const { success, error } = (result as any).processPayment

      if (success) {
        await fetchOrder()
        setChangeAmount(receivedInCents - total)
        setSuccessDialogOpen(true)
      } else {
        alert(`Payment failed: ${error}`)
      }
    } catch (err) {
      console.error('Error processing cash payment:', err)
      alert('Failed to process payment')
    } finally {
      setProcessing(false)
    }
  }

  // Card payment via Stripe Web Form
  const processCardPayment = async () => {
    if (!order) return

    const total = getRemainingBalance()
    setProcessing(true)

    try {
      const amountInCents = total
      const tipInCents = getDesiredTipCents()

      const result = await request('/api/graphql', PROCESS_PAYMENT, {
        orderId: order.id,
        amount: amountInCents,
        paymentMethod: 'credit_card',
        tipAmount: tipInCents,
        idempotencyKey: getAttemptKey('card'),
      })

      const { success, paymentId, clientSecret, error } = (result as any).processPayment

      if (success && clientSecret && paymentId && stripePublishableKey) {
        setCardSession({ clientSecret, paymentId })
      } else if (success && !stripePublishableKey) {
        alert('Stripe publishable configuration is unavailable. The payment remains reserved for recovery.')
      } else {
        alert(`Payment failed: ${error || 'Secure card session could not be created'}`)
      }
    } catch (err) {
      console.error('Error processing card payment:', err)
      alert('Failed to process card payment')
    } finally {
      setProcessing(false)
    }
  }

  // Execute Physical or Simulated Terminal Payment (Option C: PAX / Dejavoo / Simulated)
  const executeTerminalCharge = async (options?: {
    amountOverrideCents?: number
    splitId?: string
    simulatedOutcome?: 'approved' | 'declined'
    simulatedEntryMode?: 'TAP' | 'CHIP' | 'SWIPE'
    simulatedCardBrand?: 'VISA' | 'MASTERCARD' | 'AMEX'
    simulatedLast4?: string
    onTerminalTipCents?: number
  }) => {
    if (!order) return

    const baseAmountCents = options?.amountOverrideCents ?? terminalSession?.amountCents ?? getRemainingBalance()
    const tipInCents = getDesiredTipCents()
    const onTerminalTipCents = options?.onTerminalTipCents ?? 0

    setProcessing(true)
    setTerminalError(null)

    try {
      const scope = `terminal:${options?.splitId || 'full'}:${baseAmountCents}:${Date.now()}`
      const result = await request('/api/graphql', PROCESS_PAYMENT, {
        orderId: order.id,
        amount: baseAmountCents,
        paymentMethod: 'card_terminal',
        tipAmount: tipInCents,
        idempotencyKey: getAttemptKey(scope),
        terminalConfig: {
          protocol: terminalConfig.mode === 'stripe_web' ? 'simulated' : terminalConfig.mode,
          terminalName: terminalConfig.terminalName,
          tpn: terminalConfig.tpn,
          authKey: terminalConfig.authKey,
          spinEnvironment: terminalConfig.spinEnvironment,
          ipAddress: terminalConfig.ipAddress,
          port: terminalConfig.port,
          promptTipOnTerminal: terminalConfig.promptTipOnTerminal,
          timeoutSeconds: terminalConfig.timeoutSeconds,
          simulatedOutcome: options?.simulatedOutcome || 'approved',
          simulatedEntryMode: options?.simulatedEntryMode || 'TAP',
          simulatedCardBrand: options?.simulatedCardBrand || 'VISA',
          simulatedLast4: options?.simulatedLast4 || '4242',
          simulatedTipCents: onTerminalTipCents,
        },
      })

      const payload = (result as any).processPayment
      if (payload?.success) {
        setLastTerminalApproval({
          cardBrand: payload.cardBrand || 'VISA',
          last4: payload.last4 || '4242',
          entryMode: payload.entryMode || 'TAP',
          authCode: payload.authCode || 'APPROVED',
        })
        const activeSplitId = options?.splitId || terminalSession?.splitId
        setTerminalSession(null)
        setTerminalTipPreset(0)

        if (activeSplitId) {
          setSplitPayments((prev) =>
            prev.map((p) => (p.id === activeSplitId ? { ...p, status: 'completed' } : p))
          )
        }

        await fetchOrder()
        if (Number(payload.remainingBalance || 0) === 0) {
          setChangeAmount(0)
          setSuccessDialogOpen(true)
        }
      } else {
        setTerminalError(payload?.error || 'Card declined or terminal did not respond')
      }
    } catch (err: any) {
      console.error('Error processing terminal payment:', err)
      setTerminalError(err?.message || 'Terminal communication error')
    } finally {
      setProcessing(false)
    }
  }

  const openTerminalPrompt = (amountCents: number, splitId?: string, label?: string) => {
    setTerminalError(null)
    setTerminalTipPreset(0)
    setTerminalSession({ amountCents, splitId, label })
    // If physical PAX or Dejavoo is configured, immediately dispatch the HTTP request to wake the reader
    if (terminalConfig.mode === 'dejavoo_spin' || terminalConfig.mode === 'pax_poslink') {
      executeTerminalCharge({ amountOverrideCents: amountCents, splitId })
    }
  }

  // Gift card lookup
  const lookupGiftCard = async () => {
    if (!giftCardCode.trim()) return

    setCheckingGiftCard(true)
    setGiftCardError(null)
    setGiftCardBalance(null)
    setGiftCardId(null)

    try {
      const data = await request('/api/graphql', GET_GIFT_CARD, {
        code: giftCardCode.trim(),
      })

      const card = (data as any).lookupGiftCard
      if (card) {
        setGiftCardBalance(Number(card.balance || 0))
        setGiftCardId(card.id)
      } else {
        setGiftCardError('Gift card not found or is disabled')
      }
    } catch (err) {
      console.error('Error looking up gift card:', err)
      setGiftCardError('Failed to lookup gift card')
    } finally {
      setCheckingGiftCard(false)
    }
  }

  // Gift card payment
  const processGiftCardPayment = async () => {
    if (!order || !giftCardId || giftCardBalance === null) return

    const total = getRemainingBalance()
    const amountToCharge = Math.min(giftCardBalance, total)

    setProcessing(true)
    try {
      const amountInCents = amountToCharge
      const tipInCents = getDesiredTipCents()

      const result = await request('/api/graphql', REDEEM_GIFT_CARD, {
        orderId: order.id,
        code: giftCardCode.trim().toUpperCase(),
        tipAmount: tipInCents,
        idempotencyKey: getAttemptKey(`gift:${giftCardCode.trim().toUpperCase()}`),
      })
      const redemption = (result as any).redeemGiftCard

      if (redemption.success) {
        const chargedAmount = Number(redemption.amount || amountInCents)
        if (Number(redemption.remainingBalance || 0) === 0) {
          await fetchOrder()
          setChangeAmount(0)
          setSuccessDialogOpen(true)
        } else {
          await fetchOrder()
          setGiftCardBalance(Math.max(0, giftCardBalance - chargedAmount))
          const msg = formatCurrency(chargedAmount, currencyConfig) + " charged to gift card. Remaining balance: " + formatCurrency(Number(redemption.remainingBalance || 0), currencyConfig)
          alert(msg)
        }
      } else {
        alert(`Payment failed: ${redemption.error}`)
      }
    } catch (err) {
      console.error('Error processing gift card payment:', err)
      alert('Failed to process gift card payment')
    } finally {
      setProcessing(false)
    }
  }

  // Split payment functions
  const addSplitPayment = () => {
    if (newSplitMethod === 'gift_card') {
      alert('Apply gift cards from the Gift Card tab before adding remaining split tenders')
      return
    }
    const amount = toMinorUnits(newSplitAmount || '0', currencyConfig.currencyCode)
    if (amount <= 0) return
    if (amount > getSplitRemaining()) {
      alert('Amount exceeds remaining balance')
      return
    }

    setSplitPayments([
      ...splitPayments,
      {
        id: Date.now().toString(),
        amount,
        method: newSplitMethod,
        status: 'pending',
      },
    ])
    setNewSplitAmount('')
    setSplitDialogOpen(false)
  }

  const removeSplitPayment = (id: string) => {
    setSplitPayments(splitPayments.filter((p) => p.id !== id))
  }

  const processSplitPayments = async () => {
    if (!order || splitPayments.length === 0) return

    setProcessing(true)
    try {
      for (let i = 0; i < splitPayments.length; i++) {
        const split = splitPayments[i]
        if (split.status === 'completed') continue
        const amountInCents = split.amount
        
        // Update status to processing
        setSplitPayments((prev) =>
          prev.map((p) => (p.id === split.id ? { ...p, status: 'processing' } : p))
        )

        if (split.method === 'gift_card') {
          throw new Error('Apply gift cards from the Gift Card tab before processing remaining split tenders')
        }
        const result = await request('/api/graphql', PROCESS_PAYMENT, {
          orderId: order.id,
          amount: amountInCents,
          paymentMethod: split.method === 'card' ? 'credit_card' : split.method,
          tipAmount: i === 0 ? getDesiredTipCents() : 0,
          idempotencyKey: getAttemptKey(`split:${split.id}`),
        })

        const { success, paymentId, clientSecret, error } = (result as any).processPayment

        if (success) {
          if (split.method === 'card') {
            if (!clientSecret || !paymentId || !stripePublishableKey) {
              throw new Error('Secure Stripe configuration is required for split card tenders')
            }
            setCardSession({ clientSecret, paymentId, splitId: split.id })
            return
          }
          setSplitPayments((prev) =>
            prev.map((p) => (p.id === split.id ? { ...p, status: 'completed' } : p))
          )
        } else {
          alert(`Payment ${i + 1} failed: ${error}`)
          setProcessing(false)
          return
        }
      }

      // All payments processed; backend decides if the order is fully paid/completed
      await fetchOrder()
      setChangeAmount(0)
      setSuccessDialogOpen(true)
    } catch (err) {
      console.error('Error processing split payments:', err)
      alert('Failed to process split payments')
    } finally {
      setProcessing(false)
    }
  }

  const handleSuccessClose = () => {
    setSuccessDialogOpen(false)
    router.push('/dashboard/platform/pos')
  }

  const processSharePayment = async (amountInCents: number, method: 'cash' | 'card', label: string) => {
    if (!order || amountInCents <= 0) return
    if (method === 'card' && terminalConfig.mode !== 'stripe_web') {
      openTerminalPrompt(amountInCents, undefined, label)
      return
    }
    setProcessing(true)
    try {
      const result = await request('/api/graphql', PROCESS_PAYMENT, {
        orderId: order.id,
        amount: amountInCents,
        paymentMethod: method === 'card' ? 'credit_card' : 'cash',
        tipAmount: 0,
        idempotencyKey: getAttemptKey(`share:${label}:${amountInCents}:${Date.now()}`),
      })
      const { success, paymentId, clientSecret, error } = (result as any).processPayment
      if (success) {
        if (method === 'card') {
          if (!clientSecret || !paymentId || !stripePublishableKey) {
            alert('Stripe publishable configuration is unavailable for card payment.')
            return
          }
          setCardSession({ clientSecret, paymentId })
        } else {
          await fetchOrder()
          const newRemaining = Math.max(0, getRemainingBalance() - amountInCents)
          if (newRemaining === 0) {
            setChangeAmount(0)
            setSuccessDialogOpen(true)
          }
        }
      } else {
        alert(`Payment failed: ${error || 'Unknown error'}`)
      }
    } catch (err: any) {
      console.error('Error processing share payment:', err)
      alert('Failed to process payment: ' + (err?.message || err))
    } finally {
      setProcessing(false)
    }
  }

  const handleMoveItemSeat = async (orderItemId: string, targetSeatNumber: number) => {
    try {
      await request('/api/graphql', UPDATE_ORDER_ITEM_SEAT, {
        orderItemId,
        seatNumber: targetSeatNumber,
      })
      await fetchOrder()
    } catch (err: any) {
      console.error('Error moving item seat:', err)
      alert('Failed to move item to seat: ' + (err?.message || err))
    }
  }

  const handleSplitCheckByGuest = async (count: number) => {
    if (!order || count < 2) return
    setProcessing(true)
    try {
      const res: any = await request('/api/graphql', SPLIT_CHECK_BY_GUEST, {
        orderId: order.id,
        guestCount: count,
      })
      if (res?.splitCheckByGuest?.success) {
        alert(`Check successfully divided into ${count} equal guest checks!`)
        await fetchOrder()
      } else {
        alert(`Split check failed: ${res?.splitCheckByGuest?.error || 'Unknown error'}`)
      }
    } catch (err: any) {
      console.error('Error splitting check by guest:', err)
      alert('Failed to split check: ' + (err?.message || err))
    } finally {
      setProcessing(false)
    }
  }

  const quickCashAmounts = [20, 50, 100]

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Order not found</p>
        <Button className="mt-4" onClick={() => router.push('/dashboard/platform/pos')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to POS
        </Button>
      </div>
    )
  }

  const remaining = getRemainingBalance()
  const balanceStatus = calculateBalanceDue(getOrderTotal(), order?.payments || [])
  const seatBills = order
    ? splitBySeat(
        order.orderItems.map((item) => ({
          id: item.id,
          name: item.itemNameSnapshot || item.menuItem?.name || 'Item',
          price: Number(item.price || 0),
          quantity: item.quantity,
          seatNumber: item.seatNumber || 1,
        })),
        {
          subtotal: Number(order.subtotal || 0),
          tax: Number(order.tax || 0),
          tip: getDesiredTipCents(),
          discount: Number(order.discount || 0),
          total: getOrderTotal(),
        }
      )
    : []

  const terminalSessionTipCents =
    terminalSession && terminalConfig.promptTipOnTerminal && terminalTipPreset > 0
      ? Math.round((terminalSession.amountCents * terminalTipPreset) / 100)
      : 0

  return (
    <div className="flex h-[calc(100vh-200px)] gap-4 p-4">
      {/* Order Summary */}
      <Card className="w-96 flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Order #{order.orderNumber}</CardTitle>
            <Badge
              variant="outline"
              className={cn(
                'font-bold text-[10px] uppercase tracking-wider',
                balanceStatus.paymentStatus === 'paid'
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                  : balanceStatus.paymentStatus === 'partially_paid'
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                  : 'bg-zinc-500/10 text-zinc-600 border-zinc-500/30'
              )}
            >
              {balanceStatus.paymentStatus.replace('_', ' ')}
            </Badge>
          </div>
          {order.tables?.length > 0 && (
            <p className="text-sm text-muted-foreground">Table: {order.tables.map((table) => table.tableNumber).join(', ')}</p>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          <div className="space-y-2">
            {order.orderItems.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    S{item.seatNumber || 1}
                  </Badge>
                  <span className="truncate">
                    {item.quantity}x {item.itemNameSnapshot || item.menuItem?.name || 'Unknown Item'}
                  </span>
                </div>
                <span className="tabular-nums font-medium">{formatCurrency(item.price, currencyConfig)}</span>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal, currencyConfig)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>{formatCurrency(order.tax, currencyConfig)}</span>
            </div>
            {parseFloat(order.discount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{formatCurrency(order.discount, currencyConfig)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span>Tip</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                className="w-24 h-8 text-right"
              />
            </div>
            <Separator />
            <div className="flex justify-between text-muted-foreground">
              <span>Applied Tip</span>
              <span>{formatCurrency(getDesiredTipCents(), currencyConfig)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatCurrency(getOrderTotal(), currencyConfig)}</span>
            </div>

            {/* Commercial Multi-Tender Status Strip */}
            <div className="pt-2 border-t space-y-2">
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{
                    width: `${getOrderTotal() > 0 ? Math.min(100, Math.round((balanceStatus.paidAmount / getOrderTotal()) * 100)) : 0}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Paid: {formatCurrency(balanceStatus.paidAmount, currencyConfig)}</span>
                <span className="font-bold text-primary">Due: {formatCurrency(balanceStatus.balanceDue, currencyConfig)}</span>
              </div>
            </div>

            {/* Succeeded Tender Ledger */}
            {order.payments.filter((p) => p.status === 'succeeded').length > 0 && (
              <div className="pt-2 border-t space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Processed Tenders</p>
                <div className="space-y-1">
                  {order.payments
                    .filter((p) => p.status === 'succeeded')
                    .map((p, i) => (
                      <div key={p.id || i} className="flex items-center justify-between text-xs bg-muted/60 px-2 py-1 rounded">
                        <span className="flex items-center gap-1.5 capitalize text-muted-foreground">
                          {p.paymentMethod === 'cash' ? <Banknote className="h-3.5 w-3.5 text-emerald-600" /> : <CreditCard className="h-3.5 w-3.5 text-blue-600" />}
                          {p.paymentMethod.replace('_', ' ')}
                        </span>
                        <span className="font-semibold text-emerald-600">{formatCurrency(p.amount, currencyConfig)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="pt-3 border-t">
          {balanceStatus.balanceDue === 0 ? (
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              onClick={() => router.push('/dashboard/platform/pos')}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Table Settled - Exit to POS
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full text-muted-foreground"
              onClick={() => {
                const check = validateCheckoutPermitted(balanceStatus.balanceDue, balanceStatus.paymentStatus)
                if (check.canCheckout) {
                  router.push('/dashboard/platform/pos')
                } else {
                  alert(check.reason || `Cannot close check: Balance of ${formatCurrency(balanceStatus.balanceDue, currencyConfig)} remains unpaid.`)
                }
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to POS (Unpaid: {formatCurrency(balanceStatus.balanceDue, currencyConfig)})
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Payment Methods */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>Payment Method</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHardwareModalOpen(true)}
            className="text-xs gap-1.5 h-8"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Terminal & Hardware ({terminalConfig.mode.replace('_', ' ').toUpperCase()})
          </Button>
        </CardHeader>
        <CardContent className="flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="cash" className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Cash
              </TabsTrigger>
              <TabsTrigger value="card" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Card
              </TabsTrigger>
              <TabsTrigger value="gift_card" className="flex items-center gap-2">
                <Gift className="h-4 w-4" />
                Gift Card
              </TabsTrigger>
              <TabsTrigger value="split" className="flex items-center gap-2">
                <SplitSquareVertical className="h-4 w-4" />
                Split
              </TabsTrigger>
            </TabsList>

            {/* Cash Payment */}
            <TabsContent value="cash" className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div>
                  <Label>Amount Due</Label>
                  <div className="text-3xl font-bold">{formatCurrency(remaining, currencyConfig)}</div>
                </div>

                <div>
                  <Label>Cash Received</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    className="text-2xl h-14"
                  />
                </div>

                <div className="flex gap-2">
                  {quickCashAmounts.map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      className="flex-1"
                      onClick={() => setCashReceived(amount.toString())}
                    >
                      {formatCurrency(amount, currencyConfig, { inputIsCents: false })}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCashReceived(fromMinorUnits(remaining, currencyConfig.currencyCode).toFixed(2))}
                  >
                    Exact
                  </Button>
                </div>

                {toMinorUnits(cashReceived || '0', currencyConfig.currencyCode) >= remaining && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Change Due</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(toMinorUnits(cashReceived || '0', currencyConfig.currencyCode) - remaining, currencyConfig)}
                    </p>
                  </div>
                )}
              </div>

              <Button
                size="lg"
                className="w-full mt-4"
                onClick={processCashPayment}
                disabled={processing || toMinorUnits(cashReceived || '0', currencyConfig.currencyCode) < remaining}
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Complete Cash Payment
              </Button>
            </TabsContent>

            {/* Card Payment (Supports Physical PAX/Dejavoo Terminal + Simulated Terminal + Stripe Web) */}
            <TabsContent value="card" className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Amount to Charge</Label>
                    <div className="text-3xl font-bold">{formatCurrency(remaining, currencyConfig)}</div>
                  </div>
                  <div className="flex gap-1.5 bg-muted p-1 rounded-lg">
                    <Button
                      type="button"
                      size="sm"
                      variant={terminalConfig.mode !== 'stripe_web' ? 'default' : 'ghost'}
                      className="text-xs h-7"
                      onClick={() =>
                        setTerminalConfig((prev) => ({
                          ...prev,
                          mode: prev.mode === 'stripe_web' ? 'simulated' : prev.mode,
                        }))
                      }
                    >
                      <Smartphone className="h-3.5 w-3.5 mr-1.5" />
                      Card Terminal (EMV/Tap)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={terminalConfig.mode === 'stripe_web' ? 'default' : 'ghost'}
                      className="text-xs h-7"
                      onClick={() =>
                        setTerminalConfig((prev) => ({
                          ...prev,
                          mode: 'stripe_web',
                        }))
                      }
                    >
                      <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                      Web Card Form
                    </Button>
                  </div>
                </div>

                {terminalConfig.mode !== 'stripe_web' ? (
                  <div className="p-6 border-2 border-dashed rounded-lg text-center space-y-3 bg-muted/10">
                    <div className="flex items-center justify-center gap-2">
                      <Badge variant="secondary" className="uppercase text-[10px] font-bold tracking-wider">
                        {terminalConfig.mode === 'dejavoo_spin'
                          ? `Dejavoo SPIN Cloud (${terminalConfig.tpn || 'Unconfigured TPN'})`
                          : terminalConfig.mode === 'pax_poslink'
                          ? `PAX POSLink LAN (${terminalConfig.ipAddress || '192.168.1.210'}:${terminalConfig.port || 10009})`
                          : 'Simulated PAX / Dejavoo Reader'}
                      </Badge>
                      {terminalConfig.promptTipOnTerminal && (
                        <Badge variant="outline" className="text-[10px]">
                          On-Screen Tip Prompt Enabled
                        </Badge>
                      )}
                    </div>
                    <Smartphone className="h-12 w-12 mx-auto text-primary" />
                    <div>
                      <p className="text-base font-semibold">
                        {terminalConfig.terminalName || 'Counter Smart Terminal'}
                      </p>
                      <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                        Accepts EMV Chip, Contactless NFC (Apple Pay / Google Pay), and Swipe via semi-integrated terminal protocol.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed rounded-lg text-center">
                    <CreditCard className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">Secure web card payment</p>
                    <p className="text-sm text-muted-foreground">
                      Uses the configured Stripe web payment form. This is not a card-present terminal.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4">
                {terminalConfig.mode !== 'stripe_web' ? (
                  <>
                    <Button
                      size="lg"
                      className="flex-1"
                      onClick={() => openTerminalPrompt(remaining)}
                      disabled={processing || remaining <= 0}
                    >
                      {processing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wifi className="mr-2 h-4 w-4" />
                      )}
                      Send {formatCurrency(remaining, currencyConfig)} to Card Terminal
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={processCardPayment}
                      disabled={processing || remaining <= 0}
                    >
                      Open Secure Card Form
                    </Button>
                  </>
                ) : (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={processCardPayment}
                    disabled={processing}
                  >
                    {processing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="mr-2 h-4 w-4" />
                    )}
                    Open Secure Card Form
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Gift Card Payment */}
            <TabsContent value="gift_card" className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div>
                  <Label>Amount Due</Label>
                  <div className="text-3xl font-bold">{formatCurrency(remaining, currencyConfig)}</div>
                </div>

                <div className="space-y-2">
                  <Label>Gift Card Code</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter gift card code"
                      value={giftCardCode}
                      onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                    />
                    <Button
                      variant="outline"
                      onClick={lookupGiftCard}
                      disabled={checkingGiftCard || !giftCardCode.trim()}
                    >
                      {checkingGiftCard ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lookup'}
                    </Button>
                  </div>
                </div>

                {giftCardError && (
                  <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                    <p className="text-red-600">{giftCardError}</p>
                  </div>
                )}

                {giftCardBalance !== null && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Gift Card Balance</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(giftCardBalance, currencyConfig)}
                    </p>
                    {giftCardBalance < remaining && (
                      <p className="text-sm text-yellow-600 mt-2">
                        Partial payment: {formatCurrency(giftCardBalance, currencyConfig)} will be charged, 
                        {formatCurrency(remaining - giftCardBalance, currencyConfig)} remaining
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Button
                size="lg"
                className="w-full mt-4"
                onClick={processGiftCardPayment}
                disabled={processing || !giftCardId}
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Gift className="mr-2 h-4 w-4" />
                )}
                Apply Gift Card
              </Button>
            </TabsContent>

            {/* Split Payment */}
            <TabsContent value="split" className="flex-1 flex flex-col overflow-hidden">
              {/* Header stats & Mode switch */}
              <div className="space-y-3 pb-3 border-b">
                <div className="flex justify-between items-center">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Remaining to Settle</Label>
                    <div className="text-2xl font-bold text-primary">{formatCurrency(remaining, currencyConfig)}</div>
                  </div>
                  {/* Mode switcher pills */}
                  <div className="inline-flex items-center rounded-lg bg-muted p-1 text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setSplitMode('even')}
                      className={cn(
                        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                        splitMode === 'even' ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
                      )}
                    >
                      <Users className="h-3.5 w-3.5 mr-1.5" />
                      Split Evenly
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitMode('seat')}
                      className={cn(
                        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                        splitMode === 'seat' ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
                      )}
                    >
                      <Utensils className="h-3.5 w-3.5 mr-1.5" />
                      Split by Seat
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitMode('custom')}
                      className={cn(
                        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                        splitMode === 'custom' ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
                      )}
                    >
                      <Receipt className="h-3.5 w-3.5 mr-1.5" />
                      Custom Tender
                    </button>
                  </div>
                </div>
              </div>

              {/* Mode 1: Split Evenly */}
              {splitMode === 'even' && (
                <div className="flex-1 overflow-auto py-3 space-y-4">
                  <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border">
                    <div>
                      <Label className="text-sm font-semibold">Number of Guests</Label>
                      <p className="text-xs text-muted-foreground">Evenly distributes exact cents with zero penny loss</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {[2, 3, 4, 5, 6].map((n) => (
                        <Button
                          key={n}
                          type="button"
                          variant={evenGuests === n ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 w-8 p-0 text-xs font-bold"
                          onClick={() => setEvenGuests(n)}
                        >
                          {n}
                        </Button>
                      ))}
                      <div className="flex items-center ml-2 border rounded-md">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-7 p-0"
                          disabled={evenGuests <= 2}
                          onClick={() => setEvenGuests((g) => Math.max(2, g - 1))}
                        >
                          -
                        </Button>
                        <span className="w-8 text-center text-xs font-bold">{evenGuests}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-7 p-0"
                          disabled={evenGuests >= 12}
                          onClick={() => setEvenGuests((g) => Math.min(12, g + 1))}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {splitEvenly(remaining, evenGuests).map((share) => (
                      <Card key={share.guestNumber} className="border shadow-sm">
                        <CardHeader className="p-3 pb-1.5 flex flex-row items-center justify-between">
                          <Badge variant="outline" className="font-semibold text-xs">
                            Guest #{share.guestNumber}
                          </Badge>
                          <div className="text-lg font-bold text-foreground">
                            {formatCurrency(share.amount, currencyConfig)}
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-1.5">
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="flex-1 text-xs"
                              disabled={processing || remaining <= 0}
                              onClick={() => processSharePayment(share.amount, 'cash', `Guest #${share.guestNumber}`)}
                            >
                              <Banknote className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                              Pay Cash
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              className="flex-1 text-xs"
                              disabled={processing || remaining <= 0}
                              onClick={() => processSharePayment(share.amount, 'card', `Guest #${share.guestNumber}`)}
                            >
                              <CreditCard className="h-3.5 w-3.5 mr-1" />
                              Pay Card
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-xs text-muted-foreground"
                      disabled={processing || remaining <= 0}
                      onClick={() => handleSplitCheckByGuest(evenGuests)}
                    >
                      <SplitSquareVertical className="h-3.5 w-3.5 mr-1.5" />
                      Split Into {evenGuests} Separate Sub-Orders (Print Separate Checks)
                    </Button>
                  </div>
                </div>
              )}

              {/* Mode 2: Split by Seat */}
              {splitMode === 'seat' && (
                <div className="flex-1 overflow-auto py-3 space-y-4">
                  <div className="text-xs text-muted-foreground">
                    Items grouped by seat allocation. Reassign items between seats or settle individual seat balances directly.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {seatBills.map((sb) => (
                      <Card key={sb.seatNumber} className="border shadow-sm flex flex-col justify-between">
                        <CardHeader className="p-3 pb-2 border-b bg-muted/20 flex flex-row items-center justify-between">
                          <div>
                            <div className="font-bold text-sm">Seat {sb.seatNumber}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {sb.items.length} {sb.items.length === 1 ? 'item' : 'items'} • Subtotal: {formatCurrency(sb.subtotal, currencyConfig)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-bold text-primary">{formatCurrency(sb.total, currencyConfig)}</div>
                            <div className="text-[10px] text-muted-foreground">Tax: {formatCurrency(sb.tax, currencyConfig)}</div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 space-y-2 flex-1">
                          <div className="space-y-1.5 max-h-36 overflow-auto">
                            {sb.items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-xs py-1 border-b last:border-b-0">
                                <span className="truncate max-w-[130px] font-medium">
                                  {item.quantity}x {item.name}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-muted-foreground">{formatCurrency(item.price, currencyConfig)}</span>
                                  {/* Quick seat mover */}
                                  <Select
                                    value={String(item.seatNumber)}
                                    onValueChange={(val) => handleMoveItemSeat(item.id, parseInt(val, 10))}
                                  >
                                    <SelectTrigger className="h-6 w-16 text-[10px] px-1.5 py-0 border-muted">
                                      <SelectValue placeholder={`S${item.seatNumber}`} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                                        <SelectItem key={s} value={String(s)} className="text-xs">
                                          Seat {s}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="pt-2 flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="flex-1 text-xs"
                              disabled={processing || sb.total <= 0 || remaining <= 0}
                              onClick={() => processSharePayment(sb.total, 'cash', `Seat #${sb.seatNumber}`)}
                            >
                              <Banknote className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                              Pay Cash
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              className="flex-1 text-xs"
                              disabled={processing || sb.total <= 0 || remaining <= 0}
                              onClick={() => processSharePayment(sb.total, 'card', `Seat #${sb.seatNumber}`)}
                            >
                              <CreditCard className="h-3.5 w-3.5 mr-1" />
                              Pay Card
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Mode 3: Custom Tender (Split Payments list) */}
              {splitMode === 'custom' && (
                <div className="flex-1 flex flex-col py-3 overflow-hidden">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Unallocated Remaining</Label>
                      <div className="text-xl font-bold text-primary">
                        {formatCurrency(getSplitRemaining(), currencyConfig)}
                      </div>
                    </div>
                    {getSplitRemaining() > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSplitDialogOpen(true)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add Split Tender
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2 flex-1 overflow-auto">
                    {splitPayments.length === 0 ? (
                      <div className="text-center py-8 text-sm text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                        No custom tender amounts queued yet. Click &quot;Add Split Tender&quot; to split across multiple payments.
                      </div>
                    ) : (
                      splitPayments.map((payment, index) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <span className="capitalize">{payment.method.replace('_', ' ')}</span>
                            <span className="font-medium">{formatCurrency(payment.amount, currencyConfig)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {payment.status === 'completed' && (
                              <Badge variant="default" className="bg-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Paid
                              </Badge>
                            )}
                            {payment.status === 'processing' && (
                              <Badge variant="secondary">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Processing
                              </Badge>
                            )}
                            {payment.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeSplitPayment(payment.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <Button
                    size="lg"
                    className="w-full mt-3"
                    onClick={processSplitPayments}
                    disabled={processing || splitPayments.length === 0 || getSplitRemaining() > 0.01}
                  >
                    {processing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Process Queued Payments ({splitPayments.length})
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Card-Present Terminal Interactive / Live Dispatch Modal (Option C: PAX / Dejavoo / Simulated) */}
      <Dialog open={Boolean(terminalSession)} onOpenChange={(open) => !open && !processing && setTerminalSession(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              {terminalConfig.terminalName || 'Smart Card Terminal'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {terminalConfig.mode === 'dejavoo_spin'
                ? `Dejavoo SPIN Cloud Relay (TPN: ${terminalConfig.tpn || 'Not Set'})`
                : terminalConfig.mode === 'pax_poslink'
                ? `PAX BroadPOS Local HTTP (${terminalConfig.ipAddress}:${terminalConfig.port || 10009})`
                : 'Interactive PAX / Dejavoo Hardware Terminal Simulator'}
            </DialogDescription>
          </DialogHeader>

          {terminalSession && (
            <div className="space-y-4">
              {/* Terminal Screen Display */}
              <div className="p-4 rounded-xl bg-zinc-950 text-white border border-zinc-800 space-y-3 text-center shadow-inner">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{terminalSession.label || `Order #${order.orderNumber}`}</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Wifi className="h-3 w-3" />
                    EMV / NFC READY
                  </span>
                </div>

                <div>
                  <div className="text-xs text-zinc-400 uppercase tracking-wider">Total to Authorize</div>
                  <div className="text-3xl font-bold tracking-tight text-white">
                    {formatCurrency(terminalSession.amountCents + terminalSessionTipCents, currencyConfig)}
                  </div>
                  {terminalSessionTipCents > 0 && (
                    <div className="text-xs text-emerald-400 mt-0.5">
                      Includes +{formatCurrency(terminalSessionTipCents, currencyConfig)} ({terminalTipPreset}% Tip on Terminal)
                    </div>
                  )}
                </div>

                {terminalConfig.promptTipOnTerminal && (
                  <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                    <div className="text-[11px] text-zinc-400">Customer On-Screen Tip Selection</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[0, 15, 18, 20].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setTerminalTipPreset(pct)}
                          className={cn(
                            'py-1.5 px-2 rounded text-xs font-semibold border transition-colors',
                            terminalTipPreset === pct
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                          )}
                        >
                          {pct === 0 ? 'No Tip' : `${pct}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="py-2 text-xs text-zinc-300 flex items-center justify-center gap-2">
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                      <span>Authorizing with processor...</span>
                    </>
                  ) : (
                    <span>Please Tap (Apple/Google Pay/NFC), Insert Chip, or Swipe</span>
                  )}
                </div>
              </div>

              {terminalError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>{terminalError}</span>
                </div>
              )}

              {/* Simulated Reader Action Controls or Physical Retry Controls */}
              {terminalConfig.mode === 'simulated' ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                      disabled={processing}
                      onClick={() =>
                        executeTerminalCharge({
                          simulatedOutcome: 'approved',
                          simulatedEntryMode: 'TAP',
                          simulatedCardBrand: 'VISA',
                          simulatedLast4: '4242',
                          onTerminalTipCents: terminalSessionTipCents,
                        })
                      }
                    >
                      <Wifi className="h-3.5 w-3.5 mr-1.5" />
                      Tap Visa (••4242)
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs font-semibold"
                      disabled={processing}
                      onClick={() =>
                        executeTerminalCharge({
                          simulatedOutcome: 'approved',
                          simulatedEntryMode: 'CHIP',
                          simulatedCardBrand: 'MASTERCARD',
                          simulatedLast4: '8899',
                          onTerminalTipCents: terminalSessionTipCents,
                        })
                      }
                    >
                      <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                      Insert Chip (••8899)
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 text-xs text-destructive hover:text-destructive"
                      disabled={processing}
                      onClick={() =>
                        executeTerminalCharge({
                          simulatedOutcome: 'declined',
                        })
                      }
                    >
                      Simulate Card Decline
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-xs"
                      disabled={processing}
                      onClick={() => setTerminalSession(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="flex-1 text-xs"
                    disabled={processing}
                    onClick={() =>
                      executeTerminalCharge({
                        amountOverrideCents: terminalSession.amountCents,
                        splitId: terminalSession.splitId,
                        onTerminalTipCents: terminalSessionTipCents,
                      })
                    }
                  >
                    {processing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Wifi className="h-4 w-4 mr-1.5" />}
                    {processing ? 'Waiting on Terminal...' : 'Retry Terminal Prompt'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-xs"
                    onClick={() => setTerminalSession(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cardSession)} onOpenChange={(open) => !open && setCardSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Secure web card payment</DialogTitle>
          </DialogHeader>
          {cardSession && stripePublishableKey && (
            <Elements
              stripe={loadStripe(stripePublishableKey)}
              options={{ clientSecret: cardSession.clientSecret }}
            >
              <WebCardConfirmation
                paymentId={cardSession.paymentId}
                onComplete={async () => {
                  const completedSplitId = cardSession.splitId
                  setCardSession(null)
                  if (completedSplitId) {
                    setSplitPayments((previous) => previous.map((payment) =>
                      payment.id === completedSplitId ? { ...payment, status: 'completed' } : payment
                    ))
                    await fetchOrder()
                  } else {
                    await fetchOrder()
                    setChangeAmount(0)
                    setSuccessDialogOpen(true)
                  }
                }}
              />
            </Elements>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Split Payment Dialog */}
      <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Split Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount</Label>
              <Input
                step="0.01"
                min="0"
                max={getSplitRemaining()}
                placeholder={`Max: ${formatCurrency(getSplitRemaining(), currencyConfig)}`}
                value={newSplitAmount}
                onChange={(e) => setNewSplitAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Payment Method</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Button
                  variant={newSplitMethod === 'cash' ? 'default' : 'outline'}
                  onClick={() => setNewSplitMethod('cash')}
                >
                  <Banknote className="mr-2 h-4 w-4" />
                  Cash
                </Button>
                <Button
                  variant={newSplitMethod === 'card' ? 'default' : 'outline'}
                  onClick={() => setNewSplitMethod('card')}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Card
                </Button>
                <Button
                  variant="outline"
                  disabled
                  title="Apply gift cards from the Gift Card tab first"
                >
                  <Gift className="mr-2 h-4 w-4" />
                  Gift via tab
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addSplitPayment} disabled={!newSplitAmount || toMinorUnits(newSplitAmount, currencyConfig.currencyCode) <= 0}>
              Add Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hardware & Card Terminal Configuration Modal */}
      <HardwareSettingsModal
        open={hardwareModalOpen}
        onOpenChange={(open) => {
          setHardwareModalOpen(open)
          if (!open) {
            const updated = loadHardwareSettings()
            if (updated?.paymentTerminal) {
              setTerminalConfig(updated.paymentTerminal)
            }
          }
        }}
      />

      {/* Success Dialog */}
      <AlertDialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-6 w-6" />
              Payment Successful!
            </AlertDialogTitle>
            <AlertDialogDescription>
              Order #{order.orderNumber} has been paid and completed.
              {lastTerminalApproval && (
                <div className="mt-3 p-3 bg-muted rounded-lg text-xs font-mono text-foreground">
                  Approved: {lastTerminalApproval.cardBrand} (••••{lastTerminalApproval.last4}) • {lastTerminalApproval.entryMode} • Auth #{lastTerminalApproval.authCode}
                </div>
              )}
              {changeAmount > 0 && (
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <p className="text-sm text-muted-foreground">Change Due</p>
                  <p className="text-3xl font-bold text-green-600">
                    {formatCurrency(changeAmount, currencyConfig)}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleSuccessClose}>
              Return to POS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
