// 現地テスト用の記録（開発モードのときだけ使う。デモ版・通常の利用者には出さない）
// スキャンの判定値・GPSの位置と誤差・富士山の方角を、この端末の中（localStorage）に最大100件まで残す
// 使い方: logScan / logPosition / logHeading で記録 → showTestLog(root, api) で一覧画面
import { MIHO_SCAN_SPOTS as SPOTS } from '../../data/spots.js';
import { distance } from '../../js/geo.js';
import { THRESHOLD } from './scan-check.js';
import { store } from '../../js/state.js';

const KEY = 'miho-testlog-v1';
const MAX = 100;
const THUMB = 120; // 縮小写真の長辺（px）
const KIND = { scan: 'スキャン', pos: '位置', fuji: '方角' };
const NAME = Object.fromEntries(SPOTS.map((s) => [s.id, s.id === 'beach' ? '浜辺' : s.name]));

// 記録するかどうか（開発モードのみ。デモ版は除く）
export const logEnabled = (api) => api.devMode && !store.get().demo;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? []; } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) {
    // 容量オーバー：古い記録の写真から消して入れ直す
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX).map((r, i, a) => (i < a.length - 20 ? { ...r, thumb: null } : r)))); } catch { console.warn('テスト記録を保存できませんでした', e); }
  }
}
function add(rec) {
  const list = load();
  list.push({ t: new Date().toISOString(), ...rec });
  save(list);
}

// 現在地と各地点までの距離
function gpsInfo(geo) {
  const p = geo.position;
  if (!p) return { lat: null, lng: null, acc: null, dist: {} };
  return {
    lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), acc: p.accuracy != null ? Math.round(p.accuracy) : null,
    dist: Object.fromEntries(SPOTS.map((s) => [s.id, Math.round(distance(p, s))])),
  };
}
// 本番（開発モードでない）なら範囲内だったか。geo.isNear と同じ計算
const inRange = (g, spot) => g.lat != null && g.dist[spot.id] <= spot.radius + Math.min(g.acc ?? 0, 50);

async function thumb(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const k = THUMB / Math.max(bmp.width, bmp.height);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return null; }
}

// スキャン1回分。scores = { helene, hagoromo }（画像判定できないときは null）
export async function logScan(geo, spot, blob, scores) {
  const g = gpsInfo(geo);
  add({ kind: 'scan', spot: spot.id, scores, ...g, inRange: inRange(g, spot), thumb: await thumb(blob) });
}

// 「ここで位置を記録」
export function logPosition(geo, note = '') {
  add({ kind: 'pos', note, ...gpsInfo(geo) });
}

// 富士山の方角。h = 真北補正後の方角、info = センサーの情報（磁北の値・種類・誤差）
export function logHeading(geo, { h, info, target, aimed, note = '' }) {
  const g = gpsInfo(geo);
  add({
    kind: 'fuji', note, aimed, heading: h != null ? Math.round(h) : null, magnetic: info?.magnetic != null ? Math.round(info.magnetic) : null,
    source: info?.source ?? null, sensorAcc: info?.accuracy != null ? Math.round(info.accuracy) : null,
    target: Math.round(target * 10) / 10, off: h != null ? Math.round(((h - target + 540) % 360) - 180) : null, ...g,
  });
}

