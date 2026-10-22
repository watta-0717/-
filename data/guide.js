// ガイド機能の掲載データ（見本）
// category: food（飲食）/ souvenir（お土産）/ sight（観光・施設）
// ※見本データです。掲載内容・座標・営業情報は公開前に確認・追加してください（TODO）

export const GUIDE_CATEGORIES = [
  { id: 'all', label: 'すべて' },
  { id: 'food', label: '飲食' },
  { id: 'souvenir', label: 'お土産' },
  { id: 'sight', label: '観光・施設' },
];

export const GUIDE_PLACES = [
  { name: '日本平夢テラス', category: 'sight', area: '日本平', lat: 34.97066, lng: 138.46360, note: '360°の展望回廊から富士山と駿河湾を一望' },
  { name: '日本平夢テラス カフェ', category: 'food', area: '日本平', lat: 34.97060, lng: 138.46370, note: '展望を眺めながら静岡茶とスイーツ' },
  { name: '日本平ホテル', category: 'food', area: '日本平', lat: 34.96920, lng: 138.46560, note: 'ラウンジ・レストランから「全景の茶の間」の眺め' },
  { name: '日本平ロープウェイ 日本平駅', category: 'sight', area: '日本平', lat: 34.96880, lng: 138.46830, note: '久能山東照宮へ空中散歩で約5分' },
  { name: '日本平山頂の売店', category: 'souvenir', area: '日本平', lat: 34.97000, lng: 138.46420, note: '静岡茶・わさび漬けなどのお土産' },
  { name: '久能山東照宮 博物館', category: 'sight', area: '久能山', lat: 34.96530, lng: 138.46890, note: '徳川家康ゆかりの品を展示' },
  { name: '久能山下 いちご街道の直売所', category: 'souvenir', area: '久能山', lat: 34.95950, lng: 138.47150, note: '冬〜春は石垣いちご' },
  { name: '三保松原 みほしるべ', category: 'sight', area: '三保松原', lat: 35.00050, lng: 138.52260, note: '三保松原の文化と歴史を紹介する施設' },
  { name: '三保の門前町の茶屋', category: 'food', area: '三保松原', lat: 35.00010, lng: 138.52050, note: 'お茶と甘味で一休み' },
  { name: 'エスパルスドリームプラザ', category: 'souvenir', area: '清水港', lat: 35.01270, lng: 138.49300, note: '観覧車・寿司横丁・お土産' },
  { name: '清水魚市場 河岸の市', category: 'food', area: '清水港', lat: 35.01600, lng: 138.49180, note: 'まぐろ料理と海産物' },
];
