export type LogisticsProviderCode = "SHIPROCKET" | "DELHIVERY" | "SHADOWFAX" | "MANUAL";

export type Address = {
  name: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: "IN";
};

export type CreateShipmentInput = {
  orderId: string;
  sellerId: string;
  pickup: Address;
  delivery: Address;
  weightGrams: number;
  declaredValuePaise: number;
  idempotencyKey: string;
};

export type ShipmentQuote = {
  provider: LogisticsProviderCode;
  service: string;
  amountPaise: number;
  estimatedDays: number;
};

export type CreatedShipment = {
  provider: LogisticsProviderCode;
  providerShipmentId: string;
  awb?: string;
};

export type TrackingEvent = {
  status: string;
  description: string;
  occurredAt: string;
};

export interface LogisticsProvider {
  readonly code: LogisticsProviderCode;
  readonly isConfigured: boolean;
  quote(input: CreateShipmentInput): Promise<ShipmentQuote[]>;
  createShipment(input: CreateShipmentInput): Promise<CreatedShipment>;
  cancelShipment(providerShipmentId: string): Promise<void>;
  track(providerShipmentId: string): Promise<TrackingEvent[]>;
}

export class ManualLogisticsProvider implements LogisticsProvider {
  readonly code = "MANUAL" as const;
  readonly isConfigured = true;

  async quote(): Promise<ShipmentQuote[]> {
    return [{ provider: "MANUAL", service: "manual", amountPaise: 0, estimatedDays: 5 }];
  }

  async createShipment(input: CreateShipmentInput): Promise<CreatedShipment> {
    return { provider: "MANUAL", providerShipmentId: `manual_${input.orderId}` };
  }

  async cancelShipment(): Promise<void> {}

  async track(): Promise<TrackingEvent[]> {
    return [];
  }
}

class UnconfiguredLogisticsProvider implements LogisticsProvider {
  readonly isConfigured = false;
  constructor(readonly code: Exclude<LogisticsProviderCode, "MANUAL">) {}

  async quote(): Promise<ShipmentQuote[]> {
    throw new Error(`${this.code} is not configured`);
  }
  async createShipment(): Promise<CreatedShipment> {
    throw new Error(`${this.code} is not configured`);
  }
  async cancelShipment(): Promise<void> {
    throw new Error(`${this.code} is not configured`);
  }
  async track(): Promise<TrackingEvent[]> {
    throw new Error(`${this.code} is not configured`);
  }
}

const registry = new Map<LogisticsProviderCode, LogisticsProvider>([
  ["MANUAL", new ManualLogisticsProvider()],
  ["SHIPROCKET", new UnconfiguredLogisticsProvider("SHIPROCKET")],
  ["DELHIVERY", new UnconfiguredLogisticsProvider("DELHIVERY")],
  ["SHADOWFAX", new UnconfiguredLogisticsProvider("SHADOWFAX")],
]);

export function registerLogisticsProvider(provider: LogisticsProvider): void {
  registry.set(provider.code, provider);
}

export function getLogisticsProvider(code: LogisticsProviderCode): LogisticsProvider {
  const provider = registry.get(code);
  if (!provider) {
    throw new Error(`Unknown logistics provider: ${code}`);
  }
  return provider;
}

/** Checkout and order code call this — never a vendor SDK directly. */
export async function createShipmentForOrder(
  code: LogisticsProviderCode,
  input: CreateShipmentInput,
): Promise<CreatedShipment> {
  return getLogisticsProvider(code).createShipment(input);
}


export function getLogisticsProviderReadiness(): Array<{ code: LogisticsProviderCode; isConfigured: boolean }> {
  return Array.from(registry.values()).map((provider) => ({
    code: provider.code,
    isConfigured: provider.isConfigured,
  }));
}
