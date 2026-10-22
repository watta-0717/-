// 静岡市ツーリズム創生アプリ 母体
// 画面: 初回起動 / ホーム（マップ）/ ガイド / コレクション / ミッション / クリア / エンディング
import { store, photos } from './state.js';
import { geo, formatDistance, walkMinutes, distance } from './geo.js';
import { openCamera } from './camera.js';
import * as ui from './ui/components.js';
import { MISSIONS, getMission } from '../missions/registry.js';
import { MAP_BOUNDS } from '../data/spots.js';
import { renderGuide } from './ui/guide.js';
import { renderCollection } from './ui/collection.js';
import { showEnding } from './ui/ending.js';

const { html, esc, icons } = ui;
const app = document.getElementById('app');
const view = document.getElementById('view');
const nav = document.getElementById('nav');

// URLに ?dev=1 を付けると開発モードを有効にする
const params = new URLSearchParams(location.search);
if (params.has('dev')) store.set({ devMode: params.get('dev') !== '0' });
// ?demo=1 はデモ版（現地に行かずに4地域を通しで遊べる。位置判定は開発モードと同じくスキップ）
if (params.has('demo')) store.set({ demo: params.get('demo') !== '0', devMode: params.get('demo') !== '0' });
// プレビュー公開版（カメラ・位置情報が使えない環境）では常にデモ版
if (window.APP_PREVIEW) store.set({ demo: true, devMode: true });

let currentTab = 'home';
let cleanup = null;

// ---------- 共通 ----------
function updateDevBadge() {
  document.querySelector('.dev-badge')?.remove();
  const { devMode, demo } = store.get();
  if (devMode) app.appendChild(html(`<div class="dev-badge">${demo ? 'デモ版' : '開発モード'}</div>`));
}

function fragDots() {
  const n = store.fragmentCount();
  return `<span class="frag-dots">${[0, 1, 2, 3].map((k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span>`;
}

// 次に案内するミッション：未クリアのうち現在地から最も近いもの（現在地不明なら地理順）
export function nextMission() {
  const left = MISSIONS.filter((m) => !store.isCleared(m.id));
  if (!left.length) return null;
  if (!geo.position) return left[0];
  return left.reduce((a, b) => (distance(geo.position, a.spot) <= distance(geo.position, b.spot) ? a : b));
}

function directionsUrl(spot) {
  return `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}&travelmode=walking`;
}

function setTab(tab) {
  cleanup?.(); cleanup = null;
  currentTab = tab;
  view.innerHTML = '';
  nav.classList.remove('hidden');
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'home') cleanup = renderHome();
  if (tab === 'guide') cleanup = renderGuide(view);
  if (tab === 'collection') cleanup = renderCollection(view, { openEnding });
}

nav.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab);
});

