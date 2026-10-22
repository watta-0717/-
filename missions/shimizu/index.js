// 清水港ミッション「次郎長と共に『蘭字』を完成させ、開化の船を出航させよ！」
// 流れ: 起動 → ストーリー導入 → ミッション確認 → スキャン(4か所・順不同で蘭字パーツ8枚。輪郭マッチングで判定) → 蘭字の復元(スライドパズル) → 出航AR → クリア
import { SHIMIZU_SCAN_SPOTS as SPOTS } from '../../data/spots.js';
import { formatDistance, walkMinutes } from '../../js/geo.js';
import { PIECES, puzzle, tileSVG, labelSVG } from './ranji.js';
import { departureAR } from './departure-ar.js';
import { locationScan } from './location-scan.js';

const IMG = {
  bg: 'assets/img/shimizu/port_fuji.jpg',
  jirocho: 'assets/img/shimizu/jirocho.jpg',
};
const JIROCHO = '清水次郎長';
const TOTAL = PIECES.length; // 8

// 各スポットの案内（解説は設計提案書39枚目）
const INFO = {
  wheel: {
    hint: '観覧車を枠に収めてSCAN',
    about: '港のシンボルの観覧車。高い場所から富士と駿河湾、その先の水平線までを一度に見渡せる。明治の人々が茶を送り出した先も、この海の向こうにあった。',
  },
  rail: {
    hint: '残された車輪と線路を枠に収めてSCAN',
    about: '清水港線は、清水駅と港を結んだ貨物中心の路線。茶や缶詰を港へ運び、昭和五十九年に廃止された。いまは車輪と線路の一部が、記念として残されている。',
  },
  jirocho: {
    hint: '生家の門構えを枠に収めてSCAN',
    about: '清水次郎長が生まれた家。侠客として知られる一方、明治には清水港の整備や茶の輸出、英語塾の開設に力を尽くし、港町の近代化を支えたと伝わる。',
  },
  marine: {
    hint: '岸壁と海を枠に収めてSCAN',
    about: 'かつて茶箱を積んだ船が並んだ岸壁は、いまは芝生と噴水の遊歩道になっている。停泊するヨットの向こうにコンテナ埠頭が見え、港が働き続けていることがわかる。',
  },
};
const piecesOf = (spotId) => PIECES.filter((p) => p.spot === spotId);
const piecesLabel = (spotId) => piecesOf(spotId).map((p) => p.name).join('／');

