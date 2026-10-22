// オリジナル富士山の生成（2026-10-19 全体エンディング）
// 旅の途中で撮った写真の色・明るさ・鮮やかさから、人ごとに違う富士山を描く
//   const analysis = await analyzePhotos(list);           // 写真 → 色の情報
//   const fuji = buildFuji({ playerName, fragments, analysis });
//   const sprite = renderFujiSprite(fuji);                // 背景なしの富士山（AR・カード・演出で共通）
//   drawSky(ctx, W, H, fuji);                             // 背景の空（カード・演出用）
// AIによる画像生成ではなく、端末の中だけで描く。乱数は名前とクリア日時と写真の色から決まるので、同じ条件なら同じ富士山になる

import { MISSIONS } from '../../missions/registry.js';

// 写真のない地域の色（日本平＝茶畑の緑、久能山＝社殿の朱、三保松原＝松と海の青緑、清水港＝港の藍）
const AREA_COLOR = { nihondaira: [79, 122, 58], kunozan: [176, 65, 46], miho: [47, 111, 115], shimizu: [44, 63, 107] };

export const SPRITE_W = 1000, SPRITE_H = 620;   // 富士山の絵の大きさ（山の幅 = SPRITE_W、高さ ≒ SPRITE_H × 0.9）

// ---------- 乱数・色 ----------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb([h, s, l]) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const css = ([r, g, b], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const mix = (c1, c2, k) => c1.map((v, i) => v + (c2[i] - v) * k);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---------- 写真の解析 ----------
function loadBlob(blob) {
  return new Promise((res) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

// 主な色を k-means（3色）で求める
function dominant(pixels) {
  if (!pixels.length) return [];
  const byL = [...pixels].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let cents = [0.2, 0.5, 0.8].map((q) => byL[Math.floor(q * (byL.length - 1))].slice());
  let groups = [];
  for (let it = 0; it < 6; it++) {
    groups = cents.map(() => []);
    for (const p of pixels) {
      let best = 0, bd = Infinity;
      cents.forEach((c, k) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = k; } });
      groups[best].push(p);
    }
    cents = groups.map((g, k) => (g.length ? [0, 1, 2].map((i) => g.reduce((a, p) => a + p[i], 0) / g.length) : cents[k]));
  }
  return cents.map((c, k) => ({ rgb: c, share: groups[k].length / pixels.length, hsl: rgb2hsl(c) })).sort((a, b) => b.share - a.share);
}

