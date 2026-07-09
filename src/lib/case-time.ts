// 開催時間帯ユーティリティ（部制廃止 → 開始〜終了時刻ベース）
export const DEFAULT_DURATION_MIN = 240; // endTime 未設定の旧データは開始+4時間とみなす

export function effectiveEnd(start: Date, endTime: Date | null | undefined): Date {
  if (endTime && endTime > start) return endTime;
  return new Date(start.getTime() + DEFAULT_DURATION_MIN * 60000);
}

export const fmtHM = (d: Date) =>
  d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

/** 「11:30〜15:30」形式 */
export function timeRangeLabel(start: Date, endTime: Date | null | undefined): string {
  return `${fmtHM(start)}〜${fmtHM(effectiveEnd(start, endTime))}`;
}

/** 時間帯の重なり判定 */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}
