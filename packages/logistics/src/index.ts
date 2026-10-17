export type LogisticsProviderCode = "SHIPROCKET" | "DELHIVERY" | "SHADOWFAX" | "MANUAL" | "LOIMART_TEST";

export type Address = {
  name: string;
  phone: string;
  line1: string;
  /** Flat/house no., landmark: couriers print it on the label. */
  line2?: string;
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

/**
 * Stand-in for LOIMART's own courier account until a real one (Shiprocket,
 * Delhivery…) is connected: books instantly with a test tracking number so
 * the whole LOIMART-shipping flow can be used end to end. Status changes are
 * made by the LOIMART team in Admin → Logistics (a real courier sends them).
 */
export class LoimartTestCourier implements LogisticsProvider {
  readonly code = "LOIMART_TEST" as const;
  readonly isConfigured = true;
  readonly displayName = "LOIMART Test Courier";

  async quote(): Promise<ShipmentQuote[]> {
    return [{ provider: "LOIMART_TEST", service: "surface", amountPaise: 0, estimatedDays: 4 }];
  }

  async createShipment(input: CreateShipmentInput): Promise<CreatedShipment> {
    const digits = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => String(b % 10)).join("");
    return { provider: "LOIMART_TEST", providerShipmentId: `lmt_${input.orderId.slice(0, 8)}_${digits.slice(0, 4)}`, awb: `LMT${digits}` };
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
  ["LOIMART_TEST", new LoimartTestCourier()],
]);

const COURIER_NAMES: Record<LogisticsProviderCode, string> = { MANUAL: "Seller's courier", SHIPROCKET: "Shiprocket", DELHIVERY: "Delhivery", SHADOWFAX: "Shadowfax", LOIMART_TEST: "LOIMART Test Courier" };
export const courierDisplayName = (code: LogisticsProviderCode) => COURIER_NAMES[code];

/**
 * The courier account LOIMART ships with ("LOIMART shipping"). Set
 * LOIMART_COURIER to SHIPROCKET / DELHIVERY / SHADOWFAX once that account is
 * connected; until then the test courier is used.
 */
export function getPlatformCourier(): LogisticsProvider {
  const wanted = (process.env.LOIMART_COURIER ?? "").toUpperCase() as LogisticsProviderCode;
  const provider = registry.get(wanted);
  return provider && provider.isConfigured && provider.code !== "MANUAL" ? provider : registry.get("LOIMART_TEST")!;
}

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
  return Array.from(registry.values()).filter((provider) => provider.code !== "LOIMART_TEST").map((provider) => ({
    code: provider.code,
    isConfigured: provider.isConfigured,
  }));
}
