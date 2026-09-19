import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { normalizeQuoteStatus } from "@/lib/quote-status";

// POST: 見積の状態遷移 draft ⇄ confirmed（確定）／ archived（旧バージョン）
// 確定・取り消しは quotes 編集権（プランナー以上）。旧データの approved は confirmed として扱う
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canAccessCase(s, q.caseId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!can(s.role, "quotes", "edit")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { status } = await req.json().catch(() => ({}));
  const cur = normalizeQuoteStatus(q.status);
  const valid: Record<string, string[]> = {
    draft: ["confirmed", "archived"],
    confirmed: ["draft", "archived"], // draft へ = 確定の取り消し
    archived: ["draft"], // 旧バージョンからの復元
  };
  if (!valid[cur]?.includes(status)) {
    return NextResponse.json({ error: `「${cur}」から「${status}」へは変更できません` }, { status: 400 });
  }
  const updated = await prisma.quote.update({ where: { id: params.id }, data: { status } });
  // 確定取り消し時：見積連動で自動作成した未確定の発注を削除（見積と発注の乖離を防ぐ。再確定時に作り直される）
  if (cur === "confirmed" && status === "draft") {
    const removed = await prisma.order.deleteMany({
      where: { caseId: q.caseId, status: "pending", note: { startsWith: "【見積連動】" } },
    });
    if (removed.count > 0) await audit(s.userId, "auto-order-cleanup", "quote", q.id, { removed: removed.count });
  }
  // 確定時は他バージョンをアーカイブ＋業者紐づき品目から発注書を自動作成
  if (status === "confirmed") {
    await prisma.quote.updateMany({
      where: { caseId: q.caseId, id: { not: q.id }, status: { not: "archived" } },
      data: { status: "archived" },
    });

    const [items, c] = await Promise.all([
      prisma.quoteItem.findMany({ where: { quoteId: q.id, vendorId: { not: null } }, include: { vendor: true } }),
      prisma.case.findUnique({ where: { id: q.caseId }, select: { weddingDate: true } }),
    ]);
    if (items.length > 0) {
      // 以前の自動発注（未確定のもの）は作り直す
      await prisma.order.deleteMany({
        where: { caseId: q.caseId, status: "pending", note: { startsWith: "【見積連動】" } },
      });
      const byVendor = new Map<string, typeof items>();
      for (const it of items) {
        byVendor.set(it.vendorId!, [...(byVendor.get(it.vendorId!) ?? []), it]);
      }
      const dueAt = c ? new Date(c.weddingDate.getTime() - 2 * 86400000) : null;
      await prisma.order.createMany({
        data: [...byVendor.entries()].map(([vendorId, arr]) => ({
          caseId: q.caseId,
          vendorId,
          category: arr[0].vendor?.category ?? "other",
          amount: arr.reduce((s2, i) => s2 + i.qty * i.unitPrice, 0),
          note: `【見積連動】${arr.map((i) => i.name).join("・")}`,
          dueAt,
          status: "pending",
        })),
      });
      await audit(s.userId, "auto-order", "quote", q.id, { vendors: byVendor.size });
    }
  }
  await audit(s.userId, "status", "quote", q.id, { from: q.status, to: status });
  return NextResponse.json({ quote: updated });
}
