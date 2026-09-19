import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { caseScopeWhere } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET: 通知（ヘッダーのベル用・30秒ポーリング）
// 未読チャット / 未対応クレーム / 期限超過（タスク・発注・未入金）
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const scope = await caseScopeWhere(s);
  const scopedCaseIds = (await prisma.case.findMany({ where: scope, select: { id: true } })).map((c) => c.id);
  const inScope = { caseId: { in: scopedCaseIds } };
  const now = new Date();
  const isStaff = s.role !== "couple";

  const [unreadMessages, openClaims, overdueTasks, unpaid] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { ...inScope, NOT: { senderId: s.userId }, reads: { none: { userId: s.userId } } },
      include: { case: { select: { id: true, groomName: true, brideName: true } }, sender: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    isStaff ? prisma.followUp.findMany({
      where: { ...inScope, type: "claim", status: "open" },
      include: { case: { select: { id: true, groomName: true } } },
      take: 5,
    }) : [],
    isStaff ? prisma.task.findMany({
      where: { ...inScope, status: "open", dueAt: { lt: now } },
      include: { case: { select: { id: true, groomName: true } } },
      take: 5,
    }) : [],
    isStaff ? prisma.invoice.findMany({
      where: { ...inScope, status: "sent", dueAt: { lt: now } },
      include: { case: { select: { id: true, groomName: true } } },
      take: 5,
    }) : [],
  ]);

  type N = { kind: string; label: string; sub: string; href: string };
  const items: N[] = [
    ...unreadMessages.map((m) => ({
      kind: "chat", label: `💬 ${m.sender.name}：${m.body.slice(0, 30)}${m.body.length > 30 ? "…" : ""}`,
      sub: m.case.groomName, href: `/cases/${m.case.id}?tab=chat`,
    })),
    ...openClaims.map((f) => ({
      kind: "claim", label: `🚨 未対応クレーム：${f.body.slice(0, 30)}…`,
      sub: f.case.groomName, href: `/cases/${f.caseId}?tab=after`,
    })),
    ...overdueTasks.map((t) => ({
      kind: "task", label: `⏰ 期限超過タスク：${t.title.slice(0, 26)}`,
      sub: t.case?.groomName ?? "", href: t.case ? `/cases/${t.case.id}` : "/dashboard",
    })),
    ...unpaid.map((i) => ({
      kind: "invoice", label: `💴 未入金（期限超過）：${i.number}`,
      sub: i.case.groomName, href: `/cases/${i.caseId}?tab=billing`,
    })),
  ];

  return NextResponse.json({
    count: unreadMessages.length + openClaims.length + overdueTasks.length + unpaid.length,
    items: items.slice(0, 12),
  });
}
