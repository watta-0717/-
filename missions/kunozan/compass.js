// 渡丸の羅針盤（AR）：カメラ映像の上に埋葬先の候補を実際の方角で重ね、端末を向けて選ぶクイズ
// コンパス必須。許可拒否・非対応・PCでは先へ進めない（開発モードだけ方角を手で回せる）
// 戻り値: 'nikko' | 'edo' | 'okazaki'（選んだ埋葬先）か null（戻る）
import { KUNOZAN_SCAN_SPOTS, KUNOZAN_DESTINATIONS, KUNOZAN_FUJI } from '../../data/spots.js';
import { distance } from '../../js/geo.js';

const ORIGIN = KUNOZAN_SCAN_SPOTS.find((s) => s.id === 'shinbyo');
const AIM = 10;        // 照準の許容幅（±度）
const HOLD = 1500;     // 照準を保つ時間（ms）
const FOV = 60;        // 画面の横幅に見せる角度（度）
const DIRS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
const MARK = { nikko: '日', edo: '江', okazaki: '岡' };
// 札の下に出す候補の絵（FanLab提供、背景を抜いたもの。2026-10-21）。読み込めないときは描かない
// 日本平・三保もこのファイルを読み込むため、羅針盤を開いたときに初めて読み込む
let pics = null;
const loadPics = () => (pics ??= Object.fromEntries(Object.keys(MARK).map((id) => {
  const im = new Image();
  im.src = `assets/img/kunozan/icons/${id}.png`;
  return [id, im];
})));

// 2地点間の方位角（度、北=0 時計回り）
export function bearing(a, b) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
const dirName = (deg) => DIRS[Math.round(deg / 22.5) % 16];
const diff = (a, b) => ((a - b + 540) % 360) - 180; // a-b を -180〜180 に

const TARGETS = KUNOZAN_DESTINATIONS.map((d) => ({ ...d, deg: bearing(ORIGIN, d), km: Math.round(distance(ORIGIN, d) / 1000) }));
const FUJI = { ...KUNOZAN_FUJI, deg: bearing(ORIGIN, KUNOZAN_FUJI), km: Math.round(distance(ORIGIN, KUNOZAN_FUJI) / 1000) };

// ---------- コンパス（方位センサー） ----------
let permission = null; // iOS: 'granted' | 'denied'。一度拒否するとページを再読み込みするまで再要求できない

// iPhoneはボタン操作の中で許可を求める必要があるため、ボタンの onclick から直接呼ぶ
let pending = null;     // 許可の問い合わせ中
export function requestCompass() {
  const D = window.DeviceOrientationEvent;
  if (!D || typeof D.requestPermission !== 'function') return Promise.resolve(permission = 'granted');
  if (permission === 'granted') return Promise.resolve(permission);
  pending = D.requestPermission().then((r) => (permission = r), () => (permission = 'denied'));
  return pending;
}
const needsPermission = () => typeof window.DeviceOrientationEvent?.requestPermission === 'function' && permission !== 'granted';

// 背面カメラが向いている方角を求める。端末を寝かせているときは端末の上端の方角
function headingFromEuler(alpha, beta, gamma) {
  const r = Math.PI / 180;
  const ca = Math.cos(alpha * r), sa = Math.sin(alpha * r);
  const cb = Math.cos(beta * r), sb = Math.sin(beta * r);
  const cg = Math.cos(gamma * r), sg = Math.sin(gamma * r);
  let x = -ca * sg - sa * sb * cg;   // 背面カメラの向き（東）
  let y = -sa * sg + ca * sb * cg;   // 背面カメラの向き（北）
  if (Math.hypot(x, y) < 0.35) { x = -sa * cb; y = ca * cb; } // 寝かせている：上端の向き
  return (Math.atan2(x, y) / r + 360) % 360;
}

function watchHeading(onHeading) {
  const onIOS = (e) => { if (e.webkitCompassHeading != null) onHeading(e.webkitCompassHeading); };
  const onAbs = (e) => { if (e.alpha != null && e.beta != null) onHeading(headingFromEuler(e.alpha, e.beta, e.gamma ?? 0)); };
  const onAny = (e) => { if (e.webkitCompassHeading != null) onIOS(e); else if (e.absolute) onAbs(e); };
  window.addEventListener('deviceorientationabsolute', onAbs);
  window.addEventListener('deviceorientation', onAny);
  return () => {
    window.removeEventListener('deviceorientationabsolute', onAbs);
    window.removeEventListener('deviceorientation', onAny);
  };
}

