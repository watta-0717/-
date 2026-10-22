// 神廟スキャンの画像判定：撮った写真が基準写真（神廟の宝塔）にどれだけ似ているかを 0〜1 で出す
// スマホの中だけで動く画像認識（TensorFlow.js ＋ MobileNet の特徴量）。通信は同梱ファイルの読み込みのみ
// 使い方: preloadShinbyoCheck() で先に読み込み → checkShinbyo(blob) で { ok, score } を受け取る
//   ok: true（合格）/ false（不合格）/ null（この端末では判定できない＝位置情報だけで判定する）

// 合格の基準値。基準写真が増えたら現地テストの結果で調整する（docs/step3_実装計画_久能山東照宮.md 参照）
export const THRESHOLD = 0.83;

// 基準写真。写真を増やすときはここに追加する
export const REFS = [
  'assets/img/kunozan/ref/shinbyo_ref0_deck.jpg', // 設計提案書から切り出した写真
  'assets/img/kunozan/ref/shinbyo_ref1.jpg',      // 2026-10-10 提供の写真
];

const LIB = new URL('./lib/tf.min.js', import.meta.url).href;
const MODEL = new URL('./model/model.json', import.meta.url).href;
const SIZE = 224;
const LOAD_TIMEOUT = 20000;

let loading = null; // 読み込み中の Promise（1回だけ読み込む）
let model = null;
let refVecs = [];

function loadScript(src) {
  if (window.tf) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = () => reject(new Error('script load failed'));
    document.head.appendChild(s);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src}`));
    img.src = src;
  });
}

// 画像の中央を正方形に切り抜き（zoom=0.8 なら中央80%）、224px にそろえる
function square(img, zoom = 1) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const s = Math.min(w, h) * zoom;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  c.getContext('2d').drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, SIZE, SIZE);
  return c;
}

// 特徴量（長さ1にそろえた256個の数）
function embed(canvas) {
  const tf = window.tf;
  return tf.tidy(() => {
    const x = tf.browser.fromPixels(canvas).toFloat().div(127.5).sub(1).expandDims(0);
    const v = model.predict(x).flatten();
    return v.div(v.norm()).dataSync().slice();
  });
}

const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// 先に読み込んでおく（失敗しても例外は出さず false を返す）
export function preloadShinbyoCheck() {
  if (!loading) {
    const job = (async () => {
      await loadScript(LIB);
      const tf = window.tf;
      try { await tf.setBackend('webgl'); } catch { /* 使えなければ下で cpu */ }
      if (tf.getBackend() !== 'webgl') await tf.setBackend('cpu');
      await tf.ready();
      model = await tf.loadLayersModel(MODEL);
      const imgs = await Promise.all(REFS.map(loadImage));
      refVecs = imgs.map((img) => embed(square(img)));
      return true;
    })();
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), LOAD_TIMEOUT));
    loading = Promise.race([job, timeout]).catch((e) => { console.warn('神廟の画像判定を読み込めませんでした', e); return false; });
  }
  return loading;
}

// 撮った写真（Blob）を判定する
export async function checkShinbyo(blob) {
  await preloadShinbyoCheck();
  if (!model || !refVecs.length) return { ok: null, score: null }; // 時間切れの後に読み込めていれば使う
  try {
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url).finally(() => URL.revokeObjectURL(url));
    // 中央の正方形と、少し寄った中央の2通りで比べ、いちばん似ている値を使う
    const vecs = [embed(square(img)), embed(square(img, 0.8))];
    const score = Math.max(...vecs.flatMap((v) => refVecs.map((r) => cosine(v, r))));
    return { ok: score >= THRESHOLD, score };
  } catch (e) {
    console.warn('神廟の画像判定に失敗しました', e);
    return { ok: null, score: null };
  }
}
