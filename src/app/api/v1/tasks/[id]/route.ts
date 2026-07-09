import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase, audit } from "@/lib/rbac";

// PATCH: タスクの完了/再開
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const t = await prisma.task.findUnique({ where: { id: params.id } });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (t.caseId && !(await canAccessCase(s, t.caseId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const status = b.status === "done" ? "done" : "open";
  const updated = await prisma.task.update({ where: { id: params.id }, data: { status } });
  await audit(s.userId, "update", "task", t.id, { status });
  return NextResponse.json({ task: updated });
}
