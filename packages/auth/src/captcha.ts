import { AppError, logger } from "@azadimart/shared";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

let warnedMissingSecret = false;

/** Bot check is enforced only when TURNSTILE_SECRET_KEY is configured. */
export function isCaptchaEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

/**
 * Verify a Cloudflare Turnstile token server-side. Throws CAPTCHA-specific
 * VALIDATION_ERROR when the token is missing or rejected. When no secret is
 * configured the check is skipped (and a warning logged once), so local and
 * preview environments keep working until keys are added.
 */
export async function verifyCaptcha(
  token: string | undefined,
  ipAddress: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      logger.warn("TURNSTILE_SECRET_KEY is not set; bot check is disabled");
    }
    return;
  }

  if (!token) {
    throw new AppError("VALIDATION_ERROR", "Please complete the security check.", { field: "captchaToken" });
  }

  const body = new URLSearchParams({ secret, response: token });
  if (ipAddress !== "unknown") body.set("remoteip", ipAddress);

  let result: { success?: boolean; "error-codes"?: string[] };
  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    result = (await response.json()) as typeof result;
  } catch (error) {
    logger.error("Turnstile verification request failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("INTERNAL", "Security check is temporarily unavailable. Please try again.", undefined, true);
  }

  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Security check failed. Please try again.", {
      field: "captchaToken",
      codes: result["error-codes"] ?? [],
    });
  }
}
