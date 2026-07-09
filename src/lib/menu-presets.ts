// 見積テンプレのグレードに対応するコースメニュープリセット（原価・売値付き）
// 見積テンプレ適用時に料理タブへ自動作成される（既にメニューがある場合は触らない）

export type MenuPresetItem = { course: string; name: string; desc?: string; cost: number; price: number };

const STANDARD: MenuPresetItem[] = [
  { course: "乾杯酒", name: "スパークリングワイン", cost: 300, price: 800 },
  { course: "アミューズ", name: "季節のアミューズ", desc: "シェフからの小さなお愉しみ", cost: 350, price: 1000 },
  { course: "前菜", name: "彩り前菜の盛り合わせ", desc: "旬野菜と魚介のマリネを添えて", cost: 900, price: 2600 },
  { course: "スープ", name: "季節野菜のポタージュ", cost: 400, price: 1400 },
  { course: "魚料理", name: "真鯛のポワレ", desc: "白ワインソース 季節野菜を添えて", cost: 1300, price: 3600 },
  { course: "お口直し", name: "グラニテ", cost: 150, price: 500 },
  { course: "肉料理", name: "牛フィレ肉のグリル", desc: "赤ワインソース", cost: 1900, price: 4800 },
  { course: "デザート", name: "ウェディングデザート", desc: "パティシエ特製", cost: 600, price: 1800 },
  { course: "パン・飲物", name: "パン・コーヒー", cost: 250, price: 800 },
];

const PREMIER: MenuPresetItem[] = [
  { course: "乾杯酒", name: "スパークリングワイン（プレミア）", cost: 400, price: 1000 },
  { course: "アミューズ", name: "アミューズ・ブーシュ", desc: "シャンパンに合う一口前菜", cost: 450, price: 1200 },
  { course: "前菜", name: "オードブル・バリエ", desc: "鮮魚のカルパッチョと季節の前菜", cost: 1100, price: 3000 },
  { course: "前菜", name: "フォアグラのポワレ", desc: "ブリオッシュとともに", cost: 900, price: 2400 },
  { course: "スープ", name: "オマール海老のビスク", cost: 700, price: 2000 },
  { course: "魚料理", name: "鮮魚のヴァプール", desc: "サフランソース", cost: 1500, price: 4000 },
  { course: "お口直し", name: "シトラスのグラニテ", cost: 180, price: 500 },
  { course: "肉料理", name: "牛フィレ肉のロッシーニ風", desc: "トリュフソース", cost: 2400, price: 5800 },
  { course: "デザート", name: "アシェットデセール", desc: "パティシエが目の前で仕上げる一皿", cost: 750, price: 2200 },
  { course: "パン・飲物", name: "自家製パン・コーヒー・小菓子", cost: 350, price: 1000 },
];

const GRAND: MenuPresetItem[] = [
  { course: "乾杯酒", name: "シャンパーニュ", cost: 800, price: 1500 },
  { course: "アミューズ", name: "キャビアのカナッペ", cost: 900, price: 2000 },
  { course: "前菜", name: "帆立と鮮魚のミルフィーユ仕立て", cost: 1200, price: 3200 },
  { course: "前菜", name: "フォアグラと無花果のテリーヌ", cost: 1100, price: 2800 },
  { course: "スープ", name: "トリュフ香るコンソメロワイヤル", cost: 800, price: 2200 },
  { course: "魚料理", name: "オマール海老のテルミドール", cost: 2200, price: 5500 },
  { course: "お口直し", name: "シャンパーニュのグラニテ", cost: 250, price: 600 },
  { course: "肉料理", name: "国産牛フィレ肉のポワレ トリュフソース", desc: "季節の温野菜とともに", cost: 3200, price: 7500 },
  { course: "肉料理", name: "鴨胸肉のロースト（お口直しの後に）", cost: 1300, price: 3200 },
  { course: "デザート", name: "グランデセール", desc: "ワゴンサービス", cost: 900, price: 2500 },
  { course: "パン・飲物", name: "自家製パン・食後のお飲物・プティフール", cost: 400, price: 1200 },
];

const BANQUET: MenuPresetItem[] = [
  { course: "乾杯酒", name: "スパークリングワイン", cost: 300, price: 800 },
  { course: "前菜", name: "オードブル盛り合わせ", cost: 800, price: 2200 },
  { course: "スープ", name: "本日のスープ", cost: 350, price: 1000 },
  { course: "魚料理", name: "鮮魚のグリル", cost: 1100, price: 3000 },
  { course: "肉料理", name: "牛ロースのロースト", cost: 1500, price: 4000 },
  { course: "デザート", name: "デザート盛り合わせ・コーヒー", cost: 500, price: 1500 },
];

/** 見積テンプレ名からコースメニューを決定（該当なしは null） */
export function menuPresetForTemplate(templateName: string): MenuPresetItem[] | null {
  if (!templateName) return null;
  if (templateName.includes("グランメゾン")) return GRAND;
  if (templateName.includes("プレミエ")) return PREMIER;
  if (templateName.includes("スタンダード") || templateName.includes("ブライダル")) return STANDARD;
  if (templateName.includes("宴会") || templateName.includes("コース")) return BANQUET;
  return null;
}
