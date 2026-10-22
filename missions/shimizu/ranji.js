// 蘭字（輸出茶のラベル）の絵と、3×3スライドパズル「蘭字の復元」
// ラベルは 300×300 のSVGで描き、100×100 の9マスに分ける。8マスが蘭字パーツ（断片）、右下は完成時にはまる「茶」の印
// 操作: 空きマスの隣の断片をタップすると滑り込む。ヒントは最短手順から次の1枚を光らせる

// 断片（cell = 完成時の位置 0〜7。左上から右へ）
export const PIECES = [
  { id: 'world',   name: '世界',         spot: 'wheel',   cell: 0 },
  { id: 'tea',     name: 'SHIZUOKA TEA', spot: 'rail',    cell: 1 },
  { id: 'leaf',    name: '茶葉',         spot: 'rail',    cell: 2 },
  { id: 'ship',    name: '蒸気船',       spot: 'marine',  cell: 3 },
  { id: 'fuji',    name: '富士山',       spot: 'wheel',   cell: 4 },
  { id: 'port',    name: '清水港',       spot: 'marine',  cell: 5 },
  { id: 'jirocho', name: '次郎長',       spot: 'jirocho', cell: 6 },
  { id: 'margin',  name: '余白',         spot: 'jirocho', cell: 7 },
];
const EMPTY = 8;
const GOAL = '012345678';

const RED = '#b3311c', GOLD = '#c99a3a', SEA = '#2f6e8e', GREEN = '#4f8a3c', INK = '#1f1b18', PAPER = '#f3e7cc';

const waves = (y, x0 = 14, x1 = 286, h = 4) => {
  let d = `M${x0},${y}`;
  for (let x = x0; x < x1; x += 12) d += ` q6,${-h} 12,0`;
  return d;
};

