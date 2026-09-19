// ダッシュボード等の集約クエリ
import { prisma } from "./db";
import { caseScopeWhere } from "./rbac";
import type { Session } from "./auth";

function dayRange(base: Date, days = 1) {
  const from = new Date(base); from.setHours(0, 0, 0, 0);
  const to = new Date(from); to.setDate(to.getDate() + days);
  return { from, to };
}

export async function getDashboard(s: Session) {
  const now = new Date();
  const today = dayRange(now, 1);
  const week = dayRange(now, 7);
  const scope = await caseScopeWhere(s);
  const scopedCaseIds = (
    await prisma.case.findMany({ where: scope, select: { id: true } })
  ).map((c) => c.id);
  const inScope = { caseId: { in: scopedCaseIds } };

  const [todayEvents, weekList, openTasks, draftQuotes, orders, recentMessages, unpaidInvoices] =
    await Promise.all([
      prisma.calendarEvent.findMany({
        where: { ...inScope, startsAt: { gte: today.from, lt: today.to } },
        include: { case: { select: { id: true, groomName: true, brideName: true } } },
        orderBy: { startsAt: "asc" },
      }),
      prisma.case.findMany({
        where: { ...scope, weddingDate: { gte: week.from, lt: week.to } },
        include: { banquetVenue: true },
        orderBy: { weddingDate: "asc" },
      }),
      prisma.task.findMany({
        where: { ...inScope, status: "open" },
        include: { case: { select: { id: true, groomName: true, brideName: true } } },
        orderBy: { dueAt: "asc" },
        take: 8,
      }),
      prisma.quote.count({ where: { ...inScope, status: "draft" } }),
      prisma.order.findMany({ where: inScope, include: { case: true } }),
      prisma.chatMessage.findMany({
        where: { ...inScope, NOT: { senderId: s.userId } },
        include: {
          sender: { select: { name: true, role: true } },
          case: { select: { id: true, groomName: true, brideName: true } },
          reads: { where: { userId: s.userId } },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      // 未入金（請求済で入金待ち）
      prisma.invoice.findMany({
        where: { ...inScope, status: "sent" },
        include: { case: { select: { id: true, groomName: true, brideName: true } } },
        orderBy: { dueAt: "asc" },
      }),
    ]);

  // 未対応クレーム（アフター記録）— 顧客ロールには出さない
  const openClaims = s.role === "couple" ? [] : await prisma.followUp.findMany({
    where: { ...inScope, type: "claim", status: "open" },
    include: { case: { select: { id: true, groomName: true, brideName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const todayWeddings = await prisma.case.findMany({
    where: { ...scope, weddingDate: { gte: today.from, lt: today.to } },
    include: { banquetVenue: true },
  });

  // 案件ごとの発注確定状況
  const orderSummary = new Map<string, { label: string; total: number; done: number; overdue: boolean }>();
  for (const o of orders) {
    const key = o.caseId;
    const e = orderSummary.get(key) ?? {
      label: `${o.case.groomName.split(" ")[0]}様・${o.case.brideName.split(" ")[0]}様`,
      total: 0, done: 0, overdue: false,
    };
    e.total++;
    if (o.status !== "pending") e.done++;
    if (o.status === "pending" && o.dueAt && o.dueAt < now) e.overdue = true;
    orderSummary.set(key, e);
  }

  return {
    todayEvents, todayWeddings, weekWeddings: weekList.length, weekList, openTasks, draftQuotes,
    openClaims: openClaims.map((f) => ({
      id: f.id, caseId: f.caseId, body: f.body, at: f.createdAt,
      caseLabel: `${f.case.groomName.split(" ")[0]}様${f.case.brideName !== "―" ? `・${f.case.brideName.split(" ")[0]}様` : ""}`,
    })),
    unpaidInvoices: unpaidInvoices.map((i) => ({
      id: i.id, caseId: i.caseId, number: i.number, amount: i.amount,
      dueAt: i.dueAt, overdue: !!i.dueAt && i.dueAt < now,
      caseLabel: `${i.case.groomName.split(" ")[0]}様${i.case.brideName !== "―" ? `・${i.case.brideName.split(" ")[0]}様` : ""}`,
    })),
    orderSummary: [...orderSummary.entries()].map(([caseId, v]) => ({ caseId, ...v })),
    recentMessages: recentMessages.map((m) => ({
      id: m.id, body: m.body, sender: m.sender.name, caseId: m.case.id,
      caseLabel: `${m.case.groomName.split(" ")[0]}様・${m.case.brideName.split(" ")[0]}様`,
      unread: m.reads.length === 0, at: m.createdAt,
    })),
  };
}

export async function getCases(s: Session, q = "") {
  const scope = await caseScopeWhere(s);
  return prisma.case.findMany({
    where: {
      ...scope,
      ...(q ? { OR: [{ groomName: { contains: q } }, { brideName: { contains: q } }] } : {}),
    },
    include: {
      planner: { select: { name: true } },
      banquetVenue: true,
      orders: { select: { status: true } },
    },
    orderBy: { weddingDate: "asc" },
  });
}

export async function getCaseDetail(caseId: string) {
  return prisma.case.findUnique({
    where: { id: caseId },
    include: {
      planner: { select: { name: true } },
      chapelVenue: true,
      banquetVenue: true,
      meetings: { orderBy: { heldAt: "desc" }, include: { staff: { select: { name: true } } } },
      guests: { select: { tableId: true, seatObjectId: true } },
      quotes: { orderBy: { version: "desc" }, include: { items: true } },
      orders: { include: { vendor: true } },
      mealReqs: true,
      songs: true,
      rundownItems: { orderBy: { sortOrder: "asc" }, include: { song: true } },
      tasks: { orderBy: { dueAt: "asc" } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { name: true, role: true } } },
      },
    },
  });
}
