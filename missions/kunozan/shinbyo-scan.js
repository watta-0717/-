// 神廟スキャン画面（久能山専用）
// カメラ映像の上に宝塔の形の枠（左右対称の単純な形）を出し、神廟の範囲に入ると枠が金の点線→緑の実線に変わってSCANが押せる。
// 判定は位置情報だけ（写っている物の判定はしない。2026-10-18 FanLab が「枠＋位置情報」を選択）。開発モード・デモ版は位置判定をとばす。
// 共通の ui.scan・css/style.css は変えず、この画面の見た目はここで指定する。
// 戻り値: 撮影画像(Blob)。戻るボタンで null
import { geo, formatDistance } from '../../js/geo.js';

// 宝塔の形：枠の幅・高さを1とした右半分の点（中心からの横の距離, 上からの高さ）。左半分は左右反転
const HALF = [[0.03, 0], [0.04, 0.2], [0.1, 0.25], [0.3, 0.33], [0.44, 0.37], [0.5, 0.35], [0.47, 0.44], [0.34, 0.47], [0.34, 1]];
const OUTLINE = [...HALF.map(([x, y]) => [50 + x * 100, y * 100]), ...HALF.slice().reverse().map(([x, y]) => [50 - x * 100, y * 100])]
  .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * spot: 神廟の座標と半径  meter: { label, done, total }  hint / footer: 案内文
 */
export function scanShinbyo(root, api, { spot, name, sub, hint, meter, footer }) {
  const { ui } = api;
  const { html, esc, icons } = ui;

  return new Promise(async (resolve) => {
    const el = html('<div class="screen"></div>');
    root.appendChild(el);
    const cam = await api.openCamera(el);

    el.insertAdjacentHTML('beforeend', `
      <style>
        .kz-frame{position:absolute;left:50%;top:42%;width:66%;aspect-ratio:1;transform:translate(-50%,-50%);pointer-events:none;z-index:2}
        .kz-frame svg{width:100%;height:100%;overflow:visible;filter:drop-shadow(0 0 6px rgba(224,180,76,.7))}
        .kz-frame polygon{fill:none;stroke:var(--gold);stroke-width:3.5;stroke-dasharray:10 7;stroke-linejoin:round;transition:stroke .2s}
        .kz-frame polygon.kz-back{stroke:rgba(0,0,0,.45);stroke-width:7;stroke-dasharray:none} /* 明るい背景・木々の上でも見えるよう、暗い縁取りを下に敷く */
        .kz-frame.ok svg{filter:drop-shadow(0 0 8px rgba(143,194,122,.9))}
        .kz-frame.ok polygon:not(.kz-back){stroke:#8fc27a;stroke-dasharray:none}
        .kz-state{position:absolute;left:50%;top:calc(100% + 14px);transform:translateX(-50%);white-space:nowrap}
        .kz-frame.ok .kz-state .pill{border-color:#8fc27a;color:#cfe8c4}
        .shutter:disabled{opacity:.35;filter:grayscale(1)}
      </style>
      <div class="topbar">
        <button class="icon-btn" data-back>${icons.back}</button>
        <div class="card" style="flex:1;padding:10px 14px">
          <div style="display:flex;justify-content:space-between;font-size:13px"><b class="gold">${esc(meter.label)}</b><b>${meter.done} / ${meter.total}</b></div>
          <div class="meter" style="margin-top:8px">${Array.from({ length: meter.total }, (_, k) => `<i class="${k < meter.done ? 'on' : ''}"></i>`).join('')}</div>
        </div>
      </div>
      <div class="center" style="position:relative;z-index:2">
        <span class="pill">${icons.pin.replace('<svg', '<svg width="14" height="14"')} <b>${esc(name)}</b> <span class="sub" data-dist></span></span>
        ${hint ? `<div style="margin-top:8px"><span class="pill small">${esc(hint)}</span></div>` : ''}
      </div>
      <div class="kz-frame" data-frame>
        <svg viewBox="0 0 100 100" aria-hidden="true"><polygon class="kz-back" points="${OUTLINE}" vector-effect="non-scaling-stroke"/><polygon points="${OUTLINE}" vector-effect="non-scaling-stroke"/></svg>
        <div class="kz-state"><span class="pill small" data-state>現在地を確認中…</span></div>
      </div>
      <div class="scan-bottom">
        <div class="target-cards"><div class="cur"><b>${esc(name)}</b><span class="sub">${esc(sub ?? '')}</span><br><span class="gold">スキャン待ち</span></div></div>
        <div class="scan-row">
          <span style="width:48px"></span>
          <button class="shutter" data-shoot disabled>SCAN</button>
          <span style="width:48px"></span>
        </div>
        ${footer ? `<div class="center small sub" style="margin-top:10px">${esc(footer)}</div>` : ''}
      </div>
      <div class="flash"></div>`);

    const frameEl = el.querySelector('[data-frame]');
    const stateEl = el.querySelector('[data-state]');
    const distEl = el.querySelector('[data-dist]');
    const shootBtn = el.querySelector('[data-shoot]');
    let near = null;

    // 現在地が変わるたびに、神廟の範囲内かを判定する
    function update() {
      const d = geo.distanceTo(spot);
      distEl.textContent = d == null ? '' : `約${formatDistance(d)}先`;
      const v = geo.isNear(spot);
      if (!v) stateEl.textContent = d == null ? '現在地を確認中…（位置情報を許可してください）' : `${name}に近づいてください（あと約${formatDistance(Math.max(0, d - spot.radius))}）`;
      if (v === near) return;
      near = v;
      frameEl.classList.toggle('ok', v);
      shootBtn.disabled = !v;
      if (v) {
        stateEl.textContent = `✓ ${name}に着きました　宝塔を枠に合わせてSCAN`;
        navigator.vibrate?.(30);
      }
    }
    const off = geo.onChange(update);
    update();
    // 位置が届かない間も表示を更新する（許可待ち・開発モード切替など）
    const timer = setInterval(update, 1000);

    function done(v) { clearInterval(timer); off(); cam.close(); el.remove(); resolve(v); }
    el.querySelector('[data-back]').onclick = () => done(null);
    shootBtn.onclick = async () => {
      if (!geo.isNear(spot)) return update();
      const f = el.querySelector('.flash');
      f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      navigator.vibrate?.(60);
      clearInterval(timer);
      const blob = await cam.capture();
      setTimeout(() => done(blob), 350);
    };
  });
}
