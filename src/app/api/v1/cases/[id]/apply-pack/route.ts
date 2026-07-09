import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { parsePack, applyPackToCase } from "@/lib/template-pack";

// POST: テンプレ一式（パック）を案件へ適用
// body: { templateId } — 見積(下書き)・料理・席次・リソース・進行表・手配リストまで一括セットアップ
// 権限: スタッフ（quotes編集可）／お客様（couple）は「その案件にまだ見積が無いとき」のみ可
//       （客用の新規ウィザード。作られる見積は下書きで、確定はプランナーが行う）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const isStaff = can(s.role, "quotes", "edit");
  if (!isStaff) {
    if (s.role !== "couple") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const quoteCount = await prisma.quote.count({ where: { caseId: params.id } });
    if (quoteCount > 0) {
      return NextResponse.json({ error: "すでにお見積りが作成されています。変更はプランナーへご相談ください" }, { status: 403 });
    }
  }

  const b = await req.json().catch(() => ({}));
  if (!b.templateId) return NextResponse.json({ error: "templateId は必須です" }, { status: 400 });
  const t = await prisma.template.findFirst({ where: { id: String(b.templateId), type: "pack" } });
  if (!t) return NextResponse.json({ error: "テンプレが見つかりません" }, { status: 404 });
  const { pack, error } = parsePack(t.bodyJson);
  if (!pack) return NextResponse.json({ error: `テンプレの内容が不正です：${error}` }, { status: 400 });

  try {
    const done = await applyPackToCase(params.id, pack, { createQuote: true, createdBy: s.userId });
    await audit(s.userId, "apply", "template_pack", t.id, { caseId: params.id, name: pack.name, done });
    return NextResponse.json({ ok: true, name: pack.name, autoSetup: done });
  } catch (e) {
    console.error("apply-pack failed:", e);
    return NextResponse.json({ error: `サーバーエラー：${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
