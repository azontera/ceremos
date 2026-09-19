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
  const caseLabel = (c: { groomName: string; brideName: string }) =>
    `${c.groomName.split(" ")[0]}様${c.brideName !== "―" ? `・${c.brideName.split(" ")[0]}様` : ""}`;

  // スタッフのダッシュボードに必要なものだけ：今日・今週の案件／タスク／見積下書き／未入金／未対応クレーム
  const [todayEvents, weekList, openTasks, draftQuotes, unpaidInvoices, openClaims] =
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
        take: 12,
      }),
      // 下書き中の見積（案件ごとに最新版）
      prisma.quote.findMany({
        where: { ...inScope, status: "draft" },
        include: { case: { select: { id: true, groomName: true, brideName: true, weddingDate: true } } },
        orderBy: { createdAt: "desc" },
      }),
      // 未入金（請求済で入金待ち）
      prisma.invoice.findMany({
        where: { ...inScope, status: "sent" },
        include: { case: { select: { id: true, groomName: true, brideName: true } } },
        orderBy: { dueAt: "asc" },
      }),
      // 未対応クレーム（アフター記録）— 顧客ロールには出さない
      s.role === "couple" ? Promise.resolve([]) : prisma.followUp.findMany({
        where: { ...inScope, type: "claim", status: "open" },
        include: { case: { select: { id: true, groomName: true, brideName: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const todayWeddings = await prisma.case.findMany({
    where: { ...scope, weddingDate: { gte: today.from, lt: today.to } },
    include: { banquetVenue: true },
  });

  // 見積下書きは案件単位にまとめる（同じ案件の複数版は1行）
  const draftByCase = new Map<string, { caseId: string; caseLabel: string; weddingDate: Date; version: number; total: number }>();
  for (const q of draftQuotes) {
    if (!draftByCase.has(q.caseId)) {
      draftByCase.set(q.caseId, { caseId: q.caseId, caseLabel: caseLabel(q.case), weddingDate: q.case.weddingDate, version: q.version, total: q.total });
    }
  }

  return {
    todayEvents, todayWeddings, weekWeddings: weekList.length, weekList, openTasks,
    draftQuotes: [...draftByCase.values()],
    openClaims: openClaims.map((f) => ({
      id: f.id, caseId: f.caseId, body: f.body, at: f.createdAt, caseLabel: caseLabel(f.case),
    })),
    unpaidInvoices: unpaidInvoices.map((i) => ({
      id: i.id, caseId: i.caseId, number: i.number, amount: i.amount,
      dueAt: i.dueAt, overdue: !!i.dueAt && i.dueAt < now, caseLabel: caseLabel(i.case),
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