// ---------- ホーム ----------
function renderHome() {
  const el = html(`
    <div class="screen with-nav">
      <div id="map" class="map-dark"></div>
      <div class="home-top">
        <div class="topbar">
          <button class="icon-btn" data-settings aria-label="設定">${icons.gear}</button>
          <div style="flex:1;text-align:center"><span class="pill frag-counter"><span class="small sub">時空の欠片</span> ${fragDots()} <b class="gold">${store.fragmentCount()}/4</b></span></div>
          <button class="icon-btn" data-locate aria-label="現在地">${icons.locate}</button>
        </div>
      </div>
      <div class="home-sheet" data-sheet></div>
    </div>`);
  view.appendChild(el);

  // 地図（Leaflet が読み込めない場合は地図なしで続行）
  let map = null;
  let meMarker = null;
  if (window.L) {
    map = L.map(el.querySelector('#map'), { zoomControl: false, attributionControl: true }).fitBounds(MAP_BOUNDS);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    MISSIONS.forEach((m, i) => {
      const done = store.isCleared(m.id);
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:flex;align-items:center;gap:6px"><div class="pin ${done ? 'done' : ''}"><span>${i + 1}</span></div><span class="pin-label">${esc(m.area)}${done ? ' ✓' : ''}</span></div>`,
        iconSize: [34, 34], iconAnchor: [17, 34],
      });
      L.marker([m.spot.lat, m.spot.lng], { icon }).addTo(map).on('click', () => missionSheet(m));
    });
  } else {
    el.querySelector('#map').innerHTML = '<div class="center sub small" style="padding-top:45%">地図を読み込めませんでした（通信環境を確認してください）</div>';
  }

  const sheet = el.querySelector('[data-sheet]');
  function renderSheet() {
    const next = nextMission();
    if (!next) {
      sheet.innerHTML = `<div class="card center"><div class="label">ALL CLEAR</div><h3 style="margin-top:6px">4つの時空がすべて修復された</h3>
        <button class="btn" data-ending style="margin-top:10px">時空修復記念フォトカードを見る</button></div>`;
      sheet.querySelector('[data-ending]').onclick = openEnding;
      return;
    }
    const d = geo.distanceTo(next.spot);
    const near = geo.isNear(next.spot);
    sheet.innerHTML = `
      <div class="card">
        <div class="label">${store.fragmentCount() ? '次のミッション' : 'はじめのミッション'}</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin-top:6px">
          <div><h3 style="margin:0">${esc(next.area)}</h3><div class="small sub">${esc(next.spot.name)}</div></div>
          <div class="r small sub" style="text-align:right">${d == null ? '' : `<b class="gold" style="font-size:16px">${formatDistance(d)}</b>${d < 3000 ? `徒歩${walkMinutes(d)}分` : ''}`}</div>
        </div>
        <div class="serif small" style="margin:10px 0 12px;line-height:1.7">${esc(next.title)}</div>
        <button class="btn" data-go>${near ? 'ミッションを開始する' : `${esc(next.area)}のミッションを見る`}</button>
      </div>`;
    sheet.querySelector('[data-go]').onclick = () => (near ? startMission(next.id) : missionSheet(next));
  }
  renderSheet();

  const offGeo = geo.onChange((p) => {
    renderSheet();
    if (!map) return;
    const ll = [p.lat, p.lng];
    if (meMarker) meMarker.setLatLng(ll);
    else meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
  });

  el.querySelector('[data-locate]').onclick = () => {
    if (!geo.position) return ui.toast('現在地を取得できていません。位置情報を許可してください');
    map?.setView([geo.position.lat, geo.position.lng], 16);
  };
  el.querySelector('[data-settings]').onclick = openSettings;

  return () => { offGeo(); map?.remove(); };
}

function missionSheet(m) {
  const done = store.isCleared(m.id);
  const frag = store.get().fragments.find((f) => f.missionId === m.id);
  const d = geo.distanceTo(m.spot);
  const mod = ui.modal(`
    <div class="label">${esc(m.area)}</div>
    <h2 style="margin-top:6px;line-height:1.5">${esc(m.title)}</h2>
    <div class="list-item"><span class="num">${icons.pin.replace('<svg', '<svg width="14" height="14"')}</span><div class="grow"><div class="t">${esc(m.spot.name)}</div><div class="s">ここに近づくとミッションを開始できます</div></div><div class="r"><b>${formatDistance(d)}</b></div></div>
    ${done ? `<div class="card small" style="margin:8px 0">時空の欠片・${store.fragmentKanji(frag.order)} を獲得済み。もう一度遊ぶこともできます。</div>` : ''}
    <button class="btn" data-start style="margin-top:12px">ミッションを見る</button>
    <a class="btn ghost center" style="text-decoration:none" href="${directionsUrl(m.spot)}" target="_blank" rel="noopener">${esc(m.spot.name)}への道順（Googleマップ）</a>`);
  mod.el.querySelector('[data-start]').onclick = () => { mod.close(); startMission(m.id); };
}

