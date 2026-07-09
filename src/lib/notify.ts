// 通知の抽象化（リニューアル仕様書 3.2: Notifier）
// - アプリ内通知: 既存の /api/v1/me/notifications がデータから導出する方式（このファイルの対象外）
// - LINE通知: LINE_CHANNEL_TOKEN が設定されていて、ユーザーが LINE 連携済み（profileJson.lineUserId）
//   のときだけ Messaging API に push する。未設定なら静かに何もしない（骨格＝P3、実接続＝P5）。
// 呼び出し側は notifyCaseCustomers() だけ使えばよい。LINE以外の手段を足すときは Notifier 実装を増やす。
import { prisma } from "@/lib/db";

export type NotifyPayload = {
  title: string;   // 例: 「新しい宿題が届きました」
  body?: string;   // 例: タスク名・期限
  href?: string;   // アプリ内リンク（LINE文面には絶対URL化して載せる）
};

export interface Notifier {
  send(userIds: string[], payload: NotifyPayload): Promise<void>;
}

/** LINE Messaging API（push）。チャネル未設定・未連携ユーザーはスキップ */
class LineNotifier implements Notifier {
  async send(userIds: string[], p: NotifyPayload): Promise<void> {
    const token = process.env.LINE_CHANNEL_TOKEN;
    if (!token || userIds.length === 0) return;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, profileJson: true },
    });
    const text = [p.title, p.body, p.href ? `${base}${p.href}` : ""].filter(Boolean).join("\n");
    for (const u of users) {
      let lineUserId: string | undefined;
      try { lineUserId = JSON.parse(u.profileJson ?? "{}").lineUserId; } catch { /* ignore */ }
      if (!lineUserId) continue;
      try {
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
        });
      } catch (e) {
        console.error("LINE通知の送信に失敗:", e); // 通知失敗で業務処理は止めない
      }
    }
  }
}

const notifiers: Notifier[] = [new LineNotifier()];

/** 案件のお客様（coupleメンバー全員）へ通知する。失敗しても投げない */
export async function notifyCaseCustomers(caseId: string, payload: NotifyPayload): Promise<void> {
  try {
    const members = await prisma.caseMember.findMany({
      where: { caseId, user: { role: "couple", isActive: true } },
      select: { userId: true },
    });
    const ids = members.map((m) => m.userId);
    await Promise.all(notifiers.map((n) => n.send(ids, payload)));
  } catch (e) {
    console.error("notifyCaseCustomers failed:", e);
  }
}
