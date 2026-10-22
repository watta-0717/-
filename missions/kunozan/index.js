// 久能山東照宮ミッション「次の埋葬先を指し、富士を越える「不死の道」を開け！」
// 流れ: 起動(楼門) → ストーリー導入(渡丸) → ミッション確認 → 神廟スキャン → 羅針盤クイズ
//       → 岡崎城・江戸城はバッドエンド(時を巻き戻す) / 日光東照宮はグッドエンド → クリア
import { KUNOZAN_SCAN_SPOTS as SPOTS } from '../../data/spots.js';
import { formatDistance, walkMinutes } from '../../js/geo.js';
import { compassQuiz, requestCompass } from './compass.js';
import { scanShinbyo } from './shinbyo-scan.js';
// 2026-10-18 神廟スキャンは「宝塔の形の枠＋位置情報」に変更。画像判定（shinbyo-check.js・lib/・model/）は久能山では使わないが、
// 三保の画像判定が lib/・model/ を読み込むため、ファイルは残している

const IMG = {
  romon: 'assets/img/kunozan/romon.jpg',
  shinbyo: 'assets/img/kunozan/shinbyo.jpg',
  watamaru: 'assets/img/kunozan/watamaru.jpg',
  edo: 'assets/img/kunozan/edo.jpg',
  okazaki: 'assets/img/kunozan/okazaki.jpg', // FanLab提供の岡崎城の画像を、江戸城と同じ暗い色調にしたもの（2026-10-22）
};
const WATAMARU = '渡丸';
const ROMON = SPOTS.find((s) => s.id === 'romon');
const SHINBYO = SPOTS.find((s) => s.id === 'shinbyo');

// バッドエンド（提案書 24枚目）
export const BAD_END = {
  okazaki: {
    name: '岡崎城に還った歴史',
    tag: '歴史が閉じた',
    img: IMG.okazaki,
    text: '遺体は生まれた城へ還った。一人の武将の生涯としては美しく閉じる。だが天下は「たまたま続いた平穏」となり、二百六十年の記憶は誰にも語り継がれない。',
    line: '殿の一生は、<br>ここで終わってしまうのか。',
  },
  edo: {
    name: '江戸城に留まった歴史',
    tag: '歴史が途絶えた',
    img: IMG.edo,
    text: '遺体は江戸城に留まった。だが城はやがて焼け、主を替え、東照大権現を祀る社は残らない。行き場を失った神霊は薄れ、北の空に星は生まれなかった。',
    line: '……殿は、ただの人として<br>消えてしまわれた。',
  },
};

