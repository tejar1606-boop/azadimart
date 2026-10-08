import { ZodError } from "zod";
import { logger } from "./logger";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "TENANT_ISOLATION"
  | "PAYLOAD_TOO_LARGE"
  | "UNPROCESSABLE"
  | "INTERNAL";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  TENANT_ISOLATION: 403,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(code: ErrorCode, message: string, details?: unknown, expose = true) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
    this.expose = expose;
  }
}

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
};

function normalizeError(error: unknown): unknown {
  if (error instanceof ZodError) {
    return new AppError(
      "VALIDATION_ERROR",
      "Request validation failed",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  // request.json() rejects malformed bodies with a SyntaxError.
  if (error instanceof SyntaxError) {
    return new AppError("VALIDATION_ERROR", "Request body must be valid JSON");
  }
  return error;
}

export function toApiError(rawError: unknown, requestId: string): { status: number; body: ApiErrorBody } {
  const error = normalizeError(rawError);
  // Log anything that surfaces as a 5xx so the requestId shown to the client
  // can be traced in server logs; expected 4xx AppErrors stay quiet.
  if (!(error instanceof AppError) || error.status >= 500) {
    const scrub = (text: string | undefined) => text?.replace(/\/\/[^\s/@:]+:[^\s/@]+@/g, "//[REDACTED]@").replace(/\b(password|secret|token|apikey|api_key)=\S+/gi, "$1=[REDACTED]");
    logger.error("Unhandled API error", {
      requestId,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: scrub(error instanceof Error ? error.message : String(error)),
      stack: scrub(error instanceof Error ? error.stack : undefined),
    });
  }
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.expose ? error.message : "An unexpected error occurred",
          details: error.expose ? error.details : undefined,
          requestId,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL",
        message: "An unexpected error occurred",
        requestId,
      },
    },
  };
}
