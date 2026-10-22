// 起動画面の火責め演出（2026-10-20）：背景の写真の上に、燃え上がる炎・火の粉・煙・赤い明滅を重ねる
// 炎の根もとは文章の上端に合わせ、文字やボタンには重ねない。戻り値: 演出を止める関数
// 背景の富士山（fuji_view.jpg 390×545、雲の上に出た富士山のすそ野が y≈400）を、炎の上に見えるよう置き直す
const PHOTO = { w: 390, h: 545, fujiBottom: 400 };
const FLAME_ROOM = 80; // 炎の根もとから富士山のすそまでの間（炎はおおむねこの高さまで）

export function fireOverlay(screen) {
  // 起動画面の共通の暗いぼかし（下ほど暗い）は富士山まで暗くするので、この画面だけ外す（文字の下は炎の側で暗くする）
  if (!document.getElementById('fire-launch-style')) {
    const st = document.createElement('style'); st.id = 'fire-launch-style';
    st.textContent = '.story.fire-launch::after{display:none}';
    document.head.appendChild(st);
  }
  screen.classList.add('fire-launch');
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
  screen.insertBefore(canvas, screen.firstChild); // 文字（後ろの要素）より下、背景の暗いぼかしより上
  const ctx = canvas.getContext('2d');
  const dpr = 1; // ぼやけた炎なので等倍で十分（描く量を減らして軽くする）
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, base = 0, scale = 1;
  const flames = [], smoke = [], embers = [];

  function resize() {
    const r = screen.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 炎の根もと：本文（MISSION の見出し）の少し下。見つからなければ画面の6割
    const body = screen.querySelector('.story-body');
    const top = body ? body.getBoundingClientRect().top - r.top + 6 : H * 0.6;
    base = Math.max(H * 0.35, Math.min(H * 0.75, top));
    scale = Math.max(0.6, Math.min(1, base / 470)); // 背の低い画面では炎も低く
    // 富士山のすそ野が炎の少し上に来るよう、写真の大きさと上下の位置を決める（左右ははみ出さない）
    const target = base - FLAME_ROOM * scale;
    let k = W / PHOTO.w, y = target - PHOTO.fujiBottom * k;
    if (y > 0) { k = target / PHOTO.fujiBottom; y = 0; }
    screen.style.backgroundSize = `${Math.round(PHOTO.w * k)}px ${Math.round(PHOTO.h * k)}px`;
    screen.style.backgroundPosition = `center ${Math.round(y)}px`;
    screen.style.backgroundRepeat = 'no-repeat';
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  // 炎・煙の形を先に描いておき、毎フレームは貼るだけにする（スマートフォンでも軽く動かすため）
  function sprite(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  const FIRE = [ // 根もと（白っぽい黄）→ 中ほど（橙）→ 先（赤）
    sprite([[0, 'rgba(255,236,170,.9)'], [0.45, 'rgba(255,150,40,.55)'], [1, 'rgba(220,40,0,0)']]),
    sprite([[0, 'rgba(255,170,60,.8)'], [0.5, 'rgba(240,90,20,.45)'], [1, 'rgba(180,20,0,0)']]),
    sprite([[0, 'rgba(230,80,20,.6)'], [0.6, 'rgba(160,30,10,.3)'], [1, 'rgba(120,10,0,0)']]),
  ];
  const SMOKE = sprite([[0, 'rgba(30,22,18,1)'], [1, 'rgba(30,22,18,0)']]);
  // 炎の高さの揺らぎ（横方向に波打つ）
  const ridge = (x, t) => 0.55 + 0.25 * Math.sin(x / 47 + t / 700) + 0.2 * Math.sin(x / 19 - t / 430);

  function spawn(t) {
    const n = Math.round(W / 9);
    for (let i = 0; i < n * 0.22; i++) {
      const x = rnd(-10, W + 10);
      const h = ridge(x, t);
      flames.push({ x, y: base + rnd(0, 18), vx: rnd(-0.25, 0.25), vy: -rnd(0.9, 1.8) * (0.6 + h) * scale, r: rnd(9, 18) * (0.7 + h * 0.6) * scale, life: 0, max: rnd(30, 52) * (0.6 + h * 0.6) });
    }
    if (Math.random() < 0.3) smoke.push({ x: rnd(0, W), y: base - rnd(10, 50), vx: rnd(-0.2, 0.4), vy: -rnd(0.3, 0.6), r: rnd(30, 60), life: 0, max: rnd(140, 220) });
    if (Math.random() < 0.7) embers.push({ x: rnd(0, W), y: base + rnd(-10, 10), vx: rnd(-0.6, 0.6), vy: -rnd(1.2, 3.2), r: rnd(0.8, 2.2), life: 0, max: rnd(120, 260), ph: rnd(0, 6) });
  }

  function step(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.x += p.vx; p.y += p.vy; p.life++;
      if (p.life >= p.max || p.y < -40) arr.splice(i, 1);
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    // 画面全体の赤い明滅（火に照らされている）
    const flick = 0.5 + 0.25 * Math.sin(t / 130) + 0.15 * Math.sin(t / 53);
    const sky = ctx.createLinearGradient(0, 0, 0, base);
    sky.addColorStop(0, `rgba(90,20,0,${0.04 + 0.04 * flick})`);
    sky.addColorStop(1, `rgba(200,60,10,${0.2 + 0.1 * flick})`);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, base);

    // 煙（炎の上に立ちのぼる黒い煙）
    for (const s of smoke) {
      const r = s.r * (1 + s.life / s.max);
      ctx.globalAlpha = Math.sin(Math.PI * s.life / s.max) * 0.16;
      ctx.drawImage(SMOKE, s.x - r, s.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    // 根もとの光
    const glow = ctx.createLinearGradient(0, base - 140, 0, base + 40);
    glow.addColorStop(0, 'rgba(255,90,20,0)');
    glow.addColorStop(0.7, `rgba(255,110,30,${0.35 + 0.15 * flick})`);
    glow.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, base - 140, W, 180);
    // 炎（白→黄→橙→赤へ変わりながら細くなる）
    for (const f of flames) {
      const k = f.life / f.max;
      const r = f.r * (1 - k * 0.7);
      ctx.globalAlpha = (1 - k) * 0.85;
      // 縦に伸ばして炎の舌の形に
      ctx.drawImage(FIRE[k < 0.25 ? 0 : k < 0.6 ? 1 : 2], f.x + Math.sin(t / 90 + f.y / 15) * 2 - r * 0.8, f.y - r * 1.8, r * 1.6, r * 2.6);
    }
    ctx.globalAlpha = 1;
    // 火の粉
    for (const e of embers) {
      const a = (1 - e.life / e.max) * (0.6 + 0.4 * Math.sin(t / 60 + e.ph));
      ctx.fillStyle = `rgba(255,${Math.round(200 - 80 * e.life / e.max)},90,${a})`;
      ctx.beginPath(); ctx.arc(e.x + Math.sin(t / 300 + e.ph) * 6, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 炎の下側を暗く切って、文章を読みやすくする
    const fade = ctx.createLinearGradient(0, base - 30, 0, base + 50);
    fade.addColorStop(0, 'rgba(12,10,8,0)'); fade.addColorStop(1, 'rgba(12,10,8,1)');
    ctx.fillStyle = fade; ctx.fillRect(0, base - 30, W, H - base + 30);
  }

  let raf = 0, last = 0, stopped = false;
  function frame(t) {
    if (stopped) return;
    if (t - last > 14) { // 約60fps以下に抑える
      last = t;
      spawn(t);
      step(flames); step(smoke); step(embers);
      draw(t);
    }
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  if (still) {
    // 動きを減らす設定の端末：少し進めた状態を1枚だけ描く
    for (let i = 0; i < 90; i++) { spawn(i * 16); step(flames); step(smoke); step(embers); }
    draw(0);
  } else {
    raf = requestAnimationFrame(frame);
  }

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.remove();
  };
}