export async function start(root, api) {
  const { ui, geo } = api;
  const { html, esc, icons } = ui;
  const st = () => api.getState();

  // 渡丸の枠は久能山だけ幅65%にする（共通の .npc-frame は82%のまま。2026-10-18）
  root.classList.add('kunozan');
  if (!document.getElementById('kunozan-style')) {
    document.head.insertAdjacentHTML('beforeend', '<style id="kunozan-style">.kunozan .npc-frame { width: 65%; }</style>');
  }

  // ---------- 1. 起動画面（楼門付近で開始） ----------
  const go = await ui.launch(root, {
    bg: IMG.romon,
    area: '久能山東照宮',
    title: '次の埋葬先を指し、<br>富士を越える「不死の道」を開け！',
    distortion: '遺言の行方が失われ、家康公の願いが途絶えかけている。このままでは二百六十年の記憶が消えてしまう。渡丸が覚えている遺言だけが手がかりとなる。',
    spot: ROMON,
    meta: '所要 約20分 ・ 方角 3択 ・ 神廟・AR',
  });
  if (!go) return api.exit();

  // ---------- 2. ストーリー導入（初回のみ） ----------
  if (!st().introDone) {
    await ui.story(root, {
      place: '久能山東照宮・楼門',
      pages: [
        { bg: IMG.romon, html: '<span class="pill small" style="background:#7a1f0c;margin-bottom:12px">● 時空の歪みを検知</span>', text: 'ふいに、空気が軋んだ。<br>石段の上に、見慣れぬ若武者が立っている。', note: '鎧は古い。四百年前の装いのまま、彼は神廟を見上げていた。' },
        { bg: IMG.romon, npc: { name: WATAMARU, img: IMG.watamaru, caption: 'AR：四百年前から来た若武者' }, line: { who: WATAMARU, text: '殿の亡骸は、確かにこの山に納めた。<br>……その後、殿はどこへ行かれたのか。' }, note: '遺言を枕元で聞いた近習・渡丸。主君の行方を知らぬまま、時空の歪みに巻き込まれていた。' },
        { bg: IMG.shinbyo, text: '四百年前、家康公の亡骸は<br>この山に納められた。', note: '石段を登りきった先、神廟は西を向いて静かに建っている。' },
        { bg: IMG.romon, npc: { name: WATAMARU, img: IMG.watamaru, caption: 'AR：渡丸' }, line: { who: WATAMARU, text: '神廟で、わしの羅針盤を呼び覚ましてくれ。<br>殿が次に向かわれた地を、<br>指し示してくれるはずじゃ。' } },
      ],
    });
    api.setState({ introDone: true });
  }

  // ---------- 3〜5. ミッション確認 → 神廟スキャン（宝塔の形の枠＋位置情報） → スキャン成功 ----------
  while (!st().scanned) {
    const action = await missionCheck();
    if (action === 'exit') return api.exit();
    const blob = await scanShinbyo(root, api, {
      spot: SHINBYO,
      name: SHINBYO.name,
      sub: '渡丸の羅針盤',
      hint: '神廟（宝塔）を枠に合わせてSCAN',
      meter: { label: '遺言の手がかり', done: 0, total: 1 },
      footer: '石段の下から、宝塔が枠に重なるように見上げてください',
    });
    if (!blob) continue; // 戻る → ミッション確認へ
    api.savePhoto(blob, 'scan', SHINBYO.name);
    api.setState({ scanned: true });
    await scanResult(blob);
  }

  // ---------- 6〜7. 羅針盤クイズ（不正解はバッドエンド→時を巻き戻す） ----------
  while (true) {
    const choice = await compassQuiz(root, api);
    if (!choice) return api.exit();
    if (choice === 'nikko') break;
    // 見たバッドエンドは「もしもの歴史」としてコレクションに残す
    api.setState({ badEnds: [...new Set([...(st().badEnds ?? []), choice])] });
    const again = await badEnd(BAD_END[choice]);
    if (!again) return api.exit();
  }

  // ---------- 8. グッドエンド ----------
  await ui.story(root, {
    place: '久能山東照宮・神廟',
    pages: [
      { bg: IMG.romon, tint: 'linear-gradient(rgba(20,30,60,.35),rgba(10,10,20,.75))', html: '<span class="pill small" style="border-color:var(--gold);margin-bottom:12px">✓ 不死の道が開いた</span>', text: '針は富士を越え、<br>北北東・日光を指した。', note: '神廟から富士山、そして日光。三つの地は、一本の線の上に並んでいる。' },
      { bg: IMG.romon, npc: { name: WATAMARU, img: IMG.watamaru, caption: 'AR：渡丸' }, line: { who: WATAMARU, text: '「一周忌の後、日光山に<br>小さき堂を建て勧請せよ」<br>……殿は、富士（不死）を越えて<br>神になられるおつもりだったのか。' } },
      { bg: IMG.romon, npc: { name: WATAMARU, img: IMG.watamaru, caption: 'AR：渡丸' }, line: { who: WATAMARU, text: '東照大権現として、江戸の真北・日光から<br>北極星のごとく泰平の世を見守る――<br>それが殿の遺言の真意じゃ。' }, note: '渡丸は深く一礼し、光の中へ還っていった。' },
    ],
  });
  api.setState({ scanned: false, introDone: true }); // 再挑戦できるように途中経過を戻す

  api.complete({
    heading: '富士を超えて江戸へ',
    message: '江戸城の真北で北極星として君臨し、<br>泰平の世を見守る家康公の願いが叶えられた。',
    bg: IMG.romon,
  });

  // ===== 画面 =====

  // ミッション確認（地図と神廟）。戻り値: 'scan' | 'exit'
  function missionCheck() {
    return new Promise((resolve) => {
      const el = html(`
        <div class="screen">
          <div style="position:relative;height:42%;flex:none">
            <div data-map style="position:absolute;inset:0" class="map-dark"></div>
            <div class="topbar" style="position:absolute;left:0;right:0;top:0"><button class="icon-btn" data-back>${icons.back}</button><h1 style="text-shadow:0 1px 4px #000">久能山東照宮</h1><button class="icon-btn" data-help>${icons.help}</button></div>
          </div>
          <div class="scroll pad" style="background:var(--bg);border-radius:18px 18px 0 0;margin-top:-16px;position:relative;z-index:2">
            <div style="display:flex;justify-content:space-between;align-items:baseline"><h3 class="serif" style="margin:0;font-size:18px">訪れる場所</h3><span class="small sub">1か所</span></div>
            <div data-list></div>
            <div class="card small" style="margin-top:10px;line-height:1.8">
              <div>ⓘ 神廟は家康公の亡骸が納められたと伝わる場所。<b class="gold">西を向いて建つ</b>といわれています。</div>
              <div class="dim" style="margin-top:6px">拝観料が必要な区域です。受付時間を過ぎている場合は挑戦できません。</div>
            </div>
            <button class="btn" data-go style="margin-top:12px">神廟をスキャンする</button>
            <a class="btn ghost" style="text-decoration:none;text-align:center" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${SHINBYO.lat},${SHINBYO.lng}&travelmode=walking">道順を開く（Googleマップ）</a>
          </div>
        </div>`);
      root.appendChild(el);

      function renderList() {
        const d = geo.distanceTo(SHINBYO);
        el.querySelector('[data-list]').innerHTML = `<div class="list-item">
          <span class="num">1</span>
          <div class="grow"><div class="t">${esc(SHINBYO.name)}</div></div>
          <div class="r">${d == null ? '' : `<b>${formatDistance(d)}</b>徒歩${walkMinutes(d)}分`}</div></div>`;
      }

      let map = null;
      if (window.L) {
        map = L.map(el.querySelector('[data-map]'), { zoomControl: false, attributionControl: false }).setView([SHINBYO.lat, SHINBYO.lng], 18);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        L.polyline(SPOTS.map((p) => [p.lat, p.lng]), { color: '#e0b44c', weight: 2, dashArray: '6 6' }).addTo(map);
        SPOTS.forEach((s, i) => L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: `<div style="display:flex;align-items:center;gap:6px"><div class="pin"><span>${i === 0 ? '門' : 1}</span></div><span class="pin-label">${esc(s.name)}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34] }) }).addTo(map));
        map.fitBounds(SPOTS.map((p) => [p.lat, p.lng]), { paddingTopLeft: [50, 80], paddingBottomRight: [80, 50], animate: false });
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
      el.querySelector('[data-help]').onclick = () => ui.say(WATAMARU, '御社殿の脇を抜け、石段を登った先が神廟じゃ。<br>殿の眠る地で、羅針盤を呼び覚ましてくれ。');
      el.querySelector('[data-go]').onclick = () => done('scan');
    });
  }

  // スキャン成功：渡丸の羅針盤を獲得
  function scanResult(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const el = html(`
        <div class="screen">
          <div style="position:relative;height:46%;flex:none;background:url(${url}) center/cover">
            <div class="topbar"><span style="width:44px"></span><h1 style="font-size:14px;font-weight:500">${esc(SHINBYO.name)}</h1><span style="width:44px"></span></div>
            <div class="center"><span class="pill" style="border-color:var(--gold)">${icons.check.replace('<svg', '<svg width="16" height="16" style="color:var(--gold)"')} <b>スキャン成功</b></span></div>
          </div>
          <div class="scroll pad">
            <div class="card" style="display:flex;align-items:center;gap:14px;animation:appear .5s">
              ${ui.hexIcon('針', true, 44)}
              <div style="flex:1"><div class="small dim">獲得</div><h3 style="margin:0;font-size:20px">渡丸の羅針盤</h3></div>
              <b class="gold small">起動</b>
            </div>
            <div class="meter" style="margin:14px 0"><i class="on"></i></div>
            <div class="label">この場所について</div>
            <p style="line-height:1.9;font-size:14px">家康公の亡骸が納められたと伝わる廟。当初は木造で、のちに石造に改められたという。西を向いて建つといわれ、その先には生まれ故郷の岡崎がある。</p>
            <button class="btn" data-next>羅針盤を構える</button>
          </div>
        </div>`);
      root.appendChild(el);
      el.querySelector('[data-next]').onclick = () => {
        requestCompass(); // iPhoneはボタン操作の中でコンパスの許可を求める必要がある
        URL.revokeObjectURL(url); el.remove(); resolve();
      };
    });
  }

  // バッドエンド。戻り値: true（時を巻き戻す）/ false（ホームへ）
  function badEnd(b) {
    return new Promise((resolve) => {
      const bg = b.img ? `background:url(${b.img}) center 20%/cover no-repeat,#0e0d14` : `background:${b.bg}`;
      const el = html(`
        <div class="story" style="${bg}">
          <div class="story-tint" style="background:linear-gradient(rgba(10,8,14,.35),rgba(10,8,14,.92) 45%)"></div>
          ${b.mark ? `<div class="serif" style="position:absolute;left:0;right:0;top:16%;text-align:center;font-size:64px;color:rgba(243,236,224,.13);letter-spacing:.2em">${esc(b.mark)}</div>` : ''}
          <div class="center" style="position:relative;z-index:2;margin-top:calc(60px + var(--safe-t, 0px))"><span class="pill small" style="background:#7a1f0c">● ${esc(b.tag)}</span></div>
          <div class="story-body" style="text-align:center">
            <div class="label" style="color:#c75b3f;letter-spacing:.2em">BAD END</div>
            <h2 class="serif" style="font-size:26px;margin:8px 0 14px">星は、生まれなかった</h2>
            <div class="story-note" style="color:var(--text);text-align:left">${b.text}</div>
            <div class="speech" style="margin-top:16px;text-align:left"><span class="who">${WATAMARU}</span><div class="story-text" style="font-size:16px">${b.line}</div></div>
            <button class="btn dark" data-rewind style="margin-top:16px;border:1px solid var(--gold);color:var(--gold)">時を巻き戻す</button>
            <button class="link-btn" data-home style="display:block;margin:8px auto 0">ホームへ戻る</button>
          </div>
        </div>`);
      root.appendChild(el);
      navigator.vibrate?.([200]);
      el.querySelector('[data-rewind]').onclick = () => { requestCompass(); el.remove(); resolve(true); };
      el.querySelector('[data-home]').onclick = () => { el.remove(); resolve(false); };
    });
  }
}
