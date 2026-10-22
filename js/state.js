// 進行状況の保存（端末内）
// 軽いデータは localStorage、写真は IndexedDB に保存する

const KEY = 'shizuoka-tourism-v1';
const KANJI = ['壱', '弐', '参', '四'];

const defaults = () => ({
  playerName: '',
  onboarded: false,
  devMode: false,
  demo: false,
  // 欠片: [{ missionId, order(1-4), clearedAt }]
  fragments: [],
  // ミッションごとの途中経過（各ミッションが自由に使う）
  missions: {},
  endingSeenAt: null,
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    return defaults();
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 容量超過などは無視 */ }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get: () => state,
  set(patch) { state = { ...state, ...patch }; save(); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  isCleared: (missionId) => state.fragments.some((f) => f.missionId === missionId),
  fragmentCount: () => state.fragments.length,

  // クリアした順に「壱・弐・参・四」を付与する（回遊順は自由）
  addFragment(missionId) {
    const existing = state.fragments.find((f) => f.missionId === missionId);
    if (existing) return existing;
    const frag = { missionId, order: state.fragments.length + 1, clearedAt: new Date().toISOString() };
    state = { ...state, fragments: [...state.fragments, frag] };
    save();
    return frag;
  },
  fragmentKanji: (order) => KANJI[order - 1] ?? '',

  getMission: (id) => state.missions[id] ?? {},
  setMission(id, patch) {
    state = { ...state, missions: { ...state.missions, [id]: { ...(state.missions[id] ?? {}), ...patch } } };
    save();
  },

  async reset() {
    state = defaults();
    save();
    await photos.clear();
  },
};

// ---------- 写真（IndexedDB） ----------
const DB_NAME = 'shizuoka-tourism-photos';
let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('photos', mode);
    const r = fn(t.objectStore('photos'));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  }));
}

export const photos = {
  // kind: 'scan' | 'ar' | 'card'
  add: (blob, { missionId, kind, caption }) =>
    tx('readwrite', (s) => s.add({ blob, missionId, kind, caption, createdAt: new Date().toISOString() })).catch(() => null),
  all: () => tx('readonly', (s) => s.getAll()).catch(() => []),
  clear: () => tx('readwrite', (s) => s.clear()).catch(() => null),
};
