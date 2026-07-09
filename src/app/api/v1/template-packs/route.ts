import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadPacks, packSummary, scorePack, WizardAnswers } from "@/lib/template-pack";

export const dynamic = "force-dynamic";

// GET: テンプレ一式（パック）の一覧＋ウィザード回答によるおすすめ順
// お客様（couple）も閲覧可（新規ウィザードでプランを選ぶため。内容は見積として本人に提示されるもの）
// クエリ: style / guests / budgetMan / timeSlot（あればスコア順に並べ、reasonsを付ける）
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const ans: WizardAnswers = {
    style: sp.get("style") || undefined,
    guests: sp.get("guests") ? Number(sp.get("guests")) : undefined,
    budgetMan: sp.get("budgetMan") ? Number(sp.get("budgetMan")) : undefined,
    timeSlot: sp.get("timeSlot") || undefined,
  };
  const hasAns = !!(ans.style || ans.guests || ans.budgetMan || ans.timeSlot);

  const packs = await loadPacks();
  const list = packs.map(({ id, pack }) => {
    const sc = hasAns ? scorePack(pack, ans) : { score: 0, reasons: [] };
    return {
      id,
      name: pack.name,
      category: pack.category ?? "other",
      description: pack.description ?? "",
      wizard: pack.wizard ?? {},
      summary: packSummary(pack),
      score: sc.score,
      reasons: sc.reasons,
    };
  });
  if (hasAns) list.sort((a, b) => b.score - a.score);
  return NextResponse.json({ packs: list, scored: hasAns });
}
