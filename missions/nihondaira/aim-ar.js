// 方角合わせAR：日本平夢テラスから、スマートフォンを対象の方角へ向けると、その対象がカメラ映像の上に浮かび上がる
// 対象は順番に1つずつ（三春瀧櫻 → 茶畑 → 日本武尊像）。方角に入って HOLD ミリ秒保つと浮かび上がる
// コンパスが使えない端末（許可なし・PC・claude.ai のデモ版）では、タップで浮かび上がらせて進める
// 2026-10-16 発見画面の撮影ボタンを廃止（AR写真は炎を払う場面で撮る）
// 戻り値: 'done'（最後の対象まで見つけた）/ null（戻る）
import * as compass from '../kunozan/compass.js';
import { distance } from '../../js/geo.js';
import { store } from '../../js/state.js';

const AIM = 20;           // 対象の方角とみなす幅（±度）
const HOLD = 1500;        // 向け続ける時間（ms）
const NO_SENSOR = 3000;   // この時間方角が取れなければコンパスなしで進める（ms）
const SKIP_AFTER = 10000; // 「方角を合わせずに進む」を出すまで（ms）
const FOV = 60;           // 画面の横幅に見せる角度（度）
const DECLINATION = 7;    // 静岡の磁気偏角（西偏 約7°）。コンパスは磁北基準なので真北に直す
const NEAR_ORIGIN = 500;  // 夢テラスからこの距離以内なら、現在地から方角を計算する（m）
const DIRS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
const diff = (a, b) => ((a - b + 540) % 360) - 180; // a-b を -180〜180 に
const dirName = (deg) => DIRS[Math.round(deg / 22.5) % 16];

// 方角センサー（真北基準に補正して返す）。三保松原の方角判定と同じ方式
function watchHeading(cb) {
  if (typeof compass.watchTrueHeading === 'function') return compass.watchTrueHeading((e) => cb(e.heading, e));
  const r = Math.PI / 180;
  // 背面カメラが向いている方角（端末を寝かせているときは上端の方角）
  const fromEuler = (a, b, g) => {
    const ca = Math.cos(a * r), sa = Math.sin(a * r), cb = Math.cos(b * r), sb = Math.sin(b * r), cg = Math.cos(g * r), sg = Math.sin(g * r);
    let x = -ca * sg - sa * sb * cg, y = -sa * sg + ca * sb * cg;
    if (Math.hypot(x, y) < 0.35) { x = -sa * cb; y = ca * cb; }
    return (Math.atan2(x, y) / r + 360) % 360;
  };
  const toTrue = (m) => (m - DECLINATION + 360) % 360;
  const onAbs = (e) => { if (e.alpha != null && e.beta != null) { const m = fromEuler(e.alpha, e.beta, e.gamma ?? 0); cb(toTrue(m), { source: 'android', magnetic: m }); } };
  const onAny = (e) => {
    if (e.webkitCompassHeading != null) cb(toTrue(e.webkitCompassHeading), { source: 'ios', magnetic: e.webkitCompassHeading, accuracy: e.webkitCompassAccuracy });
    else if (e.absolute) onAbs(e);
  };
  window.addEventListener('deviceorientationabsolute', onAbs);
  window.addEventListener('deviceorientation', onAny);
  return () => { window.removeEventListener('deviceorientationabsolute', onAbs); window.removeEventListener('deviceorientation', onAny); };
}

