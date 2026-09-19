import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { QUOTE_CONFIRMED_STATUSES } from "@/lib/quote-status";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// GET: 案件の請求書一覧
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "quotes", "view") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const invoices = await prisma.invoice.findMany({
    where: { caseId: params.id },
    orderBy: { issuedAt: "desc" },
  });
  return NextResponse.json({ invoices });
}

// POST: 請求書の発行（見積編集権限）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "quotes", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amount ?? 0);
  if (!amount || amount <= 0) return NextResponse.json({ error: "金額を入力してください" }, { status: 400 });

  // 見積から明細を転記（承認済み優先・なければ最新の非アーカイブ）
  let itemsJson: string | null = null;
  if (b.fromQuote) {
    const quote =
      (await prisma.quote.findFirst({ where: { caseId: params.id, status: { in: QUOTE_CONFIRMED_STATUSES } }, include: { items: true }, orderBy: { version: "desc" } })) ??
      (await prisma.quote.findFirst({ where: { caseId: params.id, status: { not: "archived" } }, include: { items: true }, orderBy: { version: "desc" } }));
    if (quote && quote.items.length > 0) {
      itemsJson = JSON.stringify(
        quote.items.map((i) => ({ name: i.name, category: i.category, qty: i.qty, unitPrice: i.unitPrice })),
      );
    }
  }

  // 請求番号: INV-YYYY-0001（年内連番）
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({ where: { number: { startsWith: `INV-${year}-` } } });
  const number = `INV-${year}-${String(count + 1).padStart(4, "0")}`;

  const inv = await prisma.invoice.create({
    data: {
      caseId: params.id,
      number,
      amount,
      dueAt: b.dueAt ? new Date(b.dueAt) : null,
      note: b.note?.trim() || null,
      itemsJson,
      status: "draft",
    },
  });
  await audit(s.userId, "create", "invoice", inv.id, { number, amount });
  return NextResponse.json({ invoice: inv }, { status: 201 });
}
