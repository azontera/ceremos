import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";

// PATCH: 業者名・カテゴリの変更（管理者のみ）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.name?.trim()) data.name = b.name.trim();
  if (b.category) data.category = b.category;
  const v = await prisma.vendor.update({ where: { id: params.id }, data });
  await audit(s.userId, "update", "vendor", v.id, data);
  return NextResponse.json({ vendor: v });
}

// DELETE: 業者の削除（発注・所属ユーザーがいる場合は拒否）
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const [orders, users] = await Promise.all([
    prisma.order.count({ where: { vendorId: params.id } }),
    prisma.user.count({ where: { vendorId: params.id } }),
  ]);
  if (orders > 0 || users > 0) {
    return NextResponse.json(
      { error: `この業者は使用中のため削除できません（発注${orders}件・所属ユーザー${users}名）` },
      { status: 409 },
    );
  }
  await prisma.vendor.delete({ where: { id: params.id } });
  await audit(s.userId, "delete", "vendor", params.id);
  return NextResponse.json({ ok: true });
}
