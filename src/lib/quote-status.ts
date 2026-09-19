// 見積ステータス：draft（下書き）／ confirmed（確定）／ archived（旧バージョン）
// 旧データの "approved"（支配人承認）・"customer_confirmed" は読み取り時に「確定」として扱う（DBの値は書き換えない）
export const QUOTE_CONFIRMED_STATUSES = ["confirmed", "approved", "customer_confirmed"];

export function normalizeQuoteStatus(status: string): "draft" | "confirmed" | "archived" {
  if (QUOTE_CONFIRMED_STATUSES.includes(status)) return "confirmed";
  if (status === "archived") return "archived";
  return "draft";
}

export function isQuoteConfirmed(status: string): boolean {
  return QUOTE_CONFIRMED_STATUSES.includes(status);
}

export const QUOTE_STATUS_LABEL: Record<"draft" | "confirmed" | "archived", { label: string; cls: string }> = {
  draft: { label: "下書き", cls: "gray" },
  confirmed: { label: "確定", cls: "green" },
  archived: { label: "旧バージョン", cls: "gray" },
};