// ---------- ミッションの起動 ----------
async function startMission(id) {
  const m = getMission(id);
  cleanup?.(); cleanup = null;
  view.innerHTML = '';
  nav.classList.add('hidden');
  const root = html('<div class="screen"></div>');
  view.appendChild(root);

  let finished = false;
  const api = {
    mission: m,
    get devMode() { return store.get().devMode; },
    // ミッション内の途中経過（このミッション専用の保存領域）
    getState: () => store.getMission(id),
    setState: (patch) => store.setMission(id, patch),
    geo,
    openCamera,
    ui,
    savePhoto: (blob, kind = 'ar', caption = '') => (blob ? photos.add(blob, { missionId: id, kind, caption }) : null),
    // クリア: 欠片を付与して共通の結果画面へ
    complete(opts = {}) {
      if (finished) return; finished = true;
      const frag = store.addFragment(id);
      root.remove();
      showClear(m, frag, opts);
    },
    exit() { if (finished) return; finished = true; setTab('home'); },
  };

  try {
    const mod = await m.load();
    await mod.start(root, api);
  } catch (err) {
    console.error(err);
    ui.toast('ミッションを読み込めませんでした');
    api.exit();
  }
}

// ---------- クリア画面（全ミッション共通） ----------
function showClear(m, frag, { heading = '修復 完了', message = '', bg = '' } = {}) {
  view.innerHTML = '';
  const n = store.fragmentCount();
  const next = nextMission();
  const el = html(`
    <div class="screen" style="background:${bg ? `linear-gradient(rgba(10,8,6,.55),rgba(10,8,6,.95) 60%),url(${bg}) center/cover` : 'var(--bg)'}">
      <div class="scroll pad" style="display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:calc(24px + var(--safe-b))">
        <div class="label center" style="letter-spacing:.3em">MISSION CLEAR</div>
        <div class="clear-title">${esc(heading)}</div><hr>
        <p class="center sub" style="line-height:1.9;margin:0 0 20px">${message}</p>
        <div class="card frag-card">
          ${ui.hexIcon(store.fragmentKanji(frag.order))}
          <div>
            <h3 style="font-size:20px">時空の欠片・${store.fragmentKanji(frag.order)}</h3>
            <div class="small sub">${esc(m.area)}／${esc(m.subtitle)}</div>
            <div class="small sub" style="margin-top:6px;display:flex;align-items:center;gap:8px">${fragDots()} 修復 ${n} / 4 地域</div>
          </div>
        </div>
        ${next ? `<div class="card" style="display:flex;align-items:center;gap:12px">
            <span class="gold">${icons.pin.replace('<svg', '<svg width="20" height="20"')}</span>
            <div style="flex:1"><div class="small dim">次の歪み</div><b>${esc(next.area)}・${esc(next.subtitle)}</b></div>
            <span class="small sub">${formatDistance(geo.distanceTo(next.spot))}</span></div>` : ''}
        <div style="margin-top:16px">
          ${next ? '<button class="btn" data-next>次の地へ向かう</button>' : '<button class="btn" data-ending>エンディングへ</button>'}
          <button class="btn dark" data-home>ホームに戻る</button>
        </div>
      </div>
    </div>`);
  view.appendChild(el);
  el.querySelector('[data-home]').onclick = () => setTab('home');
  el.querySelector('[data-next]')?.addEventListener('click', () => { setTab('home'); window.open(directionsUrl(next.spot), '_blank', 'noopener'); });
  el.querySelector('[data-ending]')?.addEventListener('click', openEnding);
}

// ---------- エンディング ----------
function openEnding() {
  cleanup?.(); cleanup = null;
  view.innerHTML = '';
  nav.classList.add('hidden');
  showEnding(view, { onClose: () => setTab('collection') });
}

