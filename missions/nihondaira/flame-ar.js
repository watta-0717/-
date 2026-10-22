// 炎を払うAR演出：カメラ映像の上に炎を重ね、画面をなぞると炎が消えていく
// 炎が消えたら記念撮影（映像＋演出を1枚に合成）できる。戻り値: 撮影画像(Blob) か null
export function flameAR(root, api) {
  const { ui } = api;
  const { html } = ui;

  return new Promise(async (resolve) => {
    const el = html('<div class="screen"></div>');
    root.appendChild(el);
    const cam = await api.openCamera(el);

    const canvas = document.createElement('canvas');
    canvas.className = 'overlay';
    cam.element.appendChild(canvas); // カメラ映像の上に重ねる
    el.insertAdjacentHTML('beforeend', `
      <div class="topbar"><span style="flex:1"></span><span class="pill small" data-tag>AR：日本平が炎に包まれている</span><span style="flex:1"></span></div>
      <div class="center" data-guide style="position:relative;z-index:2;margin-top:12vh">
        <div class="serif" style="font-size:24px;text-shadow:0 2px 8px #000">草薙の剣で、炎を払え！</div>
        <div class="small" style="margin-top:8px;text-shadow:0 1px 4px #000">画面を左右に大きくなぞってください</div>
      </div>
      <div class="scan-bottom">
        <div class="meter" style="margin-bottom:14px"><i data-bar class="on" style="flex:none;width:100%;background:#e0562a"></i></div>
        <div data-end class="hidden">
          <div class="story-text center" style="font-size:16px;margin-bottom:14px">草薙の剣が修復され、日本武尊が剣を振ると、<br>たちまち日本平から炎が消えていった。</div>
          <div class="scan-row" style="justify-content:center;gap:24px;margin-top:0">
            <button class="shutter" data-shoot>撮影</button>
          </div>
          <button class="link-btn" data-skip style="display:block;margin:10px auto 0">撮影せずに進む</button>
        </div>
      </div>
      <div class="flash"></div>`);

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => { W = el.clientWidth; H = el.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    window.addEventListener('resize', resize);

    let intensity = 1;     // 炎の強さ 1 → 0
    let cleared = false;
    const parts = [];
    const sparks = [];
    const slashes = [];

    function spawnFlame() {
      parts.push({ x: Math.random() * W, y: H * (0.72 + Math.random() * 0.3), vx: (Math.random() - 0.5) * 0.6, vy: -(1.2 + Math.random() * 2.2), r: 18 + Math.random() * 34, life: 1 });
    }

    let raf;
    function frame() {
      ctx.clearRect(0, 0, W, H);
      // 炎の照り返し
      if (intensity > 0) {
        const g = ctx.createLinearGradient(0, H, 0, H * 0.3);
        g.addColorStop(0, `rgba(255,90,20,${0.55 * intensity})`); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        for (let k = 0; k < Math.ceil(10 * intensity); k++) spawnFlame();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx + Math.sin(p.y / 30) * 0.4; p.y += p.vy; p.life -= 0.012 + (1 - intensity) * 0.03; p.r *= 0.992;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(255,230,140,${0.5 * p.life})`);
        g.addColorStop(0.4, `rgba(255,120,30,${0.35 * p.life})`);
        g.addColorStop(1, 'rgba(200,30,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      // 剣の軌跡
      for (let i = slashes.length - 1; i >= 0; i--) {
        const s = slashes[i];
        s.life -= 0.06;
        if (s.life <= 0) { slashes.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(255,240,200,${s.life})`; ctx.lineWidth = 6 * s.life; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke();
      }
      // 炎が消えた後の金の粒
      if (cleared) {
        if (sparks.length < 70) sparks.push({ x: Math.random() * W, y: H + 10, vy: -(0.5 + Math.random()), a: 1 });
        sparks.forEach((s) => { s.y += s.vy; s.a = Math.min(1, (s.y / H) * 1.4); ctx.fillStyle = `rgba(240,200,90,${s.a * 0.8})`; ctx.fillRect(s.x, s.y, 2.5, 2.5); if (s.y < -10) s.y = H + 10; });
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }
    frame();

    // なぞって炎を払う
    let last = null;
    el.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointermove', (e) => {
      if (!last || cleared) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) return;
      slashes.push({ x0: last.x - r.left, y0: last.y - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top, life: 1 });
      intensity = Math.max(0, intensity - dist / 2600);
      el.querySelector('[data-bar]').style.width = `${intensity * 100}%`;
      last = { x: e.clientX, y: e.clientY };
      if (intensity <= 0) finish();
    });
    el.addEventListener('pointerup', () => { last = null; });
    // 開発モードでは自動で炎を払う
    if (api.devMode) setTimeout(() => { if (!cleared) { intensity = 0; finish(); } }, 2500);

    function finish() {
      cleared = true;
      navigator.vibrate?.([50, 30, 50]);
      el.querySelector('[data-guide]').classList.add('hidden');
      el.querySelector('[data-tag]').textContent = 'AR：炎が消え、日本平に景色が戻った';
      el.querySelector('[data-bar]').parentElement.classList.add('hidden');
      el.querySelector('[data-end]').classList.remove('hidden');
    }

    function done(v) {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      cam.close(); el.remove(); resolve(v);
    }

    el.querySelector('[data-skip]').onclick = () => done(null);
    el.querySelector('[data-shoot]').onclick = async (e) => {
      e.stopPropagation();
      const f = el.querySelector('.flash');
      f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      // 撮影用に記念スタンプを描き足して合成
      const stamp = document.createElement('canvas');
      stamp.width = canvas.width; stamp.height = canvas.height;
      const s = stamp.getContext('2d');
      s.drawImage(canvas, 0, 0);
      s.scale(dpr, dpr);
      s.fillStyle = 'rgba(0,0,0,.45)'; s.fillRect(0, H - 70, W, 70);
      s.fillStyle = '#e0b44c'; s.font = '700 18px "Noto Serif JP", serif'; s.textAlign = 'center';
      s.fillText('草薙の刃文、合わさる ― 日本平', W / 2, H - 38);
      s.fillStyle = '#f3ece0'; s.font = '500 11px "Noto Sans JP", sans-serif';
      s.fillText(`${new Date().toLocaleDateString('ja-JP')}　静岡市ツーリズム創生アプリ`, W / 2, H - 18);
      const blob = await cam.capture(stamp);
      ui.toast('写真をコレクションに保存しました');
      setTimeout(() => done(blob), 600);
    };
  });
}
