import { isQuoteConfirmed } from "./quote-status";
// 準備進捗・D-day の共通計算
export type ProgressInput = {
  meetingsCount: number;
  quotes: { status: string }[];
  orders: { status: string }[];
  songsCount: number;
  guests: { tableId: string | null; seatObjectId?: string | null }[];
  rundownCount: number;
};

export type Milestone = { label: string; done: boolean; hint: string };

export function computeProgress(x: ProgressInput): { percent: number; milestones: Milestone[] } {
  const allOrdersFixed = x.orders.length > 0 && x.orders.every((o) => o.status !== "pending");
  const seated = (g: { tableId: string | null; seatObjectId?: string | null }) => !!g.tableId || !!g.seatObjectId;
  const seatingDone = x.guests.length > 0 && x.guests.every(seated);
  const milestones: Milestone[] = [
    { label: "打ち合わせ開始", done: x.meetingsCount > 0, hint: `${x.meetingsCount}回実施` },
    { label: "見積確定", done: x.quotes.some((q) => isQuoteConfirmed(q.status)), hint: x.quotes.length ? `Ver.${x.quotes.length}まで作成` : "未作成" },
    { label: "発注確定", done: allOrdersFixed, hint: x.orders.length ? `${x.orders.filter((o) => o.status !== "pending").length}/${x.orders.length}件確定` : "発注なし" },
    { label: "楽曲決定", done: x.songsCount >= 5, hint: `${x.songsCount}曲（進行表から追加）` },
    { label: "席次確定", done: seatingDone, hint: x.guests.length ? `${x.guests.filter(seated).length}/${x.guests.length}名割当` : "ゲスト未登録" },
    { label: "進行表作成", done: x.rundownCount >= 6, hint: `${x.rundownCount}演目` },
  ];
  const percent = Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100);
  return { percent, milestones };
}

/** 挙式までの日数（当日=0、過去=負） */
export function daysUntil(weddingDate: Date): number {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(weddingDate); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function ddayLabel(d: number): { text: string; cls: string } {
  if (d < 0) return { text: "終了", cls: "gray" };
  if (d === 0) return { text: "本日！", cls: "red" };
  if (d <= 7) return { text: `あと${d}日`, cls: "red" };
  if (d <= 30) return { text: `あと${d}日`, cls: "amber" };
  return { text: `あと${d}日`, cls: "blue" };
}
