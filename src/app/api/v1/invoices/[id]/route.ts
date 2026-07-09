import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// PATCH: 請求書の状態変更（draft → sent → paid）・修正
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const inv = await prisma.invoice.findUnique({ where: { id: params.id } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!can(s.role, "quotes", "edit") || !(await canAccessCase(s, inv.caseId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.status !== undefined) {
    const valid: Record<string, string[]> = { draft: ["sent"], sent: ["paid", "draft"], paid: ["sent"] };
    if (!valid[inv.status]?.includes(b.status)) {
      return NextResponse.json({ error: `「${inv.status}」から「${b.status}」へは変更できません` }, { status: 400 });
    }
    data.status = b.status;
    data.paidAt = b.status === "paid" ? (b.paidAt ? new Date(b.paidAt) : new Date()) : null;
  }
  if (inv.status === "draft") { // 下書きのみ金額等を修正可能
    if (b.amount !== undefined) data.amount = Number(b.amount);
    if (b.dueAt !== undefined) data.dueAt = b.dueAt ? new Date(b.dueAt) : null;
    if (b.note !== undefined) data.note = b.note?.trim() || null;
  }
  const updated = await prisma.invoice.update({ where: { id: params.id }, data });
  await audit(s.userId, "update", "invoice", inv.id, { ...data, paidAt: undefined, paid: b.status === "paid" || undefined });
  return NextResponse.json({ invoice: updated });
}

// DELETE: 下書きの削除
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const inv = await prisma.invoice.findUnique({ where: { id: params.id } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!can(s.role, "quotes", "edit") || !(await canAccessCase(s, inv.caseId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (inv.status !== "draft") return NextResponse.json({ error: "下書きのみ削除できます" }, { status: 400 });
  await prisma.invoice.delete({ where: { id: params.id } });
  await audit(s.userId, "delete", "invoice", inv.id, { number: inv.number });
  return NextResponse.json({ ok: true });
}
