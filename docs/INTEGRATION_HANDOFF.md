# Integration handoff

## Current state

AzadiMart has provider-agnostic interfaces for payments and logistics. The checkout foundation currently supports **Cash on Delivery** only. Razorpay and Cashfree are intentionally unconfigured until their official API credentials and integration documentation are supplied.

Logistics currently supports a **manual shipment workflow** for development and operations testing. Shiprocket, Delhivery, and Shadowfax remain unconfigured until provider credentials, pickup-address requirements, serviceability rules, webhook specifications, and production API details are supplied.

No live payment secrets, carrier secrets, or provider tokens belong in this repository.

## Payment handoff

When provider documentation is received, wire the selected provider behind `packages/payments` rather than calling a gateway SDK from route handlers.

Required handoff data:

- Merchant/account identifier
- Test and production credentials
- API base URLs
- Order/payment creation flow
- Payment verification/signature rules
- Refund and cancellation APIs
- Webhook events, signature verification, and retry behavior
- Settlement/payout requirements
- Supported currencies and payment methods

Before enabling online payment in checkout, add provider-specific verification tests and keep COD as the fallback.

## Logistics handoff

When carrier documentation is received, wire the provider behind `packages/logistics`.

Required handoff data:

- Account/merchant identifier
- Test and production credentials
- API base URLs
- Seller pickup-address requirements
- Pincode serviceability API
- Shipment creation payload
- AWB generation/assignment flow
- Cancellation API
- Tracking API
- Webhook events, signature verification, and retry behavior
- COD availability and shipment fee calculation
- Weight/dimension constraints

Do not hard-code a provider into checkout or seller screens. The application should continue using the shared logistics abstraction.

## Production gate

Do not mark payments or carrier integration as production-ready until credentials, webhook verification, provider error handling, retry/idempotency behavior, and end-to-end test cases have been validated in a controlled environment.
