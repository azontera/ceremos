import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// POST: リソース割当（控室・厨房・スタッフ・備品）＋重複チェック
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "cases", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (!["waiting", "kitchen", "staff", "equipment"].includes(b.kind)) {
    return NextResponse.json({ error: "不正な種別です" }, { status: 400 });
  }
  if (!b.label?.trim() || !b.startsAt || !b.endsAt) {
    return NextResponse.json({ error: "名称・開始・終了は必須です" }, { status: 400 });
  }
  const startsAt = new Date(b.startsAt);
  const endsAt = new Date(b.endsAt);
  if (!(startsAt < endsAt)) {
    return NextResponse.json({ error: "終了時刻は開始時刻より後にしてください" }, { status: 400 });
  }

  try {
    // 重複チェック：会場（控室/厨房）は同一会場、スタッフは同一人物の時間帯重複を拒否
    const overlap = { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } };
    if ((b.kind === "waiting" || b.kind === "kitchen") && b.venueId) {
      const conflict = await prisma.assignment.findFirst({
        where: { venueId: b.venueId, ...overlap },
        include: { case: { select: { groomName: true, brideName: true } }, venue: true },
      });
      if (conflict) {
        return NextResponse.json(
          { error: `重複エラー：${conflict.venue?.name} はその時間帯「${conflict.case.groomName} & ${conflict.case.brideName}」が使用中です` },
          { status: 409 },
        );
      }
    }
    if (b.kind === "staff" && b.userId) {
      const conflict = await prisma.assignment.findFirst({
        where: { userId: b.userId, ...overlap },
        include: { case: { select: { groomName: true, brideName: true } }, user: { select: { name: true } } },
      });
      if (conflict) {
        return NextResponse.json(
          { error: `重複エラー：${conflict.user?.name} さんはその時間帯「${conflict.case.groomName} & ${conflict.case.brideName}」に割当済みです` },
          { status: 409 },
        );
      }
    }

    const a = await prisma.assignment.create({
      data: {
        caseId: params.id,
        kind: b.kind,
        venueId: b.venueId || null,
        userId: b.userId || null,
        label: b.label.trim(),
        startsAt, endsAt,
      },
    });
    await audit(s.userId, "create", "assignment", a.id, { kind: b.kind, label: b.label });
    return NextResponse.json({ assignment: a }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `サーバーエラー：${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}

// DELETE: /api/v1/cases/[id]/assignments?aid=xxx
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "cases", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const aid = req.nextUrl.searchParams.get("aid");
  if (!aid) return NextResponse.json({ error: "aid が必要です" }, { status: 400 });
  await prisma.assignment.deleteMany({ where: { id: aid, caseId: params.id } });
  await audit(s.userId, "delete", "assignment", aid);
  return NextResponse.json({ ok: true });
}