// ---------- 画面 ----------
export function compassQuiz(root, api) {
  const { ui } = api;
  const { html, esc, icons } = ui;
  const dev = api.devMode;
  const PICS = loadPics();

  return new Promise(async (resolve) => {
    const el = html('<div class="screen"></div>');
    root.appendChild(el);
    const cam = await api.openCamera(el);
    const canvas = document.createElement('canvas');
    canvas.className = 'overlay';
    cam.element.appendChild(canvas); // カメラ映像の上に重ねる

    el.insertAdjacentHTML('beforeend', `
      <div class="topbar" style="position:relative;z-index:3">
        <button class="icon-btn" data-back>${icons.back}</button>
        <h1 class="serif" style="text-shadow:0 1px 4px #000">渡丸の羅針盤</h1>
        <button class="icon-btn" data-help>${icons.help}</button>
      </div>
      <div class="center" data-guide style="position:absolute;left:0;right:0;top:136px;z-index:3"><span class="pill small">端末を掲げ、体を回して三つの候補を探せ</span></div>
      <div class="scan-bottom" style="z-index:3">
        <div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 14px">
          <div style="flex:1;min-width:0"><div class="small dim">画面の中央にある候補</div><b data-cur style="font-size:18px">―</b></div>
          <b class="small" data-lock style="color:var(--dim)">探索中</b>
        </div>
        <div class="card" style="margin-top:8px;padding:10px 14px">
          <div class="label" style="font-size:11px">渡丸が覚えている遺言</div>
          <div class="small" style="line-height:1.8">「一周忌の後、日光山に小さき堂を建て勧請せよ」――その方角の先には、富士が見えるはずだ。</div>
        </div>
        ${dev ? `<div class="card" style="margin-top:8px;padding:8px 14px"><div class="small dim">開発モード：方角を手で回す <b data-devdeg></b></div><input type="range" min="0" max="359" value="0" data-dev style="width:100%"></div>` : ''}
        <div style="display:flex;gap:10px;margin-top:10px;align-items:center">
          <button class="btn" data-pick disabled style="flex:1;margin:0">この方角を指す</button>
          <button class="icon-btn" data-shoot aria-label="撮影" style="width:52px;height:52px;flex:none;border:1px solid var(--gold)">${icons.camera}</button>
        </div>
        <div class="center small dim" style="margin-top:6px">方角を約1.5秒保つと選べます</div>
      </div>
      <div data-gate class="hidden" style="position:absolute;inset:0;z-index:5;background:rgba(10,8,6,.88);display:flex;flex-direction:column;justify-content:center;padding:24px"></div>
      <div class="flash"></div>`);

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => { W = el.clientWidth; H = el.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    window.addEventListener('resize', resize);

    let heading = null;      // 表示用（なめらかにした値）
    let raw = null;          // センサーの生の値
    let aimed = null;        // 照準中の候補
    let aimedAt = 0;
    let locked = null;       // 1.5秒保った候補
    let reveal = null;       // 決定後の演出 { id, t0 }
    let stopWatch = null;
    let raf;

    const curEl = el.querySelector('[data-cur]');
    const lockEl = el.querySelector('[data-lock]');
    const pickBtn = el.querySelector('[data-pick]');
    const gate = el.querySelector('[data-gate]');

    function setRaw(h) { raw = h; if (heading == null) heading = h; }

    // ---- コンパスの起動（許可・非対応の確認）----
    function startSensor() {
      stopWatch?.();
      stopWatch = watchHeading(setRaw);
      if (dev) return; // 開発モードはスライダーで操作できる
      // 3秒たっても方角が取れなければ非対応として案内
      setTimeout(() => { if (raw == null && !reveal) showGate('unavailable'); }, 3000);
    }

    function showGate(kind) {
      const msg = {
        start: { t: '羅針盤を起動する', d: '羅針盤はスマホのコンパスを使います。次の画面で「動作と方向」へのアクセスを許可してください。', b: '羅針盤を起動する' },
        denied: { t: 'コンパスが許可されていません', d: '羅針盤を使うには、コンパスへのアクセスが必要です。<br><br>iPhone：このページを再読み込みし、もう一度「羅針盤を起動する」を押して「許可」を選んでください。表示されない場合は「設定」→「アプリ」→「Safari」→「モーションと画面の向きのアクセス」をオンにしてください。', b: 'もう一度試す' },
        unavailable: { t: 'この端末では羅針盤が使えません', d: '方位センサー（コンパス）を読み取れませんでした。<br><br>・パソコンでは使えません。スマートフォンで開いてください<br>・Androidは Chrome でお試しください<br>・iPhoneは Safari の設定で「モーションと画面の向きのアクセス」をオンにしてください', b: 'もう一度試す' },
      }[kind];
      gate.innerHTML = `
        <h2 class="serif" style="margin:0 0 14px;font-size:22px">${msg.t}</h2>
        <p class="small" style="line-height:1.9;margin:0 0 22px">${msg.d}</p>
        <button class="btn" data-gate-go>${msg.b}</button>
        <button class="btn ghost" data-gate-back style="margin-top:10px">ホームへ戻る</button>`;
      gate.classList.remove('hidden');
      gate.querySelector('[data-gate-back]').onclick = () => done(null);
      gate.querySelector('[data-gate-go]').onclick = async () => {
        if (needsPermission()) await requestCompass();
        if (needsPermission()) return showGate('denied');
        gate.classList.add('hidden');
        startSensor();
      };
    }

    if (pending) await pending; // 直前の「羅針盤を構える」で求めた許可の結果を待つ
    if (needsPermission() && !dev) showGate(permission === 'denied' ? 'denied' : 'start');
    else startSensor();

    if (dev) {
      const s = el.querySelector('[data-dev]');
      const lab = el.querySelector('[data-devdeg]');
      s.oninput = () => { setRaw(+s.value); lab.textContent = `${s.value}°`; };
      s.oninput();
    }

    // ---- 描画 ----
    const xOf = (deg) => W / 2 + (diff(deg, heading) / (FOV / 2)) * (W / 2);

    function drawStrip() {
      const top = 64, h = 44, l = 16, w = W - 32;
      ctx.fillStyle = 'rgba(16,13,10,.82)'; ctx.strokeStyle = 'rgba(224,180,76,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(l, top, w, h, 10); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(l, top, w, h); ctx.clip();
      ctx.textAlign = 'center';
      for (let d = 0; d < 360; d += 2.5) {
        const major = d % 22.5 === 0;
        if (!major && d % 5 !== 0) continue;
        const x = W / 2 + (diff(d, heading) / 45) * (w / 2);
        if (x < l || x > l + w) continue;
        ctx.strokeStyle = major ? '#f3ece0' : 'rgba(243,236,224,.35)';
        ctx.beginPath(); ctx.moveTo(x, top + 22); ctx.lineTo(x, top + (major ? 34 : 29)); ctx.stroke();
        if (major) { ctx.fillStyle = d % 90 === 0 ? '#e0b44c' : '#cfc6b8'; ctx.font = '500 10px "Noto Sans JP", sans-serif'; ctx.fillText(DIRS[d / 22.5], x, top + 15); }
      }
      TARGETS.forEach((t) => {
        const x = W / 2 + (diff(t.deg, heading) / 45) * (w / 2);
        if (x < l || x > l + w) return;
        ctx.fillStyle = 'rgba(224,180,76,.9)'; ctx.beginPath(); ctx.arc(x, top + 39, 2.5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
      ctx.fillStyle = '#e0b44c';
      ctx.beginPath(); ctx.moveTo(W / 2 - 6, top + h + 2); ctx.lineTo(W / 2 + 6, top + h + 2); ctx.lineTo(W / 2, top + h - 6); ctx.fill();
      ctx.font = '700 12px "Noto Sans JP", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(heading)}°`, W / 2, top + h + 16);
    }

    function label(x, y, title, sub, mark, on) {
      ctx.font = '700 15px "Noto Serif JP", serif';
      const titleW = ctx.measureText(title).width;
      ctx.font = '500 11px "Noto Sans JP", sans-serif';
      const tw = Math.max(titleW, ctx.measureText(sub).width, 90);
      const w = tw + 58, h = 48;
      const lx = Math.max(8, Math.min(W - w - 8, x - w / 2));
      ctx.fillStyle = on ? 'rgba(24,18,10,.92)' : 'rgba(24,20,16,.78)';
      ctx.strokeStyle = on ? '#e0b44c' : 'rgba(243,236,224,.25)'; ctx.lineWidth = on ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(lx, y, w, h, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = on ? '#e0b44c' : '#5b4630';
      ctx.beginPath(); ctx.roundRect(lx + 7, y + 7, 34, 34, 5); ctx.fill();
      ctx.fillStyle = on ? '#2a1f0a' : '#f3ece0'; ctx.textAlign = 'center';
      ctx.font = '700 17px "Noto Serif JP", serif'; ctx.fillText(mark, lx + 24, y + 30);
      ctx.textAlign = 'left'; ctx.fillStyle = '#f3ece0';
      ctx.font = '700 15px "Noto Serif JP", serif'; ctx.fillText(title, lx + 49, y + 21);
      ctx.fillStyle = on ? '#e0b44c' : '#cfc6b8'; ctx.font = '500 11px "Noto Sans JP", sans-serif'; ctx.fillText(sub, lx + 49, y + 38);
    }

    // 札の下の絵：方角の点の上に立つように置く。高さは最大72px、画面が低いときは48pxまで縮める
    function drawPic(im, x, top, bottom) {
      if (!im.complete || !im.naturalWidth) return;
      const h = Math.max(48, Math.min(72, bottom - top));
      const s = Math.min(100 / im.naturalWidth, h / im.naturalHeight);
      const w = im.naturalWidth * s, ih = im.naturalHeight * s;
      ctx.drawImage(im, x - w / 2, top + h - ih, w, ih);
    }

    function drawTargets(now) {
      const base = H * 0.32;
      // 富士山の目印（日光とほぼ同じ方角）
      if (Math.abs(diff(FUJI.deg, heading)) < FOV / 2 + 10) {
        const fy = H * 0.5;
        const fx = fujiX(fy, now);
        ctx.fillStyle = 'rgba(243,236,224,.85)';
        ctx.beginPath(); ctx.moveTo(fx - 26, fy + 18); ctx.lineTo(fx - 7, fy - 6); ctx.lineTo(fx + 7, fy - 6); ctx.lineTo(fx + 26, fy + 18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(120,140,170,.9)';
        ctx.beginPath(); ctx.moveTo(fx - 26, fy + 18); ctx.lineTo(fx - 12, fy + 1); ctx.lineTo(fx + 12, fy + 1); ctx.lineTo(fx + 26, fy + 18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f3ece0'; ctx.font = '500 11px "Noto Sans JP", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`富士山 約${FUJI.km}km`, fx, fy + 34);
      }
      TARGETS.forEach((t, i) => {
        const d = diff(t.deg, heading);
        const on = locked === t.id || aimed === t.id;
        const sub = `${dirName(t.deg)} ${Math.round(t.deg)}°・約${t.km}km`;
        if (Math.abs(d) <= FOV / 2 + 15) {
          const x = xOf(t.deg);
          const y = base - (i === 1 ? 54 : 0); // 日光と江戸城が重ならないよう少しずらす
          ctx.strokeStyle = on ? 'rgba(224,180,76,.9)' : 'rgba(243,236,224,.35)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y + 48); ctx.lineTo(x, H * 0.5 - 10); ctx.stroke(); ctx.setLineDash([]);
          drawPic(PICS[t.id], x, y + 52, H * 0.5 - 30);
          ctx.fillStyle = '#e0b44c'; ctx.beginPath(); ctx.arc(x, H * 0.5 - 10, on ? 6 : 3.5, 0, Math.PI * 2); ctx.fill();
          label(x, y, t.name, sub, MARK[t.id], on);
        } else {
          // 画面外の候補は端に矢印で示す
          const right = d > 0;
          const y = H * 0.22 + i * 34;
          ctx.font = '700 12px "Noto Sans JP", sans-serif';
          const text = `${right ? '' : '‹ '}${t.name}${right ? ' ›' : ''}`;
          const w = ctx.measureText(text).width + 20;
          const x = right ? W - w - 8 : 8;
          ctx.fillStyle = 'rgba(24,20,16,.78)'; ctx.beginPath(); ctx.roundRect(x, y, w, 26, 13); ctx.fill();
          ctx.fillStyle = '#f3ece0'; ctx.textAlign = 'left'; ctx.fillText(text, x + 10, y + 17);
        }
      });
      // 照準
      const p = aimed && !locked ? Math.min(1, (now - aimedAt) / HOLD) : locked ? 1 : 0;
      const cy = H * 0.5 - 10;
      ctx.strokeStyle = 'rgba(243,236,224,.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(W / 2, cy, 18, 0, Math.PI * 2); ctx.stroke();
      if (p > 0) { ctx.strokeStyle = '#e0b44c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, cy, 18, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke(); }
    }

    // 日光の光の道：神廟（画面下）から日光の札までの直線
    const nikkoLine = () => ({ sx: W / 2, sy: H * 0.62, nx: xOf(TARGETS[0].deg), ny: H * 0.32 + 24 });
    // 富士山の目印のx座標。日光の光の道が出たら、道の上に乗るよう少しずつ寄せる（線を折らずに富士を通すため。2026-10-18）
    function fujiX(fy, now) {
      const fx = xOf(FUJI.deg);
      if (!reveal || reveal.id !== 'nikko') return fx;
      const { sx, sy, nx, ny } = nikkoLine();
      const onLine = sx + ((nx - sx) * (sy - fy)) / (sy - ny);
      const k = Math.min(1, (now - reveal.t0) / 400);
      return fx + (onLine - fx) * k;
    }

    // 決定後の演出：日光なら神廟→富士→日光の光の道（直線）、それ以外は暗転
    function drawReveal(now) {
      const t = Math.min(1, (now - reveal.t0) / 2200);
      if (reveal.id === 'nikko') {
        const { sx, sy, nx, ny } = nikkoLine();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,230,160,.95)'; ctx.lineWidth = 4; ctx.shadowColor = '#ffd77a'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (nx - sx) * t, sy + (ny - sy) * t);
        ctx.stroke(); ctx.restore();
        if (t >= 1) {
          ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, H * 0.2 - 30, W, 44);
          ctx.fillStyle = '#e0b44c'; ctx.font = '700 20px "Noto Serif JP", serif'; ctx.textAlign = 'center';
          ctx.fillText('不死の道が開いた', W / 2, H * 0.2);
        }
      } else {
        ctx.fillStyle = `rgba(5,4,8,${0.85 * t})`; ctx.fillRect(0, 0, W, H);
        if (t > 0.6) { ctx.fillStyle = '#c75b3f'; ctx.font = '700 20px "Noto Serif JP", serif'; ctx.textAlign = 'center'; ctx.fillText('……針が、震えている', W / 2, H * 0.45); }
      }
      return t >= 1;
    }

    function frame(now) {
      ctx.clearRect(0, 0, W, H);
      if (raw != null) {
        heading = (heading + diff(raw, heading) * 0.25 + 360) % 360; // ゆれを抑える
        if (!reveal) {
          const near = TARGETS.filter((t) => Math.abs(diff(t.deg, heading)) <= AIM).sort((a, b) => Math.abs(diff(a.deg, heading)) - Math.abs(diff(b.deg, heading)))[0];
          const id = near?.id ?? null;
          if (id !== aimed) { aimed = id; aimedAt = now; if (locked && locked !== id) locked = null; }
          if (aimed && !locked && now - aimedAt >= HOLD) { locked = aimed; navigator.vibrate?.(40); }
          curEl.textContent = aimed ? TARGETS.find((t) => t.id === aimed).name : '―';
          lockEl.textContent = locked ? '照準内' : aimed ? '保持中…' : '探索中';
          lockEl.style.color = locked ? 'var(--gold)' : 'var(--dim)';
          pickBtn.disabled = !locked;
        }
        drawTargets(now);
        drawStrip();
        if (reveal && drawReveal(now) && !reveal.done) { reveal.done = true; setTimeout(() => done(reveal.id), 1600); }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function done(v) {
      cancelAnimationFrame(raf);
      stopWatch?.();
      window.removeEventListener('resize', resize);
      cam.close(); el.remove(); resolve(v);
    }

    el.querySelector('[data-back]').onclick = () => done(null);
    el.querySelector('[data-help]').onclick = () => ui.say('渡丸', `殿の遺言では、日光山に堂を建てよと仰せであった。<br>その方角の先に、富士が見えるはずじゃ。<br><br><span class="small dim">候補：${TARGETS.map((t) => `${esc(t.name)}（${dirName(t.deg)}）`).join('・')}</span>`);
    pickBtn.onclick = () => {
      if (!locked || reveal) return;
      reveal = { id: locked, t0: performance.now() };
      pickBtn.disabled = true;
      el.querySelector('[data-guide]').classList.add('hidden');
      navigator.vibrate?.(locked === 'nikko' ? [60, 40, 120] : [200]);
    };
    el.querySelector('[data-shoot]').onclick = async () => {
      if (heading == null) return;
      const f = el.querySelector('.flash');
      f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      const stamp = document.createElement('canvas');
      stamp.width = canvas.width; stamp.height = canvas.height;
      const s = stamp.getContext('2d');
      s.drawImage(canvas, 0, 0);
      s.scale(dpr, dpr);
      s.fillStyle = 'rgba(0,0,0,.45)'; s.fillRect(0, H - 70, W, 70);
      s.fillStyle = '#e0b44c'; s.font = '700 18px "Noto Serif JP", serif'; s.textAlign = 'center';
      s.fillText('渡丸の羅針盤 ― 久能山東照宮', W / 2, H - 38);
      s.fillStyle = '#f3ece0'; s.font = '500 11px "Noto Sans JP", sans-serif';
      s.fillText(`${new Date().toLocaleDateString('ja-JP')}　静岡市ツーリズム創生アプリ`, W / 2, H - 18);
      const blob = await cam.capture(stamp);
      api.savePhoto(blob, 'ar', '久能山東照宮・渡丸の羅針盤');
      ui.toast('写真をコレクションに保存しました');
    };
  });
}
