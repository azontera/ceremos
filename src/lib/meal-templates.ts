// 料理プラン（料理タブ「🍽 プランから選ぶ」用）
// 結婚式コース3プラン／宴会ビュッフェ3プラン／宴会コース3プラン の計9プラン。
// プラン適用は「クリアして上書き」（既存メニューを全削除してから作成）。
// 適用後は既存の編集UIで品目を自由に変更・追加・削除できる。

export type MealTemplateItem = { course: string; name: string; desc?: string; cost: number; price: number };
export type MealPlanKind = "wedding_course" | "banquet_buffet" | "banquet_course";
export type MealTemplate = { id: string; name: string; kind: MealPlanKind; desc: string; items: MealTemplateItem[] };

export const MEAL_KIND_LABELS: [MealPlanKind, string][] = [
  ["wedding_course", "💒 結婚式コース"],
  ["banquet_buffet", "🥂 宴会ビュッフェ"],
  ["banquet_course", "🍽 宴会コース"],
];

export const MEAL_TEMPLATES: MealTemplate[] = [
  // ===== 💒 結婚式コース 3プラン =====
  {
    id: "wedding_standard", name: "スタンダードコース", kind: "wedding_course",
    desc: "定番のフレンチフルコース。幅広い会場・ご予算に対応（1名 約15,800円）",
    items: [
      { course: "乾杯酒", name: "スパークリングワイン", cost: 300, price: 800 },
      { course: "前菜", name: "彩り前菜の盛り合わせ", desc: "旬野菜と魚介のマリネを添えて", cost: 900, price: 2600 },
      { course: "スープ", name: "季節野菜のポタージュ", cost: 400, price: 1400 },
      { course: "魚料理", name: "真鯛のポワレ", desc: "白ワインソース", cost: 1300, price: 3600 },
      { course: "肉料理", name: "牛フィレ肉のグリル", desc: "赤ワインソース", cost: 1900, price: 4800 },
      { course: "デザート", name: "ウェディングデザート", cost: 600, price: 1800 },
      { course: "パン・飲物", name: "パン・コーヒー", cost: 250, price: 800 },
    ],
  },
  {
    id: "wedding_premier", name: "プレミエコース", kind: "wedding_course",
    desc: "アミューズ・フォアグラ付きのワンランク上のコース（1名 約21,600円）",
    items: [
      { course: "乾杯酒", name: "スパークリングワイン（プレミア）", cost: 400, price: 1000 },
      { course: "アミューズ", name: "アミューズ・ブーシュ", cost: 450, price: 1200 },
      { course: "前菜", name: "オードブル・バリエ", cost: 1100, price: 3000 },
      { course: "前菜", name: "フォアグラのポワレ", desc: "ブリオッシュとともに", cost: 900, price: 2400 },
      { course: "スープ", name: "オマール海老のビスク", cost: 700, price: 2000 },
      { course: "魚料理", name: "鮮魚のヴァプール", desc: "サフランソース", cost: 1500, price: 4000 },
      { course: "肉料理", name: "牛フィレ肉のロッシーニ風", desc: "トリュフソース", cost: 2400, price: 5800 },
      { course: "デザート", name: "アシェットデセール", cost: 750, price: 2200 },
      { course: "パン・飲物", name: "自家製パン・コーヒー・小菓子", cost: 350, price: 1000 },
    ],
  },
  {
    id: "wedding_grand", name: "グランメゾンコース", kind: "wedding_course",
    desc: "肉・魚2品ずつの最上級フルコース（1名 約32,200円）",
    items: [
      { course: "乾杯酒", name: "シャンパーニュ", cost: 800, price: 1500 },
      { course: "アミューズ", name: "キャビアのカナッペ", cost: 900, price: 2000 },
      { course: "前菜", name: "帆立と鮮魚のミルフィーユ仕立て", cost: 1200, price: 3200 },
      { course: "前菜", name: "フォアグラと無花果のテリーヌ", cost: 1100, price: 2800 },
      { course: "スープ", name: "トリュフ香るコンソメロワイヤル", cost: 800, price: 2200 },
      { course: "魚料理", name: "オマール海老のテルミドール", cost: 2200, price: 5500 },
      { course: "お口直し", name: "シャンパーニュのグラニテ", cost: 250, price: 600 },
      { course: "肉料理", name: "国産牛フィレ肉のポワレ トリュフソース", cost: 3200, price: 7500 },
      { course: "肉料理", name: "鴨胸肉のロースト", cost: 1300, price: 3200 },
      { course: "デザート", name: "グランデセール", desc: "ワゴンサービス", cost: 900, price: 2500 },
      { course: "パン・飲物", name: "自家製パン・食後のお飲物・プティフール", cost: 400, price: 1200 },
    ],
  },

  // ===== 🥂 宴会ビュッフェ 3プラン =====
  {
    id: "buffet_casual", name: "カジュアルビュッフェ", kind: "banquet_buffet",
    desc: "気軽な立食・二次会向け（1名 約8,000円）",
    items: [
      { course: "前菜", name: "サラダ・生野菜盛り合わせ", cost: 300, price: 900 },
      { course: "前菜", name: "オードブル盛り合わせ（冷製）", cost: 500, price: 1400 },
      { course: "肉料理", name: "唐揚げ・フライ盛り合わせ", cost: 700, price: 1900 },
      { course: "肉料理", name: "ローストチキンのハーブ風味", cost: 700, price: 1800 },
      { course: "パン・飲物", name: "ライス・パン・ドリンクバー", cost: 500, price: 1300 },
      { course: "デザート", name: "デザート・フルーツ盛り合わせ", cost: 300, price: 700 },
    ],
  },
  {
    id: "buffet_standard", name: "スタンダードビュッフェ", kind: "banquet_buffet",
    desc: "ローストビーフ実演付きの定番ビュッフェ（1名 約14,600円）",
    items: [
      { course: "前菜", name: "サラダ・生野菜盛り合わせ", cost: 300, price: 900 },
      { course: "前菜", name: "オードブル盛り合わせ（冷製）", cost: 600, price: 1700 },
      { course: "スープ", name: "本日のスープ（2種）", cost: 300, price: 900 },
      { course: "魚料理", name: "鮮魚のポワレ", cost: 900, price: 2500 },
      { course: "肉料理", name: "ローストビーフ", desc: "その場でカービング", cost: 1400, price: 3600 },
      { course: "肉料理", name: "唐揚げ・フライ盛り合わせ", cost: 700, price: 1900 },
      { course: "パン・飲物", name: "ライス・パン・ドリンクバー", cost: 500, price: 1400 },
      { course: "デザート", name: "デザート・フルーツ盛り合わせ", cost: 600, price: 1700 },
    ],
  },
  {
    id: "buffet_premium", name: "プレミアムビュッフェ", kind: "banquet_buffet",
    desc: "シェフ実演の一皿を加えた上質なビュッフェ（1名 約21,500円）",
    items: [
      { course: "前菜", name: "生ハム・チーズの盛り合わせ", cost: 900, price: 2400 },
      { course: "前菜", name: "オマール海老とアボカドのサラダ", cost: 800, price: 2100 },
      { course: "スープ", name: "オマール海老のビスク", cost: 700, price: 2000 },
      { course: "魚料理", name: "真鯛のカルパッチョ", cost: 1000, price: 2600 },
      { course: "肉料理", name: "牛フィレ肉のステーキ（シェフ実演）", cost: 2200, price: 5200 },
      { course: "肉料理", name: "ローストチキンのハーブ風味", cost: 1000, price: 2600 },
      { course: "パン・飲物", name: "自家製パン・リゾット・ドリンクバー", cost: 700, price: 1800 },
      { course: "デザート", name: "パティシエ特製デザートビュッフェ", cost: 1000, price: 2800 },
    ],
  },

  // ===== 🍽 宴会コース 3プラン =====
  {
    id: "banquet_casual", name: "宴会カジュアルコース", kind: "banquet_course",
    desc: "品数を絞ったお手頃コース。会議後の会食・小宴会に（1名 約8,600円）",
    items: [
      { course: "乾杯酒", name: "スパークリングワイン", cost: 280, price: 700 },
      { course: "前菜", name: "本日の前菜盛り合わせ", cost: 700, price: 1900 },
      { course: "スープ", name: "本日のスープ", cost: 350, price: 1000 },
      { course: "肉料理", name: "国産鶏のロースト", desc: "季節野菜添え", cost: 1200, price: 3000 },
      { course: "デザート", name: "デザート盛り合わせ", cost: 450, price: 1300 },
      { course: "パン・飲物", name: "パン・コーヒー", cost: 220, price: 700 },
    ],
  },
  {
    id: "banquet_standard", name: "宴会スタンダードコース", kind: "banquet_course",
    desc: "魚・肉の揃った着席コース。式典・祝賀会の定番（1名 約13,300円）",
    items: [
      { course: "乾杯酒", name: "スパークリングワイン", cost: 300, price: 800 },
      { course: "前菜", name: "彩り前菜の盛り合わせ", cost: 800, price: 2200 },
      { course: "スープ", name: "季節野菜のポタージュ", cost: 400, price: 1200 },
      { course: "魚料理", name: "鮮魚のポワレ", desc: "白ワインソース", cost: 1100, price: 3000 },
      { course: "肉料理", name: "牛ロース肉のグリル", desc: "赤ワインソース", cost: 1700, price: 4200 },
      { course: "デザート", name: "デザート盛り合わせ", cost: 500, price: 1300 },
      { course: "パン・飲物", name: "パン・コーヒー", cost: 220, price: 600 },
    ],
  },
  {
    id: "banquet_premium", name: "宴会プレミアムコース", kind: "banquet_course",
    desc: "ディナーショー・VIP宴会向けの上位コース（1名 約19,900円）",
    items: [
      { course: "乾杯酒", name: "シャンパーニュ", cost: 700, price: 1400 },
      { course: "アミューズ", name: "アミューズ・ブーシュ", cost: 450, price: 1100 },
      { course: "前菜", name: "帆立と鮮魚のカルパッチョ", cost: 1000, price: 2600 },
      { course: "スープ", name: "オマール海老のビスク", cost: 700, price: 1900 },
      { course: "魚料理", name: "鮮魚のヴァプール", desc: "サフランソース", cost: 1400, price: 3600 },
      { course: "肉料理", name: "国産牛フィレ肉のポワレ", cost: 2600, price: 6100 },
      { course: "デザート", name: "アシェットデセール", cost: 700, price: 2100 },
      { course: "パン・飲物", name: "自家製パン・コーヒー・小菓子", cost: 350, price: 1100 },
    ],
  },
];

export function mealTemplateById(id: string): MealTemplate | undefined {
  return MEAL_TEMPLATES.find((t) => t.id === id);
}
