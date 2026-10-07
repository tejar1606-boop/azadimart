export type PaymentProviderCode = "RAZORPAY" | "CASHFREE" | "COD";

export type CreatePaymentInput = {
  orderId: string;
  amountPaise: number;
  currency: "INR";
  customer: { id: string; email?: string; phone?: string };
  returnUrl: string;
};

export type PaymentIntent = {
  provider: PaymentProviderCode;
  providerPaymentId: string;
  checkoutUrl?: string;
  status: "PENDING" | "AUTHORIZED" | "CAPTURED";
};

export type PaymentWebhookEvent = {
  provider: PaymentProviderCode;
  providerPaymentId: string;
  status: "CAPTURED" | "FAILED" | "REFUNDED";
  raw: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  readonly isConfigured: boolean;
  createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
  refund(providerPaymentId: string, amountPaise: number): Promise<{ providerRefundId: string }>;
  parseWebhook(headers: Headers, body: unknown): Promise<PaymentWebhookEvent>;
}

export class CodPaymentProvider implements PaymentProvider {
  readonly code = "COD" as const;
  readonly isConfigured = true;

  async createPayment(input: CreatePaymentInput): Promise<PaymentIntent> {
    return {
      provider: "COD",
      providerPaymentId: `cod_${input.orderId}`,
      status: "PENDING",
    };
  }

  async refund(): Promise<{ providerRefundId: string }> {
    throw new Error("COD refunds are processed as order adjustments, not PSP refunds");
  }

  async parseWebhook(): Promise<PaymentWebhookEvent> {
    throw new Error("COD has no PSP webhook");
  }
}

export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly isConfigured = false;
  constructor(readonly code: Exclude<PaymentProviderCode, "COD">) {}

  async createPayment(): Promise<PaymentIntent> {
    throw new Error(`${this.code} is not configured`);
  }

  async refund(): Promise<{ providerRefundId: string }> {
    throw new Error(`${this.code} is not configured`);
  }

  async parseWebhook(): Promise<PaymentWebhookEvent> {
    throw new Error(`${this.code} is not configured`);
  }
}

const registry = new Map<PaymentProviderCode, PaymentProvider>([
  ["COD", new CodPaymentProvider()],
  ["RAZORPAY", new UnconfiguredPaymentProvider("RAZORPAY")],
  ["CASHFREE", new UnconfiguredPaymentProvider("CASHFREE")],
]);

export function registerPaymentProvider(provider: PaymentProvider): void {
  registry.set(provider.code, provider);
}

export function getPaymentProvider(code: PaymentProviderCode): PaymentProvider {
  const provider = registry.get(code);
  if (!provider) {
    throw new Error(`Unknown payment provider: ${code}`);
  }
  return provider;
}


export function getPaymentProviderReadiness(): Array<{ code: PaymentProviderCode; isConfigured: boolean }> {
  return Array.from(registry.values()).map((provider) => ({
    code: provider.code,
    isConfigured: provider.isConfigured,
  }));
}
