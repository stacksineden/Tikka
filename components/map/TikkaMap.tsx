"use client";

// One map for Tikka (docs/HOMEPAGE_PLAN.md, the map): the open-source MapLibre map with free
// OpenFreeMap tiles (no key, no bill). The library loads only when a map is on screen. Two uses:
// pins for search results (a price on each, tap to open the listing), and one draggable pin for an
// owner placing their shop.

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  /** What the pin says: "₦12k", "4.8". */
  label: string;
  href?: string;
  /** Worked out from the area and city: drawn lighter. */
  approx?: boolean;
}

const STYLE = "https://tiles.openfreemap.org/styles/liberty";
// Nigeria, for a map with nothing on it yet.
const NIGERIA: [number, number] = [8.0, 9.1];

export function TikkaMap({
  pins = [],
  selected,
  onSelect,
  drag,
  className = "",
  label = "Map",
}: {
  pins?: MapPin[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** One draggable pin (an owner placing their shop). */
  drag?: { lat?: number; lng?: number; onMove: (lat: number, lng: number) => void };
  className?: string;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Map<string, { m: MlMarker; el: HTMLElement }>>(new Map());
  const dragMarker = useRef<MlMarker | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const onSelectRef = useRef(onSelect);
  const onMoveRef = useRef(drag?.onMove);
  onSelectRef.current = onSelect;
  onMoveRef.current = drag?.onMove;

  // The map itself, once.
  useEffect(() => {
    let gone = false;
    void import("maplibre-gl").then((ml) => {
      if (gone || !box.current) return;
      lib.current = ml;
      // The bundler can't find MapLibre's worker file: it's served from public/ (scripts/copy-maplibre-worker.mjs).
      ml.setWorkerUrl(`/maplibre/worker.mjs?v=${ml.getVersion()}`);
      const start = drag?.lat != null && drag?.lng != null ? [drag.lng, drag.lat] : pins.length ? [pins[0].lng, pins[0].lat] : NIGERIA;
      const m = new ml.Map({ container: box.current, style: STYLE, center: start as [number, number], zoom: drag?.lat != null || pins.length ? 12 : 5, attributionControl: { compact: true } });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;
      if (drag) {
        const el = document.createElement("div");
        el.className = "size-9 rounded-full border-4 border-white bg-brand shadow-lg";
        el.setAttribute("aria-label", "Your shop");
        const mk = new ml.Marker({ element: el, draggable: true }).setLngLat(start as [number, number]).addTo(m);
        mk.on("dragend", () => {
          const p = mk.getLngLat();
          onMoveRef.current?.(p.lat, p.lng);
        });
        m.on("click", (e) => {
          mk.setLngLat(e.lngLat);
          onMoveRef.current?.(e.lngLat.lat, e.lngLat.lng);
        });
        dragMarker.current = mk;
      }
      m.on("load", () => syncPins());
    });
    const all = markers.current;
    return () => {
      gone = true;
      map.current?.remove();
      map.current = null;
      all.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Result pins: add, update and remove as the list changes, then fit them in view.
  function syncPins() {
    const ml = lib.current;
    const m = map.current;
    if (!ml || !m) return;
    const keep = new Set(pins.map((p) => p.id));
    for (const [id, { m: mk }] of markers.current) if (!keep.has(id)) {
      mk.remove();
      markers.current.delete(id);
    }
    for (const p of pins) {
      let entry = markers.current.get(p.id);
      if (!entry) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "rounded-full px-2.5 py-1 text-[13px] font-bold shadow-md transition-transform";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current?.(p.id);
        });
        entry = { m: new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m), el };
        markers.current.set(p.id, entry);
      }
      entry.el.textContent = p.label;
      entry.el.setAttribute("aria-label", `${p.label}${p.approx ? " (area)" : ""}`);
      paint(entry.el, p.id === selected, !!p.approx);
      entry.m.setLngLat([p.lng, p.lat]);
    }
    m.resize();
    if (pins.length > 1) {
      const b = new ml.LngLatBounds();
      for (const p of pins) b.extend([p.lng, p.lat]);
      m.fitBounds(b, { padding: { top: 70, bottom: 70, left: 50, right: 60 }, maxZoom: 14, duration: 0 });
    } else if (pins.length === 1) m.jumpTo({ center: [pins[0].lng, pins[0].lat], zoom: 13 });
  }
  function paint(el: HTMLElement, on: boolean, approx: boolean) {
    el.style.background = on ? "var(--ink)" : "var(--surface-raised)";
    el.style.color = on ? "var(--surface)" : "var(--ink)";
    el.style.border = approx ? "1.5px dashed var(--line-strong)" : "1.5px solid transparent";
    el.style.transform = on ? "scale(1.12)" : "";
    el.style.zIndex = on ? "2" : "1";
  }

  useEffect(() => {
    if (map.current?.loaded()) syncPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins.map((p) => `${p.id}:${p.lat}:${p.lng}:${p.label}`).join("|")]);
  useEffect(() => {
    for (const p of pins) {
      const e = markers.current.get(p.id);
      if (e) paint(e.el, p.id === selected, !!p.approx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return <div ref={box} role="region" aria-label={label} className={`overflow-hidden ${className}`} />;
}
