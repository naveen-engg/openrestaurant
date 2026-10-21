/**
 * Option C: Semi-Integrated Payment Terminal Adapter (PAX POSLink & Dejavoo SPIN / iPOSpays)
 *
 * Supports:
 * 1. Dejavoo SPIN / iPOSpays REST API (Cloud Proxy & Local REST) - compatible with Aura / Dejavoo P1, P3, QD2, QD4
 * 2. PAX BroadPOS / POSLink HTTP REST API (Local LAN IP:10009) - compatible with PAX A80, A920 Pro, A35, IM30
 * 3. Simulated Hardware Terminal - zero-config interactive simulator for open-source contributors & testing
 *
 * Security / PCI Scope:
 * Semi-integrated architecture ensures raw Track/EMV card data never enters Openfront POS.
 * The terminal handles EMV L1/L2, contactless NFC (Apple Pay / Google Pay), and DUKPT PIN encryption directly
 * with the merchant processor (TSYS, Fiserv, Elavon, Worldpay, Clearent, etc.).
 */

export type TerminalProtocol = 'simulated' | 'dejavoo_spin' | 'pax_poslink';

export interface TerminalConnectionConfig {
  protocol: TerminalProtocol;
  terminalName?: string;
  // Dejavoo SPIN / iPOSpays fields
  tpn?: string; // Terminal Profile Number (10-12 digits)
  authKey?: string; // SPIN Merchant Auth Key
  spinEnvironment?: 'sandbox' | 'production';
  spinCustomUrl?: string;
  // PAX POSLink Local LAN fields
  ipAddress?: string; // e.g., 192.168.1.210
  port?: number; // Default 10009 for PAX HTTP/REST
  // Shared behavior
  promptTipOnTerminal?: boolean;
  timeoutSeconds?: number;
  // Optional simulation controls for testing
  simulatedOutcome?: 'approved' | 'declined' | 'timeout';
  simulatedTipCents?: number;
  simulatedEntryMode?: 'TAP' | 'CHIP' | 'SWIPE';
  simulatedCardBrand?: 'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER';
  simulatedLast4?: string;
}

export interface TerminalSaleResponse {
  status: 'succeeded' | 'failed' | 'requires_capture' | 'processing';
  paymentIntentId: string;
  approvedAmountCents: number;
  baseAmountCents: number;
  tipAmountCents: number;
  cardBrand: string;
  last4: string;
  entryMode: string;
  authCode: string;
  terminalProtocol: TerminalProtocol;
  terminalReferenceId: string;
  errorMessage?: string;
  rawResponse?: Record<string, any>;
}

function resolveTerminalConfig(provider?: any, runtimeConfig?: Partial<TerminalConnectionConfig>): TerminalConnectionConfig {
  const credentials = (provider?.credentials || {}) as Record<string, any>;
  const metadata = (provider?.metadata || {}) as Record<string, any>;

  const envProtocol = process.env.TERMINAL_PROTOCOL as TerminalProtocol | undefined;
  const protocol: TerminalProtocol =
    runtimeConfig?.protocol ||
    credentials.protocol ||
    metadata.protocol ||
    envProtocol ||
    (process.env.DEJAVOO_TPN ? 'dejavoo_spin' : process.env.PAX_TERMINAL_IP ? 'pax_poslink' : 'simulated');

  return {
    protocol,
    terminalName: runtimeConfig?.terminalName || credentials.terminalName || metadata.terminalName || 'Counter Terminal 1',
    tpn: runtimeConfig?.tpn || credentials.tpn || process.env.DEJAVOO_TPN || '',
    authKey: runtimeConfig?.authKey || credentials.authKey || process.env.DEJAVOO_AUTH_KEY || '',
    spinEnvironment:
      runtimeConfig?.spinEnvironment ||
      credentials.spinEnvironment ||
      (process.env.DEJAVOO_ENV === 'production' ? 'production' : 'sandbox'),
    spinCustomUrl: runtimeConfig?.spinCustomUrl || credentials.spinCustomUrl || process.env.DEJAVOO_SPIN_URL,
    ipAddress: runtimeConfig?.ipAddress || credentials.ipAddress || process.env.PAX_TERMINAL_IP || '192.168.1.210',
    port: Number(runtimeConfig?.port || credentials.port || process.env.PAX_TERMINAL_PORT || 10009),
    promptTipOnTerminal:
      runtimeConfig?.promptTipOnTerminal ??
      credentials.promptTipOnTerminal ??
      metadata.promptTipOnTerminal ??
      true,
    timeoutSeconds: Number(runtimeConfig?.timeoutSeconds || credentials.timeoutSeconds || 60),
    simulatedOutcome: runtimeConfig?.simulatedOutcome || 'approved',
    simulatedTipCents: runtimeConfig?.simulatedTipCents,
    simulatedEntryMode: runtimeConfig?.simulatedEntryMode || 'TAP',
    simulatedCardBrand: runtimeConfig?.simulatedCardBrand || 'VISA',
    simulatedLast4: runtimeConfig?.simulatedLast4 || '4242',
  };
}

