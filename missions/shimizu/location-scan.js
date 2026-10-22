// 位置情報によるスキャン画面（清水港）
// 現在地がスポットの範囲に入ると枠が赤→緑に変わり、SCANが押せる（画像の判定はしない）。
// 戻り値: 撮影画像(Blob)。戻るボタンで null
import { geo, formatDistance } from '../../js/geo.js';

/**
 * targets / currentId / spot / hint / meter / footer は共通の ui.scan と同じ形
 */
export function locationScan(root, api, { targets, currentId, spot, hint, meter, footer }) {
  const { ui } = api;
  const { html, esc, icons } = ui;

  return new Promise(async (resolve) => {
    const el = html('<div class="screen"></div>');
    root.appendChild(el);
    const cam = await api.openCamera(el);
    const cur = targets.find((t) => t.id === currentId);

    // 枠（画面に対する割合）
    const BOX = { left: 0.1, top: 0.19, width: 0.8, height: 0.34 };

    el.insertAdjacentHTML('beforeend', `
      <style>
        .ls-box{position:absolute;left:${BOX.left * 100}%;top:${BOX.top * 100}%;width:${BOX.width * 100}%;height:${BOX.height * 100}%;border:4px solid #d23a2a;border-radius:14px;box-sizing:border-box;pointer-events:none;transition:border-color .2s,box-shadow .2s;z-index:2}
        .ls-box.ok{border-color:#3ccf6a;box-shadow:0 0 0 3px rgba(60,207,106,.25),0 0 24px rgba(60,207,106,.6)}
        .ls-state{position:absolute;left:0;right:0;top:calc(${(BOX.top + BOX.height) * 100}% - 40px);text-align:center;z-index:3;pointer-events:none}
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
        <span class="pill">${icons.pin.replace('<svg', '<svg width="14" height="14"')} <b>${esc(cur.name)}</b> <span class="sub" data-dist></span></span>
        ${hint ? `<div style="margin-top:8px"><span class="pill small">${esc(hint)}</span></div>` : ''}
      </div>
      <div class="ls-box" data-box></div>
      <div class="ls-state"><span class="pill small" data-state>現在地を確認中…</span></div>
      <div class="scan-bottom">
        <div class="target-cards">${targets.map((t) => `<div class="${t.id === currentId ? 'cur' : ''} ${t.done ? 'got' : ''}"><b>${esc(t.name)}</b><span class="sub">${esc(t.sub ?? '')}</span><br>${t.done ? '<em>取得済</em>' : t.id === currentId ? '<span class="gold">スキャン待ち</span>' : '<span class="dim">未取得</span>'}</div>`).join('')}</div>
        <div class="scan-row">
          <span style="width:48px"></span>
          <button class="shutter" data-shoot disabled>SCAN</button>
          <span style="width:48px"></span>
        </div>
        <div class="center small sub" style="margin-top:10px">${esc(footer ?? '')}</div>
      </div>
      <div class="flash"></div>`);

    const boxEl = el.querySelector('[data-box]');
    const stateEl = el.querySelector('[data-state]');
    const distEl = el.querySelector('[data-dist]');
    const shootBtn = el.querySelector('[data-shoot]');
    let near = null;

    // 現在地が変わるたびに、スポットの範囲内かを判定する
    function update() {
      const d = geo.distanceTo(spot);
      distEl.textContent = d == null ? '現在地を取得中' : `約${formatDistance(d)}先`;
      const v = geo.isNear(spot);
      if (!v) stateEl.textContent = d == null ? '位置情報を許可してください' : `「${cur.name}」に近づいてください`;
      if (v === near) return;
      near = v;
      boxEl.classList.toggle('ok', v);
      shootBtn.disabled = !v;
      if (v) {
        stateEl.textContent = '✓ 位置を確認しました　SCANを押してください';
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
      if (!geo.isNear(spot)) {
        const d = geo.distanceTo(spot);
        ui.toast(d == null ? '現在地を確認できません。位置情報を許可してください' : `「${cur.name}」に近づいてからスキャンしてください（あと約${formatDistance(d - spot.radius)}）`);
        return;
      }
      const f = el.querySelector('.flash');
      f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      navigator.vibrate?.(60);
      clearInterval(timer);
      const blob = await cam.capture();
      setTimeout(() => done(blob), 350);
    };
  });
}
