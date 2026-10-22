// 日本平ミッション「草薙の刃文を合わせ、炎を払え！」
// 流れ: （夢テラスまでの道案内）→ 起動 → ストーリー導入 → 方角合わせAR（三春瀧櫻→茶畑→日本武尊像）
//       → 現れた日本武尊に奉納 → 刃文パズル → 炎を払うAR → クリア
// 夢テラスから移動せずに遊べる（2026-10-10 作りなおし。旧版は webapp_backup_20261009.zip）
import { NIHONDAIRA_SCAN_SPOTS as SPOTS } from '../../data/spots.js';
import { routeGuide } from './route.js';
import { aimAR } from './aim-ar.js';
import { puzzle } from './puzzle.js';
import { flameAR } from './flame-ar.js';
import { fireOverlay } from './fire-launch.js';

const IMG = {
  fuji: 'assets/img/nihondaira/fuji_view.jpg',
  yamato: 'assets/img/nihondaira/yamatotakeru.jpg',
  miharu: 'assets/img/nihondaira/miharu.jpg',
  statue: 'assets/img/nihondaira/statue.jpg', // FanLab提供（2026-10-10）
  teafield: 'assets/img/nihondaira/teafield.jpg', // FanLab提供（2026-10-10）
  sword: 'assets/img/nihondaira/broken_sword.jpg', // FanLab提供「割れた剣」（2026-10-16）
};
const NPC = '日本武尊';
const spot = (id) => SPOTS.find((s) => s.id === id);

// 方角を合わせる対象（この順番）
const TARGETS = [
  {
    ...spot('miharu'),
    img: IMG.miharu,
    mark: '花',
    energy: '花のエネルギー',
    about: '東日本大震災の後、福島・三春町の「三春滝桜」の子孫樹がこの地に託された。五メートルほどの若木は、いまでは日本平のシンボルツリーとして枝を広げている。失われかけた命が、別の土地で生き続けている。',
  },
  {
    ...spot('chanoma'),
    img: IMG.teafield,
    mark: '緑',
    energy: '緑のエネルギー',
    about: '日本平の斜面には茶畑が広がり、富士山と清水港、足もとの茶畑を一度に見渡せる。静岡の茶は明治のころ、眼下の清水港から世界へ運ばれていった。',
  },
  {
    ...spot('statue'),
    img: IMG.statue,
    mark: '像',
    line: { who: NPC, text: 'よくぞ草木の力を集めてくれた。<br>その力を、わが剣に！' },
    about: '東征の途中、日本武尊がこの山に登って四方を見渡したことから「日本平」の名がついたと伝えられる。像は草薙の剣を手に、駿河の地を見守っている。',
  },
];

