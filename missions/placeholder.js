// 開発中ミッションの仮画面（各担当者の実装に置き換わるまで表示）
import { html, esc, icons } from '../js/ui/components.js';

export function placeholder(owner) {
  return async function start(root, api) {
    const el = html(`
      <div class="screen">
        <div class="topbar"><button class="icon-btn" data-back>${icons.back}</button><h1>${esc(api.mission.area)}</h1><span style="width:44px"></span></div>
        <div class="scroll pad" style="display:flex;flex-direction:column;justify-content:center">
          <div class="label center">MISSION</div>
          <h2 class="serif center" style="font-size:22px;line-height:1.6">${esc(api.mission.title)}</h2>
          <div class="card center" style="margin-top:20px">
            <h3>準備中</h3>
            <p class="sub small" style="line-height:1.8;margin:0">このミッションは現在開発中です（担当：${esc(owner)}）。<br>ほかの地域のミッションを先にお楽しみください。</p>
          </div>
          <div style="margin-top:24px">
            ${api.devMode ? '<button class="btn ghost" data-clear>［開発モード］クリア扱いにする</button>' : ''}
            <button class="btn dark" data-home>ホームに戻る</button>
          </div>
        </div>
      </div>`);
    root.appendChild(el);
    el.querySelector('[data-back]').onclick = api.exit;
    el.querySelector('[data-home]').onclick = api.exit;
    el.querySelector('[data-clear]')?.addEventListener('click', () =>
      api.complete({ heading: '修復 完了', message: `${api.mission.area}の歴史が修復された（開発用の仮クリア）` }));
  };
}
