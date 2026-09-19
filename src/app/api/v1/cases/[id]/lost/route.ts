// 失注の記録（docs/仕様_現行.md）
// POST: { reason: price|schedule|competitor|atmosphere|other, note? } — status="lost" にして理由・ステップ・日時を記録
// DELETE: 失注を取り消して商談中（contracted）に戻す
// 理由は必須（成果ダッシュボードで理由別に集計するため）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { LOST_REASONS } from "@/lib/case-types";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "couple" || !can(s.role, "cases", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (!LOST_REASONS.some(([v]) => v === b.reason)) {
    return NextResponse.json({ error: "失注理由を選択してください" }, { status: 400 });
  }
  const c = await prisma.case.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.case.update({
    where: { id: params.id },
    data: {
      status: "lost",
      lostReason: b.reason,
      lostNote: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 1000) : null,
      lostAt: new Date(),
    },
  });
  await audit(s.userId, "update", "case", params.id, { lost: b.reason });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "couple" || !can(s.role, "cases", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.case.update({
    where: { id: params.id },
    data: { status: "contracted", lostReason: null, lostNote: null, lostStep: null, lostAt: null },
  });
  await audit(s.userId, "update", "case", params.id, { lostCancelled: true });
  return NextResponse.json({ ok: true });
}