function loadImage(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

/**
 * targets: [{ id, name, lat, lng, img(画像URL) | draw(canvas に描く関数), energy, mark, about, line }]
 * startIndex: 何番目から始めるか（途中再開用）
 * onFound(target, index): 浮かび上がったときに呼ぶ（進行状況の保存用）
 */
export function aimAR(root, api, { targets, startIndex = 0, onFound }) {
  const { ui, geo } = api;
  const { html, esc } = ui;
  const demo = store.get().demo;
  const dev = api.devMode && !demo; // 開発モード（デモ版は除く）は方角を手で回せる
  const origin = api.mission.spot;

  return new Promise(async (resolve) => {
    const el = html('<div class="screen"></div>');
    root.appendChild(el);
    const cam = await api.openCamera(el);
    // 説明文は文節の途中で改行しないよう、ひとまとまりごとに折り返す（2026-10-16）
    const phr = (...lines) => lines.map((l) => l.map((p) => `<span style="display:inline-block">${p}</span>`).join('')).join('<br>');

    // 対象の絵を用意（写真 or アプリ内で描いた絵）
    const pics = await Promise.all(targets.map(async (t) => {
      if (t.img) return loadImage(t.img);
      const c = document.createElement('canvas'); c.width = 480; c.height = 320; t.draw(c.getContext('2d'), c.width, c.height); return c;
    }));

    const canvas = document.createElement('canvas');
    canvas.className = 'overlay';
    cam.element.appendChild(canvas); // カメラ映像の上に重ねる
    el.insertAdjacentHTML('beforeend', `
      <div class="topbar"><span style="flex:1"></span><span class="pill small" data-tag style="white-space:nowrap">● AR：草木の力を探す</span><span style="flex:1"></span></div>
      <div class="scan-bottom">
        <div data-gate class="card center" style="padding:18px">
          <div class="serif" style="font-size:18px;margin-bottom:8px">${phr(['夢テラスから、', '草木の力を探そう'])}</div>
          <div class="small sub" style="line-height:1.8;margin-bottom:14px">${phr(
            ['スマートフォンを掲げて、', '案内された方角へ', '向けてください。'],
            ['方角が合うと、', 'その場所が', '浮かび上がります。'],
            ['スマートフォンでは', '「動作と方向」への', 'アクセスを', '許可してください。'],
          )}</div>
          <button class="btn" data-seek style="margin:0">方角を探す</button>
        </div>
        <div data-seekbar class="hidden">
          <div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 14px">
            <div style="flex:1;min-width:0"><div class="small dim" data-step></div><b style="font-size:17px" data-target></b></div>
            <b class="small" data-lock style="color:var(--text-dim)">探索中</b>
          </div>
          <div class="meter" style="margin:10px 0 0" data-dots>${targets.map(() => '<i></i>').join('')}</div>
          ${dev ? '<div class="card" style="margin-top:8px;padding:8px 14px"><div class="small dim">開発モード：方角を手で回す <b data-devdeg></b></div><input type="range" min="0" max="359" value="0" data-dev style="width:100%"><div class="small dim" data-sensor style="margin-top:4px">センサー 未取得（スライダーを動かすと3秒間は手動が優先）</div></div>' : ''}
          <button class="btn hidden" data-tapreveal style="margin-top:10px">タップで浮かび上がらせる</button>
          <div class="small dim hidden" data-nocomp style="margin-top:8px;text-align:center;line-height:1.7"></div>
          <button class="link-btn hidden" data-retry style="display:block;margin:6px auto 0">もう一度コンパスを試す</button>
          <button class="link-btn hidden" data-noaim style="display:block;margin:10px auto 0">方角を合わせずに進む</button>
        </div>
        <div data-found class="hidden"></div>
      </div>
      <div class="flash"></div>`);

    const $ = (s) => el.querySelector(s);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => { W = el.clientWidth; H = el.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    window.addEventListener('resize', resize);

    let idx = startIndex;
    let phase = 'gate';        // gate → seek → found →（次の対象の seek）
    let noCompass = false;
    let raw = null, heading = null;
    let aimedAt = 0, seekStart = 0, revealAt = 0;
    let stopWatch = null;
    const timers = [];
    const sparks = [];

    // 方角は現在地から計算（テラスの立ち位置でずれるため）。現在地が遠い・不明なら夢テラスから
    const from = () => (geo.position && distance(geo.position, origin) <= NEAR_ORIGIN ? geo.position : origin);
    const degOf = (t) => compass.bearing(from(), t);

    function setRaw(h, info) {
      raw = h;
      if (heading == null) heading = h;
      if (dev && info) $('[data-sensor]').textContent = `センサー ${Math.round(info.magnetic ?? h)}° → ${Math.round(h)}°（${info.source ?? '—'}${info.accuracy != null ? `・誤差${Math.round(info.accuracy)}°` : ''}）`;
    }

    function beginSeek() {
      const t = targets[idx];
      phase = 'seek';
      seekStart = performance.now();
      aimedAt = 0;
      $('[data-found]').classList.add('hidden');
      $('[data-seekbar]').classList.remove('hidden');
      $('[data-noaim]').classList.add('hidden');
      $('[data-tapreveal]').classList.toggle('hidden', !noCompass);
      const deg = degOf(t);
      $('[data-step]').textContent = `${idx + 1} / ${targets.length}　次の方角`;
      $('[data-target]').textContent = noCompass ? t.name : `${t.name}（${dirName(deg)} ${Math.round(deg)}°）`;
      $('[data-dots]').innerHTML = targets.map((_, k) => `<i class="${k < idx ? 'on' : ''}"></i>`).join('');
      $('[data-tag]').textContent = `● AR：${t.name}を探す`;
      if (!noCompass) timers.push(setTimeout(() => { if (phase === 'seek' && targets[idx] === t) $('[data-noaim]').classList.remove('hidden'); }, SKIP_AFTER));
    }

    $('[data-seek]').onclick = async () => {
      // スマートフォン（iPhone など）はボタン操作の中で許可を求める必要がある
      const perm = await compass.requestCompass();
      $('[data-gate]').classList.add('hidden');
      if (dev) {
        // 開発モードでも実機のコンパスを読む（2026-10-15 修正：以前はスライダーだけで、センサーを読んでいなかった）
        // スライダーを動かした直後の3秒間は手動の値を優先する
        const s = $('[data-dev]'), lab = $('[data-devdeg]');
        let manualUntil = 0;
        s.oninput = () => { manualUntil = performance.now() + 3000; setRaw(+s.value, { source: '手動' }); lab.textContent = `${s.value}°`; };
        if (perm !== 'denied') stopWatch = watchHeading((h, info) => { if (performance.now() >= manualUntil) { setRaw(h, info); s.value = Math.round(h); lab.textContent = `${Math.round(h)}°`; } });
        else $('[data-sensor]').textContent = 'センサー：コンパスが許可されていません（スライダーで操作）';
      } else startCompass(perm);
      beginSeek();
    };

    // コンパスの読み取りを始める。使えないときはタップで進める（理由を画面に残し、もう一度試せるようにする）
    const DENIED = phr(['コンパスが', '許可されていません。'], ['許可画面が出ない場合は、', 'スマートフォンの設定で、', 'お使いのブラウザの', '「動作と方向', '（モーションと画面の向き）」', 'への', 'アクセスを', 'オンにしてください。']);
    const NODATA = '方位センサーの値が届きません';
    function startCompass(perm) {
      if (perm === 'denied') return useNoCompass('コンパスが許可されていないため、\nタップで浮かび上がらせて進みます。', DENIED);
      stopWatch = watchHeading(setRaw);
      timers.push(setTimeout(() => { if (raw == null) useNoCompass('この端末ではコンパスが使えないため、\nタップで浮かび上がらせて進みます。', NODATA); }, NO_SENSOR));
    }
    $('[data-retry]').onclick = async () => {
      const perm = await compass.requestCompass(); // ボタン操作の中で許可を求め直す
      if (perm === 'denied') { $('[data-nocomp]').innerHTML = DENIED; ui.toast('コンパスが許可されませんでした', 2400); return; }
      noCompass = false; raw = null; heading = null;
      $('[data-nocomp]').classList.add('hidden'); $('[data-retry]').classList.add('hidden');
      startCompass(perm);
      if (phase === 'seek') beginSeek();
    };

    function useNoCompass(msg, reason) {
      if (noCompass) return;
      noCompass = true;
      stopWatch?.(); stopWatch = null;
      ui.toast(msg, 3200);
      if (reason) { $('[data-nocomp]').innerHTML = reason; $('[data-nocomp]').classList.remove('hidden'); $('[data-retry]').classList.remove('hidden'); }
      if (phase === 'seek') beginSeek();
    }
    $('[data-tapreveal]').onclick = () => reveal();
    $('[data-noaim]').onclick = () => reveal();

    // ---- 浮かび上がる ----
    function reveal() {
      if (phase !== 'seek') return;
      const t = targets[idx];
      phase = 'found';
      revealAt = performance.now();
      navigator.vibrate?.([40, 30, 90]);
      onFound?.(t, idx);
      const last = idx === targets.length - 1;
      $('[data-seekbar]').classList.add('hidden');
      $('[data-tag]').textContent = `AR：${t.name}を発見`;
      const f = $('[data-found]');
      f.innerHTML = `
        <div class="card" style="animation:appear .5s">
          <div style="display:flex;align-items:center;gap:12px">
            ${ui.hexIcon(t.mark, true, 40)}
            <div style="flex:1;min-width:0"><div class="small dim">${t.energy ? '獲得' : '見つけた'}</div><h3 style="margin:0;font-size:19px">${esc(t.energy ?? t.name)}</h3></div>
            ${t.energy ? `<b class="gold small" style="text-align:right">${esc(t.name)}</b>` : ''}
          </div>
          ${t.line ? `<div class="speech" style="margin-top:22px"><span class="who">${esc(t.line.who)}</span><div class="story-text" style="font-size:15px">${t.line.text}</div></div>` : ''}
          <p class="small" style="line-height:1.85;margin:12px 0 0;max-height:22vh;overflow-y:auto">${t.about}</p>
        </div>
        <button class="btn" data-next style="margin-top:12px">${last ? '日本武尊に力を捧げる' : '次の方角へ'}</button>`;
      f.classList.remove('hidden');
      f.querySelector('[data-next]').onclick = () => {
        if (last) return done('done');
        idx++;
        beginSeek();
      };
    }

    // ---- 描画 ----
    const xOf = (deg) => (noCompass || heading == null ? W / 2 : W / 2 + (diff(deg, heading) / (FOV / 2)) * (W / 2));

    // 方角の帯（上部）
    function drawBand(tdeg) {
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
      const tx = W / 2 + (diff(tdeg, heading) / 45) * (w / 2);
      if (tx >= l && tx <= l + w) { ctx.fillStyle = '#e0b44c'; ctx.font = '700 13px "Noto Serif JP", serif'; ctx.fillText(targets[idx].mark, tx, top + 37); }
      ctx.restore();
      ctx.fillStyle = '#e0b44c';
      ctx.beginPath(); ctx.moveTo(W / 2 - 6, top + h + 2); ctx.lineTo(W / 2 + 6, top + h + 2); ctx.lineTo(W / 2, top + h - 6); ctx.fill();
    }

    // 対象の絵（光の縁取りつき）。a: 不透明度 0〜1、s: 大きさの倍率
    function drawPic(k, x, y, a, s, now) {
      const img = pics[k];
      const maxW = Math.min(W * 0.64, 300) * s, maxH = H * 0.3 * s;
      let w = maxW, h = maxW * 0.66;
      if (img) { const r = (img.width || 1) / (img.height || 1); w = Math.min(maxW, maxH * r); h = w / r; }
      ctx.save();
      ctx.globalAlpha = a;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.9);
      glow.addColorStop(0, `rgba(255,236,180,${0.45 + 0.1 * Math.sin(now / 400)})`); glow.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - w * 1.2, y - h * 1.2, w * 2.4, h * 2.4);
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 12); ctx.save(); ctx.clip();
      if (img) ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
      ctx.restore();
      ctx.strokeStyle = '#e0b44c'; ctx.lineWidth = 2.5; ctx.shadowColor = '#e0b44c'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 12); ctx.stroke();
      ctx.restore();
      return { w, h };
    }

    function drawSeek(now) {
      const t = targets[idx];
      const tdeg = degOf(t);
      const cy = H * 0.36;
      if (noCompass) {
        // コンパスなし：中央に淡く揺らめく姿
        drawPic(idx, W / 2, cy, 0.25 + 0.12 * Math.sin(now / 500), 0.92, now);
        ctx.fillStyle = '#f3ece0'; ctx.font = '600 15px "Noto Serif JP", serif'; ctx.textAlign = 'center';
        ctx.fillText(`${t.name}の方へ、スマートフォンを向けてみよう`, W / 2, H * 0.58, W - 32); // 狭い画面でははみ出さないよう縮める
        return;
      }
      if (heading == null) return;
      drawBand(tdeg);
      const d = diff(tdeg, heading);
      if (Math.abs(d) <= FOV / 2 + 10) {
        // 視野の中：方角に近づくほど濃く浮かぶ
        const near = 1 - Math.min(1, Math.abs(d) / (FOV / 2 + 10));
        drawPic(idx, xOf(tdeg), cy, 0.12 + 0.35 * near, 0.9, now);
      } else {
        // 画面外：端に矢印
        const right = d > 0;
        const text = right ? `${t.name}はこちら ›` : `‹ ${t.name}はこちら`;
        ctx.font = '700 13px "Noto Sans JP", sans-serif';
        const tw = ctx.measureText(text).width + 24;
        const x = right ? W - tw - 10 : 10;
        ctx.fillStyle = 'rgba(24,20,16,.82)'; ctx.beginPath(); ctx.roundRect(x, cy - 16, tw, 32, 16); ctx.fill();
        ctx.fillStyle = '#e0b44c'; ctx.textAlign = 'left'; ctx.fillText(text, x + 12, cy + 5);
      }
      // 照準と保持の進み具合
      const inAim = Math.abs(d) <= (t.aim ?? AIM);
      if (inAim && !aimedAt) aimedAt = now;
      if (!inAim) aimedAt = 0;
      const p = aimedAt ? Math.min(1, (now - aimedAt) / HOLD) : 0;
      const lock = $('[data-lock]');
      lock.textContent = p >= 1 ? '発見' : inAim ? '保持中…' : '探索中';
      lock.style.color = inAim ? 'var(--gold)' : 'var(--text-dim)';
      const ry = H * 0.58;
      ctx.strokeStyle = 'rgba(243,236,224,.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(W / 2, ry, 20, 0, Math.PI * 2); ctx.stroke();
      if (p > 0) { ctx.strokeStyle = '#e0b44c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, ry, 20, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke(); }
      if (p >= 1) reveal();
    }

    function drawFound(now) {
      const t = targets[idx];
      const tdeg = degOf(t);
      const k = Math.min(1, (now - revealAt) / 700);
      const e = k * k * (3 - 2 * k);
      const x = xOf(tdeg), y = H * 0.3;
      if (!noCompass && heading != null) drawBand(tdeg);
      // 光の輪が広がる
      if (k < 1) {
        ctx.strokeStyle = `rgba(255,230,150,${1 - k})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, 30 + e * Math.min(W, H) * 0.5, 0, Math.PI * 2); ctx.stroke();
      }
      const { w, h } = drawPic(idx, x, y, 0.35 + 0.65 * e, 0.85 + 0.15 * e, now);
      if (Math.random() < 0.6) sparks.push({ x: x + (Math.random() - 0.5) * w, y: y + h / 2, vy: -(0.4 + Math.random() * 0.9), a: 1 });
      ctx.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.y += s.vy; s.a -= 0.012;
        if (s.a <= 0) { sparks.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255,220,130,${s.a})`; ctx.fillRect(s.x, s.y, 2.5, 2.5);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    let raf;
    function frame(now) {
      ctx.clearRect(0, 0, W, H);
      if (raw != null) heading = (heading + diff(raw, heading) * 0.25 + 360) % 360; // ゆれを抑える
      if (phase === 'seek') drawSeek(now);
      if (phase === 'found') drawFound(now);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function done(v) {
      cancelAnimationFrame(raf);
      stopWatch?.();
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', resize);
      cam.close(); el.remove(); resolve(v);
    }
    // 戻る（カード表示中以外はいつでも）
    el.querySelector('.topbar').insertAdjacentHTML('afterbegin', `<button class="icon-btn" data-back>${ui.icons.back}</button>`);
    el.querySelector('.topbar').insertAdjacentHTML('beforeend', '<span style="width:44px"></span>');
    $('[data-back]').onclick = () => done(null);
  });
}
