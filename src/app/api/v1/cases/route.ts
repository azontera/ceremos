import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, caseScopeWhere, audit } from "@/lib/rbac";
import { effectiveEnd, overlaps, timeRangeLabel } from "@/lib/case-time";
import { getMasterOptions } from "@/lib/masters";

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "cases", "view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const scope = await caseScopeWhere(s);
  const cases = await prisma.case.findMany({
    where: {
      ...scope,
      ...(q ? {
        OR: [
          { groomName: { contains: q } }, { brideName: { contains: q } },
          { phone: { contains: q } }, { email: { contains: q } },
          { venueFree: { contains: q } }, { banquetVenue: { name: { contains: q } } },
        ],
      } : {}),
    },
    include: { planner: { select: { name: true } }, banquetVenue: true, orders: true },
    orderBy: { weddingDate: "asc" },
  });
  return NextResponse.json({ cases });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "cases", "edit")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // DB再作成後の古いセッション対策：ユーザーの実在確認
  const me = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!me) {
    return NextResponse.json(
      { error: "セッションが無効です。ログアウトして再ログインしてください" },
      { status: 401 },
    );
  }

  const b = await req.json().catch(() => null);
  const validTypes = (await getMasterOptions("case_type")).map(([v]) => v);
  const caseType = validTypes.includes(b?.caseType) ? b.caseType : "wedding";
  if (caseType === "wedding") {
    // 新規作成のハードルは低く：必須は新郎名だけ。新婦名・開催日は後から追記できる
    if (!b?.groomName?.trim()) {
      return NextResponse.json({ error: "新郎のお名前を入力してください（他の項目は後からでOK）" }, { status: 400 });
    }
    if (!b.brideName?.trim()) b.brideName = "（お相手 未定）";
  } else {
    // 宴会・式典・イベント
    if (!b?.eventName?.trim()) {
      return NextResponse.json({ error: "イベント名は必須です" }, { status: 400 });
    }
    b.groomName = b.eventName.trim();
    b.brideName = "―";
  }
  // 開催日未定：半年後の仮日程で作成（仮予約扱い）
  let dateUndecided = false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.weddingDate ?? "")) {
    const d = new Date();
    d.setDate(d.getDate() + 180);
    b.weddingDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    b.status = "tentative";
    dateUndecided = true;
  }
  // 開始・終了時刻（自由記入）を開催日に合成
  const startTime = /^\d{1,2}:\d{2}$/.test(b.startTime ?? "") ? b.startTime : "11:30";
  const weddingDate = new Date(`${b.weddingDate}T${startTime.padStart(5, "0")}:00`);
  let endTime: Date | null = null;
  if (/^\d{1,2}:\d{2}$/.test(b.endTime ?? "")) {
    endTime = new Date(`${b.weddingDate}T${b.endTime.padStart(5, "0")}:00`);
    if (endTime <= weddingDate) endTime.setDate(endTime.getDate() + 1); // 日をまたぐ宴会
  }
  const newEnd = effectiveEnd(weddingDate, endTime);

  // 会場の自由記載は「その他（外部会場）」として会場マスタへ自動登録
  if (!b.banquetVenueId && b.venueFree?.trim()) {
    const name = b.venueFree.trim();
    const existing = await prisma.venue.findFirst({ where: { name } });
    const v = existing ?? await prisma.venue.create({ data: { name, type: "external", capacity: 0 } });
    b.banquetVenueId = v.id;
  }

  // 会場重複チェック：同一会場（バンケット・チャペル）×時間帯の重なり
  // ※ 開催日未定（仮日程）の場合はチェックしない
  const dayStart = new Date(b.weddingDate); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 2); // 日またぎも見る
  for (const [field, venueId] of dateUndecided ? [] : [["banquetVenueId", b.banquetVenueId], ["chapelVenueId", b.chapelVenueId]] as const) {
    if (!venueId) continue;
    const sameVenue = await prisma.case.findMany({
      where: {
        [field]: venueId,
        weddingDate: { gte: new Date(dayStart.getTime() - 86400000), lt: dayEnd },
      },
      include: { banquetVenue: true, chapelVenue: true },
    });
    const conflict = sameVenue.find((w) =>
      overlaps(weddingDate, newEnd, w.weddingDate, effectiveEnd(w.weddingDate, w.endTime)));
    if (conflict) {
      const vn = field === "banquetVenueId" ? conflict.banquetVenue?.name : conflict.chapelVenue?.name;
      return NextResponse.json(
        { error: `重複エラー：${vn} ${timeRangeLabel(conflict.weddingDate, conflict.endTime)} には既に「${conflict.groomName} & ${conflict.brideName}」の予定が入っています` },
        { status: 409 },
      );
    }
  }
  try {
  const c = await prisma.case.create({
    data: {
      groomName: b.groomName,
      brideName: b.brideName,
      weddingDate,
      endTime,
      caseType,
      banquetVenueId: b.banquetVenueId || null,
      venueFree: b.venueFree?.trim() || null,
      guestCount: Number(b.guestCount ?? 0),
      email: b.email ?? null,
      phone: b.phone ?? null,
      status: b.status === "tentative" ? "tentative" : "contracted", // 仮予約対応
      plannerId: s.userId,
      members: { create: { userId: s.userId, roleInCase: "planner" } },
    },
  });
  // ※ 進行表・料理・席次・リソースは見積タブでテンプレートを選んで保存すると自動セットアップされる
  // クイック登録のお客様を選んで作成した場合：案件に紐付けて承認扱いに
  if (b.customerId) {
    const cust = await prisma.user.findFirst({ where: { id: b.customerId, role: "couple" } });
    if (cust) {
      await prisma.caseMember.create({ data: { caseId: c.id, userId: cust.id, roleInCase: "couple" } })
        .catch(() => { /* 既に紐付け済みなら無視 */ });
      await prisma.user.update({ where: { id: cust.id }, data: { approved: true } });
      await audit(s.userId, "link", "case_customer", c.id, { customerId: cust.id });
    }
  }
  await audit(s.userId, "create", "case", c.id);
  return NextResponse.json({ case: c }, { status: 201 });
  } catch (e) {
    console.error("case create failed:", e);
    return NextResponse.json(
      { error: `サーバーエラー：${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
