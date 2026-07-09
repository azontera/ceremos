// 案件種別（ブライダル専用ではなく、セレモニー・式典・イベント全般を扱う）
export type CaseTypeMeta = {
  value: string;
  label: string;
  emoji: string;
  desc: string;
  day: string;      // 「◯◯まであと3日」「◯◯当日」の◯◯
  grad: string;     // 選択カードのグラデーション
};

export const CASE_TYPES: CaseTypeMeta[] = [
  {
    value: "wedding", label: "ブライダル", emoji: "💐",
    desc: "挙式・披露宴・お披露目会",
    day: "挙式", grad: "linear-gradient(135deg,#e9b8c4,#a4586b)",
  },
  {
    value: "party", label: "宴会", emoji: "🥂",
    desc: "企業宴会・懇親会・同窓会・祝賀会",
    day: "宴会", grad: "linear-gradient(135deg,#f0c987,#b07a2a)",
  },
  {
    value: "ceremony", label: "セレモニー・式典", emoji: "🎗️",
    desc: "記念式典・表彰式・調印式・成人式",
    day: "式典", grad: "linear-gradient(135deg,#9db8dd,#4a6fa5)",
  },
  {
    value: "event", label: "イベント", emoji: "🎬",
    desc: "ディナーショー・フォトウェディング・MV撮影",
    day: "本番", grad: "linear-gradient(135deg,#a9d3b6,#3d8a5f)",
  },
];

export function typeMeta(v: string | null | undefined): CaseTypeMeta {
  if (v === "other") v = "event"; // 旧データ互換
  return CASE_TYPES.find((t) => t.value === v) ?? CASE_TYPES[0];
}

/** マスタ（[value,label][]）と既定メタをマージ。マスタで追加された種別は汎用メタで表示 */
export function mergeCaseTypes(options: [string, string][]): CaseTypeMeta[] {
  if (options.length === 0) return CASE_TYPES;
  return options.map(([value, label]) => {
    const base = CASE_TYPES.find((t) => t.value === value);
    if (base) return { ...base, label };
    return {
      value, label, emoji: "🎪",
      desc: "カスタム種別",
      day: "本番", grad: "linear-gradient(135deg,#c3b6d9,#6f5b96)",
    };
  });
}

/** 案件の表示名（ブライダルは両名、それ以外はイベント名） */
export function caseLabel(c: { groomName: string; brideName: string }): string {
  return c.brideName === "―" || !c.brideName ? c.groomName : `${c.groomName} & ${c.brideName}`;
}