// ラベル全体の絵（グラデーションやidを使わないので、何枚並べても衝突しない）
const ART = `
  <rect width="300" height="300" fill="${PAPER}"/>
  <rect x="5" y="5" width="290" height="290" fill="none" stroke="${RED}" stroke-width="6"/>
  <rect x="14" y="14" width="272" height="272" fill="none" stroke="${GOLD}" stroke-width="1.5"/>

  <!-- 中段を横切る海 -->
  <path d="${waves(184)}" fill="none" stroke="${SEA}" stroke-width="2"/>
  <path d="${waves(193)}" fill="none" stroke="${SEA}" stroke-width="1.5" opacity=".7"/>
  <!-- 下段を横切る茶畑の畝 -->
  ${[0, 1, 2, 3].map((k) => `<path d="M14,${262 + k * 7} C80,${252 + k * 7} 140,${272 + k * 7} 286,${258 + k * 7}" fill="none" stroke="${k % 2 ? '#8cbf5a' : GREEN}" stroke-width="4"/>`).join('')}

  <!-- 0 世界 -->
  <g stroke="${SEA}" fill="none" stroke-width="2">
    <circle cx="55" cy="50" r="24"/>
    <ellipse cx="55" cy="50" rx="10" ry="24"/>
    <line x1="31" y1="50" x2="79" y2="50"/>
    <path d="M35,38 Q55,44 75,38 M35,62 Q55,56 75,62"/>
  </g>
  <text x="55" y="88" text-anchor="middle" font-family="serif" font-size="9" letter-spacing="1.5" fill="${SEA}">TO THE WORLD</text>

  <!-- 1 SHIZUOKA TEA -->
  <text x="150" y="36" text-anchor="middle" font-family="serif" font-size="8" letter-spacing="3" fill="${GOLD}">CHOICEST</text>
  <text x="150" y="62" text-anchor="middle" font-family="serif" font-weight="700" font-size="16" letter-spacing="1" fill="${RED}">SHIZUOKA</text>
  <text x="150" y="86" text-anchor="middle" font-family="serif" font-weight="700" font-size="19" letter-spacing="4" fill="${RED}">TEA</text>

  <!-- 2 茶葉 -->
  <g fill="${GREEN}">
    <path d="M250,88 C248,70 246,52 252,26" fill="none" stroke="#5b4630" stroke-width="2.5"/>
    <path d="M250,70 C232,66 222,52 226,40 C240,42 250,54 250,70Z"/>
    <path d="M251,56 C268,52 278,40 276,28 C262,30 252,40 251,56Z"/>
    <path d="M249,84 C232,84 220,74 220,62 C234,62 246,70 249,84Z"/>
    <ellipse cx="253" cy="22" rx="4" ry="8" fill="#8cbf5a"/>
  </g>

  <!-- 3 蒸気船 -->
  <g>
    <circle cx="40" cy="118" r="7" fill="#9a958c" opacity=".7"/><circle cx="30" cy="110" r="9" fill="#9a958c" opacity=".55"/><circle cx="18" cy="104" r="10" fill="#9a958c" opacity=".4"/>
    <line x1="30" y1="170" x2="30" y2="128" stroke="${INK}" stroke-width="1.5"/>
    <line x1="78" y1="170" x2="78" y2="132" stroke="${INK}" stroke-width="1.5"/>
    <rect x="44" y="124" width="10" height="30" fill="${INK}"/><rect x="44" y="132" width="10" height="5" fill="${RED}"/>
    <rect x="34" y="152" width="40" height="12" fill="#efe3c6" stroke="${INK}" stroke-width="1"/>
    <path d="M14,164 H92 L86,180 H22 Z" fill="${INK}"/><path d="M19,174 H89 L86,180 H22 Z" fill="${RED}"/>
  </g>

  <!-- 4 富士山と日の丸 -->
  <circle cx="150" cy="134" r="22" fill="${RED}"/>
  <path d="M104,182 L138,128 L162,128 L196,182 Z" fill="#3b5f8a"/>
  <path d="M138,128 L162,128 L171,142 L160,137 L150,145 L141,137 L129,142 Z" fill="#fbf8f0"/>

  <!-- 5 清水港（錨） -->
  <g stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round">
    <circle cx="250" cy="118" r="6"/>
    <line x1="250" y1="124" x2="250" y2="162"/>
    <line x1="238" y1="132" x2="262" y2="132"/>
    <path d="M230,150 Q236,164 250,164 Q264,164 270,150"/>
  </g>
  <text x="250" y="178" text-anchor="middle" font-family="serif" font-size="10" letter-spacing="2" fill="${INK}">SHIMIZU</text>

  <!-- 6 次郎長（丸い印） -->
  <circle cx="50" cy="240" r="27" fill="${RED}"/>
  <circle cx="50" cy="240" r="23" fill="none" stroke="#f6e8cc" stroke-width="1"/>
  <text x="50" y="233" text-anchor="middle" font-family="serif" font-weight="700" font-size="12" fill="#fff">次</text>
  <text x="50" y="246" text-anchor="middle" font-family="serif" font-weight="700" font-size="12" fill="#fff">郎</text>
  <text x="50" y="259" text-anchor="middle" font-family="serif" font-weight="700" font-size="12" fill="#fff">長</text>

  <!-- 7 余白 -->
  <path d="M150,214 l6,8 -6,8 -6,-8Z" fill="${GOLD}"/>
  <text x="150" y="246" text-anchor="middle" font-family="serif" font-size="8" letter-spacing="2" fill="${INK}">PURE JAPAN</text>

  <!-- 8 茶の印（完成時にはまる最後の1枚） -->
  <rect x="232" y="216" width="36" height="36" fill="${RED}" transform="rotate(-6 250 234)"/>
  <text x="250" y="243" text-anchor="middle" font-family="serif" font-weight="700" font-size="24" fill="#fff" transform="rotate(-6 250 234)">茶</text>
`;

// cell(0〜8) の部分だけを切り出した絵
export const tileSVG = (cell, attrs = '') =>
  `<svg viewBox="${(cell % 3) * 100} ${Math.floor(cell / 3) * 100} 100 100" ${attrs}>${ART}</svg>`;
// 完成したラベル全体
export const labelSVG = (attrs = '') => `<svg viewBox="0 0 300 300" ${attrs}>${ART}</svg>`;

// ---------- パズルの計算（盤面 = 位置0〜8に並ぶcell番号の文字列。'8'が空き） ----------
const NEXT = [[1, 3], [0, 2, 4], [1, 5], [0, 4, 6], [1, 3, 5, 7], [2, 4, 8], [3, 7], [4, 6, 8], [5, 7]];
const swap = (s, a, b) => { const c = s.split(''); [c[a], c[b]] = [c[b], c[a]]; return c.join(''); };

// 完成形からの最短手数（全181,440通り。初回だけ計算）
let DIST = null;
function distances() {
  if (DIST) return DIST;
  DIST = new Map([[GOAL, 0]]);
  const q = [GOAL];
  for (let h = 0; h < q.length; h++) {
    const s = q[h], e = s.indexOf('8'), d = DIST.get(s);
    for (const n of NEXT[e]) {
      const t = swap(s, e, n);
      if (!DIST.has(t)) { DIST.set(t, d + 1); q.push(t); }
    }
  }
  return DIST;
}

