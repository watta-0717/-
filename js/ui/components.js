// 共通UI部品（全ミッションで共通して使う）
import { geo, formatDistance } from '../geo.js';
import { openCamera } from '../camera.js';

export const icons = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17h.01"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 11l8-7 8 7v9H4z"/></svg>',
  shard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8.5 5v10L12 22l-8.5-5V7z"/><path d="M12 7l3 5-3 5-3-5z"/></svg>',
  locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5 9-10"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// HTML文字列から要素を1つ作る
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

export function toast(msg, ms = 2600) {
  const app = document.getElementById('app');
  const el = html(`<div class="toast">${esc(msg)}</div>`);
  app.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// 下から出るシート。content は要素か HTML 文字列
export function modal(content) {
  const app = document.getElementById('app');
  const bg = html('<div class="modal-bg"><div class="modal"></div></div>');
  const box = bg.firstElementChild;
  if (typeof content === 'string') box.innerHTML = content; else box.appendChild(content);
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  app.appendChild(bg);
  function close() { bg.remove(); }
  return { el: box, close };
}

// NPCのセリフ・ヒントを手軽に表示する
export function say(who, text) {
  const m = modal(`<div class="speech" style="margin-top:14px"><span class="who">${esc(who)}</span><div class="story-text" style="font-size:16px">${text}</div></div><button class="btn dark" style="margin-top:16px">閉じる</button>`);
  m.el.querySelector('button').onclick = m.close;
  return m;
}

/**
 * 紙芝居形式の物語（起動画面・ストーリー導入・エンディングで共通）
 * pages: [{ bg, tint, text, note, npc: { name, img, caption }, line, html }]
 *   tint: 画面全体に重ねる色（CSSの background 値）
 * 戻り値: 最後まで進むかスキップで resolve
 */
export function story(root, { pages, place, skippable = true }) {
  return new Promise((resolve) => {
    let i = 0;
    const el = html('<div class="story"></div>');
    root.appendChild(el);

    function render() {
      const p = pages[i];
      el.style.backgroundImage = p.bg ? `url(${p.bg})` : 'none';
      el.style.backgroundColor = '#1a140f';
      const dots = pages.length > 1 ? `<div class="progress-dots">${pages.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>` : '';
      el.innerHTML = `
        ${p.tint ? `<div class="story-tint" style="background:${p.tint}"></div>` : ''}
        <div class="topbar" style="justify-content:space-between">
          ${place ? `<span class="pill">${icons.pin.replace('<svg', '<svg width="14" height="14"')} ${esc(place)}</span>` : '<span></span>'}
          ${skippable ? '<button class="pill" data-skip>スキップ</button>' : ''}
        </div>
        ${dots}
        ${p.npc ? `<div class="npc-frame"><img src="${p.npc.img}" alt="${esc(p.npc.name)}"></div>
                    <div class="center" style="margin-top:10px"><span class="pill small">${esc(p.npc.caption ?? `AR：${p.npc.name}があらわれた`)}</span></div>` : ''}
        <div class="story-body">
          ${p.html ?? ''}
          ${p.line ? `<div class="speech"><span class="who">${esc(p.line.who)}</span><div class="story-text" style="font-size:17px">${p.line.text}</div></div>` : ''}
          ${p.text ? `<div class="story-text">${p.text}</div>` : ''}
          ${p.note ? `<div class="story-note">${p.note}</div>` : ''}
          <div class="story-nav">
            ${i > 0 ? '<button class="pill" data-prev>‹ 前へ</button>' : '<span></span>'}
            <div class="tap-next">${i < pages.length - 1 ? 'タップで次へ' : 'タップで進む'}</div>
            <span></span>
          </div>
        </div>`;
    }
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-skip]')) { i = pages.length; }
      else if (e.target.closest('[data-prev]')) { if (i > 0) i--; }  // 前のページに戻る（2026-10-16）
      else i++;
      if (i >= pages.length) { el.remove(); resolve(); } else render();
    });
    render();
  });
}

/**
 * スキャン画面（カメラ撮影＋位置判定）
 * targets: [{ id, name, sub }]  currentId: 今回スキャンする対象
 * spot: { lat, lng, radius }  meter: { label, done, total }
 * 戻り値: 撮影画像(Blob)。戻るボタンで null
 */
