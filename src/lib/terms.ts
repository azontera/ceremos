// 案件タイプ連動の用語辞書
// 宴会・式典・イベント案件で「新郎新婦」「両家」等の婚礼用語が画面に出ないように、
// 画面の文言は原則この t() を通す（婚礼用語のハードコード禁止 = CLAUDE.md 設計上の約束事）。
// caseType: wedding（ブライダル）/ party（宴会）/ ceremony（式典）/ event（イベント）

export type TermKey =
  | "couple"        // 新郎新婦 / 主催者
  | "coupleSama"    // 新郎新婦様 / 主催者様
  | "groom"         // 新郎 / 主催者（代表）
  | "bride"         // 新婦 / 副代表
  | "groomSide"     // 新郎側 / 主催側
  | "brideSide"     // 新婦側 / 来賓側
  | "bothFamilies"  // ご両家 / 主催者様
  | "ceremony"      // 挙式 / 式典
  | "reception"     // 披露宴 / ご宴会
  | "wedding"       // 結婚式 / ご宴会
  | "guests"        // ゲスト / ご来賓
  | "planner"       // ウェディングプランナー / 宴会担当
  | "prep";         // 結婚式の準備 / ご宴会の準備

const WEDDING: Record<TermKey, string> = {
  couple: "新郎新婦",
  coupleSama: "新郎新婦様",
  groom: "新郎",
  bride: "新婦",
  groomSide: "新郎側",
  brideSide: "新婦側",
  bothFamilies: "ご両家",
  ceremony: "挙式",
  reception: "披露宴",
  wedding: "結婚式",
  guests: "ゲスト",
  planner: "ウェディングプランナー",
  prep: "結婚式の準備",
};

// 宴会・式典・イベント共通（婚礼用語を一切含まない）
const BANQUET: Record<TermKey, string> = {
  couple: "主催者",
  coupleSama: "主催者様",
  groom: "代表者",
  bride: "副代表",
  groomSide: "主催側",
  brideSide: "来賓側",
  bothFamilies: "主催者様",
  ceremony: "式典",
  reception: "ご宴会",
  wedding: "ご宴会",
  guests: "ご来賓",
  planner: "宴会担当",
  prep: "ご宴会の準備",
};

export function isBridal(caseType: string | null | undefined): boolean {
  return !caseType || caseType === "wedding";
}

/** 案件タイプに応じた用語を返す。婚礼以外はすべて宴会用語 */
export function t(key: TermKey, caseType: string | null | undefined): string {
  return (isBridal(caseType) ? WEDDING : BANQUET)[key];
}

/** 婚礼専用機能（衣装・引出物・ケーキ入刀・両家表示など）を出すか */
export function showBridalFeatures(caseType: string | null | undefined): boolean {
  return isBridal(caseType);
}

/** 宴会モードで非表示にするカタログカテゴリ */
export const BRIDAL_ONLY_CATALOG_CATEGORIES = ["dress"];

/** 宴会モードで進行表シーン候補から除外するキーワード（テンプレ・シーン名フィルタ用） */
export const BRIDAL_ONLY_SCENE_WORDS = [
  "ケーキ入刀", "ファーストバイト", "ブーケ", "ベールダウン", "誓いのキス",
  "指輪交換", "お色直し", "両家", "花嫁", "新婦の手紙", "フラワーシャワー",
];
