import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// POST: 発注の追加
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "orders", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (!b.category || !b.note?.trim()) {
    return NextResponse.json({ error: "カテゴリと品目名は必須です" }, { status: 400 });
  }
  try {
    const o = await prisma.order.create({
      data: {
        caseId: params.id,
        vendorId: b.vendorId || null,
        category: b.category,
        amount: Number(b.amount || 0),
        dueAt: b.dueAt ? new Date(b.dueAt) : null,
        note: b.note.trim(),
        status: "pending",
      },
    });
    await audit(s.userId, "create", "order", o.id);
    return NextResponse.json({ order: o }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `サーバーエラー：${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
