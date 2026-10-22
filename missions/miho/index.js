// 三保松原ミッション「天女と漁師の間を取り持ち、羽衣の舞を成立させよ！」
// 流れ: 起動 → ストーリー導入 → ミッション確認 → スキャン(エレーヌの碑・羽衣の松。位置＋画像判定) → 浜辺で伯梁が羽衣を返す → 羽衣の舞AR → クリア
import { MIHO_SCAN_SPOTS as SPOTS } from '../../data/spots.js';
import { distance, formatDistance, walkMinutes } from '../../js/geo.js';
import { hagoromoAR } from './hagoromo-ar.js';
import { preloadMihoCheck, checkMiho, scoresFor, THRESHOLD } from './scan-check.js';
import { logEnabled, logScan, logPosition, showTestLog } from './testlog.js';
import { watchHeading } from './heading.js';
import { requestCompass } from '../kunozan/compass.js';

const IMG = {
  bg: 'assets/img/miho/matsubara_fuji.jpg',
  tennyo: 'assets/img/miho/tennyo_cry.jpg', // 2026-10-21 FanLabの絵（泣く天女）に差し替え
  tennyoThanks: 'assets/img/miho/tennyo_thanks.jpg', // お礼の場面だけ感謝する天女（FanLabの絵 感謝天女.jpg 343×512 を正方形に切り出し）
  hakuryo: 'assets/img/miho/hakuryo.jpg',
};
const TENNYO = '天女';
// 物語の画面の天女の枠：小さい画面で枠が低くなっても、絵を拡大して枠いっぱいに表示（はみ出た上下は隠す。顔が切れないよう少し上寄せ。2026-10-21 FanLab指定）
const TENNYO_FRAME = '<style>.story .npc-frame:has(img[alt="天女"]){display:flex}.story .npc-frame img[alt="天女"]{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 20%}</style>';
const HAKURYO = '伯梁';
const SCANS = SPOTS.slice(0, 2); // エレーヌの碑・羽衣の松
const BEACH = SPOTS[2];
// 地図のラベルを左側に出す地点（碑と松は約27mしか離れておらず、右に並べると重なるため。浜辺は画面の右端で切れるため）
const LABEL_LEFT = ['helene', 'beach'];
const RESCUE_AFTER = 3; // 画像判定に続けてこの回数落ちたら「このまま進む」を出す
const NEAR_FIT = 2000;  // 現在地が地点からこの距離（m）以内なら、地図の最初の範囲に現在地も入れる

// ミッション確認画面の地図の現在地（Googleマップ風：青い点・誤差の円・向いている方角）。三保の画面だけで使う
const ME_STYLE = `
  .miho-me-wrap { position: relative; width: 90px; height: 90px; pointer-events: none; }
  .miho-cone { position: absolute; inset: 0; opacity: 0; transition: opacity .3s; }
  .miho-cone.on { opacity: 1; }
  .miho-me { position: absolute; left: 37px; top: 37px; width: 16px; height: 16px; border-radius: 50%; background: #4285f4; border: 3px solid #fff; box-sizing: content-box; margin: -3px 0 0 -3px; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
  .miho-me::after { content: ""; position: absolute; inset: -3px; border-radius: 50%; background: rgba(66,133,244,.35); animation: miho-pulse 2s ease-out infinite; z-index: -1; }
  @keyframes miho-pulse { from { transform: scale(1); opacity: .9; } to { transform: scale(3.2); opacity: 0; } }
  .miho-locate { position: absolute; right: 12px; bottom: 28px; z-index: 500; width: 44px; height: 44px; border-radius: 50%; border: none; background: #fff; color: #4285f4; box-shadow: 0 2px 6px rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; cursor: pointer; }
`;
// 向いている方角の扇（上＝北。回転して使う）
const CONE_SVG = '<svg viewBox="0 0 90 90" width="90" height="90"><defs><radialGradient id="miho-cone-g" cx="45" cy="45" r="42" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4285f4" stop-opacity=".7"/><stop offset="1" stop-color="#4285f4" stop-opacity="0"/></radialGradient></defs><path d="M45 45 L28 5 A42 42 0 0 1 62 5 Z" fill="url(#miho-cone-g)"/></svg>';
const LOCATE_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>';

