import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { createDealForInvoice, freeeConfigured } from "@/lib/freee";
import { getSetting } from "@/lib/settings";

// この案件の未同期請求書を freee の収入取引として一括登録
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "quotes", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!freeeConfigured()) {
    return NextResponse.json({ error: "freee未設定：.env に FREEE_CLIENT_ID / FREEE_CLIENT_SECRET を設定してください" }, { status: 400 });
  }
  if (!(await getSetting("freee_access_token"))) {
    return NextResponse.json({ error: "freee未連携：管理者アカウントで「freeeと連携」を実行してください", needConnect: true }, { status: 400 });
  }

  const c = await prisma.case.findUnique({ where: { id: params.id } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const partnerName = c.brideName !== "―" ? `${c.groomName}・${c.brideName} 様` : `${c.groomName} 様`;

  const invoices = await prisma.invoice.findMany({
    where: { caseId: params.id, freeeDealId: null },
    orderBy: { issuedAt: "asc" },
  });
  if (invoices.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "未同期の請求書はありません（すべて同期済み）" });
  }

  const results: { number: string; ok: boolean; error?: string }[] = [];
  for (const inv of invoices) {
    try {
      const dealId = await createDealForInvoice(inv, partnerName);
      await prisma.invoice.update({ where: { id: inv.id }, data: { freeeDealId: String(dealId) } });
      results.push({ number: inv.number, ok: true });
    } catch (e) {
      results.push({ number: inv.number, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await audit(s.userId, "sync", "freee", params.id, { results });
  const okCount = results.filter((r) => r.ok).length;
  const errs = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: errs.length === 0,
    synced: okCount,
    company: await getSetting("freee_company_name"),
    errors: errs,
  });
}
