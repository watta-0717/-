// オリジナルAR富士山（2026-10-19 全体エンディング）
// カメラ映像の上に、生成した富士山を重ねる。ドラッグで位置、スライダーで大きさ（実際の富士山の方角には合わせない：差異AH）
// 戻り値: 「フォトカードへ」を押すと resolve
import { openCamera } from '../camera.js';
import { photos } from '../state.js';
import { html, toast } from './components.js';
import { drawSparkle, SPRITE_W, SPRITE_H } from './fuji-gen.js';

export function showFujiAR(view, { fuji, sprite }) {
  return new Promise(async (resolve) => {
    const el = html('<div class="screen" style="background:#000"></div>');
    view.appendChild(el);
    const cam = await openCamera(el);
    const canvas = document.createElement('canvas');
    canvas.className = 'overlay';
    cam.element.appendChild(canvas); // カメラ映像の上に重ねる（.cam canvas.overlay）

    el.insertAdjacentHTML('beforeend', `
      <div class="topbar"><span class="pill small" style="white-space:nowrap">● AR：あなただけの富士山</span><span style="flex:1"></span></div>
      <div data-drag style="position:absolute;left:0;right:0;top:64px;bottom:210px;touch-action:none;z-index:1"></div>
      <div class="center small" style="position:absolute;left:16px;right:16px;top:70px;z-index:2;pointer-events:none;text-shadow:0 1px 4px #000;line-height:1.8">
        指で動かして、好きな場所に富士山を置いてください</div>
      <div class="scan-bottom" style="z-index:2">
        <div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 14px">
          <span class="small dim" style="white-space:nowrap">大きさ</span>
          <input type="range" min="30" max="140" value="85" data-size style="flex:1">
        </div>
        <div class="scan-row" style="justify-content:center;margin-top:12px">
          <button class="shutter" data-shoot>撮影</button>
        </div>
        <button class="btn" data-card style="margin-top:12px">フォトカードへ</button>
      </div>
      <div class="flash"></div>`);

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    // 富士山の位置（裾の中央、画面に対する割合）と大きさ（画面幅に対する割合）
    const pos = { x: 0.5, y: 0.62 };
    let size = 0.85;
    function resize() {
      W = cam.element.clientWidth; H = cam.element.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    const t0 = performance.now();
    let raf = 0;
    function frame(now) {
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const fw = W * size, fh = (fw * SPRITE_H) / SPRITE_W;
      const x = pos.x * W - fw / 2, y = pos.y * H - fh;
      const appear = Math.min(1, t / 1.2);   // ふわっと現れる
      ctx.globalAlpha = appear;
      ctx.drawImage(sprite, x, y + (1 - appear) * 30, fw, fh);
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(x, y);
      drawSparkle(ctx, fw, fh, fuji, t, [0.05, 0, 0.9, 0.8]);
      ctx.restore();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // ドラッグで移動
    const drag = el.querySelector('[data-drag]');
    let start = null;
    drag.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; drag.setPointerCapture(e.pointerId); });
    drag.addEventListener('pointermove', (e) => {
      if (!start) return;
      pos.x = Math.max(0.05, Math.min(0.95, start.px + (e.clientX - start.x) / W));
      pos.y = Math.max(0.25, Math.min(1.05, start.py + (e.clientY - start.y) / H));
    });
    const end = () => { start = null; };
    drag.addEventListener('pointerup', end);
    drag.addEventListener('pointercancel', end);
    el.querySelector('[data-size]').oninput = (e) => { size = e.target.value / 100; };

    el.querySelector('[data-shoot]').onclick = async () => {
      const f = el.querySelector('.flash');
      f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      const blob = await cam.capture(canvas);
      if (blob) {
        await photos.add(blob, { missionId: 'ending', kind: 'ar', caption: 'オリジナルAR富士山' });
        toast('コレクションに保存しました');
      }
    };
    el.querySelector('[data-card]').onclick = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      cam.close();
      el.remove();
      resolve();
    };
  });
}
