// カタログ・見積で実際に組んだ案件の内容（見積・料理・進行表・リソース・席次）を
// テンプレート一式（type=pack）として登録する。「カタログで作った見積もりをテンプレ登録できる」機能。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { buildPackFromCase } from "@/lib/template-pack";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "quotes", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "テンプレート名を入力してください" }, { status: 400 });
  const category = ["bridal", "banquet", "other"].includes(b.category) ? b.category : "other";

  const { pack, error } = await buildPackFromCase(params.id, { name, category, description: b.description });
  if (!pack) return NextResponse.json({ error: error ?? "テンプレートを作成できませんでした" }, { status: 400 });

  const t = await prisma.template.create({
    data: { type: "pack", name, bodyJson: JSON.stringify(pack) },
  });
  await audit(s.userId, "create", "template_pack", t.id, { name, fromCaseId: params.id });
  return NextResponse.json({ id: t.id, name: t.name }, { status: 201 });
}
