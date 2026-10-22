// エンディング：「時空修復記念フォトカード」の発行
// オリジナルAR富士山 … 旅の途中で撮った写真の色・明るさから、人ごとに違う富士山を描く（2026-10-19 コラージュから変更）
// 流れ：ストーリー → 富士山の生成演出 → AR富士山（撮影できる）→ フォトカード（2回目以降はAR富士山から）
import { store, photos } from '../state.js';
import { MISSIONS } from '../../missions/registry.js';
import { html, esc, story, icons, toast } from './components.js';
import { analyzePhotos, buildFuji, renderFujiSprite, drawSky, drawSparkle, SPRITE_W, SPRITE_H } from './fuji-gen.js';
import { showFujiAR } from './fuji-ar.js';

const W = 1080, H = 1440;

// 富士山のもとにする写真（スキャン・AR演出で撮ったもの。フォトカードとエンディングで撮った写真は使わない）
async function sourcePhotos() {
  return (await photos.all()).filter((p) => p.kind !== 'card' && p.missionId !== 'ending');
}

export async function makeFuji() {
  const s = store.get();
  const list = await sourcePhotos();
  const analysis = await analyzePhotos(list);
  const fuji = buildFuji({ playerName: s.playerName, fragments: s.fragments, analysis });
  return { fuji, sprite: renderFujiSprite(fuji), list };
}

