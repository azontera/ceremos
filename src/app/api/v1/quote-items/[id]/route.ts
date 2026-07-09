import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// PATCH: 見積明細の編集
// - スタッフ（quotes編集権）: すべての明細
// - 業者アカウント: 自社紐付き（vendorId=自社）の明細のみ
// いずれも見積が draft / confirmed の間のみ。approved は不可。変更は監査ログへ記録
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const item = await prisma.quoteItem.findUnique({
    where: { id: params.id },
    include: { quote: true },
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isVendorOwn = !!s.vendorId && item.vendorId === s.vendorId;
  const isStaff = can(s.role, "quotes", "edit");
  if (!isVendorOwn && !isStaff) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await canAccessCase(s, item.quote.caseId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!["draft", "confirmed"].includes(item.quote.status)) {
    return NextResponse.json({ error: "承認済・アーカイブ済の見積は編集できません（新バージョンを作成してください）" }, { status: 400 });
  }

  const b = await req.json().catch(() => ({}));
  const before = { name: item.name, qty: item.qty, unitPrice: item.unitPrice };
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) {
    if (!String(b.name).trim()) return NextResponse.json({ error: "品目名を入力してください" }, { status: 400 });
    data.name = String(b.name).trim();
  }
  if (b.qty !== undefined) data.qty = Math.max(0, Number(b.qty) || 0);
  if (b.unitPrice !== undefined) data.unitPrice = Math.max(0, Number(b.unitPrice) || 0);

  const updated = await prisma.quoteItem.update({ where: { id: params.id }, data });

  // 見積合計を再計算
  const items = await prisma.quoteItem.findMany({ where: { quoteId: item.quoteId } });
  const total = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  await prisma.quote.update({ where: { id: item.quoteId }, data: { total } });

  await audit(s.userId, isVendorOwn ? "vendor-edit" : "update", "quote_item", item.id, {
    before, after: { name: updated.name, qty: updated.qty, unitPrice: updated.unitPrice }, quoteId: item.quoteId,
  });
  return NextResponse.json({ item: updated, total });
}
