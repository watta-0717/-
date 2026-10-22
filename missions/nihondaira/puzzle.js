// 刃文パズル：3つに割れた刀身を左右にスライドし、刃文の波をつなげる
// 操作: 刀身をタップして選び、下の横バー（スライダー）で左右にずらす。中心線に合うと金色に光る
// （2026-10-15 変更：ドラッグ・‹ ›・← → ボタンを廃止）
// （2026-10-22 変更：刀身の幅を約1.5倍に。説明文をバーの枠内へ移し、空いた分だけ剣を大きく表示）
const PIECES = 3;
const SNAP = 5;      // この距離(px, SVG座標)以内なら一致とみなす
const RANGE = 50;    // バーの片側の幅（SVG座標）
const NAMES = ['上（切っ先）', '中', '下'];

export function puzzle(root, api) {
  const { ui } = api;
  const { html, icons } = ui;

  return new Promise((resolve) => {
    // バー上の正解位置（刀身ごとに中央から左右へずらし、バーの真ん中＝正解にならないようにする）
    const bias = Array.from({ length: PIECES }, () => (Math.random() < 0.5 ? -1 : 1) * (10 + Math.round(Math.random() * 25)));
    // バーの値（-RANGE〜RANGE）。刀身のずれ = 値 - bias。必ず一致していない状態から始める
    const vals = bias.map((b) => { let v; do { v = Math.round((Math.random() * 2 - 1) * RANGE); } while (Math.abs(v - b) < 18); return v; });
    const offsets = vals.map((v, i) => v - bias[i]);
    let sel = 1;

    // 刀身の形（SVG座標 幅200 x 高さ420）
    const cx = 100, bw = 66;
    const segs = [
      { y0: 20, y1: 160, tip: true },
      { y0: 166, y1: 280 },
      { y0: 286, y1: 386 },
    ];
    const wave = (y) => cx + 10 * Math.sin(y / 13) + 5.5 * Math.sin(y / 5.3);
    const hamon = (y0, y1) => {
      let d = '';
      for (let y = y0 + 4; y <= y1 - 4; y += 3) d += `${d ? 'L' : 'M'}${wave(y).toFixed(1)},${y}`;
      return d;
    };
    const outline = (s) => s.tip
      ? `M${cx},${s.y0} L${cx + bw / 2},${s.y0 + 60} L${cx + bw / 2},${s.y1} L${cx - bw / 2},${s.y1} L${cx - bw / 2},${s.y0 + 60} Z`
      : `M${cx - bw / 2},${s.y0} H${cx + bw / 2} V${s.y1} H${cx - bw / 2} Z`;

    const el = html(`
      <div class="screen" style="background:radial-gradient(ellipse at 50% 60%,#3a2618,#120f0c 70%)">
        <div class="topbar"><button class="icon-btn" data-back>${icons.back}</button><h1>草薙の剣・封印</h1><button class="icon-btn" data-help>${icons.help}</button></div>
        <div class="center small sub">日本武尊像の前・集めた草木の力を捧げた</div>
        <div class="center" style="margin-top:10px"><span class="pill" style="border-color:var(--gold);color:var(--gold);border-radius:6px"><b data-count></b></span></div>
        <div style="flex:1;display:grid;place-items:center;min-height:0">
          <svg data-svg viewBox="0 0 200 420" style="height:100%;max-height:440px;touch-action:none;overflow:visible">
            <defs><linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#1d2a30"/><stop offset=".5" stop-color="#2f3e46"/><stop offset="1" stop-color="#1a2328"/></linearGradient></defs>
            <line x1="${cx}" y1="10" x2="${cx}" y2="392" stroke="rgba(224,180,76,.12)" stroke-dasharray="3 5"/>
            ${segs.map((s, i) => `
              <g data-piece="${i}" style="cursor:pointer">
                <rect x="${cx - bw / 2 - 14}" y="${s.y0 - 2}" width="${bw + 28}" height="${s.y1 - s.y0 + 4}" fill="transparent"/>
                <path d="${outline(s)}" fill="url(#steel)" stroke="#9fb3bd" stroke-width="1.2"/>
                <path data-hamon d="${hamon(s.tip ? s.y0 + 64 : s.y0, s.y1)}" fill="none" stroke-width="3.5" stroke-linecap="round"/>
                <rect data-sel x="${cx - bw / 2 - 8}" y="${s.y0 - 4}" width="${bw + 16}" height="${s.y1 - s.y0 + 8}" fill="none" stroke="#e0b44c" stroke-dasharray="5 4" rx="3"/>
              </g>`).join('')}
            <rect x="${cx - 38}" y="390" width="76" height="12" rx="2" fill="#a88a4e"/>
            <rect x="${cx - 56}" y="402" width="112" height="6" rx="3" fill="#4a3f33"/>
            <rect x="${cx - 16}" y="408" width="32" height="30" fill="#2a221b"/>
          </svg>
        </div>
        <style>
          .hamon-bar{flex:1;-webkit-appearance:none;appearance:none;height:36px;background:transparent;touch-action:none;margin:0}
          .hamon-bar::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,#3a3128,#6b5a3e,#3a3128)}
          .hamon-bar::-moz-range-track{height:6px;border-radius:3px;background:linear-gradient(90deg,#3a3128,#6b5a3e,#3a3128)}
          .hamon-bar::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;margin-top:-12px;border-radius:50%;background:#e0b44c;border:3px solid #1a1510;box-shadow:0 0 10px rgba(224,180,76,.6)}
          .hamon-bar::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:#e0b44c;border:3px solid #1a1510;box-shadow:0 0 10px rgba(224,180,76,.6)}
        </style>
        <div class="pad" style="padding-top:0;padding-bottom:calc(16px + var(--safe-b))">
          <div class="card" data-ctrl style="padding:12px 16px 10px;margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span class="small sub">動かす刀身：<b class="gold" data-selname></b></span>
              <span style="display:flex;gap:6px" data-dots></span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="small dim">←</span>
              <input type="range" class="hamon-bar" min="${-RANGE}" max="${RANGE}" step="0.5" data-bar aria-label="刀身をずらす">
              <span class="small dim">→</span>
            </div>
            <div class="center small dim" data-guide style="margin-top:4px">${['刀身をタップして選び、', 'バーでずらして', '刃文の波を繋げよ'].map((t) => `<span style="display:inline-block">${t}</span>`).join('')}</div>
          </div>
          <button class="btn" data-solve disabled>刃文が3つ揃うと解除できます</button>
        </div>
      </div>`);
    root.appendChild(el);

    const svg = el.querySelector('[data-svg]');
    // 剣全体の位置：真ん中の刀身の中心が、画面の縦の真ん中に来るように上下にずらす（2026-10-16）
    // 剣が上の「刃文 ○/3 一致」や下の説明・操作に重なる画面の高さでは、剣を少し小さくして収める
    const PIVOT = (segs[1].y0 + segs[1].y1) / 2; // SVG座標
    const TOP = segs[0].y0, BOTTOM = 438;         // 切っ先と柄の端（SVG座標）
    svg.style.transformOrigin = `50% ${(PIVOT / 420 * 100).toFixed(2)}%`;
    function placeSword() {
      svg.style.transform = 'none';
      const r = svg.getBoundingClientRect();
      const unit = r.height / 420;                               // SVG座標1あたりの画面上の大きさ
      const pivotY = r.top + PIVOT * unit;
      const center = window.innerHeight / 2;
      const ceiling = el.querySelector('[data-count]').getBoundingClientRect().bottom + 12; // 切っ先の上限
      const floor = el.querySelector('[data-ctrl]').getBoundingClientRect().top - 10;      // 柄の下限（バーの枠の上）
      // 入る範囲でできるだけ大きく（最大1.6倍、最小0.5倍）
      const k = Math.max(0.5, Math.min(1.6, (center - ceiling) / ((PIVOT - TOP) * unit), (floor - center) / ((BOTTOM - PIVOT) * unit)));
      svg.style.transform = `translateY(${(center - pivotY).toFixed(1)}px) scale(${k.toFixed(3)})`;
    }
    window.addEventListener('resize', placeSword);
    const groups = [...el.querySelectorAll('[data-piece]')];
    const aligned = (i) => Math.abs(offsets[i]) < 0.5;

    function render() {
      groups.forEach((g, i) => {
        g.setAttribute('transform', `translate(${offsets[i]},0)`);
        const ok = aligned(i);
        const h = g.querySelector('[data-hamon]');
        h.setAttribute('stroke', ok ? '#f2c75c' : '#8d9aa1');
        h.style.filter = ok ? 'drop-shadow(0 0 4px #e0b44c)' : 'none';
        g.querySelector('[data-sel]').style.display = i === sel ? '' : 'none';
      });
      const n = offsets.filter((_, i) => aligned(i)).length;
      el.querySelector('[data-count]').textContent = `刃文 ${n} / ${PIECES} 一致`;
      el.querySelector('[data-selname]').textContent = NAMES[sel];
      el.querySelector('[data-dots]').innerHTML = groups.map((_, i) => `<i style="width:10px;height:10px;border-radius:50%;background:${i === sel ? 'var(--gold)' : '#555'}"></i>`).join('');
      el.querySelector('[data-solve]').disabled = n < PIECES;
      el.querySelector('[data-solve]').textContent = n < PIECES ? '刃文が3つ揃うと解除できます' : '封印を解除する';
    }

    const bar = el.querySelector('[data-bar]');
    function syncBar() { bar.value = offsets[sel] + bias[sel]; }
    function snap(i) {
      if (Math.abs(offsets[i]) <= SNAP) {
        if (offsets[i] !== 0) navigator.vibrate?.(30);
        offsets[i] = 0;
      }
    }

    // 刀身をタップ：動かす刀身を選ぶ（動かさない）
    svg.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-piece]');
      if (!g) return;
      sel = Number(g.dataset.piece);
      syncBar();
      render();
    });

    // 横バー：動かしている間は刀身が付いてくる。指を離したときに正解の近くなら吸い付く
    bar.addEventListener('input', () => { offsets[sel] = +bar.value - bias[sel]; render(); });
    bar.addEventListener('change', () => { snap(sel); syncBar(); render(); });

    el.querySelector('[data-help]').onclick = () =>
      ui.say('日本武尊', '刀身の中を走る、波のような模様が「刃文」だ。<br>刀身をタップして選び、下のバーで左右にずらすのだ。<br>上から下まで波が一本の線につながれば、金色に光る。');
    el.querySelector('[data-back]').onclick = () => { window.removeEventListener('resize', placeSword); el.remove(); resolve(false); };
    el.querySelector('[data-solve]').onclick = () => {
      navigator.vibrate?.([60, 40, 160]);
      el.querySelector('[data-svg]').style.filter = 'drop-shadow(0 0 18px #e0b44c)';
      el.querySelector('[data-solve]').textContent = '草薙の剣、修復！';
      setTimeout(() => { window.removeEventListener('resize', placeSword); el.remove(); resolve(true); }, 900);
    };

    syncBar();
    render();
    requestAnimationFrame(placeSword);
  });
}