export async function drawPhotoCard({ fuji, sprite }) {
  const s = store.get();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // 背景：写真の色から決めた空
  drawSky(ctx, W, H, fuji, { horizon: 0.72 });
  // 富士山
  const cx = W / 2, base = 1010, fw = 1020, fh = (fw * SPRITE_H) / SPRITE_W;
  ctx.drawImage(sprite, cx - fw / 2, base - fh, fw, fh);
  // 下側を暗くして文字を読みやすくする
  const foot = ctx.createLinearGradient(0, base - 120, 0, H);
  foot.addColorStop(0, 'rgba(18,15,12,0)'); foot.addColorStop(0.35, 'rgba(18,15,12,.92)'); foot.addColorStop(1, '#120f0c');
  ctx.fillStyle = foot; ctx.fillRect(0, base - 120, W, H - base + 120);
  // 上側も少し暗くしてタイトルを読みやすくする
  const top = ctx.createLinearGradient(0, 0, 0, 320);
  top.addColorStop(0, 'rgba(10,8,12,.55)'); top.addColorStop(1, 'rgba(10,8,12,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 320);
  ctx.save(); ctx.translate(cx - fw / 2, base - fh);
  drawSparkle(ctx, fw, fh, fuji, 0.8, [0.05, 0, 0.9, 0.8]);
  ctx.restore();

  // 枠
  ctx.strokeStyle = 'rgba(224,180,76,.7)'; ctx.lineWidth = 3; ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.strokeStyle = 'rgba(224,180,76,.3)'; ctx.lineWidth = 1; ctx.strokeRect(50, 50, W - 100, H - 100);

  // 文字
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12;
  ctx.fillStyle = '#e0b44c';
  ctx.font = '700 30px "Noto Sans JP", sans-serif';
  ctx.fillText('C E R T I F I C A T E', cx, 140);
  ctx.fillStyle = '#f3ece0';
  ctx.font = '800 76px "Noto Serif JP", serif';
  ctx.fillText('時空修復記念', cx, 240);
  ctx.shadowBlur = 0;

  ctx.font = '600 34px "Noto Serif JP", serif';
  ctx.fillStyle = '#b9ad99';
  ctx.fillText('時空修復師', cx, 1100);
  ctx.font = '800 64px "Noto Serif JP", serif';
  ctx.fillStyle = '#f3ece0';
  ctx.fillText(s.playerName || '旅人', cx, 1180);

  // 欠片（縁の色はそれぞれの地域の山肌の色）
  const last = s.fragments.reduce((a, f) => (f.clearedAt > a ? f.clearedAt : a), '');
  MISSIONS.forEach((m, k) => {
    const x = cx + (k - 1.5) * 200, y = 1252;
    const f = s.fragments.find((v) => v.missionId === m.id);
    const band = fuji.bands[fuji.areaIds.indexOf(m.id)];
    ctx.beginPath();
    for (let a = 0; a < 6; a++) ctx.lineTo(x + 28 * Math.cos(Math.PI / 6 + (a * Math.PI) / 3), y + 28 * Math.sin(Math.PI / 6 + (a * Math.PI) / 3));
    ctx.closePath();
    ctx.fillStyle = f ? '#e0b44c' : '#3a332c'; ctx.fill();
    if (f && band) { ctx.strokeStyle = `rgb(${band.map(Math.round).join(',')})`; ctx.lineWidth = 5; ctx.stroke(); }
    ctx.fillStyle = '#2a1f0a'; ctx.font = '800 26px "Noto Serif JP", serif';
    ctx.fillText(f ? store.fragmentKanji(f.order) : '', x, y + 9);
    ctx.fillStyle = '#b9ad99'; ctx.font = '500 22px "Noto Sans JP", sans-serif';
    ctx.fillText(m.area, x, y + 62);
  });

  ctx.fillStyle = '#7d7364'; ctx.font = '500 22px "Noto Sans JP", sans-serif';
  ctx.fillText(`${last ? new Date(last).toLocaleString('ja-JP', { dateStyle: 'long', timeStyle: 'short' }) : ''}　静岡市ツーリズム創生アプリ`, cx, H - 62);

  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
}

// 富士山の生成演出：写真が並び、その色が流れ込んで、山が下から描かれていく
function showGenerate(view, { fuji, sprite, list }) {
  return new Promise((resolve) => {
    const el = html(`
      <div class="screen" style="background:#0d0b14">
        <canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas>
        <div data-text class="center" style="position:absolute;left:20px;right:20px;bottom:calc(40px + var(--safe-b));opacity:0;transition:opacity .8s">
          <div class="story-text" style="margin-bottom:6px">旅の記憶から、<br>あなただけの富士山が生まれた。</div>
          <div class="small sub" style="margin-bottom:16px;line-height:1.8">${list.length ? `撮影した${list.length}枚の写真の色から描かれています` : '4つの地の色から描かれています'}</div>
          <button class="btn" data-go>ARで見る</button>
        </div>
      </div>`);
    view.appendChild(el);
    const canvas = el.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth, h = el.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);

    // 写真の小さな見本（最大8枚）
    const thumbs = list.slice(-8).map((p) => {
      const url = URL.createObjectURL(p.blob);
      const img = new Image();
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
      return img;
    });
    const tw = Math.min(56, (w - 40) / Math.max(1, thumbs.length) - 6);
    const thumbPos = thumbs.map((_, k) => ({ x: w / 2 + (k - (thumbs.length - 1) / 2) * (tw + 6), y: h * 0.14 }));
    // 色の粒（写真の位置から富士山へ）
    const r = fuji.rand();
    const fw = Math.min(w * 0.95, 520), fh = (fw * SPRITE_H) / SPRITE_W, fx = w / 2 - fw / 2, fbase = h * 0.66;
    const dots = Array.from({ length: 160 }, (_, i) => {
      const from = thumbPos.length ? thumbPos[i % thumbPos.length] : { x: r() * w, y: h * 0.1 };
      return { sx: from.x, sy: from.y, tx: fx + fw * (0.2 + r() * 0.6), ty: fbase - fh * r() * 0.8, c: fuji.bands[i % 4], d: r() * 0.6 };
    });

    const t0 = performance.now();
    let raf = 0, shown = false;
    function frame(now) {
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // 空がだんだん現れる
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, (t - 0.8) / 1.6));
      drawSky(ctx, w, h, fuji, { horizon: 0.66 });
      ctx.restore();
      // 地面（文字を読みやすくする）
      const ground = ctx.createLinearGradient(0, fbase - 30, 0, h);
      ground.addColorStop(0, 'rgba(13,11,20,0)'); ground.addColorStop(0.25, '#0d0b14'); ground.addColorStop(1, '#0d0b14');
      ctx.fillStyle = ground; ctx.fillRect(0, fbase - 30, w, h - fbase + 30);
      // 写真の見本
      const ta = t < 0.8 ? t / 0.8 : Math.max(0, 1 - (t - 2.2) / 0.6);
      thumbs.forEach((img, k) => {
        if (!img.complete || !img.naturalWidth) return;
        ctx.globalAlpha = Math.max(0, Math.min(1, ta - k * 0.06));
        const p = thumbPos[k];
        ctx.drawImage(img, p.x - tw / 2, p.y - tw / 2, tw, tw);
        ctx.strokeStyle = '#e0b44c'; ctx.lineWidth = 1; ctx.strokeRect(p.x - tw / 2, p.y - tw / 2, tw, tw);
      });
      ctx.globalAlpha = 1;
      // 山が下から描かれる
      const grow = Math.min(1, Math.max(0, (t - 0.9) / 1.8));
      if (grow > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, fbase - fh * grow, w, fh * grow + 2); ctx.clip();
        ctx.drawImage(sprite, fx, fbase - fh, fw, fh);
        ctx.restore();
      }
      // 色の粒
      dots.forEach((d) => {
        const k = Math.min(1, Math.max(0, (t - 0.6 - d.d) / 1.4));
        if (k <= 0 || k >= 1) return;
        const e = k * k * (3 - 2 * k);
        ctx.fillStyle = `rgba(${d.c.map(Math.round).join(',')},${1 - k * 0.6})`;
        ctx.beginPath(); ctx.arc(d.sx + (d.tx - d.sx) * e, d.sy + (d.ty - d.sy) * e, 3, 0, Math.PI * 2); ctx.fill();
      });
      if (t > 2.8) { ctx.save(); ctx.translate(fx, fbase - fh); drawSparkle(ctx, fw, fh, fuji, t, [0.05, 0, 0.9, 0.8]); ctx.restore(); }
      if (t > 2.9 && !shown) { shown = true; el.querySelector('[data-text]').style.opacity = 1; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    el.querySelector('[data-go]').onclick = () => { cancelAnimationFrame(raf); el.remove(); resolve(); };
  });
}

