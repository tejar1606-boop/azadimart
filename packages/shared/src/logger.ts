export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogFields = {
  requestId?: string;
  actorId?: string;
  role?: string;
  app?: string;
  [key: string]: unknown;
};

const REDACT_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "secret",
  "authorization",
  "cookie",
  "pan",
  "gstin",
  "accountNumber",
  "ifsc",
  "aadhaar",
  "otp",
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      if (REDACT_KEYS.has(key) || key.toLowerCase().includes("secret")) {
        return [key, "[REDACTED]"];
      }
      return [key, redact(nested)];
    });
    return Object.fromEntries(entries);
  }
  return value;
}

export function createLogger(defaultFields: LogFields = {}) {
  const minLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

  function write(level: LogLevel, message: string, fields: LogFields = {}) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
      return;
    }
    const safeFields = redact({ ...defaultFields, ...fields }) as LogFields;
    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...safeFields,
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (message: string, fields?: LogFields) => write("debug", message, fields),
    info: (message: string, fields?: LogFields) => write("info", message, fields),
    warn: (message: string, fields?: LogFields) => write("warn", message, fields),
    error: (message: string, fields?: LogFields) => write("error", message, fields),
    child: (fields: LogFields) => createLogger({ ...defaultFields, ...fields }),
  };
}

export const logger = createLogger({ service: "azadimart" });
