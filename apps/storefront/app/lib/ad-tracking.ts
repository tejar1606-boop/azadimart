/** Counts one view per sponsored ad per browser session. */
export function countAdView(bidId: string) {
  try {
    const key = "azm-ad-" + bidId;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { /* storage blocked: still count */ }
  void fetch("/api/v1/ads/impression", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bidId }), keepalive: true }).catch(() => undefined);
}
