# Payment Provider Adapters (`features/integrations/payment`)

This directory contains the payment provider adapters used by Open Restaurant's GraphQL payment engine (`features/keystone/mutations/processPayment.ts` and `features/keystone/utils/paymentProviderAdapter.ts`).

See the full **[Payment Providers & Card Terminal Integration Guide](../../../PAYMENT_PROVIDERS.md)** in the repository root for hardware setup, Dejavoo SPIN & PAX POSLink configuration, environment variables, and POS usage instructions.

## Included Adapters
- **`terminal.ts`**: Semi-integrated physical card terminal adapter supporting **Dejavoo SPIN (Cloud REST)**, **PAX BroadPOS / POSLink (Local LAN HTTP)**, and the built-in **Simulated Hardware Reader**.
- **`stripe.ts`**: Stripe PaymentIntents, Web Elements confirmation, captures, refunds, and webhook verification.
- **`paypal.ts`**: PayPal Orders v2 creation, capture, and refund integration.
- **`manual.ts`**: In-house cash and manual tender processing.
