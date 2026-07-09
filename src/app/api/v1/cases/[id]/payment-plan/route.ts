import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// GET: 支払予定一覧
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "quotes", "view") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const plans = await prisma.paymentPlan.findMany({
    where: { caseId: params.id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ plans });
}

// PUT: 支払予定の一括更新（内金／半金／全額など複数行）
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "quotes", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const rows: { label: string; amount: number; dueAt: string | null }[] = Array.isArray(b.plans) ? b.plans : [];

  await prisma.$transaction([
    prisma.paymentPlan.deleteMany({ where: { caseId: params.id } }),
    prisma.paymentPlan.createMany({
      data: rows
        .filter((r) => r.label?.trim())
        .map((r, i) => ({
          caseId: params.id,
          label: r.label.trim(),
          amount: Number(r.amount ?? 0),
          dueAt: r.dueAt ? new Date(r.dueAt) : null,
          sortOrder: i + 1,
        })),
    }),
  ]);
  await audit(s.userId, "update", "payment_plan", params.id, { rows: rows.length });
  const plans = await prisma.paymentPlan.findMany({ where: { caseId: params.id }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ plans });
}