// list: photos.all() の要素（{ blob, missionId }）。地域ごとの色と、全体の明るさ・鮮やかさ・空の色を返す
export async function analyzePhotos(list) {
  const N = 32;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const areas = {};
  let lumaSum = 0, satSum = 0, count = 0, sky = [0, 0, 0], skyN = 0;
  for (const p of list) {
    const img = await loadBlob(p.blob);
    if (!img) continue;
    ctx.drawImage(img, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    const a = (areas[p.missionId] ??= { pixels: [], n: 0 });
    a.n++;
    let l = 0, s = 0;
    for (let i = 0; i < d.length; i += 4) {
      const px = [d[i], d[i + 1], d[i + 2]];
      const hsl = rgb2hsl(px);
      l += hsl[2]; s += hsl[1];
      if (i / 4 < N * (N / 3)) { sky = sky.map((v, k) => v + px[k]); skyN++; } // 上の3分の1 = 空
      if (i % 8 === 0) a.pixels.push(px);
    }
    lumaSum += l / (N * N); satSum += s / (N * N); count++;
  }
  for (const id in areas) { areas[id].colors = dominant(areas[id].pixels); delete areas[id].pixels; }
  return {
    count,
    areas,
    luma: count ? lumaSum / count : 0.6,
    sat: count ? satSum / count : 0.3,
    sky: skyN ? sky.map((v) => v / skyN) : null,
  };
}

// ---------- 富士山の設計図 ----------
// 山肌の色：写真の主な色のうち、ある程度色みのあるものを版画風の落ち着いた色に整える
function bandColor(area, id) {
  const cs = area?.colors ?? [];
  const pick = cs.find((c) => c.hsl[1] > 0.15 && c.share > 0.15) ?? cs[0];
  if (!pick) return AREA_COLOR[id] ?? [90, 90, 90];
  const [h, s, l] = pick.hsl;
  return hsl2rgb([h, clamp(s, 0.22, 0.62), clamp(l, 0.24, 0.5)]);
}

export function buildFuji({ playerName = '', fragments = [], analysis }) {
  const order = [...MISSIONS].sort((a, b) => {
    const fa = fragments.find((f) => f.missionId === a.id)?.order ?? 9;
    const fb = fragments.find((f) => f.missionId === b.id)?.order ?? 9;
    return fa - fb;
  });
  const bands = order.map((m) => bandColor(analysis.areas[m.id], m.id));
  const seedText = [playerName, ...fragments.map((f) => f.clearedAt), ...bands.map((c) => c.map(Math.round).join(','))].join('|');
  const seed = hash(seedText);
  const r = rng(seed);

  // 時間帯：写真の明るさで決める
  const b = analysis.luma;
  const time = b >= 0.52 ? 'morning' : b >= 0.38 ? 'sunset' : 'night';
  const base = {
    morning: ['#3d6fa8', '#9cc3e0', '#f3e2c0'],
    sunset: ['#23284a', '#8a4a6a', '#f0a35a'],
    night: ['#070a1a', '#1b2340', '#3a3550'],
  }[time].map(hex2rgb);
  const skyStops = analysis.sky ? [mix(base[0], analysis.sky, 0.25), mix(base[1], analysis.sky, 0.3), base[2]] : base;

  const sat = analysis.sat;
  return {
    seed, time, bands, skyStops,
    areaIds: order.map((m) => m.id),
    shape: { shoulder: 0.16 + r() * 0.18, leanL: (r() - 0.5) * 0.06, leanR: (r() - 0.5) * 0.06, crater: 0.06 + r() * 0.03 },
    snowLine: clamp(0.26 + b * 0.14 + (r() - 0.5) * 0.06, 0.26, 0.38),   // 頂上から何割まで雪か
    drips: Array.from({ length: 9 + Math.floor(r() * 5) }, (_, k) => (k % 2 ? 0.02 + r() * 0.04 : 0.05 + r() * 0.07)),
    waves: Array.from({ length: 3 }, () => ({ a: 0.012 + r() * 0.02, f: 2 + r() * 4, p: r() * Math.PI * 2 })),
    ridges: Array.from({ length: 12 }, () => ({ x: r() * 2 - 1, bend: (r() - 0.5) * 0.12 })),
    clouds: Array.from({ length: 2 + Math.round(sat * 6) }, () => ({ x: r(), y: 0.15 + r() * 0.5, w: 0.18 + r() * 0.3 })),
    sparkle: Math.round(20 + sat * 80),
    sun: { x: (r() < 0.5 ? 0.12 : 0.65) + r() * 0.23, y: time === 'sunset' ? 0.62 : 0.2 + r() * 0.12 },   // 山頂の真上は避ける
    rand: () => rng(seed ^ 0x9e3779b9),   // 星や光の粒用（毎回同じ並び）
  };
}

// ---------- 描画 ----------
function outline(ctx, f, cx, base, w, h) {
  const { shoulder, leanL, leanR, crater } = f.shape;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, base);
  ctx.bezierCurveTo(cx - w * (0.3 + leanL), base - h * shoulder, cx - w * 0.15, base - h * 0.78, cx - w * crater, base - h);
  ctx.lineTo(cx - w * crater * 0.4, base - h * 0.965);
  ctx.lineTo(cx, base - h * 0.995);
  ctx.lineTo(cx + w * crater * 0.5, base - h * 0.955);
  ctx.lineTo(cx + w * crater, base - h);
  ctx.bezierCurveTo(cx + w * 0.15, base - h * 0.78, cx + w * (0.3 + leanR), base - h * shoulder, cx + w / 2, base);
  ctx.closePath();
}

