// カメラ（背面カメラ映像の表示と撮影）
// 使い方:
//   const cam = await openCamera(container);   // container の中に <video> を敷く
//   const blob = await cam.capture(overlayCanvas?); // 映像（＋重ねた演出）を1枚の画像に
//   cam.close();

export async function openCamera(container) {
  const wrap = document.createElement('div');
  wrap.className = 'cam';
  container.prepend(wrap);

  let stream = null;
  let video = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1920 } },
      audio: false,
    });
    video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.srcObject = stream;
    wrap.appendChild(video);
    await video.play().catch(() => {});
  } catch {
    // カメラが使えない（許可なし・PCなど）場合は代替背景を出す
    const fb = document.createElement('div');
    fb.className = 'cam-fallback';
    fb.textContent = 'カメラを利用できません。ブラウザの設定でカメラを許可してください（このまま操作は続けられます）';
    wrap.appendChild(fb);
  }

  return {
    available: !!video,
    element: wrap,
    // 画面に見えている範囲（object-fit: cover）をそのまま切り出して保存する
    async capture(overlay) {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      if (video && video.videoWidth) {
        const vr = video.videoWidth / video.videoHeight;
        const cr = w / h;
        let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0;
        if (vr > cr) { sw = sh * cr; sx = (video.videoWidth - sw) / 2; } else { sh = sw / cr; sy = (video.videoHeight - sh) / 2; }
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, c.height);
        g.addColorStop(0, '#2c3b4c'); g.addColorStop(1, '#546e4e');
        ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      }
      if (overlay) ctx.drawImage(overlay, 0, 0, c.width, c.height);
      return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
    },
    close() {
      stream?.getTracks().forEach((t) => t.stop());
      wrap.remove();
    },
  };
}