export async function showEnding(view, { onClose }) {
  const s = store.get();
  const first = !s.endingSeenAt;
  if (first) {
    await story(view, {
      pages: [
        { bg: 'assets/img/nihondaira/fuji_view.jpg', text: '四つの欠片が、ひとつに重なった。', note: '日本平の炎、久能山の遺言、三保の羽衣、清水港の船出。<br>富士をめぐる歴史は、正しい流れを取り戻した。' },
        { bg: 'assets/img/nihondaira/fuji_view.jpg', text: `ありがとう、${esc(s.playerName || '旅人')}。`, note: 'あなたの旅の記憶から、ひとつの富士が形づくられていく――' },
      ],
    });
  }

  const made = await makeFuji();
  if (first) await showGenerate(view, made);
  await showFujiAR(view, made);

  const el = html(`
    <div class="screen">
      <div class="topbar"><button class="icon-btn" data-back>${icons.back}</button><h1>時空修復記念フォトカード</h1><span style="width:44px"></span></div>
      <div class="scroll pad" style="padding-top:0">
        <div data-card class="center sub small" style="aspect-ratio:3/4;display:grid;place-items:center;border:1px solid var(--line);border-radius:12px">カードを作成中…</div>
        <p class="small sub" style="line-height:1.8">「オリジナル富士山」は、あなたが旅の途中で撮影した写真の色と明るさから描かれています。</p>
        <a class="btn" data-save style="text-decoration:none;text-align:center;display:block">画像を保存する</a>
        <button class="btn dark" data-share>共有する</button>
        <button class="btn dark" data-ar>AR富士山をもう一度</button>
      </div>
    </div>`);
  view.appendChild(el);
  el.querySelector('[data-back]').onclick = onClose;
  el.querySelector('[data-ar]').onclick = async () => {
    el.style.display = 'none';
    await showFujiAR(view, made);
    el.style.display = '';
  };

  const blob = await drawPhotoCard(made);
  const url = URL.createObjectURL(blob);
  el.querySelector('[data-card]').outerHTML = `<img src="${url}" alt="時空修復記念フォトカード" style="border-radius:12px;box-shadow:0 0 40px rgba(224,180,76,.25)">`;
  const save = el.querySelector('[data-save]');
  save.href = url; save.download = 'jikuu-shufuku-card.jpg';
  el.querySelector('[data-share]').onclick = async () => {
    const file = new File([blob], 'jikuu-shufuku-card.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '時空修復記念フォトカード' }); } catch { /* キャンセル */ }
    } else toast('この端末では共有に対応していません。「画像を保存する」をご利用ください');
  };

  if (first) {
    store.set({ endingSeenAt: new Date().toISOString() });
    photos.add(blob, { missionId: 'ending', kind: 'card', caption: '時空修復記念フォトカード' });
  }
}
