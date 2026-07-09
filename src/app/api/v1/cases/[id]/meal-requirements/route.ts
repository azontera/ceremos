import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// POST: 料理配慮事項の追加
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "meals", "edit") && !can(s.role, "cases", "edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.guestLabel?.trim() || !b.type || !b.detail?.trim()) {
    return NextResponse.json({ error: "すべての項目を入力してください" }, { status: 400 });
  }
  const m = await prisma.mealRequirement.create({
    data: { caseId: params.id, guestLabel: b.guestLabel.trim(), type: b.type, detail: b.detail.trim() },
  });
  await audit(s.userId, "create", "meal_requirement", m.id);
  return NextResponse.json({ req: m }, { status: 201 });
}

// DELETE: /api/v1/cases/[id]/meal-requirements?reqId=xxx
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if ((!can(s.role, "meals", "edit") && !can(s.role, "cases", "edit")) || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const reqId = req.nextUrl.searchParams.get("reqId");
  if (!reqId) return NextResponse.json({ error: "reqId が必要です" }, { status: 400 });
  await prisma.mealRequirement.deleteMany({ where: { id: reqId, caseId: params.id } });
  await audit(s.userId, "delete", "meal_requirement", reqId);
  return NextResponse.json({ ok: true });
}
