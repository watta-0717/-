// ミッション開始地点・スキャン地点の座標
// ※座標は地図上からの概算値です。現地で実測して更新してください（TODO: 現地確認）
// radius はミッション開始・スキャンが可能になる距離（m）

export const MISSION_SPOTS = {
  nihondaira: { name: '日本平夢テラス', lat: 34.974735, lng: 138.465898, radius: 150 }, // 2026-10-14 Googleマップの座標（FanLab）に更新
  kunozan:    { name: '久能山東照宮 楼門', lat: 34.964250, lng: 138.467154, radius: 150 }, // 2026-10-19 楼門の座標（Googleマップ）に更新
  miho:       { name: 'みほしるべ', lat: 34.99440, lng: 138.52237, radius: 150 }, // 2026-10-13 入口の座標（Googleマップ）に更新
  shimizu:    { name: 'エスパルスドリームプラザ', lat: 35.01270, lng: 138.49300, radius: 150 },
};

// 日本平ミッション：夢テラスからスマホを向ける対象（この順に方角を合わせる。方角は現在地からこの座標への向き）
// 2026-10-14 Googleマップの座標（FanLab）に更新。aim は合わせる幅（±度、省略時20）。三春瀧櫻は約74mと近くGPSのずれで方角がぶれるため広げる
export const NIHONDAIRA_SCAN_SPOTS = [
  { id: 'miharu',  name: '三春瀧櫻', lat: 34.975381, lng: 138.466106, radius: 80, aim: 30 },
  { id: 'chanoma', name: '茶畑',     lat: 34.978576, lng: 138.469636, radius: 80 },
  { id: 'statue',  name: '日本武尊像', lat: 34.977895, lng: 138.465478, radius: 80 },
];

// 三保松原ミッションのスキャン地点（順路どおり。浜辺は羽衣を返す場所でスキャンはしない）
// 2026-10-13 Googleマップで確認した座標に更新（現地での最終確認は未実施）
export const MIHO_SCAN_SPOTS = [
  { id: 'helene',   name: 'エレーヌの碑', lat: 34.99397, lng: 138.52241, radius: 80 },
  { id: 'hagoromo', name: '羽衣の松',     lat: 34.99391, lng: 138.52269, radius: 80 },
  { id: 'beach',    name: '浜辺（富士山眺望スポット）', lat: 34.99482, lng: 138.52550, radius: 100 },
];

// 久能山東照宮ミッションの地点（順路どおり。楼門で起動し、神廟をスキャン）
export const KUNOZAN_SCAN_SPOTS = [
  { id: 'romon',    name: '楼門', lat: 34.964250, lng: 138.467154, radius: 80 }, // 2026-10-19 Googleマップの座標（FanLab）に更新
  { id: 'shinbyo',  name: '神廟', lat: 34.965425, lng: 138.467969, radius: 60 }, // 同上
];

// 久能山東照宮ミッション：羅針盤クイズの埋葬先候補（方角の計算に使う。正解は日光東照宮）
export const KUNOZAN_DESTINATIONS = [
  { id: 'nikko',   name: '日光東照宮', lat: 36.75800, lng: 139.59880 },
  { id: 'edo',     name: '江戸城',     lat: 35.68520, lng: 139.75280 },
  { id: 'okazaki', name: '岡崎城',     lat: 34.95600, lng: 137.15920 },
];
// 羅針盤に「不死の道」の目印として表示する富士山
export const KUNOZAN_FUJI = { name: '富士山', lat: 35.36060, lng: 138.72740 };

// 清水港ミッションのスキャン地点（順不同。各地点で蘭字パーツを2枚ずつ獲得）
export const SHIMIZU_SCAN_SPOTS = [
  { id: 'wheel',  name: '観覧車',             short: '観覧車', lat: 35.01210, lng: 138.49560, radius: 80 },
  { id: 'rail',   name: '清水港線跡地',       short: '線路跡', lat: 35.01390, lng: 138.49440, radius: 80 },
  { id: 'jirocho', name: '次郎長生家',        short: '生家',   lat: 35.00563, lng: 138.49065, radius: 60 },
  { id: 'marine', name: '清水マリンパーク（岸壁）', short: '岸壁', lat: 35.00954, lng: 138.49432, radius: 80 },
];

// 地図の初期表示（4地域が収まる範囲）
export const MAP_BOUNDS = [[34.958, 138.455], [35.020, 138.530]];
