"use client";

import { useEffect, useState } from "react";

type Prefs = { newOrders: boolean; reminders: boolean; cancellations: boolean };
type DeviceState = "checking" | "unsupported" | "blocked" | "on" | "off";

const OPTIONS: Array<[keyof Prefs, string, string]> = [
  ["newOrders", "New orders", "The moment a customer orders your product."],
  ["reminders", "Ship-by reminders", "When an order must ship today, and if it's late."],
  ["cancellations", "Cancellations", "When a customer or AzadiMart cancels an order, so you don't ship it."],
];

/** Converts the VAPID public key (base64url) for pushManager.subscribe. */
function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export default function AlertSettings({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [devices, setDevices] = useState(0);
  const [device, setDevice] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const body = await fetch("/api/v1/notifications/settings", { cache: "no-store" }).then((r) => r.json());
    setPrefs(body.settings); setDevices(body.devices);
  }
  async function checkDevice() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { setDevice("unsupported"); return; }
    if (Notification.permission === "denied") { setDevice("blocked"); return; }
    const reg = await navigator.serviceWorker.getRegistration("/");
    setDevice(reg && (await reg.pushManager.getSubscription()) ? "on" : "off");
  }
  useEffect(() => { void load(); void checkDevice(); }, []);

  async function savePrefs(next: Prefs) {
    setPrefs(next); setError(""); setMessage("");
    const response = await fetch("/api/v1/notifications/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!response.ok) setError("Couldn't save. Please try again."); else setMessage("Saved.");
  }

  async function turnOn() {
    setBusy(true); setError(""); setMessage("");
    try {
      if (!vapidPublicKey) throw new Error("Phone and desktop alerts aren't set up on this server yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setDevice(permission === "denied" ? "blocked" : "off"); throw new Error("Notifications weren't allowed. You can allow them in your browser's site settings."); }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) }));
      const response = await fetch("/api/v1/push-subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!response.ok) throw new Error("Couldn't register this device. Please try again.");
      setDevice("on"); setMessage("Alerts are on for this device."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't turn alerts on."); }
    finally { setBusy(false); }
  }

  async function turnOff() {
    setBusy(true); setError(""); setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/v1/push-subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setDevice("off"); setMessage("Alerts are off for this device."); await load();
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/v1/notifications/test", { method: "POST" });
    setBusy(false);
    if (!response.ok) { setError("Couldn't send a test alert."); return; }
    setMessage(device === "on" ? "Test alert sent. It should appear on this device in a few seconds." : "Test alert sent. It appears here within 30 seconds; turn on device alerts to get it when Seller Hub is closed.");
  }

  const card = "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card";
  const deviceText: Record<DeviceState, string> = {
    checking: "Checking…",
    unsupported: "This browser doesn't support notifications. Try Chrome on Android or a computer (on iPhone, add Seller Hub to your Home Screen first).",
    blocked: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
    on: "On for this device. You'll get alerts even when Seller Hub is closed.",
    off: "Off for this device.",
  };

  return (
    <div className="mt-6 grid max-w-4xl gap-5 lg:grid-cols-2">
      <section className={card}>
        <h2 className="font-semibold">Phone & desktop alerts</h2>
        <p className="mt-1 text-sm text-slate-500">{deviceText[device]}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {device === "on"
            ? <button type="button" disabled={busy} onClick={() => void turnOff()} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-50">Turn off on this device</button>
            : device === "off" ? <button type="button" disabled={busy} onClick={() => void turnOn()} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Turning on…" : "Turn on for this device"}</button> : null}
          <button type="button" disabled={busy} onClick={() => void test()} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-50">Send a test alert</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">{devices} device{devices === 1 ? "" : "s"} receiving alerts. While Seller Hub is open you also get a pop-up and a chime.</p>
      </section>

      <section className={card}>
        <h2 className="font-semibold">What to alert me about</h2>
        {prefs ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {OPTIONS.map(([key, label, hint]) => (
              <li key={key} className="flex items-center justify-between gap-4 py-3">
                <span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-slate-500">{hint}</span></span>
                <button type="button" role="switch" aria-checked={prefs[key]} aria-label={label} onClick={() => void savePrefs({ ...prefs, [key]: !prefs[key] })} className={"relative h-6 w-11 shrink-0 rounded-full transition " + (prefs[key] ? "bg-brand" : "bg-slate-300")}>
                  <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition " + (prefs[key] ? "left-[22px]" : "left-0.5")} />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-slate-500">Loading…</p>}
        <p className="mt-2 text-xs text-slate-500">All alerts still appear in Notices.</p>
      </section>
      {message ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 lg:col-span-2">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 lg:col-span-2">{error}</p> : null}
    </div>
  );
}
