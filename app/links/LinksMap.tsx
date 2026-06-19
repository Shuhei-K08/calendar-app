"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  storeName: string;
  genre: string;
  area: string;
  color: string;
  url: string;
  mapUrl: string;
};

const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";

let leafletPromise: Promise<void> | null = null;

function loadLeaflet(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).L) return Promise.resolve();
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise<void>((resolve, reject) => {
    // CSS
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    // JS
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).L) resolve();
      else existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Leaflet load failed"));
    document.body.appendChild(script);
  });
  return leafletPromise;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );

export default function LinksMap({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Leaflet読み込み
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 地図初期化
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = (window as any).L;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([35.68, 139.76], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 80);
  }, [ready]);

  // マーカー更新
  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;
    const L = (window as any).L;
    layerRef.current.clearLayers();
    const bounds: [number, number][] = [];
    points.forEach((p) => {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 9,
        color: "#ffffff",
        weight: 2,
        fillColor: p.color,
        fillOpacity: 0.95,
      });
      const area = p.area ? `<div style="color:#64748b;font-size:12px">${esc(p.area)}</div>` : "";
      marker.bindPopup(
        `<div style="min-width:160px">
           <div style="font-weight:700;margin-bottom:2px">${esc(p.storeName)}</div>
           <div style="color:#64748b;font-size:12px">${esc(p.genre)}</div>
           ${area}
           <div style="margin-top:6px;display:flex;gap:8px">
             <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">URL</a>
             <a href="${esc(p.mapUrl)}" target="_blank" rel="noopener noreferrer">Google地図</a>
           </div>
         </div>`,
      );
      marker.addTo(layerRef.current);
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length === 1) {
      mapRef.current.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
    setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 80);
  }, [points, ready]);

  // アンマウント時に破棄
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--fg-muted)]">
        地図の読み込みに失敗しました。通信環境をご確認ください。
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full rounded-xl" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--fg-muted)]">
          地図を読み込み中…
        </div>
      )}
    </div>
  );
}
