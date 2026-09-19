import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isQuoteConfirmed } from "@/lib/quote-status";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// PATCH: 下書き見積の明細をその場で編集（バージョンは増やさない）
// 確定済みの見積は履歴保護のため編集不可（新しいバージョンを作成してください）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!can(s.role, "quotes", "edit") || !(await canAccessCase(s, q.caseId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (q.status !== "draft") {
    return NextResponse.json({ error: "下書き以外の見積はその場で編集できません。新しいバージョンを作成してください" }, { status: 400 });
  }
  const b = await req.json().catch(() => ({}));
  const items = Array.isArray(b.items) ? b.items.filter((i: { name?: string }) => i.name?.trim()) : [];
  if (items.length === 0) return NextResponse.json({ error: "品目を1件以上入力してください" }, { status: 400 });
  const total = items.reduce((s2: number, i: { qty?: number; unitPrice?: number }) => s2 + Number(i.qty || 0) * Number(i.unitPrice || 0), 0);

  await prisma.quoteItem.deleteMany({ where: { quoteId: q.id } });
  const updated = await prisma.quote.update({
    where: { id: q.id },
    data: {
      note: b.note ?? q.note,
      total,
      items: {
        create: items.map((i: { name: string; category?: string; qty?: number; unitPrice?: number; vendorId?: string | null }) => ({
          name: i.name.trim(),
          category: i.category || "other",
          qty: Number(i.qty || 1),
          unitPrice: Number(i.unitPrice || 0),
          vendorId: i.vendorId || null,
        })),
      },
    },
    include: { items: true },
  });
  await audit(s.userId, "update", "quote", q.id, { version: q.version, total });
  return NextResponse.json({ quote: updated });
}

// DELETE: 見積バージョンの削除
// 確定済みは削除不可（先に「確定を取り消す」で下書きに戻してから）
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = await prisma.quote.findUnique({ where: { id: params.id }, include: { items: true } });
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!can(s.role, "quotes", "edit") || !(await canAccessCase(s, q.caseId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (isQuoteConfirmed(q.status)) {
    return NextResponse.json({ error: "確定済みの見積は削除できません。先に「確定を取り消す」で下書きに戻してください" }, { status: 400 });
  }
  await prisma.quote.delete({ where: { id: params.id } }); // 明細は cascade で削除
  // 復元できるよう明細スナップショットを監査ログに記録
  await audit(s.userId, "delete", "quote", q.id, {
    version: q.version, status: q.status, total: q.total, note: q.note,
    items: q.items.map((i) => ({ name: i.name, category: i.category, qty: i.qty, unitPrice: i.unitPrice, vendorId: i.vendorId })),
  });
  return NextResponse.json({ ok: true });
}
