"use client";

/**
 * Device signals for the welcome bonus (one bonus per device): a random ID
 * kept on this device (local storage + a year-long cookie), and a fingerprint,
 * which is a SHA-256 hash of how the device looks to the browser (screen, time zone,
 * language, hardware, how it draws text). Nothing personal is read; private
 * browsing or clearing data resets the ID but usually not the fingerprint.
 */
const KEY = "loi_did";

function readCookie(name: string) {
  return document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.split("=")[1] ?? null;
}

export function deviceId(): string {
  let id: string | null = null;
  try { id = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  id ??= readCookie(KEY);
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) id = crypto.randomUUID().replace(/-/g, "");
  try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ }
  document.cookie = `${KEY}=${id}; Max-Age=${60 * 60 * 24 * 400}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  return id;
}

async function sha256(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deviceFingerprint(): Promise<string | undefined> {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    let canvas = "";
    try {
      const c = document.createElement("canvas"); c.width = 220; c.height = 30;
      const g = c.getContext("2d");
      if (g) { g.textBaseline = "top"; g.font = "16px Arial"; g.fillStyle = "#f60"; g.fillRect(0, 0, 60, 20); g.fillStyle = "#069"; g.fillText("LOIMART ₹101 ✓", 2, 2); canvas = c.toDataURL(); }
    } catch { /* canvas blocked */ }
    const parts = [
      nav.userAgent, nav.platform, nav.language, (nav.languages ?? []).join(","), Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen.width, screen.height, screen.colorDepth, window.devicePixelRatio, nav.hardwareConcurrency ?? "", nav.deviceMemory ?? "", nav.maxTouchPoints ?? "", canvas,
    ];
    return await sha256(parts.join("|"));
  } catch {
    return undefined;
  }
}

export async function deviceSignals() {
  return { deviceId: deviceId(), fingerprint: await deviceFingerprint() };
}
