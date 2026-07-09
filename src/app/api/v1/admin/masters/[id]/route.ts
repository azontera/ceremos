import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";

// PATCH: 表示名・並び順・有効/無効の変更（管理者のみ）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.label !== undefined) {
    if (!String(b.label).trim()) return NextResponse.json({ error: "表示名を入力してください" }, { status: 400 });
    data.label = String(b.label).trim();
  }
  if (b.sortOrder !== undefined) data.sortOrder = Number(b.sortOrder);
  if (b.isActive !== undefined) data.isActive = !!b.isActive;

  const o = await prisma.masterOption.update({ where: { id: params.id }, data });
  await audit(s.userId, "update", "master_option", o.id, data);
  return NextResponse.json({ option: o });
}

// DELETE: 選択肢の削除（管理者のみ）
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const o = await prisma.masterOption.delete({ where: { id: params.id } });
  await audit(s.userId, "delete", "master_option", o.id, { group: o.group, label: o.label });
  return NextResponse.json({ ok: true });
}