// ---------- 一覧画面 ----------
const fmt = (v, d = 2) => (v == null ? '—' : v.toFixed(d));
const time = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function summary(list) {
  const rows = [];
  for (const id of ['helene', 'hagoromo']) {
    const recs = list.filter((r) => r.kind === 'scan' && r.spot === id);
    const sc = recs.map((r) => r.scores?.[id]).filter((v) => v != null);
    const acc = recs.map((r) => r.acc).filter((v) => v != null);
    const pass = sc.filter((v) => v >= THRESHOLD[id]).length;
    rows.push(`<tr><th>${NAME[id]}</th><td>${recs.length}回</td><td>${sc.length ? `${fmt(Math.min(...sc))} / ${fmt(sc.reduce((a, b) => a + b, 0) / sc.length)} / ${fmt(Math.max(...sc))}` : '—'}</td><td>${sc.length ? `${pass}/${sc.length}` : '—'}</td><td>${acc.length ? `${Math.min(...acc)}〜${Math.max(...acc)}m` : '—'}</td></tr>`);
  }
  const fuji = list.filter((r) => r.kind === 'fuji' && r.off != null);
  const off = fuji.map((r) => r.off);
  return `
    <table class="tlog-sum">
      <tr><th></th><th>スキャン</th><th>判定値 最小/平均/最大</th><th>合格</th><th>GPS誤差</th></tr>
      ${rows.join('')}
    </table>
    <div class="small dim" style="margin-top:6px">基準値 碑 ${THRESHOLD.helene.toFixed(2)}・松 ${THRESHOLD.hagoromo.toFixed(2)}。富士山の方角の記録 ${fuji.length}件${off.length ? `（ずれ ${Math.min(...off)}°〜${Math.max(...off)}°）` : ''}</div>`;
}

function card(r, esc) {
  const gps = r.lat != null ? `GPS ${r.lat}, ${r.lng}（誤差${r.acc ?? '—'}m）` : 'GPS なし';
  const dist = Object.entries(r.dist ?? {}).map(([id, d]) => `${NAME[id]} ${d}m`).join('・');
  let main = '';
  if (r.kind === 'scan') {
    const s = r.scores;
    const v = (id) => (s?.[id] == null ? '—' : `<b class="${s[id] >= THRESHOLD[id] ? 'gold' : ''}">${fmt(s[id])}</b>`);
    main = `<b>${NAME[r.spot]}をスキャン</b>　碑 ${v('helene')}・松 ${v('hagoromo')}<br><span class="${r.inRange ? '' : 'tlog-ng'}">${r.inRange ? '本番でも範囲内' : '本番なら範囲外'}</span>`;
  } else if (r.kind === 'pos') {
    main = `<b>位置を記録</b>${r.note ? `　${esc(r.note)}` : ''}`;
  } else {
    main = `<b>富士山の方角</b>　${r.heading ?? '—'}°（目標 ${r.target}°、ずれ ${r.off ?? '—'}°）${r.aimed === true ? '・合わせて開始' : r.aimed === false ? '・合わせずに開始' : ''}<br><span class="dim">センサー ${r.source ?? 'なし'}${r.magnetic != null ? `・磁北 ${r.magnetic}°` : ''}${r.sensorAcc != null ? `・誤差${r.sensorAcc}°` : ''}</span>`;
  }
  return `<div class="tlog-item">
    ${r.thumb ? `<img src="${r.thumb}" alt="">` : `<div class="tlog-kind">${KIND[r.kind]}</div>`}
    <div style="min-width:0"><div class="small dim">${time(r.t)}</div><div class="small" style="line-height:1.7">${main}</div><div class="small dim" style="line-height:1.6">${gps}<br>${dist}</div></div>
  </div>`;
}

// Excel やチャットに貼れるタブ区切りの表
const localTime = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
function toTSV(list) {
  const head = ['日時', '種類', '地点', '碑の判定値', '松の判定値', '本番で範囲内', '緯度', '経度', 'GPS誤差m', '碑まで', '松まで', '浜辺まで', '方角', '目標', 'ずれ', 'センサー', '磁北', 'センサー誤差', 'メモ'];
  const rows = list.map((r) => [
    localTime(r.t), KIND[r.kind], r.spot ? NAME[r.spot] : '', r.scores?.helene?.toFixed(3) ?? '', r.scores?.hagoromo?.toFixed(3) ?? '',
    r.kind === 'scan' ? (r.inRange ? '○' : '×') : '', r.lat ?? '', r.lng ?? '', r.acc ?? '',
    r.dist?.helene ?? '', r.dist?.hagoromo ?? '', r.dist?.beach ?? '',
    r.heading ?? '', r.target ?? '', r.off ?? '', r.source ?? '', r.magnetic ?? '', r.sensorAcc ?? '', r.note ?? '',
  ]);
  return [head, ...rows].map((row) => row.join('\t')).join('\n');
}