/**
 * 1. Dejavoo SPIN (REST v2) Implementation
 * Documentation: https://app.theneo.io/dejavoo/spin/payment-api
 */
async function executeDejavooSpinSale({
  config,
  amountCents,
  tipCents,
  referenceId,
  orderNumber,
}: {
  config: TerminalConnectionConfig;
  amountCents: number;
  tipCents: number;
  referenceId: string;
  orderNumber?: string;
}): Promise<TerminalSaleResponse> {
  if (!config.tpn || !config.authKey) {
    throw new Error('Dejavoo SPIN requires both TPN (Terminal Profile Number) and AuthKey');
  }

  const baseUrl =
    config.spinCustomUrl ||
    (config.spinEnvironment === 'production'
      ? 'https://spinpos.net/spin'
      : 'https://test.spinpos.net/spin');

  const amountDollars = Number((amountCents / 100).toFixed(2));
  const tipDollars = tipCents > 0 ? Number((tipCents / 100).toFixed(2)) : undefined;

  const payload: Record<string, any> = {
    Amount: amountDollars,
    TipAmount: tipDollars,
    PaymentType: 'Credit',
    ReferenceId: referenceId.slice(0, 32),
    InvoiceNumber: String(orderNumber || '1001').slice(0, 16),
    Tpn: config.tpn,
    Authkey: config.authKey,
    SPInProxyTimeout: Math.min(120, Math.max(15, config.timeoutSeconds || 60)),
    GetExtendedData: true,
    CallbackInfo: {
      Url: '',
    },
  };

  const controller = new AbortController();
  const timeoutMs = (config.timeoutSeconds || 60) * 1000 + 5000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/v2/Payment/Sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Dejavoo SPIN HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    // Dejavoo SPIN status codes: "0000" = Approved
    const resultCode = data?.GeneralResponse?.ResultCode ?? data?.ResultCode;
    const statusCode = data?.GeneralResponse?.StatusCode ?? data?.StatusCode;
    const isApproved = resultCode === '0' && (statusCode === '0000' || statusCode === '0');

    const returnedTipDollars = Number(data?.Amounts?.TipAmount ?? data?.TipAmount ?? tipDollars ?? 0);
    const returnedTotalDollars = Number(data?.Amounts?.TotalAmount ?? data?.TotalAmount ?? amountDollars + returnedTipDollars);
    const finalTipCents = Math.round(returnedTipDollars * 100);
    const finalTotalCents = Math.round(returnedTotalDollars * 100);

    if (!isApproved) {
      const detail =
        data?.GeneralResponse?.DetailedMessage ||
        data?.GeneralResponse?.Message ||
        data?.Message ||
        'Card declined on Dejavoo terminal';
      return {
        status: 'failed',
        paymentIntentId: `spin_${referenceId}`,
        approvedAmountCents: 0,
        baseAmountCents: amountCents,
        tipAmountCents: 0,
        cardBrand: data?.CardData?.CardType || 'UNKNOWN',
        last4: data?.CardData?.Last4 || '0000',
        entryMode: data?.CardData?.EntryType || 'UNKNOWN',
        authCode: '',
        terminalProtocol: 'dejavoo_spin',
        terminalReferenceId: referenceId,
        errorMessage: detail,
        rawResponse: data,
      };
    }

    return {
      status: 'succeeded',
      paymentIntentId: data?.ReferenceId || `spin_${referenceId}`,
      approvedAmountCents: finalTotalCents,
      baseAmountCents: amountCents,
      tipAmountCents: finalTipCents,
      cardBrand: String(data?.CardData?.CardType || 'CARD').toUpperCase(),
      last4: String(data?.CardData?.Last4 || '0000').slice(-4),
      entryMode: String(data?.CardData?.EntryType || 'TAP').toUpperCase(),
      authCode: String(data?.AuthCode || data?.GeneralResponse?.AuthCode || 'APPROVED'),
      terminalProtocol: 'dejavoo_spin',
      terminalReferenceId: referenceId,
      rawResponse: data,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 2. PAX BroadPOS / POSLink Local HTTP REST Implementation
 * Communicates with a PAX terminal (A80, A920 Pro, A35, IM30) on local network port 10009
 */
async function executePaxPoslinkSale({
  config,
  amountCents,
  tipCents,
  referenceId,
  orderNumber,
}: {
  config: TerminalConnectionConfig;
  amountCents: number;
  tipCents: number;
  referenceId: string;
  orderNumber?: string;
}): Promise<TerminalSaleResponse> {
  if (!config.ipAddress) {
    throw new Error('PAX POSLink requires the terminal Local IP Address (e.g. 192.168.1.210)');
  }

  const port = config.port || 10009;
  const endpoint = `http://${config.ipAddress}:${port}/poslink/payment`;

  const payload = {
    Command: 'T00', // DoCredit
    Version: '1.28',
    TransactionType: '01', // 01 = Sale
    AmountInformation: {
      TransactionAmount: String(amountCents),
      TipAmount: tipCents > 0 ? String(tipCents) : undefined,
    },
    TraceInformation: {
      ReferenceNumber: referenceId.slice(0, 16),
      InvoiceNumber: String(orderNumber || '1001').slice(0, 16),
    },
    CashierInformation: {
      ClerkID: 'POS',
    },
    TipRequestFlag: config.promptTipOnTerminal && tipCents === 0 ? '1' : '0',
  };

  const controller = new AbortController();
  const timeoutMs = (config.timeoutSeconds || 60) * 1000 + 5000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`PAX POSLink HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    // PAX POSLink ResultCode "000000" = OK / Approved
    const isApproved = data?.ResultCode === '000000' || data?.ResponseCode === '00';
    const approvedTotalCents = Number(
      data?.AmountInformation?.ApprovedAmount ?? amountCents + tipCents
    );
    const approvedTipCents = Number(
      data?.AmountInformation?.TipAmount ?? tipCents
    );

    if (!isApproved) {
      return {
        status: 'failed',
        paymentIntentId: `pax_${referenceId}`,
        approvedAmountCents: 0,
        baseAmountCents: amountCents,
        tipAmountCents: 0,
        cardBrand: data?.AccountInformation?.CardType || 'UNKNOWN',
        last4: data?.AccountInformation?.Account?.slice(-4) || '0000',
        entryMode: data?.AccountInformation?.EntryMode || 'UNKNOWN',
        authCode: '',
        terminalProtocol: 'pax_poslink',
        terminalReferenceId: referenceId,
        errorMessage: data?.ResultTxt || data?.ResponseMessage || 'Declined on PAX terminal',
        rawResponse: data,
      };
    }

    return {
      status: 'succeeded',
      paymentIntentId: data?.HostInformation?.TransactionIdentifier || `pax_${referenceId}`,
      approvedAmountCents: approvedTotalCents,
      baseAmountCents: amountCents,
      tipAmountCents: approvedTipCents,
      cardBrand: String(data?.AccountInformation?.CardType || 'VISA').toUpperCase(),
      last4: String(data?.AccountInformation?.Account || '4242').slice(-4),
      entryMode: String(data?.AccountInformation?.EntryMode || 'TAP').toUpperCase(),
      authCode: String(data?.HostInformation?.AuthCode || 'PAXOK'),
      terminalProtocol: 'pax_poslink',
      terminalReferenceId: referenceId,
      rawResponse: data,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 3. Simulated Hardware Terminal (Built-in for Open-Source Dev & E2E Testing)
 */
async function executeSimulatedTerminalSale({
  config,
  amountCents,
  tipCents,
  referenceId,
}: {
  config: TerminalConnectionConfig;
  amountCents: number;
  tipCents: number;
  referenceId: string;
}): Promise<TerminalSaleResponse> {
  if (config.simulatedOutcome === 'declined') {
    return {
      status: 'failed',
      paymentIntentId: `sim_term_${referenceId}`,
      approvedAmountCents: 0,
      baseAmountCents: amountCents,
      tipAmountCents: 0,
      cardBrand: config.simulatedCardBrand || 'VISA',
      last4: config.simulatedLast4 || '0002',
      entryMode: config.simulatedEntryMode || 'TAP',
      authCode: '',
      terminalProtocol: 'simulated',
      terminalReferenceId: referenceId,
      errorMessage: 'Card declined by issuer (Simulated Terminal Decline)',
      rawResponse: { simulated: true, outcome: 'declined' },
    };
  }

  if (config.simulatedOutcome === 'timeout') {
    throw new Error('Terminal timed out waiting for customer card tap');
  }

  const finalTipCents =
    typeof config.simulatedTipCents === 'number'
      ? Math.max(0, Math.round(config.simulatedTipCents))
      : tipCents;
  const approvedTotalCents = amountCents + finalTipCents;

  return {
    status: 'succeeded',
    paymentIntentId: `sim_term_${referenceId}`,
    approvedAmountCents: approvedTotalCents,
    baseAmountCents: amountCents,
    tipAmountCents: finalTipCents,
    cardBrand: config.simulatedCardBrand || 'VISA',
    last4: config.simulatedLast4 || '4242',
    entryMode: config.simulatedEntryMode || 'TAP',
    authCode: `AUTH${referenceId.slice(0, 4).toUpperCase()}`,
    terminalProtocol: 'simulated',
    terminalReferenceId: referenceId,
    rawResponse: {
      simulated: true,
      terminalName: config.terminalName || 'Simulated PAX/Dejavoo Reader',
      entryMode: config.simulatedEntryMode || 'TAP',
      aid: 'A0000000031010',
      tvr: '0000008000',
    },
  };
}

/**
 * Standard Openfront Payment Adapter Exports
 */
export async function createPaymentFunction({
  provider,
  order,
  amount,
  currency,
  idempotencyKey,
  terminalConfig,
}: {
  provider?: any;
  order: any;
  amount: number;
  currency: string;
  idempotencyKey?: string;
  terminalConfig?: Partial<TerminalConnectionConfig>;
}) {
  const config = resolveTerminalConfig(provider, terminalConfig);
  const referenceId = idempotencyKey || `ord_${order?.id || Date.now()}`;
  const orderNumber = order?.orderNumber || '1001';

  let result: TerminalSaleResponse;

  if (config.protocol === 'dejavoo_spin') {
    result = await executeDejavooSpinSale({
      config,
      amountCents: amount,
      tipCents: 0,
      referenceId,
      orderNumber,
    });
  } else if (config.protocol === 'pax_poslink') {
    result = await executePaxPoslinkSale({
      config,
      amountCents: amount,
      tipCents: 0,
      referenceId,
      orderNumber,
    });
  } else {
    result = await executeSimulatedTerminalSale({
      config,
      amountCents: amount,
      tipCents: 0,
      referenceId,
    });
  }

  if (result.status === 'failed') {
    throw new Error(result.errorMessage || 'Terminal transaction was declined');
  }

  return {
    status: result.status,
    paymentIntentId: result.paymentIntentId,
    clientSecret: null, // Physical terminals complete EMV/Tap directly without a web PaymentElement
    amount: result.approvedAmountCents,
    baseAmount: result.baseAmountCents,
    tipAmount: result.tipAmountCents,
    currency: currency.toUpperCase(),
    cardBrand: result.cardBrand,
    last4: result.last4,
    entryMode: result.entryMode,
    authCode: result.authCode,
    terminalProtocol: result.terminalProtocol,
    terminalReferenceId: result.terminalReferenceId,
    rawResponse: result.rawResponse,
  };
}

export async function capturePaymentFunction({
  paymentId,
  amount,
}: {
  provider?: any;
  paymentId: string;
  amount: number;
}) {
  return {
    status: 'succeeded',
    amount,
    data: { paymentId, capturedAt: new Date().toISOString() },
  };
}

export async function refundPaymentFunction({
  provider,
  paymentId,
  amount,
  idempotencyKey,
  terminalConfig,
}: {
  provider?: any;
  paymentId: string;
  amount: number;
  idempotencyKey?: string;
  terminalConfig?: Partial<TerminalConnectionConfig>;
}) {
  const config = resolveTerminalConfig(provider, terminalConfig);
  const referenceId = idempotencyKey || `ref_${paymentId}`;

  if (config.protocol === 'dejavoo_spin' && config.tpn && config.authKey) {
    const baseUrl =
      config.spinCustomUrl ||
      (config.spinEnvironment === 'production'
        ? 'https://spinpos.net/spin'
        : 'https://test.spinpos.net/spin');

    const response = await fetch(`${baseUrl}/v2/Payment/Return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Amount: Number((amount / 100).toFixed(2)),
        PaymentType: 'Credit',
        ReferenceId: referenceId.slice(0, 32),
        Tpn: config.tpn,
        Authkey: config.authKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`Dejavoo SPIN Refund HTTP ${response.status}`);
    }
    const data = await response.json();
    return {
      id: data?.ReferenceId || referenceId,
      refundId: data?.ReferenceId || referenceId,
      status: 'succeeded',
      amount,
      data,
    };
  }

  if (config.protocol === 'pax_poslink' && config.ipAddress) {
    const port = config.port || 10009;
    const response = await fetch(`http://${config.ipAddress}:${port}/poslink/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Command: 'T00',
        Version: '1.28',
        TransactionType: '02', // 02 = Return / Refund
        AmountInformation: {
          TransactionAmount: String(amount),
        },
        TraceInformation: {
          ReferenceNumber: referenceId.slice(0, 16),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`PAX POSLink Refund HTTP ${response.status}`);
    }
    const data = await response.json();
    return {
      id: data?.HostInformation?.TransactionIdentifier || referenceId,
      refundId: data?.HostInformation?.TransactionIdentifier || referenceId,
      status: 'succeeded',
      amount,
      data,
    };
  }

  return {
    id: `term_ref_${referenceId}`,
    refundId: `term_ref_${referenceId}`,
    status: 'succeeded',
    amount,
    data: { simulated: true, paymentId, refundedAt: new Date().toISOString() },
  };
}

export async function getPaymentStatusFunction({
  paymentId,
}: {
  provider?: any;
  paymentId: string;
}) {
  return {
    status: 'succeeded',
    amount: null,
    data: { paymentId },
  };
}

export async function generatePaymentLinkFunction({
  paymentId,
}: {
  provider?: any;
  paymentId: string;
}) {
  return `#terminal-transaction-${paymentId}`;
}

export async function handleWebhookFunction({
  event,
}: {
  provider?: any;
  event: any;
  headers?: any;
  rawBody?: string;
}) {
  return {
    isValid: true,
    event,
    type: event?.type || 'terminal.payment.completed',
    resource: event,
  };
}
