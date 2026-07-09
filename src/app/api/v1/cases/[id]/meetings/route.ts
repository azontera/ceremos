import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// POST: 打ち合わせ記録の作成
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "meetings", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (!b.heldAt) return NextResponse.json({ error: "日時は必須です" }, { status: 400 });

  const m = await prisma.meeting.create({
    data: {
      caseId: params.id,
      heldAt: new Date(b.heldAt),
      staffId: s.userId,
      minutes: b.minutes || null,
      decisions: b.decisions || null,
      homework: b.homework || null,
      internalNote: b.internalNote || null,
      nextAt: b.nextAt ? new Date(b.nextAt) : null,
    },
  });
  // 次回予定はカレンダーにも登録
  if (b.nextAt) {
    const c = await prisma.case.findUnique({ where: { id: params.id }, select: { groomName: true, brideName: true } });
    const start = new Date(b.nextAt);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    await prisma.calendarEvent.create({
      data: {
        caseId: params.id, type: "meeting",
        title: `${c?.groomName ?? ""}様・${c?.brideName ?? ""}様 打ち合わせ`,
        startsAt: start, endsAt: end,
      },
    });
  }
  await audit(s.userId, "create", "meeting", m.id);
  return NextResponse.json({ meeting: m }, { status: 201 });
}
