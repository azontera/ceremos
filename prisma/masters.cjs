// 選択肢マスタの既定値（seed.cjs / scripts/create-admin.cjs から使用）
// ※ src/lib/masters.ts の DEFAULT_MASTERS と同内容を維持すること
/* eslint-disable */
const DEFAULT_MASTERS = [
  { group: "case_type", value: "wedding", label: "ブライダル", sortOrder: 1 },
  { group: "case_type", value: "party", label: "宴会", sortOrder: 2 },
  { group: "case_type", value: "ceremony", label: "セレモニー・式典", sortOrder: 3 },
  { group: "case_type", value: "event", label: "イベント", sortOrder: 4 },
  ...["親族", "主賓", "上司", "同僚", "友人", "恩師", "その他"].map((label, i) => ({
    group: "relation", value: `rel${i + 1}`, label, sortOrder: i + 1,
  })),
  ...[
    ["ceremony", "挙式"], ["venue", "会場"], ["catering", "料理・飲物"],
    ["florist", "装花"], ["dress", "衣装"], ["beauty", "美容"],
    ["photo", "写真"], ["video", "映像"], ["mc", "司会"], ["audio", "音響・照明"],
    ["print", "ペーパーアイテム"], ["gift", "引出物"], ["service", "サービス"],
    ["discount", "値引・特典"], ["other", "その他"],
  ].map(([value, label], i) => ({ group: "quote_category", value, label, sortOrder: i + 1 })),
];

module.exports = { DEFAULT_MASTERS };