export function showTestLog(root, api) {
  const { html, esc, icons, toast } = api.ui;
  return new Promise((resolve) => {
    const el = html(`
      <div class="screen" style="z-index:1000;background:var(--bg)"><!-- 地図（Leaflet）のピンより上に出す -->
        <style>
          .tlog-sum { width:100%; border-collapse:collapse; font-size:12px; font-variant-numeric:tabular-nums; }
          .tlog-sum th, .tlog-sum td { padding:5px 4px; border-bottom:1px solid var(--line, rgba(212,175,95,.3)); text-align:left; white-space:nowrap; }
          .tlog-item { display:grid; grid-template-columns:56px 1fr; gap:10px; padding:10px 0; border-bottom:1px solid var(--line, rgba(212,175,95,.3)); }
          .tlog-item img { width:56px; height:56px; object-fit:cover; border-radius:6px; }
          .tlog-kind { width:56px; height:56px; border-radius:6px; display:grid; place-items:center; font-size:12px; background:rgba(243,236,224,.08); color:var(--gold); }
          .tlog-ng { color:#e0775c; }
        </style>
        <div class="topbar"><button class="icon-btn" data-back>${icons.back}</button><h1>テスト記録</h1><span style="width:44px"></span></div>
        <div class="scroll pad">
          <div class="small sub" style="line-height:1.8">開発モードでのスキャン・位置・富士山の方角を、この端末の中に最大100件残しています。</div>
          <div data-sum style="margin:12px 0;overflow-x:auto"></div>
          <div style="display:flex;gap:8px">
            <button class="btn" data-copy style="margin:0;flex:1">表としてコピー</button>
            <button class="btn ghost" data-clear style="margin:0;flex:none;width:auto;padding:0 16px">すべて消す</button>
          </div>
          <div data-confirm class="card hidden" style="margin-top:10px">
            <div class="small" style="margin-bottom:8px">記録をすべて消します。元に戻せません。</div>
            <div style="display:flex;gap:8px"><button class="btn" data-yes style="margin:0;flex:1">消す</button><button class="btn ghost" data-no style="margin:0;flex:1">やめる</button></div>
          </div>
          <textarea data-tsv readonly class="hidden" style="width:100%;height:120px;margin-top:10px;font-size:11px"></textarea>
          <div data-list style="margin-top:8px"></div>
        </div>
      </div>`);
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    const render = () => {
      const list = load();
      $('[data-sum]').innerHTML = summary(list);
      $('[data-list]').innerHTML = list.length ? list.slice().reverse().map((r) => card(r, esc)).join('') : '<div class="small dim center" style="padding:24px 0">まだ記録はありません。スキャンや「ここで位置を記録」で増えていきます。</div>';
    };
    render();
    $('[data-copy]').onclick = async () => {
      const tsv = toTSV(load());
      try { await navigator.clipboard.writeText(tsv); toast('コピーしました。Excelやチャットに貼り付けられます'); } catch {
        const ta = $('[data-tsv]'); ta.value = tsv; ta.classList.remove('hidden'); ta.select();
        toast('自動でコピーできなかったので、表示した文字を選んでコピーしてください', 4000);
      }
    };
    $('[data-clear]').onclick = () => $('[data-confirm]').classList.remove('hidden');
    $('[data-no]').onclick = () => $('[data-confirm]').classList.add('hidden');
    $('[data-yes]').onclick = () => { save([]); $('[data-confirm]').classList.add('hidden'); render(); toast('記録を消しました'); };
    $('[data-back]').onclick = () => { el.remove(); resolve(); };
  });
}
