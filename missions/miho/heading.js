// 三保の方角センサー（羽衣の舞の富士山探しと、ミッション確認画面の地図の現在地の向きで使う）
// コンパスは磁北基準なので、静岡の磁気偏角（西偏 約7°）で真北に直して返す
import * as compass from '../kunozan/compass.js';

export const DECLINATION = 7;

// 方角センサー（真北基準に補正して返す）。compass.js に真北補正つきの watchTrueHeading があればそれを使う
export function watchHeading(cb) {
  if (typeof compass.watchTrueHeading === 'function') return compass.watchTrueHeading((e) => cb(e.heading, e));
  const r = Math.PI / 180;
  // 背面カメラが向いている方角（端末を寝かせているときは上端の方角）
  const fromEuler = (a, b, g) => {
    const ca = Math.cos(a * r), sa = Math.sin(a * r), cb = Math.cos(b * r), sb = Math.sin(b * r), cg = Math.cos(g * r), sg = Math.sin(g * r);
    let x = -ca * sg - sa * sb * cg, y = -sa * sg + ca * sb * cg;
    if (Math.hypot(x, y) < 0.35) { x = -sa * cb; y = ca * cb; }
    return (Math.atan2(x, y) / r + 360) % 360;
  };
  const toTrue = (m) => (m - DECLINATION + 360) % 360;
  const onAbs = (e) => { if (e.alpha != null && e.beta != null) { const m = fromEuler(e.alpha, e.beta, e.gamma ?? 0); cb(toTrue(m), { source: 'android', magnetic: m }); } };
  const onAny = (e) => {
    if (e.webkitCompassHeading != null) cb(toTrue(e.webkitCompassHeading), { source: 'ios', magnetic: e.webkitCompassHeading, accuracy: e.webkitCompassAccuracy });
    else if (e.absolute) onAbs(e);
  };
  window.addEventListener('deviceorientationabsolute', onAbs);
  window.addEventListener('deviceorientation', onAny);
  return () => { window.removeEventListener('deviceorientationabsolute', onAbs); window.removeEventListener('deviceorientation', onAny); };
}
