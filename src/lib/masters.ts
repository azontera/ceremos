// 選択肢マスタ（案件種別・間柄・部門）— 管理画面で編集可能。空のときは既定値にフォールバック
import { prisma } from "./db";

export const MASTER_GROUPS: Record<string, string> = {
  case_type: "案件種別",
  relation: "間柄（席次表）",
  quote_category: "部門（見積・発注）",
};

// 既定値（seed / create-admin でも投入される）
export const DEFAULT_MASTERS: { group: string; value: string; label: string; sortOrder: number }[] = [
  { group: "case_type", value: "wedding", label: "ブライダル", sortOrder: 1 },
  { group: "case_type", value: "party", label: "宴会", sortOrder: 2 },
  { group: "case_type", value: "ceremony", label: "セレモニー・式典", sortOrder: 3 },
  { group: "case_type", value: "event", label: "イベント", sortOrder: 4 },
  ...["親族", "主賓", "上司", "同僚", "友人", "恩師", "その他"].map((label, i) => ({
    group: "relation", value: `rel${i + 1}`, label, sortOrder: i + 1,
  })),
  ...([
    ["ceremony", "挙式"], ["venue", "会場"], ["catering", "料理・飲物"],
    ["florist", "装花"], ["dress", "衣装"], ["beauty", "美容"],
    ["photo", "写真"], ["video", "映像"], ["mc", "司会"], ["audio", "音響・照明"],
    ["print", "ペーパーアイテム"], ["gift", "引出物"], ["transport", "送迎・車両"],
    ["service", "サービス"], ["discount", "値引・特典"], ["other", "その他"],
  ] as [string, string][]).map(([value, label], i) => ({
    group: "quote_category", value, label, sortOrder: i + 1,
  })),
];

/** グループの有効な選択肢（[value, label][]）。マスタ未登録時は既定値 */
export async function getMasterOptions(group: string): Promise<[string, string][]> {
  const rows = await prisma.masterOption.findMany({
    where: { group, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (rows.length > 0) return rows.map((r) => [r.value, r.label]);
  return DEFAULT_MASTERS.filter((m) => m.group === group).map((m) => [m.value, m.label]);
}
