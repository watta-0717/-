// 4地域のミッション登録表
// 各担当者は missions/<id>/index.js を作れば母体に組み込まれます。
// 仕様は docs/ミッション共通仕様.md を参照。
import { MISSION_SPOTS } from '../data/spots.js';

export const MISSIONS = [
  {
    id: 'nihondaira',
    area: '日本平',
    title: '草薙の刃文を合わせ、炎を払え！',
    subtitle: '草薙の剣',
    spot: MISSION_SPOTS.nihondaira,
    load: () => import('./nihondaira/index.js'),
  },
  {
    id: 'kunozan',
    area: '久能山東照宮',
    title: '次の埋葬先を指し、富士を越える「不死の道」を開け！',
    subtitle: '遺言の行方',
    spot: MISSION_SPOTS.kunozan,
    load: () => import('./kunozan/index.js'),
  },
  {
    id: 'miho',
    area: '三保松原',
    title: '天女と漁師の間を取り持ち、羽衣の舞を成立させよ！',
    subtitle: '羽衣の舞',
    spot: MISSION_SPOTS.miho,
    load: () => import('./miho/index.js'),
  },
  {
    id: 'shimizu',
    area: '清水港',
    title: '次郎長と共に「蘭字」を完成させ、開化の船を出航させよ！',
    subtitle: '開化の船',
    spot: MISSION_SPOTS.shimizu,
    load: () => import('./shimizu/index.js'),
  },
];

export const getMission = (id) => MISSIONS.find((m) => m.id === id);