// ---------- 設定 ----------
function openSettings() {
  const s = store.get();
  const m = ui.modal(`
    <h2>設定</h2>
    <label class="small sub">時空修復師の名前（フォトカードに入ります）</label>
    <input class="field" data-name maxlength="16" value="${esc(s.playerName)}" style="margin:6px 0 12px">
    <div class="switch-row"><div><b>開発モード</b><div class="small sub">位置判定をスキップ（現地以外での動作確認用）</div></div><input type="checkbox" data-dev ${s.devMode ? 'checked' : ''} style="width:22px;height:22px"></div>
    <button class="btn" data-save style="margin-top:16px">保存する</button>
    <button class="btn dark" data-reset>進行状況をリセット</button>`);
  m.el.querySelector('[data-save]').onclick = () => {
    store.set({ playerName: m.el.querySelector('[data-name]').value.trim(), devMode: m.el.querySelector('[data-dev]').checked, demo: s.demo && m.el.querySelector('[data-dev]').checked });
    updateDevBadge(); m.close(); setTab(currentTab);
  };
  // 誤操作防止：2回押すと消去
  let armed = false;
  m.el.querySelector('[data-reset]').onclick = async (e) => {
    if (!armed) { armed = true; e.target.textContent = 'もう一度押すと欠片・写真をすべて消去します'; return; }
    await store.reset(); m.close(); location.reload();
  };
}

// ---------- 初回起動 ----------
async function onboarding() {
  nav.classList.add('hidden');
  await ui.story(view, {
    skippable: false,
    pages: [
      { bg: 'assets/img/nihondaira/fuji_view.jpg', html: '<div class="label">SHIZUOKA CITY</div><h1 class="serif" style="font-size:28px;margin:6px 0 16px;line-height:1.4">静岡市<br>ツーリズム創生アプリ</h1>', text: '富士を望む四つの地で、<br>歴史が少しずつ歪みはじめた。' },
      { bg: 'assets/img/nihondaira/fuji_view.jpg', text: 'あなたは「歴史の修復師」。', note: '日本平・久能山・三保松原・清水港。各地のミッションを解き、歴史を正しく導くと「時空の欠片」が手に入ります。どこから巡っても大丈夫。四つ集めると、あなただけの記念フォトカードが届きます。' },
    ],
  });

  return new Promise((resolve) => {
    const el = html(`
      <div class="screen"><div class="scroll pad" style="display:flex;flex-direction:column;justify-content:center">
        <div class="label">登録</div>
        <h2 class="serif" style="margin:6px 0 16px">修復師の名前を教えてください</h2>
        <input class="field" data-name maxlength="16" placeholder="例：静岡 太郎">
        <p class="small sub" style="line-height:1.8">記念フォトカードに「時空修復師 〇〇」として入ります。あとから設定で変更できます。</p>
        <div class="card" style="margin-top:12px">
          <h3>カメラと位置情報を使います</h3>
          <p class="small sub" style="line-height:1.8;margin:0">スキャンやAR演出にカメラを、ミッション地点の判定に位置情報を使います。データは端末の中だけに保存されます。</p>
        </div>
        <button class="btn" data-ok style="margin-top:20px">許可して はじめる</button>
      </div></div>`);
    view.appendChild(el);
    el.querySelector('[data-ok]').onclick = async () => {
      store.set({ playerName: el.querySelector('[data-name]').value.trim() || '旅人', onboarded: true });
      geo.start();
      // カメラ許可を先に取っておく（すぐ停止）
      try { (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach((t) => t.stop()); } catch { /* 後で再度確認 */ }
      el.remove();
      resolve();
    };
  });
}

// ---------- 起動 ----------
async function boot() {
  updateDevBadge();
  if (!store.get().onboarded) await onboarding();
  geo.start();
  // ?mission=nihondaira で直接ミッションを開く（開発用）
  const direct = params.get('mission') || window.APP_PREVIEW_MISSION;
  if (direct && getMission(direct)) startMission(direct); else setTab('home');
}

boot();