// スキャンで得る「情け」
const NASAKE = {
  helene: {
    name: '人間の情け',
    kanji: '人',
    short: '見知らぬ異国の人を想う心',
    retry: '……碑が見つかりませぬ。<br>正面のレリーフと文字が<br>入るように撮ってくださいませ。',
    tips: '・碑の正面に立ち、レリーフ（銅板）と石の碑全体を枠に入れてください<br>・逆光や暗い場所では写りにくくなります',
    hint: '碑を枠に収めてSCAN',
    about: '羽衣伝説に魅せられたフランスの舞踊家エレーヌ・ジュグラリスは、能「羽衣」を演じ続けたが、三保の地を踏むことなく若くして世を去った。その想いを知った地元の人々が、碑を建てて悼んだ。会ったこともない異国の人を想う心が、ここに残されている。',
  },
  hagoromo: {
    name: '自然を尊ぶ情け',
    kanji: '松',
    short: '枯れる松に代を継がせる心',
    retry: '……羽衣の松が見つかりませぬ。<br>幹を見上げて、枝ぶりが<br>入るように撮ってくださいませ。',
    tips: '・柵の外から、太い幹と広がる枝を枠に入れてください<br>・枝や地面だけ、空だけにならないようにしてください',
    hint: '幹を見上げて枠に収めてSCAN',
    about: '天女が羽衣を掛けたと伝わる「羽衣の松」。いまの松は三代目で、先代が弱ったとき、人々は新たな松に役目を継がせた。松くい虫や潮風から松原を守る手入れは、いまも地元の人々の手で続けられている。',
  },
};