// 必ず解ける並びを作る（完成形から崩し、最短16手以上になったら止める）
function shuffle() {
  const D = distances();
  let s = GOAL, prev = -1;
  for (let i = 0; i < 400; i++) {
    const e = s.indexOf('8');
    const opts = NEXT[e].filter((n) => n !== prev);
    const n = opts[Math.floor(Math.random() * opts.length)];
    s = swap(s, e, n); prev = e;
    if (D.get(s) >= 16 && i > 40) break;
  }
  return s;
}

const LINES = [
  '光っている断片を、空いた所へ滑らせてみな。',
  '焦るこたぁねえ。光ってるやつからだ。',
  'そいつを動かしゃ、また一歩近づくぜ。',
];

// パズル画面。戻り値: true（完成）/ false（戻る）
export function puzzle(root, api) {
  const { ui } = api;
  const { html, icons } = ui;
  const saved = api.getState().puzzle;

  return new Promise((resolve) => {
    let board = saved?.board ?? shuffle();
    let moves = saved?.moves ?? 0;
    let sec = saved?.sec ?? 0;
    const history = [];
    let solved = false;

    const el = html(`
      <div class="screen" style="background:radial-gradient(ellipse at 50% 40%,#1d2a36,#0e0c0a 75%)">
        <div class="topbar"><button class="icon-btn" data-back>${icons.back}</button><h1 class="serif">蘭字の復元</h1><button class="icon-btn" data-help>${icons.help}</button></div>
        <div class="scroll" style="padding:0 16px 16px;display:flex;flex-direction:column">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="flex:1">
              <div class="story-text" style="font-size:15px">断片を滑らせ、蘭字を組み直せ</div>
              <div class="small" style="margin-top:4px"><b class="gold" data-ok></b> <span class="sub">正しい位置</span></div>
            </div>
            <button data-preview style="background:none;border:1px solid var(--line);border-radius:6px;padding:3px;width:58px;flex:none">
              ${labelSVG('style="display:block;width:100%"')}<div class="small dim" style="font-size:10px;margin-top:2px">完成図</div>
            </button>
          </div>
          <div data-board style="position:relative;width:min(100%,340px);aspect-ratio:1;margin:14px auto 0;border:6px solid ${RED};border-radius:4px;background:#2a2118;touch-action:manipulation"></div>
          <div class="center small sub" style="margin-top:10px">空きマスの隣をタップすると、その断片が滑り込みます</div>
          <div class="card" style="display:flex;align-items:center;gap:18px;margin-top:12px;padding:10px 14px">
            <div><div class="small dim">手数</div><b style="font-size:20px" data-moves></b></div>
            <div><div class="small dim">経過</div><b style="font-size:20px" data-time></b></div>
            <span style="flex:1"></span>
            <button class="pill" data-undo>↶ 一手戻す</button>
          </div>
          <div class="speech hidden" data-line style="margin-top:12px"><span class="who">清水次郎長</span><div class="story-text" style="font-size:15px"></div></div>
          <button class="btn ghost" data-hint style="margin-top:12px">次郎長に尋ねる（ヒント）</button>
          <button class="btn" data-done disabled>蘭字を完成させる</button>
          <div class="center small dim" data-foot style="margin-top:6px">8枚すべてが正しい位置に揃うと完成します</div>
        </div>
      </div>`);
    root.appendChild(el);
    const boardEl = el.querySelector('[data-board]');
    const style = document.createElement('style');
    style.textContent = `
      .rj-tile{position:absolute;width:33.333%;height:33.333%;padding:1.5px;transition:transform .18s ease;cursor:pointer}
      .rj-tile svg{display:block;width:100%;height:100%;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,.5)}
      .rj-tile.ok svg{outline:1.5px solid rgba(224,180,76,.55);outline-offset:-1.5px}
      .rj-tile.hint svg{animation:rjHint .7s ease-in-out 4;outline:3px solid var(--gold);outline-offset:-3px}
      @keyframes rjHint{50%{transform:scale(.92);filter:brightness(1.25)}}
      .rj-solved .rj-tile svg{box-shadow:none;border-radius:0}
      .rj-solved{box-shadow:0 0 28px rgba(224,180,76,.75)}
      .rj-last{opacity:0;transition:opacity .8s}
      .rj-solved .rj-last{opacity:1}`;
    el.appendChild(style);

    // 8枚＋最後の1枚（完成時に空きマスへ現れる）
    const tiles = {};
    for (let c = 0; c <= 8; c++) {
      const t = document.createElement('div');
      t.className = 'rj-tile' + (c === EMPTY ? ' rj-last' : '');
      t.innerHTML = tileSVG(c);
      if (c !== EMPTY) t.onclick = () => tap(c);
      boardEl.appendChild(t);
      tiles[c] = t;
    }

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    function render() {
      for (let pos = 0; pos < 9; pos++) {
        const c = +board[pos];
        tiles[c].style.transform = `translate(${(pos % 3) * 100}%,${Math.floor(pos / 3) * 100}%)`;
        tiles[c].classList.toggle('ok', c !== EMPTY && c === pos);
      }
      const ok = [...board].filter((c, pos) => c !== '8' && +c === pos).length;
      el.querySelector('[data-ok]').textContent = `${ok} / 8`;
      el.querySelector('[data-moves]').textContent = moves;
      el.querySelector('[data-time]').textContent = fmt(sec);
      el.querySelector('[data-undo]').disabled = !history.length || solved;
    }
    const save = () => api.setState({ puzzle: { board, moves, sec } });

    function say(text) {
      const box = el.querySelector('[data-line]');
      box.querySelector('.story-text').innerHTML = text;
      box.classList.remove('hidden');
    }

    function tap(c) {
      if (solved) return;
      const pos = board.indexOf(String(c)), e = board.indexOf('8');
      if (!NEXT[e].includes(pos)) { navigator.vibrate?.(15); return; }
      history.push(board);
      board = swap(board, e, pos);
      moves++;
      Object.values(tiles).forEach((t) => t.classList.remove('hint'));
      render(); save();
      if (board === GOAL) win();
    }

    function win() {
      solved = true;
      clearInterval(timer);
      boardEl.classList.add('rj-solved');
      navigator.vibrate?.([60, 40, 120]);
      say('見事だ！ これで胸を張って<br>静岡の茶を世界へ出せるってもんよ。');
      el.querySelector('[data-hint]').classList.add('hidden');
      el.querySelector('[data-foot]').textContent = `${moves}手・${fmt(sec)}で完成`;
      const b = el.querySelector('[data-done]');
      b.disabled = false; b.textContent = '出航の準備へ';
      render();
    }

    const timer = setInterval(() => { if (!solved && !document.hidden) { sec++; render(); if (sec % 5 === 0) save(); } }, 1000);

    el.querySelector('[data-undo]').onclick = () => {
      if (!history.length || solved) return;
      board = history.pop();
      moves = Math.max(0, moves - 1);
      render(); save();
    };
    el.querySelector('[data-hint]').onclick = () => {
      const D = distances();
      const e = board.indexOf('8'), d = D.get(board);
      const pos = NEXT[e].find((n) => D.get(swap(board, e, n)) === d - 1);
      const c = +board[pos];
      Object.values(tiles).forEach((t) => t.classList.remove('hint'));
      void tiles[c].offsetWidth;
      tiles[c].classList.add('hint');
      const piece = PIECES.find((p) => p.cell === c);
      say(`${LINES[Math.floor(Math.random() * LINES.length)]}<br><span class="small sub">「${piece.name}」の断片だ。完成まで、あと最短${d}手。</span>`);
    };
    el.querySelector('[data-preview]').onclick = () => {
      const m = ui.modal(`<h2 class="serif" style="margin-top:6px">完成図</h2><div style="border:6px solid ${RED};border-radius:4px;max-width:300px;margin:0 auto">${labelSVG('style="display:block;width:100%"')}</div><p class="small sub">明治の輸出茶ラベル「蘭字」。右下の「茶」の印は、8枚が揃うと最後にはまります。</p><button class="btn dark">閉じる</button>`);
      m.el.querySelector('button').onclick = m.close;
    };
    el.querySelector('[data-help]').onclick = () => ui.say('清水次郎長', '空いたマスの隣の断片を触りゃ、そこへ滑り込む。<br>右上の完成図を見ながら、8枚を元の位置に戻しな。<br>迷ったら、遠慮なく俺に尋ねるんだぜ。');

    const finish = (v) => { clearInterval(timer); save(); el.remove(); resolve(v); };
    el.querySelector('[data-back]').onclick = () => finish(false);
    el.querySelector('[data-done]').onclick = () => solved && finish(true);

    render();
    save();
    if (board === GOAL) win();
  });
}
