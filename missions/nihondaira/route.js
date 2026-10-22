// 夢テラスまでの道案内：現在地と日本平夢テラスを地図に出し、距離と徒歩の目安を表示する
// 夢テラスに着く（開始半径の内側）と自動で閉じる。戻り値: true（到着）/ false（戻る）
// ※アプリ内の線は2点を結ぶ直線。道に沿った経路は Googleマップの徒歩ルートで見てもらう
import { formatDistance, walkMinutes } from '../../js/geo.js';

export function routeGuide(root, api) {
  const { ui, geo } = api;
  const { html, icons } = ui;
  const spot = api.mission.spot;
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}&travelmode=walking`;

  return new Promise((resolve) => {
    const el = html(`
      <div class="screen">
        <div style="position:relative;flex:1;min-height:0">
          <div data-map class="map-dark" style="position:absolute;inset:0"></div>
          <div class="topbar" style="position:absolute;left:0;right:0;top:0"><button class="icon-btn" data-back>${icons.back}</button><h1 style="text-shadow:0 1px 4px #000">日本平夢テラスへ</h1><span style="width:44px"></span></div>
        </div>
        <div class="pad" style="background:var(--bg);border-radius:18px 18px 0 0;margin-top:-16px;position:relative;z-index:2;padding-bottom:calc(16px + var(--safe-b))">
          <div class="label">ミッションの開始地点</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin:6px 0 4px">
            <div><h3 class="serif" style="margin:0;font-size:20px">${spot.name}</h3><div class="small sub">日本平の山頂・展望施設</div></div>
            <div class="r small sub" style="text-align:right" data-dist></div>
          </div>
          <p class="small sub" style="line-height:1.8;margin:8px 0 14px">夢テラスに着くと、自動でミッションが始められるようになります。ミッションは夢テラスから移動せずに遊べます。</p>
          <a class="btn" style="text-decoration:none;text-align:center" href="${gmaps}" target="_blank" rel="noopener">Googleマップで経路を見る</a>
          <button class="btn dark" data-here>夢テラスに着いた</button>
        </div>
      </div>`);
    root.appendChild(el);

    let map = null, me = null, line = null;
    if (window.L) {
      map = L.map(el.querySelector('[data-map]'), { zoomControl: false, attributionControl: true }).setView([spot.lat, spot.lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      L.marker([spot.lat, spot.lng], { icon: L.divIcon({ className: '', html: '<div style="display:flex;align-items:center;gap:6px"><div class="pin"><span>夢</span></div><span class="pin-label">日本平夢テラス</span></div>', iconSize: [34, 34], iconAnchor: [17, 34] }) }).addTo(map);
    }

    const distEl = el.querySelector('[data-dist]');
    function update(p) {
      const d = geo.distanceTo(spot);
      distEl.innerHTML = d == null ? '現在地を確認中' : `<b class="gold" style="font-size:18px;display:block">${formatDistance(d)}</b>${d < 5000 ? `徒歩 約${walkMinutes(d)}分` : '車・バスで山頂へ'}`;
      if (map && p) {
        const ll = [p.lat, p.lng];
        if (me) me.setLatLng(ll);
        else me = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
        if (line) line.setLatLngs([ll, [spot.lat, spot.lng]]);
        else {
          line = L.polyline([ll, [spot.lat, spot.lng]], { color: '#e0b44c', weight: 3, dashArray: '6 8' }).addTo(map);
          map.fitBounds([ll, [spot.lat, spot.lng]], { padding: [60, 60], maxZoom: 17 });
        }
      }
      if (geo.isNear(spot)) done(true);
    }
    const off = geo.onChange(update);
    update(geo.position);

    let closed = false;
    function done(v) {
      if (closed) return; closed = true;
      off(); map?.remove(); el.remove(); resolve(v);
    }
    el.querySelector('[data-back]').onclick = () => done(false);
    el.querySelector('[data-here]').onclick = () => {
      if (geo.isNear(spot)) return done(true);
      const d = geo.distanceTo(spot);
      ui.toast(d == null ? '現在地を確認できません。位置情報を許可してください' : `夢テラスまで あと約${formatDistance(Math.max(0, d - spot.radius))}です`);
    };
  });
}
