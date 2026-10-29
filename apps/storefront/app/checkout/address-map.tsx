"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export type LatLng = { lat: number; lng: number };
const INDIA: LatLng = { lat: 22.5, lng: 79 };

/**
 * OpenStreetMap with a pin fixed in the middle: the shopper drags the map
 * under the pin, and onMove reports where the pin points once they let go.
 * `goTo` changes whenever the form wants the map to jump (location found, search picked).
 */
export function AddressMap({ goTo, onMove }: { goTo: (LatLng & { key: number }) | null; onMove: (at: LatLng) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const moved = useRef(onMove);
  moved.current = onMove;
  // Where the form last sent the map; arriving there isn't a drag by the shopper.
  const jumpedTo = useRef<LatLng | null>(null);
  const latest = useRef(goTo);
  latest.current = goTo;

  useEffect(() => {
    let gone = false;
    void import("leaflet").then((L) => {
      if (gone || !box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([INDIA.lat, INDIA.lng], 4);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      m.on("moveend", () => {
        const c = m.getCenter();
        const j = jumpedTo.current;
        if (j && Math.abs(j.lat - c.lat) < 1e-5 && Math.abs(j.lng - c.lng) < 1e-5) return;
        if (m.getZoom() < 14) return; // too far out to be an address
        moved.current({ lat: c.lat, lng: c.lng });
      });
      map.current = m;
      if (latest.current) { jumpedTo.current = latest.current; m.setView([latest.current.lat, latest.current.lng], 17); }
    });
    return () => { gone = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!goTo || !map.current) return;
    jumpedTo.current = goTo;
    map.current.setView([goTo.lat, goTo.lng], 17, { animate: true });
  }, [goTo]);

  return (
    <div className="relative h-full w-full">
      <div ref={box} className="absolute inset-0 z-0" />
      {/* The pin stays in the middle; its tip marks the spot. */}
      <svg viewBox="0 0 24 36" className="pointer-events-none absolute left-1/2 top-1/2 z-[400] h-11 w-8 -translate-x-1/2 -translate-y-full drop-shadow-md" aria-hidden="true">
        <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 36 12 36s12-15.2 12-24.1C24 5.3 18.6 0 12 0z" fill="#e11d48" />
        <circle cx="12" cy="12" r="4.5" fill="#fff" />
      </svg>
    </div>
  );
}
