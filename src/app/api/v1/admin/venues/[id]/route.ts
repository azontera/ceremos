import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";

// PATCH: 会場名・定員の変更（管理者のみ）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.name?.trim()) data.name = b.name.trim();
  if (b.capacity !== undefined) data.capacity = Number(b.capacity) || 0;
  // 会場サイズ（m）。登録すると席次表キャンバスが実寸比になる。空欄で未設定に戻せる
  if (b.widthM !== undefined) data.widthM = b.widthM === "" || b.widthM === null ? null : Math.max(3, Math.min(60, Number(b.widthM)));
  if (b.depthM !== undefined) data.depthM = b.depthM === "" || b.depthM === null ? null : Math.max(3, Math.min(60, Number(b.depthM)));
  const v = await prisma.venue.update({ where: { id: params.id }, data });
  await audit(s.userId, "update", "venue", v.id, data);
  return NextResponse.json({ venue: v });
}

// DELETE: 会場の削除（使用中は拒否）
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const [banq, chap, events, assigns] = await Promise.all([
    prisma.case.count({ where: { banquetVenueId: params.id } }),
    prisma.case.count({ where: { chapelVenueId: params.id } }),
    prisma.calendarEvent.count({ where: { venueId: params.id } }),
    prisma.assignment.count({ where: { venueId: params.id } }),
  ]);
  const used = banq + chap + events + assigns;
  if (used > 0) {
    return NextResponse.json({ error: `この会場は使用中のため削除できません（案件${banq + chap}件・予定${events}件・割当${assigns}件）` }, { status: 409 });
  }
  await prisma.venue.delete({ where: { id: params.id } });
  await audit(s.userId, "delete", "venue", params.id);
  return NextResponse.json({ ok: true });
}
