// ガイド：付近の店舗・施設を近い順に表示（カテゴリで絞り込み）
import { GUIDE_CATEGORIES, GUIDE_PLACES } from '../../data/guide.js';
import { geo, formatDistance, walkMinutes } from '../geo.js';
import { html, esc } from './components.js';

const CAT_LABEL = Object.fromEntries(GUIDE_CATEGORIES.map((c) => [c.id, c.label]));
let filter = 'all';

export function renderGuide(view) {
  const el = html(`
    <div class="screen with-nav">
      <div class="topbar"><h1>ガイド</h1></div>
      <div class="pad" style="padding-top:0"><div class="chips">${GUIDE_CATEGORIES.map((c) => `<button class="chip" data-cat="${c.id}">${esc(c.label)}</button>`).join('')}</div></div>
      <div class="scroll pad" style="padding-top:0"><div data-note class="small dim" style="margin-bottom:6px"></div><div data-list></div></div>
    </div>`);
  view.appendChild(el);

  function render() {
    el.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.cat === filter));
    const items = GUIDE_PLACES
      .filter((p) => filter === 'all' || p.category === filter)
      .map((p) => ({ ...p, d: geo.distanceTo(p) }))
      .sort((a, b) => (a.d ?? 0) - (b.d ?? 0));
    el.querySelector('[data-note]').textContent = geo.position ? '現在地から近い順' : '現在地を取得できないため地域順に表示しています';
    el.querySelector('[data-list]').innerHTML = items.map((p) => `
      <a class="list-item" style="color:inherit;text-decoration:none" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">
        <div class="grow">
          <div class="t">${esc(p.name)}</div>
          <div class="s">${esc(CAT_LABEL[p.category])}・${esc(p.area)}　${esc(p.note)}</div>
        </div>
        <div class="r">${p.d == null ? '' : `<b>${formatDistance(p.d)}</b>${p.d < 3000 ? `徒歩${walkMinutes(p.d)}分` : ''}`}</div>
      </a>`).join('');
  }
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]');
    if (c) { filter = c.dataset.cat; render(); }
  });
  render();
  return geo.onChange(render);
}
