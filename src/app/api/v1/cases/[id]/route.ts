import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { effectiveEnd, overlaps, timeRangeLabel } from "@/lib/case-time";
import { getMasterOptions } from "@/lib/masters";
import { deleteFile } from "@/lib/storage";

// 案件の完全削除（テストデータの掃除用）。支配人以上のみ。
// Case のカスケードで見積・進行表・席次・楽曲・請求等は連動削除される。
// Attachment は擬似リレーション（parentType/parentId）のためカスケードされない → 手動でレコード＋実ファイルを削除
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["admin", "manager"].includes(s.role)) {
    return NextResponse.json({ error: "案件の削除は支配人以上のみ可能です" }, { status: 403 });
  }
  const c = await prisma.case.findUnique({
    where: { id: params.id },
    select: { id: true, groomName: true, brideName: true, weddingDate: true },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 削除前に自動バックアップ（案件はカスケードで関連データも消えるため。失敗したら中止）
  const { backupDb } = await import("@/lib/db-backup");
  const bk = await backupDb(`case-delete-${c.groomName || "案件"}`);
  if (!bk) return NextResponse.json({ error: "バックアップに失敗したため、削除を中止しました。時間をおいて再度お試しください。" }, { status: 500 });

  const [meetings, songs] = await Promise.all([
    prisma.meeting.findMany({ where: { caseId: c.id }, select: { id: true } }),
    prisma.song.findMany({ where: { caseId: c.id }, select: { id: true } }),
  ]);
  const atts = await prisma.attachment.findMany({
    where: {
      OR: [
        { parentType: "case", parentId: c.id },
        { parentType: "meeting", parentId: { in: meetings.map((m) => m.id) } },
        { parentType: "song", parentId: { in: songs.map((sg) => sg.id) } },
      ],
    },
  });
  for (const a of atts) {
    try { await deleteFile(a.fileKey); } catch { /* ファイル消失済みでも続行 */ }
  }
  if (atts.length) await prisma.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } });
  await prisma.case.delete({ where: { id: c.id } });
  await audit(s.userId, "delete", "case", c.id, {
    groomName: c.groomName, brideName: c.brideName,
    weddingDate: c.weddingDate, attachments: atts.length,
  });
  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const c = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      planner: { select: { name: true } },
      chapelVenue: true,
      banquetVenue: true,
      meetings: { orderBy: { heldAt: "desc" } },
      quotes: { orderBy: { version: "desc" }, include: { items: true } },
      orders: { include: { vendor: true } },
      mealReqs: true,
      songs: true,
      rundownItems: { orderBy: { sortOrder: "asc" } },
      tasks: { where: { status: "open" } },
    },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ case: c });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "cases", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const existing = await prisma.case.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const allowed = [
    "groomName", "brideName", "address", "phone", "email", "guestCount", "status",
    "plannerId", "banquetVenueId", "chapelVenueId", "venueFree",
  ] as const;
  const data: Record<string, unknown> = {};
  for (const k of allowed) {
    if (b[k] === undefined) continue;
    if (k === "guestCount") data[k] = Number(b[k]);
    else if (k === "plannerId" || k === "banquetVenueId" || k === "chapelVenueId") data[k] = b[k] || null;
    else data[k] = b[k];
  }
  if (b.caseType !== undefined) {
    const validTypes = (await getMasterOptions("case_type")).map(([v]) => v);
    if (validTypes.includes(b.caseType)) data.caseType = b.caseType;
  }
  if (b.weddingDate) data.weddingDate = new Date(b.weddingDate);
  // 終了時刻："HH:MM"（開催日と合成）または ISO 文字列
  if (b.endTime !== undefined) {
    if (!b.endTime) data.endTime = null;
    else if (/^\d{1,2}:\d{2}$/.test(b.endTime)) {
      const base = (data.weddingDate as Date | undefined) ?? existing.weddingDate;
      const e = new Date(base); const [h, m] = b.endTime.split(":").map(Number);
      e.setHours(h, m, 0, 0);
      if (e <= base) e.setDate(e.getDate() + 1);
      data.endTime = e;
    } else data.endTime = new Date(b.endTime);
  }

  // 会場重複チェック：開催日／会場のいずれかを変更する場合のみ（他フィールドのみの編集では実行しない）
  const touchesSchedule = ["weddingDate", "endTime", "banquetVenueId", "chapelVenueId"].some((k) => b[k] !== undefined);
  if (touchesSchedule) {
    const newWeddingDate = (data.weddingDate as Date | undefined) ?? existing.weddingDate;
    const newEndTime = data.endTime !== undefined ? (data.endTime as Date | null) : existing.endTime;
    const newEnd = effectiveEnd(newWeddingDate, newEndTime);
    const dayStart = new Date(newWeddingDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 2);
    const venueChecks: ["banquetVenueId" | "chapelVenueId", string | null][] = [
      ["banquetVenueId", (data.banquetVenueId as string | null | undefined) ?? existing.banquetVenueId],
      ["chapelVenueId", (data.chapelVenueId as string | null | undefined) ?? existing.chapelVenueId],
    ];
    for (const [field, venueId] of venueChecks) {
      if (!venueId) continue;
      const sameVenue = await prisma.case.findMany({
        where: {
          id: { not: params.id },
          [field]: venueId,
          weddingDate: { gte: new Date(dayStart.getTime() - 86400000), lt: dayEnd },
        },
        include: { banquetVenue: true, chapelVenue: true },
      });
      const conflict = sameVenue.find((w) =>
        overlaps(newWeddingDate, newEnd, w.weddingDate, effectiveEnd(w.weddingDate, w.endTime)));
      if (conflict) {
        const vn = field === "banquetVenueId" ? conflict.banquetVenue?.name : conflict.chapelVenue?.name;
        return NextResponse.json(
          { error: `重複エラー：${vn} ${timeRangeLabel(conflict.weddingDate, conflict.endTime)} には既に「${conflict.groomName} & ${conflict.brideName}」の予定が入っています` },
          { status: 409 },
        );
      }
    }
  }

  const c = await prisma.case.update({ where: { id: params.id }, data });
  await audit(s.userId, "update", "case", c.id, data);
  return NextResponse.json({ case: c });
}
