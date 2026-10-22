// 羽衣の舞AR演出：カメラ映像の上で、羽衣をまとった天女が舞い、富士の方へ還っていく
// 富士山を探す（コンパスで富士の方角へ向ける）→ 舞（約6秒）→ 昇天（約4秒）→ 記念撮影。戻り値: 撮影画像(Blob) か null
// コンパスが使えない端末（許可なし・PC・claude.ai のデモ版）では、方角を合わせずに案内文だけで舞を始める
// 天女は FanLab の絵（左腕と袖・体・右腕と袖・羽衣の4レイヤー、assets/img/miho/tennyo_parts/）を重ねて動かす。読み込めないときは描いた天女
// 「AR富士を表示」ボタン：富士山が見えないとき用。押すと富士山の絵を重ねる（コンパスありは富士の方角、なしは画面中央上）
import * as compass from '../kunozan/compass.js';
import { MIHO_SCAN_SPOTS } from '../../data/spots.js';
import { store } from '../../js/state.js';
import { logHeading } from './testlog.js';
import { watchHeading } from './heading.js';

const FUJI = { lat: 35.36060, lng: 138.72740 };                 // 富士山頂
const BEACH = MIHO_SCAN_SPOTS.find((s) => s.id === 'beach');
const FUJI_DEG = compass.bearing(BEACH, FUJI);                 // 浜辺から見た富士の方角（約24°・北北東）
const AIM = 20;          // 富士の方角とみなす幅（±度）
const HOLD = 1500;       // 向け続ける時間（ms）
const NO_SENSOR = 3000;  // この時間方角が取れなければコンパスなしで進める（ms）
const SKIP_AFTER = 10000; // 「方角を合わせずに見る」を出すまで（ms）
const FOV = 60;          // 画面の横幅に見せる角度（度）
const DIRS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
const diff = (a, b) => ((a - b + 540) % 360) - 180; // a-b を -180〜180 に

// 天女の絵（4枚とも 768×1024 の同じキャンバスに、重ねるとそのまま天女になる位置で描かれている）
// パスはページ基準で1つずつ書く（1ファイル版のデモでは、この文字列が埋め込みデータに置き換わる）
const PARTS = {
  armL: 'assets/img/miho/tennyo_parts/arm_left.png',
  body: 'assets/img/miho/tennyo_parts/body.png',
  armR: 'assets/img/miho/tennyo_parts/arm_right.png',
  hagoromo: 'assets/img/miho/tennyo_parts/hagoromo.png',
};
const ART = {
  center: [374, 516],    // 画面上の天女の位置に合わせる点（絵の範囲の中心）
  height: 930,           // 絵の範囲の高さ（羽衣の上端〜裾）
  width: 732,
  waist: [540, 420],     // 体を揺らす中心（帯のあたり）
  shoulderL: [485, 315], // 左腕を回す支点
  shoulderR: [600, 310], // 右腕を回す支点
  hagoromo: [263, 52, 622, 388], // 羽衣の絵の範囲（x1, y1, x2, y2）
};
let partsLoading = null;
function loadParts() {
  if (!partsLoading) {
    partsLoading = Promise.all(Object.entries(PARTS).map(([k, f]) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve([k, img]);
      img.onerror = () => reject(new Error(`天女の絵を読み込めませんでした: ${f}`));
      img.src = f;
    }))).then(Object.fromEntries).catch((e) => { console.warn(e); return null; });
  }
  return partsLoading;
}

