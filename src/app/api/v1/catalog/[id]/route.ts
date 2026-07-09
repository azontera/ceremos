// 業者カタログ品目の編集・削除（スタッフ＝全品目／業者ユーザー＝自社品目のみ）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";
import { deleteFile } from "@/lib/storage";

async function authz(itemId: string) {
  const s = await getSession();
  if (!s) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const item = await prisma.catalogItem.findUnique({ where: { id: itemId } });
  if (!item) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  const isStaff = ["admin", "manager", "planner"].includes(s.role);
  const isOwn = !!s.vendorId && s.vendorId === item.vendorId;
  if (!isStaff && !isOwn) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { s, item };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await authz(params.id);
  if ("error" in a) return a.error;
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) {
    if (!String(b.name).trim()) return NextResponse.json({ error: "品目名を入力してください" }, { status: 400 });
    data.name = String(b.name).trim();
  }
  if (b.category !== undefined) data.category = String(b.category).trim() || "other";
  if (b.price !== undefined) data.price = Math.max(0, Math.round(Number(b.price) || 0));
  if (b.desc !== undefined) data.desc = String(b.desc) || null;
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  if (b.sortOrder !== undefined) data.sortOrder = Number(b.sortOrder) || 0;
  const item = await prisma.catalogItem.update({ where: { id: params.id }, data });
  await audit(a.s.userId, "update", "catalog_item", item.id, data);
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const a = await authz(params.id);
  if ("error" in a) return a.error;
  // 画像も削除
  const atts = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: params.id } });
  for (const att of atts) {
    await prisma.attachment.delete({ where: { id: att.id } });
    await deleteFile(att.fileKey);
  }
  await prisma.catalogItem.delete({ where: { id: params.id } });
  await audit(a.s.userId, "delete", "catalog_item", params.id, { name: a.item.name, category: a.item.category, price: a.item.price });
  return NextResponse.json({ ok: true });
}
