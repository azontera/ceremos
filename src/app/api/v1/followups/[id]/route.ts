import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// PATCH: 対応状況の変更（open ⇔ done）・内容修正
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const f = await prisma.followUp.findUnique({ where: { id: params.id } });
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  const canEdit = can(s.role, "meetings", "edit") || can(s.role, "cases", "edit");
  if (s.role === "couple" || !canEdit || !(await canAccessCase(s, f.caseId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.status !== undefined && ["open", "done"].includes(b.status)) data.status = b.status;
  if (b.body !== undefined && String(b.body).trim()) data.body = String(b.body).trim();
  const updated = await prisma.followUp.update({ where: { id: params.id }, data });
  await audit(s.userId, "update", "followup", f.id, data);
  return NextResponse.json({ followup: updated });
}

// DELETE: 記録の削除
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const f = await prisma.followUp.findUnique({ where: { id: params.id } });
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  const canEdit = can(s.role, "meetings", "edit") || can(s.role, "cases", "edit");
  if (s.role === "couple" || !canEdit || !(await canAccessCase(s, f.caseId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.followUp.delete({ where: { id: params.id } });
  await audit(s.userId, "delete", "followup", f.id, { type: f.type, body: f.body, status: f.status });
  return NextResponse.json({ ok: true });
}