// 背景なしの富士山を1枚の canvas に描く。glow = 金の輪郭を光らせる（AR用）
export function renderFujiSprite(f, { glow = true, fadeFoot = true } = {}) {
  const W = SPRITE_W, H = SPRITE_H;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const pad = 30, cx = W / 2, base = H, w = W - pad * 2, h = H * 0.9;

  ctx.save();
  outline(ctx, f, cx, base, w, h); ctx.clip();
  // 山肌：4本の帯（上から順に塗り重ねる。いちばん下が最初にクリアした地域）
  const bounds = [0.42, 0.28, 0.14];
  ctx.fillStyle = css(f.bands[3]); ctx.fillRect(0, 0, W, H);
  for (let i = 2; i >= 0; i--) {
    const y0 = base - h * bounds[2 - i];
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += W / 40) {
      const wv = f.waves[i % 3];
      ctx.lineTo(x, y0 + Math.sin((x / W) * wv.f * Math.PI * 2 + wv.p + i) * h * wv.a);
    }
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = css(f.bands[i]); ctx.fill();
  }
  // 立体感（左に光、右に影）
  const shade = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  shade.addColorStop(0, 'rgba(255,240,210,.18)'); shade.addColorStop(0.45, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.32)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
  // 尾根と谷の線（版画の彫りのような線）
  ctx.lineCap = 'round';
  f.ridges.forEach((rd) => {
    const topY = base - h * 0.93, x1 = cx + rd.x * w * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + rd.x * w * 0.04, topY);
    ctx.quadraticCurveTo(cx + rd.x * w * (0.22 + rd.bend), base - h * 0.45, x1, base);
    ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 3; ctx.stroke();
  });
  // 冠雪：ぎざぎざの下端
  const sy = base - h * (1 - f.snowLine);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.4, base - h * 1.1);
  ctx.lineTo(cx - w * 0.4, sy);
  f.drips.forEach((d, k) => ctx.lineTo(cx - w * 0.4 + (w * 0.8 * (k + 1)) / (f.drips.length + 1), sy + h * d));
  ctx.lineTo(cx + w * 0.4, sy);
  ctx.lineTo(cx + w * 0.4, base - h * 1.1);
  ctx.closePath();
  const snow = ctx.createLinearGradient(cx - w * 0.2, 0, cx + w * 0.2, 0);
  snow.addColorStop(0, '#ffffff'); snow.addColorStop(1, f.time === 'night' ? '#b9c3dc' : f.time === 'sunset' ? '#f3d2c0' : '#dfe8f2');
  ctx.fillStyle = snow; ctx.fill();
  ctx.restore();

  // 裾をぼかす（ARでカメラ映像になじませる）
  if (fadeFoot) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createLinearGradient(0, base - h * 0.2, 0, base);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
    ctx.fillStyle = g; ctx.fillRect(0, base - h * 0.2, W, h * 0.2);
    ctx.restore();
  }
  if (glow) {
    outline(ctx, f, cx, base, w, h);
    ctx.strokeStyle = '#e0b44c'; ctx.lineWidth = 4; ctx.shadowColor = '#e0b44c'; ctx.shadowBlur = 22; ctx.stroke();
    ctx.shadowBlur = 0;
  }
  return c;
}

// 空（時間帯・太陽や月・星・雲）。horizon = 地平線の高さ（0〜1）
export function drawSky(ctx, W, H, f, { horizon = 0.75 } = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, H * horizon);
  g.addColorStop(0, css(f.skyStops[0])); g.addColorStop(0.6, css(f.skyStops[1])); g.addColorStop(1, css(f.skyStops[2]));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = f.rand();
  if (f.time === 'night') {
    for (let i = 0; i < 140; i++) { ctx.fillStyle = `rgba(255,245,220,${0.2 + r() * 0.7})`; ctx.fillRect(r() * W, r() * H * horizon * 0.8, 2, 2); }
  }
  // 太陽・月
  const sx = f.sun.x * W, syy = f.sun.y * H, sr = W * (f.time === 'sunset' ? 0.09 : 0.05);
  const halo = ctx.createRadialGradient(sx, syy, sr * 0.4, sx, syy, sr * 3);
  const sc = f.time === 'night' ? [240, 236, 210] : f.time === 'sunset' ? [255, 150, 70] : [255, 245, 215];
  halo.addColorStop(0, css(sc, 0.5)); halo.addColorStop(1, css(sc, 0));
  ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
  ctx.beginPath(); ctx.arc(sx, syy, sr, 0, Math.PI * 2); ctx.fillStyle = css(sc, 0.95); ctx.fill();
  // 雲（横長のかすみ）
  f.clouds.forEach((cl) => {
    const cw = cl.w * W, ch = H * 0.018, x = cl.x * W - cw / 2, y = cl.y * H * horizon;
    ctx.fillStyle = f.time === 'night' ? 'rgba(160,170,200,.18)' : 'rgba(255,255,255,.4)';
    ctx.beginPath(); ctx.roundRect(x, y, cw, ch, ch / 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x + cw * 0.15, y - ch * 1.4, cw * 0.55, ch, ch / 2); ctx.fill();
  });
}

// 光の粒（t = 時間。AR・カードの飾り）
export function drawSparkle(ctx, W, H, f, t = 0, area = [0, 0, 1, 1]) {
  const r = f.rand();
  for (let i = 0; i < f.sparkle; i++) {
    const x = (area[0] + r() * area[2]) * W, y = (area[1] + r() * area[3]) * H, ph = r() * Math.PI * 2, c = f.bands[i % 4];
    const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2 + ph));
    ctx.fillStyle = css(mix(c, [255, 230, 160], 0.6), a);
    ctx.beginPath(); ctx.arc(x, y - ((t * 8 + ph * 10) % 30), 2.2, 0, Math.PI * 2); ctx.fill();
  }
}

export const colorCss = css;
