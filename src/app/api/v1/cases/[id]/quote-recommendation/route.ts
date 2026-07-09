import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase } from "@/lib/rbac";
import { recommendQuoteTemplate } from "@/lib/quote-recommend";

// GET: ヒヤリングシートの回答から初期見積テンプレートを推奨
// 見積ウィザードが呼び出し、「🎯 おすすめプラン」として表示する
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const c = await prisma.case.findUnique({
    where: { id: params.id },
    select: { caseType: true, guestCount: true },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 案件のお客様（couple）のヒヤリング回答をマージ（新郎・新婦どちらの回答も使う）
  const members = await prisma.caseMember.findMany({
    where: { caseId: params.id, user: { role: "couple" } },
    include: { user: { select: { profileJson: true } } },
  });
  const survey: Record<string, string> = {};
  for (const m of members) {
    try {
      const p = JSON.parse(m.user.profileJson ?? "{}");
      for (const [k, v] of Object.entries(p.survey ?? {})) {
        if (typeof v === "string" && v.trim() && !survey[k]) survey[k] = v;
      }
    } catch { /* ignore */ }
  }

  const tpls = await prisma.template.findMany({
    where: { type: "quote" },
    select: { id: true, name: true },
  });
  const rec = recommendQuoteTemplate(tpls, {
    caseType: c.caseType, guestCount: c.guestCount, survey,
  });
  return NextResponse.json({
    recommendation: rec,
    surveyAnswered: Object.keys(survey).length,
  });
}
