// コレクション：時空の欠片・撮影した写真・記念フォトカード
import { store, photos } from '../state.js';
import { MISSIONS } from '../../missions/registry.js';
import { BAD_END } from '../../missions/kunozan/index.js';
import { html, esc, hexIcon, modal, icons } from './components.js';

const KIND_LABEL = { scan: 'スキャン', ar: 'AR演出', card: 'フォトカード' };

export function renderCollection(view, { openEnding }) {
  const urls = [];
  const s = store.get();
  const allClear = store.fragmentCount() === 4;
  // 久能山で見たバッドエンド（もしもの歴史）
  const ifs = (store.getMission('kunozan').badEnds ?? []).map((k) => BAD_END[k]).filter(Boolean);
  const el = html(`
    <div class="screen with-nav">
      <div class="topbar"><h1>コレクション</h1></div>
      <div class="scroll pad" style="padding-top:0">
        <div class="card">
          <div class="label">時空の欠片 ${store.fragmentCount()} / 4</div>
          <div class="frag-grid" style="margin-top:14px">
            ${MISSIONS.map((m) => {
              const f = s.fragments.find((x) => x.missionId === m.id);
              return `<div class="frag-cell">${hexIcon(f ? store.fragmentKanji(f.order) : '?', !!f, 48)}${esc(m.area)}</div>`;
            }).join('')}
          </div>
        </div>
        <div class="card">
          <div class="label">記念フォトカード</div>
          <p class="small sub" style="margin:8px 0 12px;line-height:1.7">${allClear ? '4つの時空を修復した証です。' : '4つの欠片を集めると「時空修復記念フォトカード」が発行されます。'}</p>
          <button class="btn ${allClear ? '' : 'dark'}" data-ending ${allClear ? '' : 'disabled'}>フォトカードを見る</button>
        </div>
        <div class="card">
          <div class="label">写真</div>
          <div class="grid" data-photos style="margin-top:12px"><div class="small dim" style="grid-column:1/-1">読み込み中…</div></div>
        </div>
        <div class="card">
          <div class="label">ストーリーの振り返り</div>
          ${MISSIONS.map((m) => `<div class="list-item"><div class="grow"><div class="t">${esc(m.area)}</div><div class="s">${esc(m.title)}</div></div><div class="r">${store.isCleared(m.id) ? '<b>修復済</b>' : '未修復'}</div></div>`).join('')}
        </div>
        ${ifs.length ? `<div class="card">
          <div class="label">もしもの歴史</div>
          <p class="small sub" style="margin:8px 0 4px;line-height:1.7">久能山東照宮で見た、別の結末です。</p>
          ${ifs.map((b) => `<div class="list-item"><div class="grow"><div class="t">${esc(b.name)}</div><div class="s">${b.text}</div></div></div>`).join('')}
        </div>` : ''}
      </div>
    </div>`);
  view.appendChild(el);
  el.querySelector('[data-ending]').onclick = () => allClear && openEnding();

  photos.all().then((list) => {
    const box = el.querySelector('[data-photos]');
    if (!list.length) { box.innerHTML = '<div class="small dim" style="grid-column:1/-1">まだ写真がありません。スキャンやAR演出で撮影した写真がここに並びます。</div>'; return; }
    box.innerHTML = '';
    list.reverse().forEach((p) => {
      const url = URL.createObjectURL(p.blob);
      urls.push(url);
      const img = html(`<img src="${url}" alt="${esc(p.caption)}">`);
      img.onclick = () => {
        const area = MISSIONS.find((m) => m.id === p.missionId)?.area ?? '';
        modal(`<img src="${url}" style="border-radius:10px;width:100%">
          <p class="small sub">${esc(area)}・${esc(KIND_LABEL[p.kind] ?? '')}　${esc(p.caption)}<br>${new Date(p.createdAt).toLocaleString('ja-JP')}</p>
          <a class="btn" style="text-decoration:none;display:flex;gap:8px;justify-content:center" href="${url}" download="shizuoka-${p.id}.jpg">${icons.download.replace('<svg', '<svg width="18"')} 保存する</a>`);
      };
      box.appendChild(img);
    });
  });

  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}
