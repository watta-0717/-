// 位置情報・距離計算
import { store } from './state.js';

let last = null;
let watchId = null;
const listeners = new Set();

export function distance(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m) {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
}

// 徒歩 約80m/分
export const walkMinutes = (m) => Math.max(1, Math.round(m / 80));

export const geo = {
  get position() { return last; },

  start() {
    if (watchId != null || !('geolocation' in navigator)) return;
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        last = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        listeners.forEach((fn) => fn(last));
      },
      () => { /* 許可されない場合は last = null のまま */ },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  },

  onChange(fn) { listeners.add(fn); if (last) fn(last); return () => listeners.delete(fn); },

  distanceTo(spot) { return last ? distance(last, spot) : null; },

  // 開発モードでは常に「到着済み」とみなす
  isNear(spot, radius = spot.radius ?? 100) {
    if (store.get().devMode) return true;
    const d = this.distanceTo(spot);
    // GPS誤差を考慮して精度分だけ許容する（最大50m）
    return d != null && d <= radius + Math.min(last.accuracy ?? 0, 50);
  },
};
