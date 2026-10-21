# Open Restaurant — Payment Providers & Card Terminal Integration Guide

Open Restaurant includes a pluggable, PCI-out-of-scope **Payment Provider Adapter Architecture** supporting both **In-Person Card-Present EMV/NFC Terminals** (PAX, Dejavoo, Simulated Reader), **Online / Web Payments** (Stripe, PayPal), **Gift Cards**, and **Cash / Multi-Tender Split Checks**.

---

## 1. Supported Payment Providers

| Provider Code | Adapter File | Type | Supported Tenders |
| :--- | :--- | :--- | :--- |
| `pp_terminal_terminal` | `features/integrations/payment/terminal.ts` | **Semi-Integrated Physical Card Terminal (BYO Processor)** | EMV Chip, Contactless NFC (Apple Pay / Google Pay), Magstripe Swipe, On-Terminal Tipping |
| `pp_stripe_stripe` | `features/integrations/payment/stripe.ts` | **Stripe PaymentIntents & Elements** | Web Credit/Debit Cards, Apple Pay, Google Pay |
| `pp_paypal_paypal` | `features/integrations/payment/paypal.ts` | **PayPal Orders v2** | PayPal Wallet & Checkout |
| `pp_system_default` | `features/integrations/payment/manual.ts` | **In-House Cash & Manual Tender** | Cash (with automatic ESC/POS cash drawer kick & change calculation) |

---

## 2. Physical Card Terminals (Option C: Bring-Your-Own-Processor)

Because physical EMV/NFC card readers require PCI PTS and EMV Level 1 & Level 2 hardware certifications, Open Restaurant uses a **Semi-Integrated Terminal Architecture**:
- Your POS sends only the **Order Amount**, **Invoice Number**, and **Idempotency Reference ID** to the terminal.
- The physical terminal handles the **Tap / Chip / PIN**, **DUKPT Hardware Encryption**, and **On-Screen Customer Tip Selection** directly with the merchant bank/processor (TSYS, Fiserv, Elavon, Worldpay, Clearent, etc.).
- Raw card numbers never touch the Open Restaurant server or database (**Zero PCI Scope**).

### Supported Terminal Protocols

#### A. Dejavoo SPIN / iPOSpays REST API (`dejavoo_spin`)
- **Compatible Hardware:** Dejavoo P1, P3, P5, QD2, QD4, Z9, Z11 (Aura / iPOSpays firmware).
- **How It Works:** Cloud REST relay (`https://spinpos.net/spin/v2/Payment/Sale` for production, `https://test.spinpos.net/spin/v2/Payment/Sale` for sandbox). Works seamlessly whether Open Restaurant is hosted in the cloud or locally on-premise.
- **Required Credentials:**
  - `TPN` (10–12 digit Terminal Profile Number)
  - `AuthKey` (SPIN Merchant Authentication Key)

#### B. PAX BroadPOS / POSLink Local HTTP (`pax_poslink`)
- **Compatible Hardware:** PAX A80, A920 Pro, A35, IM30 running BroadPOS with POSLink HTTP enabled.
- **How It Works:** Direct local LAN HTTP POST (`http://<TERMINAL_IP>:10009/poslink/payment`) sending command `T00` (`DoCredit` Sale `01` / Return `02`) with `TipRequestFlag`.
- **Required Credentials:**
  - `Local LAN IP Address` (e.g., `192.168.1.210`)
  - `POSLink Port` (default: `10009`)

#### C. Simulated Hardware Terminal (`simulated`)
- **Zero-Hardware Testing:** Enabled by default for development and open-source contributors.
- Renders an interactive **Virtual PAX / Dejavoo Touchscreen** inside the POS checkout modal so you can test:
  - Customer on-screen tip selection (`No Tip`, `15%`, `18%`, `20%`)
  - **Tap Visa (`••4242`)** via NFC
  - **Insert Mastercard (`••8899`)** via EMV Chip
  - **Simulated Issuer Decline**

---

## 3. Where to Configure & Use Payments in the Portal

### A. Global Payment Providers Admin Page
- **URL:** `http://localhost:3000/dashboard/platform/payment-providers`
- Click **`+ Connect Provider`** to open the preset selector drawer:
  - **`📟 PAX / Dejavoo Terminal (BYO Processor)`**
  - **`👋 Cash / Manual Tender`**
  - **`💳 Stripe`**
  - **`🟦 PayPal`**

### B. Per-Register POS Hardware & Terminal Modal
Each iPad or POS workstation can pair to the physical card reader sitting at its counter:
1. Open the POS at `http://localhost:3000/dashboard/platform/pos` (or the Order Payment screen).
2. Click the **Hardware / Terminal** button in the top-right header.
3. Select the **`Card Terminal`** tab.
4. Choose **`Simulated`**, **`Dejavoo SPIN`**, **`PAX POSLink`**, or **`Stripe Web`**, enter your TPN/AuthKey or Local IP/Port, toggle **"Prompt Customer for Tip on Terminal Screen"**, and click **"Test Terminal Connection"**.

### C. POS Checkout & Split-Check Terminal Flow
1. Create an order on `/dashboard/platform/pos` and proceed to payment (`/dashboard/platform/pos/[orderId]/payment`).
2. Select the **`Card`** tab (or **`Split`** tab $\rightarrow$ **`Pay Card`** on any guest share or seat bill).
3. Click **`Send $XX.XX to Card Terminal`**.
4. When the customer selects a tip on the terminal screen and taps their card, `processPayment` automatically reconciles the on-terminal tip into `restaurantOrder.tip` and `restaurantOrder.total`, records the `cardBrand`, `last4`, `entryMode`, and `authCode`, and closes the check.

---

## 4. Environment Variables (`.env`)

```env
# Optional - Semi-Integrated Payment Terminals (PAX / Dejavoo / Simulated)
TERMINAL_PROTOCOL="simulated" # "simulated" | "dejavoo_spin" | "pax_poslink"
DEJAVOO_TPN=""
DEJAVOO_AUTH_KEY=""
DEJAVOO_ENV="sandbox"         # "sandbox" | "production"
PAX_TERMINAL_IP="192.168.1.210"
PAX_TERMINAL_PORT="10009"

# Optional - Stripe (Web Checkout & Elements)
NEXT_PUBLIC_STRIPE_KEY=""
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""

# Optional - PayPal
NEXT_PUBLIC_PAYPAL_CLIENT_ID=""
PAYPAL_CLIENT_SECRET=""
```

---

## 5. Adding a Custom Payment Provider Adapter

You can plug in any custom gateway by creating a new file in `features/integrations/payment/<your-provider>.ts` (or pointing a `PaymentProvider` record to an external `https://...` webhook URL) that exports:

```ts
export async function createPaymentFunction({ provider, order, amount, currency, idempotencyKey, terminalConfig }) {}
export async function capturePaymentFunction({ provider, paymentId, amount }) {}
export async function refundPaymentFunction({ provider, paymentId, amount, idempotencyKey }) {}
export async function getPaymentStatusFunction({ provider, paymentId }) {}
export async function generatePaymentLinkFunction({ provider, paymentId }) {}
export async function handleWebhookFunction({ provider, event, headers, rawBody }) {}
```
