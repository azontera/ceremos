import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// PATCH: 発注ステータス変更（pending → confirmed → delivered）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const o = await prisma.order.findUnique({ where: { id: params.id } });
  if (!o) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canAccessCase(s, o.caseId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!can(s.role, "orders", "edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { status } = await req.json().catch(() => ({}));
  if (!["pending", "confirmed", "delivered"].includes(status)) {
    return NextResponse.json({ error: "不正なステータスです" }, { status: 400 });
  }
  const updated = await prisma.order.update({ where: { id: params.id }, data: { status } });
  await audit(s.userId, "status", "order", o.id, { from: o.status, to: status });
  return NextResponse.json({ order: updated });
}
