// 三保松原スキャンの画像判定：撮った写真が対象（エレーヌの碑／羽衣の松）の基準写真にどれだけ似ているかを 0〜1 で出す
// 久能山の神廟スキャン（missions/kunozan/shinbyo-check.js）と同じ方式。ライブラリとモデルは久能山の同梱ファイルを共用する
// 使い方: preloadMihoCheck() で先に読み込み → checkMiho(id, blob) で { ok, score } を受け取る
//   ok: true（合格）/ false（不合格）/ null（この端末では判定できない＝位置情報だけで判定する）

// 合格の基準値（対象ごと）。2026-10-12 の試作で決めた値。現地テストの結果で調整する（docs/step3_実装計画_三保松原.md 6章）
export const THRESHOLD = { helene: 0.80, hagoromo: 0.78 };

// 基準写真。写真を増やすときはここに追加する
export const REFS = {
  helene: [
    'assets/img/miho/ref/helene_ref1.jpg',      // 2026-10-12 提供の写真
    'assets/img/miho/ref/helene_ref2.jpg',
  ],
  hagoromo: [
    'assets/img/miho/ref/hagoromo_ref0_deck.jpg', // 設計提案書から切り出した写真
    'assets/img/miho/ref/hagoromo_ref1.jpg',      // 2026-10-12 提供の写真
    'assets/img/miho/ref/hagoromo_ref2.jpg',
    'assets/img/miho/ref/hagoromo_ref3.jpg',
  ],
};

// 久能山担当のファイルを読み込むだけ（中身は変更しない）
const LIB = new URL('../kunozan/lib/tf.min.js', import.meta.url).href;
const MODEL = new URL('../kunozan/model/model.json', import.meta.url).href;
const SIZE = 224;
const LOAD_TIMEOUT = 20000;

let loading = null; // 読み込み中の Promise（1回だけ読み込む）
let model = null;
const refVecs = {};

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
export function preloadMihoCheck() {
  if (!loading) {
    const job = (async () => {
      await loadScript(LIB);
      const tf = window.tf;
      try { await tf.setBackend('webgl'); } catch { /* 使えなければ下で cpu */ }
      if (tf.getBackend() !== 'webgl') await tf.setBackend('cpu');
      await tf.ready();
      model = await tf.loadLayersModel(MODEL);
      for (const [id, list] of Object.entries(REFS)) {
        const imgs = await Promise.all(list.map(loadImage));
        refVecs[id] = imgs.map((img) => embed(square(img)));
      }
      return true;
    })();
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), LOAD_TIMEOUT));
    loading = Promise.race([job, timeout]).catch((e) => { console.warn('三保の画像判定を読み込めませんでした', e); return false; });
  }
  return loading;
}

// 写真の特徴量（中央の正方形と、少し寄った中央の2通り）
async function photoVecs(blob) {
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url).finally(() => URL.revokeObjectURL(url));
  return [embed(square(img)), embed(square(img, 0.8))];
}

const best = (vecs, refs) => Math.max(...vecs.flatMap((v) => refs.map((r) => cosine(v, r))));

// 撮った写真（Blob）を対象 id（'helene' / 'hagoromo'）の基準写真と比べる
export async function checkMiho(id, blob) {
  await preloadMihoCheck();
  const refs = refVecs[id];
  if (!model || !refs?.length) return { ok: null, score: null }; // 時間切れの後に読み込めていれば使う
  try {
    const score = best(await photoVecs(blob), refs);
    return { ok: score >= THRESHOLD[id], score };
  } catch (e) {
    console.warn('三保の画像判定に失敗しました', e);
    return { ok: null, score: null };
  }
}

// 基準値の調整用（開発時のみ使用）：対象ごとのいちばん高い類似度を返す
export async function scoresFor(blob) {
  await preloadMihoCheck();
  if (!model) return null;
  const vecs = await photoVecs(blob);
  return Object.fromEntries(Object.entries(refVecs).map(([id, refs]) => [id, best(vecs, refs)]));
}
