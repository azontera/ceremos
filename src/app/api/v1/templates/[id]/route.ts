import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";
import { parsePack } from "@/lib/template-pack";

// PATCH: テンプレート編集（管理者のみ）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ編集できます" }, { status: 403 });

  const cur = await prisma.template.findUnique({ where: { id: params.id } });
  if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.name?.trim()) data.name = b.name.trim();
  if (b.bodyJson !== undefined) {
    if (cur.type === "pack") {
      // パックはスキーマ検証（name等の必須チェック）まで行う
      const { pack, error } = parsePack(b.bodyJson);
      if (!pack) return NextResponse.json({ error: `パックの内容が不正です：${error}` }, { status: 400 });
      if (!b.name?.trim()) data.name = pack.name.trim();
    } else {
      try { JSON.parse(b.bodyJson); } catch {
        return NextResponse.json({ error: "内容が正しいJSON形式ではありません" }, { status: 400 });
      }
    }
    data.bodyJson = b.bodyJson;
  }
  const t = await prisma.template.update({ where: { id: params.id }, data });
  await audit(s.userId, "update", "template", t.id);
  return NextResponse.json({ template: t });
}

// DELETE: テンプレート削除（管理者のみ。案件へ適用済みの内容はコピーなので影響しない）
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ削除できます" }, { status: 403 });

  const t = await prisma.template.delete({ where: { id: params.id } }).catch(() => null);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  await audit(s.userId, "delete", "template", t.id, { name: t.name, type: t.type });
  return NextResponse.json({ ok: true });
}