export async function start(root, api) {
  const { ui, geo } = api;
  const { html, esc, icons } = ui;
  const st = () => api.getState();
  // 次郎長の絵を黄色い枠いっぱいに広げる（画像の幅が枠より小さいと右と下に隙間が出るため。2026-10-22。画像は4:3）
  // 画面の低いスマートフォンでは、縦横比を保ったまま枠ごと小さくする（高さは画面の30%まで）
  if (!document.getElementById('shimizu-style')) {
    document.head.insertAdjacentHTML('beforeend', `<style id="shimizu-style">
      .npc-frame:has(img[alt="${JIROCHO}"]) { width: min(82%, calc(30vh * 4 / 3)); flex-shrink: 0; }
      .npc-frame img[alt="${JIROCHO}"] { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; }
    </style>`);
  }
  const gotPieces = () => (st().got ?? []).flatMap((id) => piecesOf(id).map((p) => p.id));

  // ---------- 1. 起動画面 ----------
  const go = await ui.launch(root, {
    bg: IMG.bg,
    area: '清水港',
    title: '次郎長と共に「蘭字」を完成させ、<br>開化の船を出航させよ！',
    distortion: '明治時代、海外へ輸出する茶のラベル「蘭字」のデザインが奪われ、清水港からの輸出船が出航できずにいる。',
    spot: api.mission.spot,
    meta: '所要 約35分 ・ 断片 8枚 ・ 港・AR',
  });
  if (!go) return api.exit();

  // ---------- 2. ストーリー導入（初回のみ。途中再開時は省略） ----------
  if (!st().introDone) {
    await ui.story(root, {
      place: '清水港・エスパルスドリームプラザ',
      pages: [
        { bg: IMG.bg, text: '岸壁の向こうに富士。<br>今日も船が荷を積んでいる。', note: 'この港から、静岡の茶は世界へ運ばれていった。' },
        { bg: IMG.bg, tint: 'linear-gradient(rgba(40,50,70,.1),rgba(15,20,30,.6))', html: '<span class="pill small" style="background:#7a1f0c;margin-bottom:12px">● 時空の歪みを検知</span>', text: '汽笛が、途中で途切れた。<br>コンテナ船の姿が、古い蒸気船に変わる。', note: '茶を満載したまま、船は岸壁を離れられずにいる。' },
        { bg: IMG.bg, npc: { name: JIROCHO, img: IMG.jirocho, caption: 'AR：清水次郎長があらわれた' }, line: { who: JIROCHO, text: 'おい若造、世界に誇る<br>静岡のお茶を出す手伝いをしな！' }, note: '茶箱に貼るラベル「蘭字」が奪われた。ラベルなき茶は、荷として認められない。' },
        { bg: IMG.bg, npc: { name: JIROCHO, img: IMG.jirocho, caption: 'AR：清水次郎長' }, line: { who: JIROCHO, text: '蘭字の断片は、港のあちこちに<br>散らばっちまった。<br>4か所を回って、8枚そろえてきな。' }, note: '回る順番は自由。どこからでも始められる。' },
      ],
    });
    api.setState({ introDone: true });
  }

  // ---------- 3〜5. ミッション確認とスキャン（順不同） ----------
  while ((st().got ?? []).length < SPOTS.length) {
    const action = await missionCheck();
    if (action === 'exit') return api.exit();

    const got = st().got ?? [];
    const spot = SPOTS.find((s) => s.id === action);
    const blob = await locationScan(root, api, {
      targets: SPOTS.map((s) => ({ id: s.id, name: s.short, sub: '2枚', done: got.includes(s.id) })),
      currentId: spot.id,
      spot,
      hint: INFO[spot.id].hint,
      meter: { label: '蘭字のパーツ', done: gotPieces().length, total: TOTAL },
      footer: 'スポットに着くと枠が緑になります。対象を枠に収めてSCANを押してください',
    });
    if (!blob) continue;
    api.savePhoto(blob, 'scan', spot.name);
    api.setState({ got: [...new Set([...got, spot.id])] });
    await scanResult(spot, blob);
  }

  // ---------- 6. 蘭字の復元（スライドパズル） ----------
  if (!st().solved) {
    const ok = await puzzle(root, api);
    if (!ok) return api.exit();
    api.setState({ solved: true });
    await ui.story(root, {
      place: '清水港・岸壁',
      pages: [
        { bg: IMG.bg, html: `<div style="width:150px;margin:0 auto 14px;border:5px solid #b3311c;box-shadow:0 0 24px rgba(224,180,76,.6)">${labelSVG('style="display:block;width:100%"')}</div>`, text: '蘭字がよみがえった。<br>茶箱に一枚ずつ、ラベルが貼られていく。' },
        { bg: IMG.bg, npc: { name: JIROCHO, img: IMG.jirocho, caption: 'AR：清水次郎長' }, line: { who: JIROCHO, text: 'さあ、荷は揃った。<br>汽笛を鳴らして、船を出しな！' }, note: 'スマホを海の方へ向けて、出航を見届けよう。' },
      ],
    });
  }

  // ---------- 7. 出航AR ----------
  const photo = await departureAR(root, api);
  if (photo) api.savePhoto(photo, 'ar', '清水港・開化の船の出航');

  // ---------- 8. 結果画面 ----------
  await ui.story(root, {
    place: '清水港',
    skippable: false,
    pages: [
      { bg: IMG.bg, tint: 'linear-gradient(rgba(10,8,6,.1),rgba(10,8,6,.7))', text: '汽笛が鳴り、静岡の茶を積んだ船が<br>清水港から世界へ出てゆく。', note: '世界へ開かれた静岡の現代へと、港の歴史がつながった。' },
    ],
  });
  api.setState({ got: [], solved: false, puzzle: null, introDone: true }); // 再挑戦できるように途中経過を戻す

  api.complete({
    heading: '出航',
    message: '蘭字を取り戻した茶は、開化の船に積まれて海を渡った。<br>世界へ開かれた清水港の歴史が修復された。',
    bg: IMG.bg,
  });

  // ===== 画面 =====

  // 集めたパーツの一覧（取得済みは絵柄、未取得は「?」）
  function partsStrip(size = 34) {
    const have = gotPieces();
    return `<div style="display:flex;gap:5px;flex-wrap:wrap">${PIECES.map((p) => have.includes(p.id)
      ? `<div title="${esc(p.name)}" style="width:${size}px;height:${size}px;border:1.5px solid #b3311c;border-radius:3px;overflow:hidden">${tileSVG(p.cell, 'style="display:block;width:100%;height:100%"')}</div>`
      : `<div style="width:${size}px;height:${size}px;border:1px dashed rgba(255,255,255,.25);border-radius:3px;display:grid;place-items:center" class="dim small">?</div>`).join('')}</div>`;
  }

  // ミッション確認（地図と4スポットのリスト。順不同で、タップした所を次の目的地にする）
  // 戻り値: スポットid | 'exit'
  function missionCheck() {
    return new Promise((resolve) => {
      const got = st().got ?? [];
      const rest = SPOTS.filter((s) => !got.includes(s.id));
      const nearest = () => {
        if (!geo.position) return rest[0];
        return [...rest].sort((a, b) => geo.distanceTo(a) - geo.distanceTo(b))[0];
      };
      let target = null; // 利用者が選んだスポット（未選択なら最寄り）

      const el = html(`
        <div class="screen">
          <div style="position:relative;height:38%;flex:none">
            <div data-map style="position:absolute;inset:0" class="map-dark"></div>
            <div class="topbar" style="position:absolute;left:0;right:0;top:0"><button class="icon-btn" data-back>${icons.back}</button><h1 style="text-shadow:0 1px 4px #000">清水港</h1><button class="icon-btn" data-help>${icons.help}</button></div>
          </div>
          <div class="scroll pad" style="background:var(--bg);border-radius:18px 18px 0 0;margin-top:-16px;position:relative;z-index:2">
            <div style="display:flex;justify-content:space-between;align-items:baseline"><h3 class="serif" style="margin:0;font-size:18px">訪れる場所</h3><span class="small sub">4か所 ・ 順不同</span></div>
            <div data-list></div>
            <div class="label" style="margin-top:12px">集めた蘭字のパーツ　<b class="gold">${gotPieces().length} / ${TOTAL}</b></div>
            <div style="margin-top:8px">${partsStrip()}</div>
            <button class="btn" data-go style="margin-top:14px"></button>
            <a class="btn ghost" data-route style="text-decoration:none;text-align:center" target="_blank" rel="noopener">道順を開く（Googleマップ）</a>
          </div>
        </div>`);
      root.appendChild(el);

      function renderList() {
        const next = target ?? nearest();
        el.querySelector('[data-list]').innerHTML = SPOTS.map((s, i) => {
          const done = got.includes(s.id);
          const d = geo.distanceTo(s);
          return `<div class="list-item" data-spot="${s.id}" style="cursor:${done ? 'default' : 'pointer'};${s.id === next.id ? 'background:rgba(224,180,76,.08);border-radius:10px' : ''}">
            <span class="num ${done ? 'done' : ''}">${done ? '✓' : i + 1}</span>
            <div class="grow"><div class="t">${esc(s.name)}</div>${s.id === next.id ? '<div class="s"><span class="gold">次はここ</span></div>' : ''}</div>
            <div class="r">${d == null ? '' : `<b>${formatDistance(d)}</b>徒歩${walkMinutes(d)}分`}</div></div>`;
        }).join('');
        el.querySelectorAll('[data-spot]').forEach((row) => {
          row.onclick = () => { if (!got.includes(row.dataset.spot)) { target = SPOTS.find((s) => s.id === row.dataset.spot); renderList(); } };
        });
        el.querySelector('[data-go]').textContent = `${next.id === 'marine' ? '岸壁' : next.name}から撮影を始める`;
        el.querySelector('[data-route]').href = `https://www.google.com/maps/dir/?api=1&destination=${next.lat},${next.lng}&travelmode=walking`;
      }

      let map = null;
      if (window.L) {
        const start = api.mission.spot;
        map = L.map(el.querySelector('[data-map]'), { zoomControl: false, attributionControl: false }).setView([start.lat, start.lng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        SPOTS.forEach((s, i) => L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: `<div style="display:flex;align-items:center;gap:6px"><div class="pin ${got.includes(s.id) ? 'done' : ''}"><span>${i + 1}</span></div><span class="pin-label">${esc(s.short)}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34] }) }).addTo(map));
        map.fitBounds([start, ...SPOTS].map((p) => [p.lat, p.lng]), { padding: [40, 40], animate: false });
      }
      let me = null;
      const off = geo.onChange((p) => {
        renderList();
        if (!map) return;
        if (me) me.setLatLng([p.lat, p.lng]);
        else me = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
      });
      renderList();

      const done = (v) => { off(); map?.remove(); el.remove(); resolve(v); };
      el.querySelector('[data-back]').onclick = () => done('exit');
      el.querySelector('[data-help]').onclick = () => ui.say(JIROCHO, '観覧車、清水港線跡地、俺の生家、それにマリンパークの岸壁。<br>どこから回っても構わねえ。<br>一覧の場所を触りゃ、そこを次の行き先にできるぜ。');
      el.querySelector('[data-go]').onclick = () => done((target ?? nearest()).id);
    });
  }

  // スキャン成功画面
  function scanResult(spot, blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const count = gotPieces().length;
      const got = piecesOf(spot.id);
      const el = html(`
        <div class="screen">
          <div style="position:relative;height:42%;flex:none;background:url(${url}) center/cover">
            <div class="topbar"><span style="width:44px"></span><h1 style="font-size:14px;font-weight:500">${esc(spot.name)}</h1><span style="width:44px"></span></div>
            <div class="center"><span class="pill" style="border-color:var(--gold)">${icons.check.replace('<svg', '<svg width="16" height="16" style="color:var(--gold)"')} <b>スキャン成功</b></span></div>
          </div>
          <div class="scroll pad">
            <div class="card" style="display:flex;align-items:center;gap:12px;animation:appear .5s">
              <div style="display:flex;gap:6px">${got.map((p) => `<div style="width:46px;height:46px;border:2px solid #b3311c;border-radius:3px;overflow:hidden;box-shadow:0 0 12px rgba(224,180,76,.5)">${tileSVG(p.cell, 'style="display:block;width:100%;height:100%"')}</div>`).join('')}</div>
              <div style="flex:1;min-width:0"><div class="small dim">獲得</div><h3 class="serif" style="margin:0;font-size:17px">${esc(piecesLabel(spot.id))}の断片</h3></div>
              <b class="gold small" style="text-align:right">断片<br>${count} / ${TOTAL}</b>
            </div>
            <div class="meter" style="margin:14px 0">${PIECES.map((_, k) => `<i class="${k < count ? 'on' : ''}"></i>`).join('')}</div>
            <div class="label">この場所について</div>
            <p style="line-height:1.9;font-size:14px">${INFO[spot.id].about}</p>
            <button class="btn" data-next>${count < TOTAL ? '次のスポットへ' : '蘭字の復元へ'}</button>
          </div>
        </div>`);
      root.appendChild(el);
      el.querySelector('[data-next]').onclick = () => { URL.revokeObjectURL(url); el.remove(); resolve(); };
    });
  }
}
