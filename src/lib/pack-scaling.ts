// テンプレ一式（pack）の人数スケーリング（クライアント/サーバー共用・純粋関数）
// 案件のゲスト人数に合わせて、見積の数量・品名（「× ◯名」表記）を自動調整する。
//
// ルール:
// - item.perGuest が数値/true → qty = ceil(人数 × perGuest)（true は 1 扱い。例: 引出物は 0.5 で「2名に1つ」）
// - perGuest 未指定でも、品名に「× ◯名」「×◯名」があれば1名あたり品目とみなして qty = 人数
// - 品名中の「◯名」「◯セット」「◯組」の数字は実数に置換される

export type ScalableQuoteItem = {
  name: string; category?: string; qty?: number; unitPrice?: number;
  perGuest?: number | boolean;
};

const NAME_GUESTS_RE = /[×xX]\s*\d+\s*名/;

export function scaleQuoteItems<T extends ScalableQuoteItem>(items: T[], guests: number): T[] {
  if (!guests || guests <= 0) return items;
  return items.map((it) => {
    let mult: number | null = null;
    if (typeof it.perGuest === "number" && it.perGuest > 0) mult = it.perGuest;
    else if (it.perGuest === true) mult = 1;
    else if (NAME_GUESTS_RE.test(it.name)) mult = 1; // 「× 60名」表記＝1名あたり品目とみなす
    if (mult === null) return it;
    const qty = Math.max(1, Math.ceil(guests * mult));
    let name = it.name.replace(/([×xX]\s*)\d+(\s*名)/g, `$1${guests}$2`);
    name = name.replace(/([×xX]\s*)\d+(\s*(?:セット|組))/g, `$1${qty}$2`);
    return { ...it, name, qty };
  });
}

/** スタッフ行の人数展開：perGuests（ゲスト◯名につき1名）→ 必要人数分の行に展開 */
export function expandStaffCount(guests: number, perGuests?: number): number {
  if (!perGuests || perGuests <= 0 || !guests || guests <= 0) return 1;
  return Math.min(15, Math.max(1, Math.ceil(guests / perGuests)));
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮"];
export function numberedLabel(label: string, index: number, total: number): string {
  return total <= 1 ? label : `${label}${CIRCLED[index] ?? `(${index + 1})`}`;
}
