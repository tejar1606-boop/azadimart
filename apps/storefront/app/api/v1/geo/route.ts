import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { AppError, matchIndiaState, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/**
 * Fills the address form for signed-in shoppers:
 *   ?pin=560103          → city and state for a PIN code (India Post directory)
 *   ?lat=12.93&lng=77.67 → area, city, state and PIN for the map pin / "Use my current location" (OpenStreetMap)
 *   ?q=sakra hospital    → places in India for the map's search box (Photon, built on OpenStreetMap)
 * Looked up from the server so the shopper's browser never talks to these services directly.
 * Both are free public services with fair-use limits; switch to a paid maps key (Google / Mappls) before heavy traffic.
 */
type Found = { area: string; city: string; state: string; postalCode: string };
const cache = new Map<string, { at: number; found: Found | null }>();
const DAY = 24 * 60 * 60 * 1000;
let lastOsmCall = 0;
const UA = "LOIMART address lookup (support@loimart.com)";

async function byPin(pin: string): Promise<Found | null> {
  const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(8000) });
  const body = (await r.json().catch(() => null)) as Array<{ Status: string; PostOffice: Array<{ Name: string; District: string; State: string; Block: string }> | null }> | null;
  const offices = body?.[0]?.Status === "Success" ? body[0].PostOffice ?? [] : [];
  const first = offices[0];
  if (!first) return null;
  return { area: "", city: first.District, state: matchIndiaState(first.State), postalCode: pin };
}

async function byPoint(lat: number, lng: number): Promise<Found | null> {
  // OpenStreetMap's public server allows about one lookup per second.
  const wait = lastOsmCall + 1100 - Date.now();
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  lastOsmCall = Date.now();
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  const body = (await r.json().catch(() => null)) as { address?: Record<string, string> } | null;
  const a = body?.address;
  if (!a || a.country_code !== "in") return null;
  const parts = [a.amenity ?? a.building ?? a.shop ?? a.office, a.road, a.neighbourhood, a.quarter, a.suburb].filter((p): p is string => Boolean(p));
  const area = [...new Set(parts)].join(", ");
  const postalCode = (a.postcode ?? "").replace(/\s/g, "");
  return { area, city: a.city ?? a.town ?? a.village ?? a.state_district ?? a.county ?? "", state: matchIndiaState(a.state), postalCode: /^[1-9][0-9]{5}$/.test(postalCode) ? postalCode : "" };
}

type Place = { name: string; detail: string; lat: number; lng: number };
const searches = new Map<string, { at: number; places: Place[] }>();

async function search(q: string, near: { lat: number; lng: number } | null): Promise<Place[]> {
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : "&lat=20.59&lon=78.96";
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&bbox=68,6,98,38${bias}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  const body = (await r.json().catch(() => null)) as { features?: Array<{ geometry: { coordinates: [number, number] }; properties: Record<string, string> }> } | null;
  return (body?.features ?? []).filter((f) => f.properties.countrycode === "IN").slice(0, 6).map((f) => {
    const p = f.properties;
    const detail = [...new Set([p.street, p.locality, p.district, p.city, p.state, p.postcode].filter(Boolean))].filter((x) => x !== p.name).join(", ");
    return { name: p.name ?? p.street ?? p.city ?? "", detail, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
  }).filter((x) => x.name);
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    if (q !== undefined) {
      await enforceRateLimit(createDatabase(), request, "addressSearch", { subject: session.userId, rule: { limit: 150, windowSeconds: 10 * 60 } });
      if (q.length < 3 || q.length > 100) return NextResponse.json({ places: [] });
      const nl = Number(url.searchParams.get("lat")), ng = Number(url.searchParams.get("lng"));
      const near = Number.isFinite(nl) && Number.isFinite(ng) && nl !== 0 ? { lat: Math.round(nl * 10) / 10, lng: Math.round(ng * 10) / 10 } : null;
      const key = q.toLowerCase() + (near ? `@${near.lat},${near.lng}` : "");
      const hit = searches.get(key);
      if (hit && Date.now() - hit.at < DAY) return NextResponse.json({ places: hit.places });
      const places = await search(q, near).catch(() => []);
      if (searches.size > 5000) searches.clear();
      searches.set(key, { at: Date.now(), places });
      return NextResponse.json({ places });
    }
    await enforceRateLimit(createDatabase(), request, "addressLookup", { subject: session.userId, rule: { limit: 80, windowSeconds: 10 * 60 } });
    const pin = url.searchParams.get("pin");
    const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));
    let key: string, look: () => Promise<Found | null>;
    if (pin !== null) {
      if (!/^[1-9][0-9]{5}$/.test(pin)) throw new AppError("VALIDATION_ERROR", "Enter a valid 6-digit PIN code");
      key = "pin:" + pin; look = () => byPin(pin);
    } else if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98) {
      // ~100 m grid so nearby shoppers share a lookup.
      key = `pt:${lat.toFixed(3)},${lng.toFixed(3)}`; look = () => byPoint(lat, lng);
    } else throw new AppError("VALIDATION_ERROR", "Location must be in India");
    const hit = cache.get(key);
    let found: Found | null;
    if (hit && Date.now() - hit.at < DAY) found = hit.found;
    else {
      found = await look().catch(() => null);
      if (cache.size > 5000) cache.clear();
      cache.set(key, { at: Date.now(), found });
    }
    if (!found) return NextResponse.json({ found: null, message: pin !== null ? "We couldn't find this PIN code. Please type the city and state." : "We couldn't find your address. Please type it in." });
    return NextResponse.json({ found });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