export async function start(root, api) {
  const { ui, geo } = api;
  const { html, icons } = ui;
  const st = () => api.getState();

  // ---------- 0. 夢テラスまでの道案内（離れているときだけ。開発モード・デモ版では省く） ----------
  if (!geo.isNear(api.mission.spot)) {
    const arrived = await routeGuide(root, api);
    if (!arrived) return api.exit();
  }

  // ---------- 1. 起動画面（火責めの演出を重ねる） ----------
  const launching = ui.launch(root, {
    bg: IMG.fuji,
    area: '日本平',
    title: '草薙の刃文を合わせ、<br>炎を払え！',
    distortion: '草薙の剣が抜けず、日本武尊が火攻めの中に取り残されている。このままでは「日本平」という名の由来が、歴史から消えてしまう。',
    spot: api.mission.spot,
    meta: '所要 約15分 ・ 夢テラスから移動なし ・ AR',
  });
  const stopFire = fireOverlay(root.lastElementChild); // launch が追加した起動画面
  const go = await launching;
  stopFire();
  if (!go) return api.exit();

  // ---------- 2. ストーリー導入（初回のみ。途中再開時は省略） ----------
  if (!st().introDone) {
    await ui.story(root, {
      place: '日本平夢テラス',
      pages: [
        { bg: IMG.fuji, text: '眼下に清水の街と駿河湾。<br>その向こうに、富士がそびえている。', note: 'いつもと変わらない、日本平の展望だった。' },
        { bg: IMG.fuji, tint: 'radial-gradient(ellipse at 50% 75%,rgba(220,70,20,.6),rgba(120,20,0,.25) 60%,transparent)', html: '<span class="pill small" style="background:#7a1f0c;margin-bottom:12px">⚠ 時空の歪みを検知</span>', text: 'ふいに、景色が揺らいだ。<br>街が消え、一面の草原が現れる。', note: 'その草原が、風下から炎に包まれていく。煙の向こうに、人影がひとつ。' },
        { bg: IMG.fuji, npc: { name: NPC, img: IMG.yamato }, line: { who: NPC, text: 'おのれ……剣が、抜けぬ！<br>このままでは、焼かれる――' }, note: '火責めに遭った日本武尊。草を薙ぎ払うはずの草薙の剣が、鞘から抜けずにいる。' },
        { bg: IMG.fuji, npc: { name: NPC, img: IMG.yamato, caption: 'AR：日本武尊' }, line: { who: NPC, text: 'そこの者、力を貸してくれ。<br>この丘から、三春瀧櫻と茶畑の力を呼び、<br>わが像のもとへ届けてほしい。' }, note: 'スマートフォンを掲げて方角を合わせると、その場所が浮かび上がります。' },
      ],
    });
    api.setState({ introDone: true });
  }

  // ---------- 3. 方角合わせAR（三春瀧櫻 → 茶畑 → 日本武尊像） ----------
  if (!st().offered) {
    const found = st().found ?? [];
    const next = TARGETS.findIndex((t) => !found.includes(t.id));
    const startIndex = next === -1 ? TARGETS.length - 1 : next; // 途中から再開
    const r = await aimAR(root, api, {
      targets: TARGETS,
      startIndex,
      onFound: (t) => api.setState({ found: [...new Set([...(st().found ?? []), t.id])] }),
    });
    if (r !== 'done') return api.exit();

    // ---------- 4. 現れた日本武尊に奉納 ----------
    const ok = await offering();
    if (!ok) return api.exit();
    api.setState({ offered: true });
    await ui.story(root, {
      pages: [
        { bg: IMG.statue, npc: { name: NPC, img: IMG.yamato, caption: 'AR：日本武尊' }, line: { who: NPC, text: 'おお……力が満ちる！<br>抜けた、抜けたぞ！' } },
        { bg: IMG.sword, text: 'しかし、力を込めすぎたのか――<br>刀身が三つに割れてしまった。', note: '割れた刀身をずらし、刃文の波をひとつにつなげて、剣を修復しよう。' },
      ],
    });
  }

  // ---------- 5. 刃文パズル ----------
  const solved = await puzzle(root, api);
  if (!solved) return api.exit();

  // ---------- 6. 炎を払うAR演出 ----------
  const photo = await flameAR(root, api);
  if (photo) api.savePhoto(photo, 'ar', '日本平・炎払い');
  api.setState({ found: [], offered: false, introDone: true }); // 再挑戦できるように途中経過を戻す

  api.complete({
    heading: '封印 解除',
    message: '日本武尊は草を薙ぎ払って炎を逃れ、<br>日本平の由来が、再び歴史に繋ぎ直された。',
  });

  // ===== 画面 =====

  // 奉納：浮かび上がった日本武尊像の前で、長押しでエネルギーを捧げる（夢テラスのまま）
  function offering() {
    return new Promise((resolve) => {
      const el = html(`
        <div class="story" style="background-image:url(${IMG.statue})">
          <div class="topbar"><button class="icon-btn" data-back>${icons.back}</button><h1 style="text-shadow:0 1px 4px #000">日本武尊像</h1><span style="width:44px"></span></div>
          <div class="story-body center">
            <div class="speech" style="text-align:left"><span class="who">${NPC}</span><div class="story-text" style="font-size:16px">集めた草木の力を、この剣に！</div></div>
            <div style="position:relative;width:132px;height:132px;margin:22px auto 10px">
              <svg viewBox="0 0 100 100" style="position:absolute;inset:0;transform:rotate(-90deg)"><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="5"/><circle data-ring cx="50" cy="50" r="46" fill="none" stroke="#e0b44c" stroke-width="5" stroke-dasharray="289" stroke-dashoffset="289" stroke-linecap="round"/></svg>
              <button class="shutter" data-hold style="position:absolute;inset:18px;width:auto;height:auto;font-size:14px;touch-action:none;user-select:none;-webkit-user-select:none">長押しで<br>捧げる</button>
            </div>
            <div class="small sub">花と緑のエネルギー 2 / 2</div>
          </div>
        </div>`);
      root.appendChild(el);
      const ring = el.querySelector('[data-ring]');
      const hold = el.querySelector('[data-hold]');
      let p = 0, timer = null;
      const tick = () => {
        p = Math.min(1, p + 0.025);
        ring.style.strokeDashoffset = 289 * (1 - p);
        if (p >= 1) { clearInterval(timer); navigator.vibrate?.([80, 40, 120]); setTimeout(() => { el.remove(); resolve(true); }, 300); }
      };
      hold.addEventListener('pointerdown', (e) => { e.preventDefault(); clearInterval(timer); timer = setInterval(tick, 40); });
      const stop = () => { if (p < 1) { clearInterval(timer); p = 0; ring.style.strokeDashoffset = 289; } };
      hold.addEventListener('pointerup', stop);
      hold.addEventListener('pointerleave', stop);
      hold.addEventListener('contextmenu', (e) => e.preventDefault());
      el.querySelector('[data-back]').onclick = () => { clearInterval(timer); el.remove(); resolve(false); };
    });
  }
}