export function scan(root, { title, targets, currentId, spot, hint, meter, footer }) {
  return new Promise(async (resolve) => {
    const el = html('<div class="screen"></div>');
    root.appendChild(el);
    const cam = await openCamera(el);
    const cur = targets.find((t) => t.id === currentId);

    el.insertAdjacentHTML('beforeend', `
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
      <div class="scan-frame"><div class="scan-line"></div></div>
      <div class="scan-bottom">
        <div class="target-cards">${targets.map((t) => `<div class="${t.id === currentId ? 'cur' : ''} ${t.done ? 'got' : ''}"><b>${esc(t.name)}</b><span class="sub">${esc(t.sub ?? '')}</span><br>${t.done ? '<em>取得済</em>' : t.id === currentId ? '<span class="gold">スキャン待ち</span>' : '<span class="dim">未取得</span>'}</div>`).join('')}</div>
        <div class="scan-row">
          <span style="width:48px"></span>
          <button class="shutter" data-shoot>SCAN</button>
          <span style="width:48px"></span>
        </div>
        ${footer ? `<div class="center small sub" style="margin-top:10px">${esc(footer)}</div>` : ''}
      </div>
      <div class="flash"></div>`);

    const distEl = el.querySelector('[data-dist]');
    const off = geo.onChange(() => { const d = geo.distanceTo(spot); distEl.textContent = d == null ? '' : `約${formatDistance(d)}先`; });
    if (!geo.position) distEl.textContent = '現在地を取得中';

    function done(v) { off(); cam.close(); el.remove(); resolve(v); }
    el.querySelector('[data-back]').onclick = () => done(null);
    el.querySelector('[data-shoot]').onclick = async () => {
      if (!geo.isNear(spot)) {
        const d = geo.distanceTo(spot);
        toast(d == null ? '現在地を確認できません。位置情報を許可してください' : `「${cur.name}」に近づいてからスキャンしてください（あと約${formatDistance(d - spot.radius)}）`);
        return;
      }
      const f = el.querySelector('.flash');
      f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      navigator.vibrate?.(60);
      const blob = await cam.capture();
      setTimeout(() => done(blob), 350);
    };
  });
}

/**
 * 起動画面（全ミッション共通の形）
 * タイトルと「歴史の歪み」を表示し、開始地点に近づくと「ミッションを開始する」が押せる
 * 戻り値: true（開始）/ false（戻る）
 */
export function launch(root, { bg, area, title, distortion, spot, meta }) {
  return new Promise((resolve) => {
    const el = html(`
      <div class="story" style="background-image:url(${bg})">
        <div class="topbar"><button class="icon-btn" data-back>${icons.back}</button><span style="flex:1"></span><span class="pill small">${esc(area)}</span></div>
        <div class="story-body">
          <div class="label">MISSION</div>
          <h2 class="serif" style="font-size:26px;line-height:1.5;margin:8px 0 18px">${title}</h2>
          <div class="label" style="color:var(--red);filter:brightness(1.4)">歴史の歪み</div>
          <div class="story-note" style="color:var(--text);margin-top:6px">${distortion}</div>
          ${meta ? `<div class="small dim" style="margin:10px 0 0">${esc(meta)}</div>` : ''}
          <div class="small center sub" data-dist style="margin:18px 0 8px"></div>
          <button class="btn" data-start>ミッションを開始する</button>
        </div>
      </div>`);
    root.appendChild(el);
    const btn = el.querySelector('[data-start]');
    const distEl = el.querySelector('[data-dist]');
    const update = () => {
      const near = geo.isNear(spot);
      btn.disabled = !near;
      const d = geo.distanceTo(spot);
      distEl.textContent = near ? `${spot.name}に到着しました` : d == null ? `${spot.name}に近づくと開始できます（位置情報を確認中）` : `${spot.name}まで 約${formatDistance(d)}　近づくと開始できます`;
    };
    const off = geo.onChange(update);
    update();
    const done = (v) => { off(); el.remove(); resolve(v); };
    el.querySelector('[data-back]').onclick = () => done(false);
    btn.onclick = () => done(true);
  });
}

// 欠片アイコン（六角形）
export const hexIcon = (kanji, on = true, size = 56) =>
  `<div class="hex ${on ? 'on' : ''}" style="width:${size}px;height:${size * 1.14}px;font-size:${size / 3}px">${esc(kanji)}</div>`;