export async function start(root, api) {
  const { ui, geo } = api;
  const { html, esc, icons } = ui;
  const st = () => api.getState();
  const LOG = logEnabled(api); // 開発モード（デモ版を除く）は現地テスト用に記録を残す

  // ---------- 1. 起動画面 ----------
  const go = await ui.launch(root, {
    bg: IMG.bg,
    area: '三保松原',
    title: '天女と漁師の間を取り持ち、<br>羽衣の舞を成立させよ！',
    distortion: '伯梁が羽衣を返さず、天女が天に帰れない。富士山との境界である松原が崩れかけている。',
    spot: api.mission.spot,
    meta: '所要 約30分 ・ 情け 2つ ・ 松原・AR',
  });
  if (!go) return api.exit();

  // ---------- 2. ストーリー導入（初回のみ。途中再開時は省略） ----------
  if (!st().introDone) {
    await ui.story(root, {
      place: '三保松原・みほしるべ',
      pages: [
        { bg: IMG.bg, text: '松と海の向こうに、富士。<br>天女が羽衣を掛けたと伝わる松原。', note: 'みほしるべで、羽衣伝説の展示を見終えたところだった。' },
        { bg: IMG.bg, tint: 'linear-gradient(rgba(40,50,70,.15),rgba(20,25,40,.55))', html: '<span class="pill small" style="background:#7a1f0c;margin-bottom:12px">● 松原が崩れはじめている</span>', text: '波の音が止まり、松がざわめいた。<br>浜辺に、うずくまる人影がある。', note: '天に帰れぬまま、羽衣を待ち続けている者がいる。' },
        { bg: IMG.bg, npc: { name: TENNYO, img: IMG.tennyo, caption: 'AR：天女があらわれた' }, html: TENNYO_FRAME, line: { who: TENNYO, text: 'その羽衣がなければ、<br>わたくしは天へ帰れませぬ――' }, note: '羽衣を持ち去ったのは、浜の漁師・伯梁。家の宝にすると言って、返そうとしない。' },
        { bg: IMG.bg, npc: { name: TENNYO, img: IMG.tennyo, caption: 'AR：天女' }, html: TENNYO_FRAME, line: { who: TENNYO, text: 'この松原に宿る「情け」を<br>集めてきてはくださいませぬか。<br>あの方の心も、きっと動きましょう。' } },
      ],
    });
    api.setState({ introDone: true });
  }

  // ---------- 3〜4. ミッション確認とスキャン（位置＋画像判定） ----------
  if (!SCANS.every((s) => (st().got ?? []).includes(s.id))) preloadMihoCheck(); // 画像判定の部品を先に読み込んでおく（待たない）
  scanLoop: while (true) {
    const got = st().got ?? [];
    const allGot = SCANS.every((s) => got.includes(s.id));
    const action = await missionCheck(allGot ? BEACH.id : SCANS.find((s) => !got.includes(s.id)).id);
    if (action === 'exit') return api.exit();
    if (action === BEACH.id) break;

    const spot = SPOTS.find((s) => s.id === action);
    let fails = 0;
    while (true) {
      const blob = await ui.scan(root, {
        targets: SCANS.map((s) => ({ id: s.id, name: s.name, sub: NASAKE[s.id].name, done: got.includes(s.id) })),
        currentId: spot.id,
        spot,
        hint: NASAKE[spot.id].hint,
        meter: { label: '集めた情け', done: got.length, total: 2 },
        footer: '対象に近づき、カメラを向けてSCANを押してください',
      });
      if (!blob) continue scanLoop; // 戻る → ミッション確認へ
      const res = await judging(spot, () => checkMiho(spot.id, blob));
      if (LOG) await logScan(geo, spot, blob, res.ok === null ? null : await scoresFor(blob));
      if (api.devMode && res.score != null) {
        // 開発モード・デモ版：似ている度合いを見せるだけで止めない
        ui.toast(`画像判定 ${res.score.toFixed(2)}（基準 ${THRESHOLD[spot.id].toFixed(2)}）${res.ok ? '合格' : '不合格'}`, 4000);
      }
      if (res.ok === false && !api.devMode) {
        fails++;
        const next = await retryScreen(spot, blob, fails);
        if (next === 'retry') continue;
        if (next === 'back') continue scanLoop;
        // 'skip'：救済で先へ進む
      }
      // res.ok === null（この端末では画像判定が使えない）は位置情報だけで合格
      api.savePhoto(blob, 'scan', spot.name);
      const newGot = [...new Set([...got, spot.id])];
      api.setState({ got: newGot });
      await scanResult(spot, blob, newGot.length);
      break;
    }
  }

  // ---------- 5. 浜辺：伯梁の心が動き、羽衣を返す ----------
  if (!st().returned) {
    const ok = await persuade();
    if (!ok) return api.exit();
    api.setState({ returned: true });
    await ui.story(root, {
      place: '三保松原・浜辺',
      pages: [
        { bg: IMG.bg, npc: { name: HAKURYO, img: IMG.hakuryo, caption: '羽衣を差し出す伯梁' }, text: '伯梁は懐から羽衣を取り出し、<br>震える手で天女へ差し出した。' },
        { bg: IMG.bg, npc: { name: TENNYO, img: IMG.tennyoThanks, caption: 'AR：天女' }, html: TENNYO_FRAME, line: { who: TENNYO, text: 'ありがとう存じます。<br>お礼に、天上の舞をお見せしましょう。' }, note: 'スマホを掲げて富士山の方角を探し、羽衣の舞を見届けよう。' },
      ],
    });
  }

  // ---------- 6. 羽衣の舞AR ----------
  const photo = await hagoromoAR(root, api);
  if (photo) api.savePhoto(photo, 'ar', '三保松原・羽衣の舞');
  api.setState({ got: [], returned: false, introDone: true }); // 再挑戦できるように途中経過を戻す

  api.complete({
    heading: '調和 修復',
    message: '人と自然、二つの情けを知った伯梁が羽衣を返した。<br>下界と天界を結ぶ松原の調和が戻った。',
    bg: IMG.bg,
  });

  // ===== 画面 =====

  // ミッション確認（地図と3地点のリスト）。戻り値: 'helene' | 'hagoromo' | 'beach' | 'exit'
  function missionCheck(nextId) {
    return new Promise((resolve) => {
      const got = st().got ?? [];
      const el = html(`
        <div class="screen">
          <style>${ME_STYLE}</style>
          <div style="position:relative;height:42%;flex:none">
            <div data-map style="position:absolute;inset:0" class="map-dark"></div>
            <button class="miho-locate" data-locate aria-label="現在地へ移動">${LOCATE_ICON}</button>
            <div class="topbar" style="position:absolute;left:0;right:0;top:0"><button class="icon-btn" data-back>${icons.back}</button><h1 style="text-shadow:0 1px 4px #000">三保松原</h1><button class="icon-btn" data-help>${icons.help}</button></div>
          </div>
          <div class="scroll pad" style="background:var(--bg);border-radius:18px 18px 0 0;margin-top:-16px;position:relative;z-index:2">
            <div style="display:flex;justify-content:space-between;align-items:baseline"><h3 class="serif" style="margin:0;font-size:18px">訪れる場所</h3><span class="small sub">3か所 ・ 順路どおり</span></div>
            <div data-list></div>
            <button class="btn" data-go style="margin-top:12px"></button>
            <a class="btn ghost" data-route style="text-decoration:none;text-align:center" target="_blank" rel="noopener">道順を開く（Googleマップ）</a>
            ${LOG ? '<div class="small dim" style="margin-top:14px">開発モード：現地テスト</div><div style="display:flex;gap:8px;margin-top:6px"><button class="btn ghost" data-logpos style="margin:0;flex:1">ここで位置を記録</button><button class="btn ghost" data-log style="margin:0;flex:1">テスト記録</button></div>' : ''}
          </div>
        </div>`);
      root.appendChild(el);
      const desc = { helene: '人間の情けを集める', hagoromo: '自然を尊ぶ情けを集める', beach: '情けを示し、羽衣を返す' };
      const next = SPOTS.find((s) => s.id === nextId);

      function renderList() {
        el.querySelector('[data-list]').innerHTML = SPOTS.map((s, i) => {
          const done = got.includes(s.id);
          const d = geo.distanceTo(s);
          return `<div class="list-item">
            <span class="num ${done ? 'done' : ''}">${done ? '✓' : i + 1}</span>
            <div class="grow"><div class="t">${esc(s.name)}</div><div class="s">${desc[s.id]}${s.id === nextId ? ' ・ <span class="gold">次はここ</span>' : ''}</div></div>
            <div class="r">${d == null ? '' : `<b>${formatDistance(d)}</b>徒歩${walkMinutes(d)}分`}</div></div>`;
        }).join('');
        const near = geo.isNear(next);
        el.querySelector('[data-go]').textContent = nextId === BEACH.id
          ? (near ? '浜辺で伯梁と向き合う' : '浜辺へ向かう')
          : `${next.name}をスキャンする`;
      }
      el.querySelector('[data-route]').href = `https://www.google.com/maps/dir/?api=1&destination=${next.lat},${next.lng}&travelmode=walking`;

      let map = null;
      if (window.L) {
        map = L.map(el.querySelector('[data-map]'), { zoomControl: false, attributionControl: false, zoomSnap: 0.25 }).setView([BEACH.lat, BEACH.lng], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        const pts = [api.mission.spot, ...SPOTS];
        L.polyline(pts.map((p) => [p.lat, p.lng]), { color: '#e0b44c', weight: 2, dashArray: '6 6' }).addTo(map);
        SPOTS.forEach((s, i) => L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: `<div style="position:relative"><div class="pin ${got.includes(s.id) ? 'done' : ''}"><span>${i + 1}</span></div><span class="pin-label" style="position:absolute;top:6px;white-space:nowrap;${LABEL_LEFT.includes(s.id) ? 'right' : 'left'}:calc(100% + 6px)">${esc(s.id === BEACH.id ? '浜辺' : s.name)}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34] }), zIndexOffset: (SPOTS.length - i) * 100 }).addTo(map)); // 番号の小さい地点を上に重ねる
        // 現在地が近く（2km以内）にあれば、最初の範囲に現在地も入れる
        const p0 = geo.position;
        const nearMe = p0 && Math.min(...pts.map((s) => distance(p0, s))) <= NEAR_FIT;
        const bounds = (nearMe ? [...pts, p0] : pts).map((p) => [p.lat, p.lng]);
        map.fitBounds(bounds, { paddingTopLeft: [96, 50], paddingBottomRight: [60, 40], animate: false });
      }
      // 現在地：青い点＋向いている方角（1つのマーカー）と、GPSの誤差の円
      let me = null, acc = null, heading = null;
      const meIcon = window.L && L.divIcon({ className: '', html: `<div class="miho-me-wrap"><div class="miho-cone" data-cone>${CONE_SVG}</div><div class="miho-me"></div></div>`, iconSize: [90, 90], iconAnchor: [45, 45] });
      const showHeading = () => {
        const cone = me?.getElement()?.querySelector('[data-cone]');
        if (!cone || heading == null) return;
        cone.style.transform = `rotate(${heading}deg)`;
        cone.classList.add('on');
      };
      const off = geo.onChange((p) => {
        renderList();
        if (!map) return;
        const ll = [p.lat, p.lng];
        if (acc) acc.setLatLng(ll).setRadius(p.accuracy ?? 0);
        else acc = L.circle(ll, { radius: p.accuracy ?? 0, color: '#4285f4', weight: 1, opacity: 0.5, fillColor: '#4285f4', fillOpacity: 0.15, interactive: false }).addTo(map);
        if (me) me.setLatLng(ll);
        else { me = L.marker(ll, { icon: meIcon, interactive: false, zIndexOffset: 1000 }).addTo(map); showHeading(); }
      });
      // 向いている方角（コンパスが使えない端末では扇を出さない）。ゆれを抑えて回す
      const stopHeading = watchHeading((h) => {
        heading = heading == null ? h : (heading + (((h - heading + 540) % 360) - 180) * 0.4 + 360) % 360;
        showHeading();
      });
      // 現在地ボタン：地図を現在地へ。iPhone はここで方角の許可を求める
      el.querySelector('[data-locate]').onclick = () => {
        requestCompass();
        const p = geo.position;
        if (!p) return ui.toast('現在地を取得中です');
        map?.setView([p.lat, p.lng], Math.max(map.getZoom(), 17), { animate: true });
      };
      renderList();

      const done = (v) => { off(); stopHeading(); map?.remove(); el.remove(); resolve(v); };
      el.querySelector('[data-back]').onclick = () => done('exit');
      el.querySelector('[data-help]').onclick = () => ui.say(TENNYO, 'エレーヌの碑と羽衣の松で、この地の「情け」に触れてくださいませ。<br>二つそろったら、浜辺へ。');
      if (LOG) {
        el.querySelector('[data-logpos]').onclick = () => {
          logPosition(geo, 'ミッション確認画面');
          const p = geo.position;
          ui.toast(p ? `位置を記録しました（GPS誤差 約${Math.round(p.accuracy ?? 0)}m）` : '現在地が取れていないため、位置なしで記録しました');
        };
        el.querySelector('[data-log]').onclick = () => showTestLog(root, api);
      }
      el.querySelector('[data-go]').onclick = () => {
        if (nextId === BEACH.id && !geo.isNear(next)) {
          return ui.toast(`浜辺に近づいてください（あと約${formatDistance(Math.max(0, geo.distanceTo(next) - next.radius))}）`);
        }
        done(nextId);
      };
    });
  }

  // 画像判定中の表示（判定が速くても一瞬で消えないよう、最低0.6秒は出す）
  async function judging(spot, fn) {
    const el = html(`
      <div class="screen" style="display:grid;place-items:center;background:rgba(10,8,6,.92);z-index:20">
        <div class="center">
          <div class="serif" style="font-size:20px;animation:blink 1.2s infinite">${esc(spot.name)}を確かめています…</div>
          <div class="small dim" style="margin-top:10px">天女が、写真の中に宿る「情け」を探しています</div>
        </div>
      </div>`);
    root.appendChild(el);
    const [res] = await Promise.all([fn(), new Promise((r) => setTimeout(r, 600))]);
    el.remove();
    return res;
  }

  // 画像判定で不合格：撮り直し／（3回目から）このまま進む。戻り値: 'retry' | 'skip' | 'back'
  function retryScreen(spot, blob, count) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const n = NASAKE[spot.id];
      const rescue = count >= RESCUE_AFTER;
      const el = html(`
        <div class="screen">
          <div style="position:relative;height:42%;flex:none;background:url(${url}) center/cover">
            <div class="topbar"><button class="icon-btn" data-back>${icons.back}</button><h1 style="font-size:14px;font-weight:500">${esc(spot.name)}</h1><span style="width:44px"></span></div>
            <div class="center"><span class="pill" style="background:#7a1f0c">● 情けが見つからない</span></div>
          </div>
          <div class="scroll pad">
            <div class="speech" style="margin-top:6px"><span class="who">${TENNYO}</span>
              <div class="story-text" style="font-size:16px">${n.retry}</div>
            </div>
            <div class="small dim" style="margin:12px 0;line-height:1.8">${n.tips}</div>
            <button class="btn" data-retry>撮り直す</button>
            ${rescue ? '<button class="btn ghost" data-skip style="margin-top:10px">このまま進む</button><div class="center small dim" style="margin-top:6px">うまく撮れないときは、このまま先へ進めます</div>' : ''}
          </div>
        </div>`);
      root.appendChild(el);
      const done = (v) => { URL.revokeObjectURL(url); el.remove(); resolve(v); };
      el.querySelector('[data-retry]').onclick = () => done('retry');
      el.querySelector('[data-back]').onclick = () => done('back');
      if (rescue) el.querySelector('[data-skip]').onclick = () => done('skip');
    });
  }

  // スキャン成功画面
  function scanResult(spot, blob, count) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const n = NASAKE[spot.id];
      const el = html(`
        <div class="screen">
          <div style="position:relative;height:46%;flex:none;background:url(${url}) center/cover">
            <div class="topbar"><span style="width:44px"></span><h1 style="font-size:14px;font-weight:500">${esc(spot.name)}</h1><span style="width:44px"></span></div>
            <div class="center"><span class="pill" style="border-color:var(--gold)">${icons.check.replace('<svg', '<svg width="16" height="16" style="color:var(--gold)"')} <b>スキャン成功</b></span></div>
          </div>
          <div class="scroll pad">
            <div class="card" style="display:flex;align-items:center;gap:14px;animation:appear .5s">
              ${ui.hexIcon(n.kanji, true, 44)}
              <div style="flex:1"><div class="small dim">獲得</div><h3 style="margin:0;font-size:20px">${n.name}</h3><div class="small sub">${n.short}</div></div>
              <b class="gold small">情け<br>${count} / 2</b>
            </div>
            <div class="meter" style="margin:14px 0">${[0, 1].map((k) => `<i class="${k < count ? 'on' : ''}"></i>`).join('')}</div>
            <div class="label">この場所について</div>
            <p style="line-height:1.9;font-size:14px">${n.about}</p>
            <button class="btn" data-next>${count < 2 ? '次のスポットへ' : '浜辺へ向かう'}</button>
          </div>
        </div>`);
      root.appendChild(el);
      el.querySelector('[data-next]').onclick = () => { URL.revokeObjectURL(url); el.remove(); resolve(); };
    });
  }

  // 浜辺：二つの情けを示し、伯梁の心が動く → 「羽衣を返す」
  function persuade() {
    return new Promise((resolve) => {
      const cards = SCANS.map((s) => `
        <div class="card" style="flex:1;padding:10px;display:flex;align-items:center;gap:8px;min-width:0">
          ${ui.hexIcon(NASAKE[s.id].kanji, true, 30)}
          <div style="min-width:0"><b class="mp-name">${NASAKE[s.id].name}</b><div class="small dim mp-sub">${esc(s.name)}</div></div>
        </div>`).join('');
      // 伯梁の画像は、情けカードと会話欄のあいだの空いた高さに合わせて大きさを変える（下の fit）
      const el = html(`
        <div class="story mp" style="background-image:url(${IMG.bg})">
          <style>
            .mp .mp-name { font-size: 13px; white-space: nowrap; }
            .mp .mp-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .mp .topbar .pill { white-space: nowrap; }
            .mp [data-pic] { flex: 1 1 0; min-height: 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 16px 0; }
            .mp [data-frame] { margin: 0; width: 78%; }
            .mp [data-frame] img { display: block; width: 100%; height: 100%; object-fit: cover; }
            .mp .story-body { margin-top: 0; }
            @media (max-width: 345px) {
              .mp .topbar { gap: 6px; }
              .mp .topbar .pill { padding-left: 9px; padding-right: 9px; }
              .mp .mp-name { font-size: 11.5px; }
              .mp .card { padding: 8px !important; gap: 6px !important; }
            }
            @media (max-height: 600px) {
              .mp .story-body { padding-top: 10px; }
              .mp .story-body .speech .story-text { font-size: 15px !important; line-height: 1.75; }
              .mp .story-body [data-go] { margin-top: 10px !important; }
            }
          </style>
          <div class="story-tint" style="background:linear-gradient(rgba(10,8,6,.35),rgba(10,8,6,.85) 55%)"></div>
          <div class="topbar"><button class="icon-btn" data-back>${icons.back}</button><span class="pill small">${icons.pin.replace('<svg', '<svg width="14" height="14"')} 三保松原・浜辺</span><span style="flex:1"></span><span class="pill small gold">✓ 情け 2 / 2</span></div>
          <div style="display:flex;gap:8px;padding:0 16px;position:relative;z-index:2">${cards}</div>
          <div data-pic>
            <div class="npc-frame" data-frame><img src="${IMG.hakuryo}" alt="${HAKURYO}"></div>
            <div class="center" data-cap style="margin-top:8px;flex:none"><span class="pill small">二つの情けを示された伯梁</span></div>
          </div>
          <div class="story-body">
            <div class="speech" data-line><span class="who">${HAKURYO}</span><div class="story-text" style="font-size:16px">見ず知らずの異国の人を悼み、<br>枯れる松に代を継がせる――<br>この土地の者は、そこまでするのか。</div></div>
            <div class="story-note" data-note style="margin-top:10px"></div>
            <button class="btn" data-go style="margin-top:14px">続きを聞く</button>
          </div>
        </div>`);
      const pic = el.querySelector('[data-pic]'), frame = el.querySelector('[data-frame]'), img = frame.querySelector('img');
      // 画像の縦横比を保ったまま、幅（画面の92%・最大420px）と空いた高さの両方に収まるいちばん大きいサイズにする
      const fit = () => {
        const ratio = (img.naturalWidth || 296) / (img.naturalHeight || 234);
        const cap = el.querySelector('[data-cap]').offsetHeight + 8;
        const availW = Math.min(pic.clientWidth * 0.92, 420);
        const availH = Math.max(80, pic.clientHeight - 12 - cap - 4);
        const w = Math.min(availW, availH * ratio);
        frame.style.width = `${Math.round(w)}px`;
        frame.style.height = `${Math.round(w / ratio)}px`;
      };
      const ro = new ResizeObserver(fit);
      ro.observe(pic);
      img.addEventListener('load', fit);
      const close = (v) => { ro.disconnect(); el.remove(); resolve(v); };
      root.appendChild(el);
      let step = 0;
      const btn = el.querySelector('[data-go]');
      btn.onclick = () => {
        if (step === 0) {
          step = 1;
          el.querySelector('[data-line] .story-text').innerHTML = '……わしは、人にも木にも<br>情けを欠いておった。';
          el.querySelector('[data-note]').textContent = '伯梁は懐の羽衣に、そっと手を当てた。';
          btn.textContent = '羽衣を返す';
          return;
        }
        if (!geo.isNear(BEACH)) return ui.toast('浜辺で羽衣を返してください');
        navigator.vibrate?.([60, 40, 100]);
        close(true);
      };
      el.querySelector('[data-back]').onclick = () => close(false);
    });
  }
}