export function hagoromoAR(root, api) {
  const { ui } = api;
  const { html } = ui;
  const demo = store.get().demo;
  const dev = api.devMode && !demo; // 開発モード（デモ版は除く）は方角を手で回せる。現地テスト用に方角を記録する

  return new Promise(async (resolve) => {
    const el = html('<div class="screen"></div>');
    root.appendChild(el);
    const cam = await api.openCamera(el);

    const canvas = document.createElement('canvas');
    canvas.className = 'overlay';
    cam.element.appendChild(canvas); // カメラ映像の上に重ねる（.cam canvas.overlay）
    el.insertAdjacentHTML('beforeend', `
      <div class="topbar"><span class="pill small" data-tag style="white-space:nowrap">● AR演出：羽衣の舞</span><span style="flex:1"></span><button class="pill small" data-arfuji aria-pressed="false" style="white-space:nowrap;border:1px solid rgba(224,180,76,.6);color:var(--gold);cursor:pointer">AR富士を表示</button></div>
      <div class="center" data-guide style="position:absolute;left:16px;right:16px;top:150px;z-index:2">
        <div class="small" data-guide-text style="text-shadow:0 1px 4px #000;line-height:1.8">富士山（北北東）の方へスマホを向けてください</div>
      </div>
      <div class="scan-bottom">
        <div data-gate class="card center" style="padding:18px">
          <div class="serif" style="font-size:18px;margin-bottom:8px">天女は富士へ還ろうとしている</div>
          <div class="small sub" style="line-height:1.8;margin-bottom:14px">スマホを掲げて、富士山の方角を探してください。<br>iPhoneでは「動作と方向」へのアクセスを許可してください。</div>
          <button class="btn" data-seek style="margin:0">富士山の方を探す</button>
        </div>
        <div data-seekbar class="hidden">
          <div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 14px">
            <div style="flex:1"><div class="small dim">富士山の方角</div><b style="font-size:17px">北北東 ${Math.round(FUJI_DEG)}°</b></div>
            <b class="small" data-lock style="color:var(--text-dim)">探索中</b>
          </div>
          ${dev ? '<div class="card" style="margin-top:8px;padding:8px 14px"><div class="small dim">開発モード：方角を手で回す <b data-devdeg></b></div><input type="range" min="0" max="359" value="300" data-dev style="width:100%"><div class="small dim" data-sensor style="margin-top:4px">センサー 未取得（スライダーを動かすと3秒間は手動が優先）</div><button class="link-btn" data-loghead style="margin-top:4px">今の方角を記録</button></div>' : ''}
          <button class="link-btn hidden" data-noaim style="display:block;margin:10px auto 0">方角を合わせずに見る</button>
        </div>
        <div data-end class="hidden">
          <div class="story-text center" style="font-size:16px;margin-bottom:14px">羽衣をまとった天女が、<br>松と海を越えて富士へ還っていく。</div>
          <div class="scan-row" style="justify-content:center;gap:24px;margin-top:0">
            <button class="shutter" data-shoot>撮影</button>
          </div>
          <button class="link-btn" data-skip style="display:block;margin:10px auto 0">撮影せずに見届ける</button>
        </div>
      </div>
      <div class="flash"></div>`);

    const $ = (s) => el.querySelector(s);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => { W = el.clientWidth; H = el.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    window.addEventListener('resize', resize);

    const DANCE = 6000, ASCEND = 4000;
    let phase = 'gate';  // gate → seek → dance → end
    let t0 = 0;          // 舞の開始時刻
    let raw = null, heading = null;
    let lastInfo = null;   // センサーの情報（記録用）
    let manualUntil = 0;   // 開発モード：スライダーを動かした直後は手動の値を優先する
    let aimedAt = 0;     // 富士の方角に入った時刻（0 = 外れている）
    let seekStart = 0;
    let stopWatch = null;
    const timers = [];
    const sparks = [];   // 光の粒
    const petals = [];   // 舞い散る花びら
    let ended = false;
    let arFujiAt = 0;    // AR富士を表示した時刻（0 = 非表示）
    let art = null;      // 天女の絵（読み込めたら { armL, body, armR, hagoromo }）
    loadParts().then((p) => { art = p; });

    // ---- 富士山を探す ----
    function setRaw(h, info) {
      raw = h;
      lastInfo = info ?? null;
      if (heading == null) heading = h;
      if (dev && info) $('[data-sensor]').textContent = `センサー ${Math.round(info.magnetic ?? h)}° → ${Math.round(h)}°（${info.source ?? '—'}${info.accuracy != null ? `・誤差${Math.round(info.accuracy)}°` : ''}）`;
    }

    $('[data-seek]').onclick = async () => {
      // iPhone はボタン操作の中で許可を求める必要がある
      const perm = await compass.requestCompass();
      $('[data-gate]').classList.add('hidden');
      $('[data-seekbar]').classList.remove('hidden');
      phase = 'seek';
      seekStart = performance.now();
      if (dev) {
        const s = $('[data-dev]'), lab = $('[data-devdeg]');
        const manual = () => { setRaw(+s.value, { source: '手動' }); lab.textContent = `${s.value}°`; };
        s.oninput = () => { manualUntil = performance.now() + 3000; manual(); };
        manual();
        // 現地テスト用：実機のコンパスも読み、スライダーを触っていない間はそちらを使う
        stopWatch = watchHeading((h, info) => { if (performance.now() >= manualUntil) setRaw(h, info); });
        $('[data-loghead]').onclick = () => {
          logHeading(api.geo, { h: raw, info: lastInfo, target: FUJI_DEG, aimed: null, note: '手動で記録' });
          ui.toast(`方角を記録しました（${Math.round(raw)}°・${lastInfo?.source ?? '—'}）`);
        };
        return;
      }
      if (perm === 'denied') return noCompass('コンパスが許可されていないため、方角は合わせずに始めます。');
      stopWatch = watchHeading(setRaw);
      timers.push(setTimeout(() => { if (raw == null && phase === 'seek') noCompass('この端末ではコンパスが使えないため、方角は合わせずに始めます。'); }, NO_SENSOR));
      timers.push(setTimeout(() => { if (phase === 'seek') $('[data-noaim]').classList.remove('hidden'); }, SKIP_AFTER));
    };
    $('[data-noaim]').onclick = () => startDance(false);

    function noCompass(msg) {
      ui.toast(msg, 3200);
      startDance(false);
    }

    function startDance(aimed) {
      if (phase !== 'seek') return;
      phase = 'dance';
      t0 = performance.now();
      if (dev) logHeading(api.geo, { h: raw, info: lastInfo, target: FUJI_DEG, aimed, note: '舞の開始' });
      // コンパスは止めない（AR富士をスマホの向きに合わせて動かすため）。止めるのは画面を閉じるとき
      $('[data-seekbar]').classList.add('hidden');
      $('[data-guide-text]').textContent = aimed ? '富士の方角が開いた。羽衣の舞を見届けよう' : 'スマホを富士山の方へ向けたまま、最後までご覧ください';
      navigator.vibrate?.([40, 30, 80]);
    }

    // ---- 描画 ----
    const xOf = (deg) => W / 2 + (diff(deg, heading) / (FOV / 2)) * (W / 2);

    // 方角の帯（上部）と富士の目印
    function drawSeek(now) {
      const top = 64, h = 40, l = 16, w = W - 32;
      ctx.fillStyle = 'rgba(16,13,10,.82)'; ctx.strokeStyle = 'rgba(224,180,76,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(l, top, w, h, 10); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(l, top, w, h); ctx.clip();
      ctx.textAlign = 'center';
      for (let d = 0; d < 360; d += 5) {
        const major = d % 22.5 === 0;
        const x = W / 2 + (diff(d, heading) / 45) * (w / 2);
        if (x < l || x > l + w) continue;
        ctx.strokeStyle = major ? '#f3ece0' : 'rgba(243,236,224,.35)';
        ctx.beginPath(); ctx.moveTo(x, top + 22); ctx.lineTo(x, top + (major ? 33 : 28)); ctx.stroke();
        if (major) { ctx.fillStyle = d % 90 === 0 ? '#e0b44c' : '#cfc6b8'; ctx.font = '500 10px "Noto Sans JP", sans-serif'; ctx.fillText(DIRS[d / 22.5], x, top + 15); }
      }
      const fx = W / 2 + (diff(FUJI_DEG, heading) / 45) * (w / 2);
      if (fx >= l && fx <= l + w) { ctx.fillStyle = '#e0b44c'; ctx.font = '700 13px "Noto Serif JP", serif'; ctx.fillText('富', fx, top + 36); }
      ctx.restore();
      ctx.fillStyle = '#e0b44c';
      ctx.beginPath(); ctx.moveTo(W / 2 - 6, top + h + 2); ctx.lineTo(W / 2 + 6, top + h + 2); ctx.lineTo(W / 2, top + h - 6); ctx.fill();

      const d = diff(FUJI_DEG, heading);
      const cy = H * 0.45;
      if (arFujiAt && Math.abs(d) <= FOV / 2 + 10) {
        // AR富士を表示中は、目印のシルエットの代わりに AR富士（drawFuji）が出ている
      } else if (Math.abs(d) <= FOV / 2 + 10) {
        // 富士山のシルエット
        const x = xOf(FUJI_DEG), y = cy;
        ctx.fillStyle = 'rgba(243,236,224,.85)';
        ctx.beginPath(); ctx.moveTo(x - 40, y + 26); ctx.lineTo(x - 10, y - 10); ctx.lineTo(x + 10, y - 10); ctx.lineTo(x + 40, y + 26); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(120,140,170,.9)';
        ctx.beginPath(); ctx.moveTo(x - 40, y + 26); ctx.lineTo(x - 18, y + 2); ctx.lineTo(x + 18, y + 2); ctx.lineTo(x + 40, y + 26); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f3ece0'; ctx.font = '500 12px "Noto Sans JP", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('富士山', x, y + 44);
      } else {
        // 画面外：端に矢印
        const right = d > 0;
        const text = right ? '富士山はこちら ›' : '‹ 富士山はこちら';
        ctx.font = '700 13px "Noto Sans JP", sans-serif';
        const tw = ctx.measureText(text).width + 24;
        const x = right ? W - tw - 10 : 10;
        ctx.fillStyle = 'rgba(24,20,16,.82)'; ctx.beginPath(); ctx.roundRect(x, cy - 16, tw, 32, 16); ctx.fill();
        ctx.fillStyle = '#e0b44c'; ctx.textAlign = 'left'; ctx.fillText(text, x + 12, cy + 5);
      }
      // 照準と保持の進み具合
      const inAim = Math.abs(d) <= AIM;
      if (inAim && !aimedAt) aimedAt = now;
      if (!inAim) aimedAt = 0;
      const p = aimedAt ? Math.min(1, (now - aimedAt) / HOLD) : 0;
      const lock = $('[data-lock]');
      lock.textContent = p >= 1 ? '富士の方角' : inAim ? '保持中…' : '探索中';
      lock.style.color = inAim ? 'var(--gold)' : 'var(--text-dim)';
      ctx.strokeStyle = 'rgba(243,236,224,.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(W / 2, cy - 30, 20, 0, Math.PI * 2); ctx.stroke();
      if (p > 0) { ctx.strokeStyle = '#e0b44c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, cy - 30, 20, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke(); }
      if (p >= 1) startDance(true);
    }

    // 天女の位置：舞の間は画面中央で揺れ、昇天で画面中央上（富士の方）へ小さくなりながら去る
    function figure(t) {
      const dance = Math.min(1, t / DANCE);
      const up = Math.max(0, Math.min(1, (t - DANCE) / ASCEND));
      const e = up * up * (3 - 2 * up);
      const x = W * 0.5 + Math.sin(t / 700) * W * 0.12 * (1 - e);
      // k: 天女の絵の縮尺（全身が画面の高さの約4割。横にはみ出さないようにする）
      const k0 = Math.min(H * 0.42 / ART.height, W * 0.95 / ART.width);
      const k = k0 * (1 - e * 0.75);
      // 小さい画面では、羽衣の上端が上の案内文（〜画面上から180px）にかからない高さまで下げる
      const cy = art ? Math.max(H * (0.5 - 0.04 * dance), 180 + (ART.center[1] - ART.hagoromo[1]) * k0) : H * (0.5 - 0.04 * dance);
      const y = cy + Math.sin(t / 450) * 16 * (1 - e) - e * H * 0.38;
      return { x, y, s: Math.min(W, H) / 380 * (1 - e * 0.75), k, a: 1 - Math.max(0, (up - 0.75) / 0.25) };
    }

    // 羽衣の帯（波打ちながら体の後ろへなびく）
    function ribbon(f, t, side, hue) {
      const n = 26;
      ctx.beginPath();
      const pts = [];
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const x = f.x + side * (14 + k * 150) * f.s + Math.sin(t / 380 + k * 5 + side) * 26 * k * f.s;
        const y = f.y - 20 * f.s + k * 90 * f.s + Math.cos(t / 520 + k * 4) * 34 * k * f.s;
        pts.push([x, y]);
      }
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
      g.addColorStop(0, `hsla(${hue},80%,92%,${0.9 * f.a})`);
      g.addColorStop(1, `hsla(${hue},80%,85%,0)`);
      ctx.strokeStyle = g; ctx.lineWidth = 9 * f.s; ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 天女の姿（光をまとった白い衣のシルエット）
    function body(f, t) {
      const s = f.s;
      const sway = Math.sin(t / 700) * 0.12;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(sway);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 110 * s);
      glow.addColorStop(0, `rgba(255,248,220,${0.55 * f.a})`); glow.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 110 * s, 0, Math.PI * 2); ctx.fill();
      // 衣
      ctx.fillStyle = `rgba(255,255,255,${0.85 * f.a})`;
      ctx.beginPath();
      ctx.moveTo(0, -38 * s);
      ctx.bezierCurveTo(16 * s, -30 * s, 18 * s, 10 * s, 34 * s, 58 * s + Math.sin(t / 300) * 6 * s);
      ctx.quadraticCurveTo(0, 66 * s, -34 * s, 58 * s + Math.cos(t / 300) * 6 * s);
      ctx.bezierCurveTo(-18 * s, 10 * s, -16 * s, -30 * s, 0, -38 * s);
      ctx.fill();
      // 袖（腕を広げる）
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * f.a})`; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
      const arm = Math.sin(t / 500) * 0.5;
      ctx.beginPath(); ctx.moveTo(0, -26 * s); ctx.quadraticCurveTo(-30 * s, (-40 + arm * 20) * s, -54 * s, (-30 + arm * 30) * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -26 * s); ctx.quadraticCurveTo(30 * s, (-40 - arm * 20) * s, 54 * s, (-30 - arm * 30) * s); ctx.stroke();
      // 頭と髪飾り
      ctx.fillStyle = `rgba(255,252,240,${f.a})`;
      ctx.beginPath(); ctx.arc(0, -50 * s, 11 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(224,180,76,${f.a})`;
      ctx.beginPath(); ctx.arc(0, -63 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ---- 天女の絵を動かす ----
    const rad = Math.PI / 180;
    // 支点 [px, py] のまわりに角度 deg だけ回して img を描く（絵の座標系の中で）
    function drawRotated(img, [px, py], deg) {
      ctx.save();
      ctx.translate(px, py); ctx.rotate(deg * rad); ctx.translate(-px, -py);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }

    // 羽衣の絵：縦の細い帯に分けて、帯ごとに上下にずらして波打たせる（両端＝肩の近くは小さく、上の弧ほど大きく）
    // 帯の境目に線が出ないよう、絵と同じ大きさの別キャンバスに整数の位置で並べてから、まとめて描く
    const PAD = 30;
    const hagoCanvas = document.createElement('canvas');
    function drawHagoromo(img, t) {
      const [x1, y1, x2, y2] = ART.hagoromo;
      const w = x2 - x1, h = y2 - y1;
      if (hagoCanvas.width !== w) { hagoCanvas.width = w; hagoCanvas.height = h + PAD * 2; }
      const hc = hagoCanvas.getContext('2d');
      hc.clearRect(0, 0, hagoCanvas.width, hagoCanvas.height);
      const step = 4;
      for (let x = 0; x < w; x += step) {
        const u = x / w;
        const amp = 8 + 18 * Math.sin(u * Math.PI);
        const dy = Math.sin(t / 420 - u * 7) * amp;
        const sw = Math.min(step, w - x);
        hc.drawImage(img, x1 + x, y1, sw, h, x, PAD + dy, sw, h);
      }
      // 全体も少し左右に揺らす
      const sx = Math.sin(t / 650) * 10;
      ctx.drawImage(hagoCanvas, x1 + sx, y1 - PAD);
    }

    // プログラムで描く羽衣：肩から体の後ろへ長くなびく帯（絵の座標系。淡い桃色・生成り色）
    function trail(t, [sx, sy], phase, color, len, wid) {
      const n = 28, pts = [];
      for (let i = 0; i < n; i++) {
        const q = i / (n - 1);
        const x = sx - q * len * 0.95 + Math.sin(t / 520 + q * 5 + phase) * 70 * q;
        const y = sy + q * len * 0.55 + Math.cos(t / 610 + q * 4 + phase) * 90 * q;
        pts.push([x, y]);
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
      g.addColorStop(0, `rgba(${color},.7)`); g.addColorStop(0.7, `rgba(${color},.35)`); g.addColorStop(1, `rgba(${color},0)`);
      ctx.strokeStyle = g; ctx.lineWidth = wid; ctx.lineCap = 'round';
      ctx.stroke();
    }

    function drawArt(f, t) {
      const sway = Math.sin(t / 700) * 6;                       // 体の揺れ（±6°）
      const armL = Math.sin(t / 520) * 15;                      // 左腕と袖（±15°）
      const armR = Math.sin(t / 520 + 1.3) * -10;               // 右腕と袖（±10°、左と少しずらす）
      ctx.save();
      ctx.globalAlpha = f.a;
      // 天女のまわりの光
      const r = ART.height * 0.55 * f.k;
      const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      glow.addColorStop(0, 'rgba(255,240,220,.45)'); glow.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
      // 絵の座標系へ
      ctx.translate(f.x, f.y); ctx.scale(f.k, f.k); ctx.translate(-ART.center[0], -ART.center[1]);
      const [wx, wy] = ART.waist;
      ctx.translate(wx, wy); ctx.rotate(sway * rad); ctx.translate(-wx, -wy);
      trail(t, ART.shoulderL, 0, '250,214,196', 620, 34);       // 後ろへなびく羽衣（体の後ろ）
      trail(t + 700, ART.shoulderR, 2, '255,236,214', 700, 26);
      drawRotated(art.armL, ART.shoulderL, armL);
      ctx.drawImage(art.body, 0, 0);
      drawRotated(art.armR, ART.shoulderR, armR);
      drawHagoromo(art.hagoromo, t);
      ctx.restore();
    }

    function drawDance(now) {
      const t = now - t0;
      // 天上の光（画面中央上＝富士の方から差す）
      const lg = ctx.createRadialGradient(W * 0.5, H * 0.05, 0, W * 0.5, H * 0.05, H * 0.7);
      lg.addColorStop(0, `rgba(255,236,180,${0.35 + 0.1 * Math.sin(t / 900)})`); lg.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);

      const f = figure(t);
      if (art && f.a > 0) drawArt(f, t); // 絵の天女（光の粒はその上に重ねる）
      ctx.globalCompositeOperation = 'lighter';
      if (f.a > 0) {
        if (!art) {
          ribbon(f, t, -1, 200);
          ribbon(f, t, 1, 330);
          ribbon(f, t + 900, 1, 45);
        }
        const spread = art ? ART.width * f.k * 0.6 : 60 * f.s;
        if (Math.random() < 0.8) sparks.push({ x: f.x + (Math.random() - 0.5) * spread, y: f.y + (Math.random() - 0.2) * spread, vx: (Math.random() - 0.5) * 0.6, vy: 0.3 + Math.random() * 0.8, a: 1 });
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx; p.y += p.vy; p.a -= 0.012;
        if (p.a <= 0) { sparks.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255,230,150,${p.a})`; ctx.fillRect(p.x, p.y, 2.5, 2.5);
      }
      ctx.globalCompositeOperation = 'source-over';
      if (!art && f.a > 0) body(f, t); // 絵が読み込めないときは描いた天女
      if (!ended && t > DANCE + ASCEND) finish();
    }

    function drawPetals() {
      if (petals.length < 40 && Math.random() < 0.3) petals.push({ x: Math.random() * W, y: -10, r: Math.random() * Math.PI, v: 0.6 + Math.random() * 0.9 });
      petals.forEach((p) => {
        p.y += p.v; p.x += Math.sin((p.y + p.r * 100) / 40) * 0.6; p.r += 0.02;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = 'rgba(255,190,210,.75)'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
    }

    // ---- AR富士 ----
    // コンパスあり：富士の方角に、地平線（画面の高さ42%）から立ち上がる形で描く。なし：画面中央上（天女が昇る先）に描く
    function drawFuji(now) {
      const a = Math.min(1, (now - arFujiAt) / 500);
      const compassOn = heading != null;
      const w = Math.min(W * 0.8, 420), h = w * 0.3;
      const base = Math.max(H * 0.42, 200 + h); // 小さい画面では上の案内文と重ならないよう下げる
      let x = W / 2;
      if (compassOn) {
        const d = diff(FUJI_DEG, heading);
        x = xOf(FUJI_DEG);
        if (Math.abs(d) > FOV / 2 + 25) {
          // 画面の外：富士山を探す画面では「富士山はこちら」が出ているので、舞の間だけ端に案内を出す
          if (phase !== 'seek') {
            const right = d > 0;
            const text = right ? 'AR富士はこちら ›' : '‹ AR富士はこちら';
            ctx.font = '700 12px "Noto Sans JP", sans-serif';
            const tw = ctx.measureText(text).width + 22;
            const bx = right ? W - tw - 10 : 10;
            ctx.globalAlpha = a;
            ctx.fillStyle = 'rgba(24,20,16,.78)'; ctx.beginPath(); ctx.roundRect(bx, H * 0.3 - 14, tw, 28, 14); ctx.fill();
            ctx.fillStyle = '#e0b44c'; ctx.textAlign = 'left'; ctx.fillText(text, bx + 11, H * 0.3 + 4);
            ctx.globalAlpha = 1;
          }
          return;
        }
      }
      const l = x - w / 2, r = x + w / 2, top = base - h;
      const pk = w * 0.07;             // 山頂の平らな部分の半分の幅
      // 山の輪郭（裾が広がる曲線）
      const outline = () => {
        ctx.beginPath();
        ctx.moveTo(l, base);
        ctx.bezierCurveTo(l + w * 0.22, base - h * 0.12, x - pk - w * 0.12, top + h * 0.22, x - pk, top);
        ctx.lineTo(x - pk * 0.3, top + h * 0.03); ctx.lineTo(x + pk * 0.2, top); ctx.lineTo(x + pk, top + h * 0.02);
        ctx.bezierCurveTo(x + pk + w * 0.12, top + h * 0.22, r - w * 0.22, base - h * 0.12, r, base);
        ctx.closePath();
      };
      ctx.save();
      ctx.globalAlpha = a * 0.92;
      // うっすらとした光
      ctx.shadowColor = 'rgba(255,240,210,.55)'; ctx.shadowBlur = 18;
      const g = ctx.createLinearGradient(0, top, 0, base);
      g.addColorStop(0, '#6f86ad'); g.addColorStop(0.55, '#4d6690'); g.addColorStop(1, 'rgba(60,82,120,.35)');
      ctx.fillStyle = g; outline(); ctx.fill();
      ctx.shadowBlur = 0;
      // 雪（山頂から約3分の1、下端はぎざぎざ）
      ctx.save(); outline(); ctx.clip();
      ctx.fillStyle = 'rgba(250,250,255,.96)';
      ctx.beginPath();
      ctx.moveTo(l, top - 2); ctx.lineTo(r, top - 2);
      const snow = top + h * 0.36, n = 9;
      for (let i = n; i >= 0; i--) {
        const k = i / n;
        const sx = x - w * 0.24 + k * w * 0.48;
        const sy = snow + (i % 2 ? h * 0.1 : -h * 0.04) - Math.abs(k - 0.5) * h * 0.08;
        ctx.lineTo(sx, sy);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(243,236,224,.9)'; ctx.font = '500 11px "Noto Sans JP", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('AR富士', x, base + 16);
      ctx.globalAlpha = 1;
    }

    $('[data-arfuji]').onclick = (e) => {
      e.stopPropagation();
      arFujiAt = arFujiAt ? 0 : performance.now();
      const b = e.currentTarget;
      b.textContent = arFujiAt ? 'AR富士を消す' : 'AR富士を表示';
      b.setAttribute('aria-pressed', String(!!arFujiAt));
    };

    let raf;
    function frame(now) {
      ctx.clearRect(0, 0, W, H);
      if (raw != null) heading = (heading + diff(raw, heading) * 0.25 + 360) % 360; // ゆれを抑える
      if (arFujiAt) drawFuji(now); // 天女や光より先に描く（天女の後ろに出る）
      if (phase === 'seek' && heading != null) drawSeek(now);
      if (phase === 'dance' || phase === 'end') drawDance(now);
      drawPetals();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function finish() {
      ended = true;
      phase = 'end';
      navigator.vibrate?.([40, 30, 40]);
      $('[data-guide]').classList.add('hidden');
      $('[data-tag]').textContent = 'AR：天女は富士へ還った';
      $('[data-end]').classList.remove('hidden');
    }

    function done(v) {
      cancelAnimationFrame(raf);
      stopWatch?.();
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', resize);
      cam.close(); el.remove(); resolve(v);
    }

    $('[data-skip]').onclick = () => done(null);
    $('[data-shoot]').onclick = async (e) => {
      e.stopPropagation();
      const f = $('.flash');
      f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      // 撮影用に記念スタンプを描き足して合成
      const stamp = document.createElement('canvas');
      stamp.width = canvas.width; stamp.height = canvas.height;
      const s = stamp.getContext('2d');
      s.drawImage(canvas, 0, 0);
      s.scale(dpr, dpr);
      s.fillStyle = 'rgba(0,0,0,.45)'; s.fillRect(0, H - 70, W, 70);
      s.fillStyle = '#e0b44c'; s.font = '700 18px "Noto Serif JP", serif'; s.textAlign = 'center';
      s.fillText('羽衣の舞、成る ― 三保松原', W / 2, H - 38);
      s.fillStyle = '#f3ece0'; s.font = '500 11px "Noto Sans JP", sans-serif';
      s.fillText(`${new Date().toLocaleDateString('ja-JP')}　静岡市ツーリズム創生アプリ`, W / 2, H - 18);
      const blob = await cam.capture(stamp);
      ui.toast('写真をコレクションに保存しました');
      setTimeout(() => done(blob), 600);
    };
  });
}
