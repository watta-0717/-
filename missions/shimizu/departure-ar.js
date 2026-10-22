// 出航AR演出：カメラ映像の上に、茶箱を積んだ蒸気船を重ねる
// 停泊（煙を上げて待つ）→「汽笛を鳴らして出航する」で汽笛が鳴り、船が沖へ小さくなっていく（約9秒）→ 記念撮影
// 戻り値: 撮影画像(Blob) か null

// 汽笛の音源（2026-10-17 FanLab 提供）。読み込めない・再生できない端末では下の合成音で代用する
const WHISTLE_MP3 = 'assets/sound/shimizu/whistle.mp3';

// 汽笛（合成音。MP3が鳴らせないときの代用）
function whistle(ac, at = 0, len = 1.8) {
  const t = ac.currentTime + at;
  const out = ac.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.22, t + 0.12);
  out.gain.setValueAtTime(0.22, t + len - 0.35);
  out.gain.linearRampToValueAtTime(0, t + len);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1400;
  lp.connect(out); out.connect(ac.destination);
  [196, 247, 294].forEach((f) => {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.linearRampToValueAtTime(f, t + 0.15);
    o.connect(lp); o.start(t); o.stop(t + len + 0.05);
  });
}

export function departureAR(root, api) {
  const { ui } = api;
  const { html } = ui;

  return new Promise(async (resolve) => {
    const el = html('<div class="screen"></div>');
    root.appendChild(el);
    const cam = await api.openCamera(el);

    const canvas = document.createElement('canvas');
    canvas.className = 'overlay';
    cam.element.appendChild(canvas); // カメラ映像の上に重ねる（.cam canvas.overlay）
    el.insertAdjacentHTML('beforeend', `
      <div class="topbar"><span style="flex:1"></span><span class="pill small" data-tag>● AR：岸壁に停泊する蒸気船</span><span style="flex:1"></span></div>
      <div class="center" data-guide style="position:relative;z-index:2;margin-top:4vh">
        <div class="small" style="text-shadow:0 1px 4px #000">スマホを海の方へ向けてください</div>
      </div>
      <div class="scan-bottom">
        <div data-start>
          <div class="story-text center" style="font-size:16px;margin-bottom:14px">蘭字を貼った茶箱が、船に積み込まれた。</div>
          <button class="btn" data-go>汽笛を鳴らして出航する</button>
          <div class="center small dim" style="margin-top:8px">音が出ます</div>
        </div>
        <div data-end class="hidden">
          <div class="story-text center" style="font-size:16px;margin-bottom:14px">お茶を積んだ蒸気船が、<br>汽笛を鳴らして世界へ出ていく。</div>
          <div class="scan-row" style="justify-content:center;gap:24px;margin-top:0">
            <button class="shutter" data-shoot>撮影</button>
          </div>
          <button class="link-btn" data-skip style="display:block;margin:10px auto 0">撮影せずに見届ける</button>
        </div>
      </div>
      <div class="flash"></div>`);

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => { W = el.clientWidth; H = el.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    window.addEventListener('resize', resize);

    const SAIL = 9000;
    let tStart = null;      // 出航した時刻
    let ac = null;
    let audio = null;   // 汽笛のMP3
    let ended = false;
    const smoke = [];
    const gulls = Array.from({ length: 3 }, (_, i) => ({ x: Math.random(), y: 0.12 + i * 0.07, v: 0.0004 + Math.random() * 0.0003, p: Math.random() * 6 }));

    // 船の位置：停泊中は画面中央やや右、出航後は左の沖へ進みながら小さくなる
    function ship(now) {
      const base = Math.min(W, H * 0.8) / 300;
      if (tStart == null) return { x: W * 0.56, y: H * 0.6, s: base, k: 0 };
      const k = Math.min(1, (now - tStart) / SAIL);
      const e = 1 - Math.pow(1 - k, 2.2);
      return { x: W * (0.56 - 0.36 * e), y: H * (0.6 - 0.1 * e), s: base * (1 - 0.72 * e), k };
    }

    // 蒸気船（左向き）。原点は喫水線の中央
    function drawShip(f, now) {
      const s = f.s;
      ctx.save();
      ctx.translate(f.x, f.y + Math.sin(now / 600) * 2.5 * s);
      ctx.rotate(Math.sin(now / 900) * 0.012);
      ctx.scale(s, s);
      // 引き波
      if (tStart != null) {
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(100, 18 + i * 5); ctx.quadraticCurveTo(150 + i * 30, 22 + i * 6, 200 + i * 50, 18 + i * 9); ctx.stroke(); }
      }
      // マストと索具
      ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-82, -8); ctx.lineTo(-82, -96); ctx.moveTo(78, -8); ctx.lineTo(78, -86); ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-82, -96); ctx.lineTo(-128, -10); ctx.moveTo(-82, -96); ctx.lineTo(10, -78); ctx.moveTo(78, -86); ctx.lineTo(112, -10); ctx.moveTo(78, -86); ctx.lineTo(27, -78); ctx.stroke();
      // 船体
      ctx.fillStyle = '#1d1c20';
      ctx.beginPath(); ctx.moveTo(-132, -12); ctx.lineTo(112, -10); ctx.lineTo(102, 22); ctx.lineTo(-96, 22); ctx.quadraticCurveTo(-118, 10, -132, -12); ctx.fill();
      ctx.fillStyle = '#a8321e';
      ctx.beginPath(); ctx.moveTo(-104, 14); ctx.lineTo(104, 14); ctx.lineTo(102, 22); ctx.lineTo(-96, 22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e0b44c'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-124, -5); ctx.lineTo(108, -4); ctx.stroke();
      // 甲板室と窓
      ctx.fillStyle = '#efe6d2'; ctx.fillRect(-40, -34, 96, 24);
      ctx.fillStyle = '#3c3a38';
      for (let i = 0; i < 6; i++) ctx.fillRect(-32 + i * 15, -27, 7, 7);
      // 煙突
      ctx.fillStyle = '#1d1c20'; ctx.fillRect(0, -82, 22, 50);
      ctx.fillStyle = '#a8321e'; ctx.fillRect(0, -72, 22, 8);
      // 茶箱（蘭字つき）
      for (let i = 0; i < 3; i++) for (let j = 0; j < (i === 1 ? 2 : 1); j++) {
        const x = -112 + i * 22, y = -30 - j * 18;
        ctx.fillStyle = '#b48a55'; ctx.fillRect(x, y, 20, 18);
        // 蘭字（クリーム地・朱の枠・日の丸・富士）。画像を使うと撮影時に保存できない端末があるため図形で描く
        ctx.fillStyle = '#f3e7cc'; ctx.fillRect(x + 3, y + 2, 14, 14);
        ctx.strokeStyle = '#b3311c'; ctx.lineWidth = 1.4; ctx.strokeRect(x + 3.7, y + 2.7, 12.6, 12.6);
        ctx.fillStyle = '#b3311c'; ctx.beginPath(); ctx.arc(x + 10, y + 7.5, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3b5f8a'; ctx.beginPath(); ctx.moveTo(x + 5, y + 14); ctx.lineTo(x + 10, y + 8.5); ctx.lineTo(x + 15, y + 14); ctx.fill();
      }
      ctx.restore();
    }

    let raf;
    function frame(now) {
      ctx.clearRect(0, 0, W, H);
      const f = ship(now);

      // 海面のきらめき（船の足元）
      const sea = ctx.createLinearGradient(0, f.y - 10, 0, H);
      sea.addColorStop(0, 'rgba(40,90,120,0)'); sea.addColorStop(1, 'rgba(20,50,70,.35)');
      ctx.fillStyle = sea; ctx.fillRect(0, f.y - 10, W, H);

      // 煙（煙突の先から出て、後ろ上へ流れる）
      const sailing = tStart != null && f.k < 1;
      if (Math.random() < (sailing ? 0.6 : 0.25)) {
        smoke.push({ x: f.x + 11 * f.s, y: f.y - 84 * f.s, r: 6 * f.s, a: 0.55, vx: (sailing ? 0.9 : 0.3) * f.s + Math.random() * 0.3, vy: -0.5 - Math.random() * 0.4 });
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const p = smoke[i];
        p.x += p.vx; p.y += p.vy; p.r += 0.22; p.a -= 0.0045;
        if (p.a <= 0) { smoke.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(210,205,198,${p.a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }

      drawShip(f, now);

      // カモメ
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      gulls.forEach((g) => {
        g.x -= g.v * 16; if (g.x < -0.1) g.x = 1.1;
        const x = g.x * W, y = g.y * H + Math.sin(now / 500 + g.p) * 6, w = Math.sin(now / 180 + g.p) * 4;
        ctx.beginPath(); ctx.moveTo(x - 9, y - w); ctx.quadraticCurveTo(x - 4, y - 6, x, y); ctx.quadraticCurveTo(x + 4, y - 6, x + 9, y - w); ctx.stroke();
      });

      if (tStart != null && !ended && now - tStart > SAIL) finish();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    el.querySelector('[data-go]').onclick = () => {
      const synth = () => {
        try {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          whistle(ac, 0, 1.8);
          whistle(ac, 2.6, 1.2);
        } catch { /* 音が出せない端末でも演出は続ける */ }
      };
      audio = new Audio(WHISTLE_MP3);
      audio.play().catch(synth);
      navigator.vibrate?.([300, 200, 200]);
      tStart = performance.now();
      el.querySelector('[data-start]').classList.add('hidden');
      el.querySelector('[data-tag]').textContent = '● AR：開化の船、出航';
    };

    function finish() {
      ended = true;
      el.querySelector('[data-guide]').classList.add('hidden');
      el.querySelector('[data-tag]').textContent = 'AR：船は世界へ';
      el.querySelector('[data-end]').classList.remove('hidden');
    }

    function done(v) {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      ac?.close?.();
      audio?.pause();
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
      s.fillText('開化の船、出航 ― 清水港', W / 2, H - 38);
      s.fillStyle = '#f3ece0'; s.font = '500 11px "Noto Sans JP", sans-serif';
      s.fillText(`${new Date().toLocaleDateString('ja-JP')}　静岡市ツーリズム創生アプリ`, W / 2, H - 18);
      const blob = await cam.capture(stamp);
      ui.toast('写真をコレクションに保存しました');
      setTimeout(() => done(blob), 600);
    };
  });
}
