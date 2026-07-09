// カタログ → 見積カード反映
// POST { items: [{ catalogItemId, qty }] }
// ・お客様（couple）も利用可。ただし価格は必ずサーバー側でカタログの定価を使う（定価でのみ追加できる）
// ・値引きはプランナー以上が見積編集（unitPrice変更・値引行の追加）で行う
// ・「最後の反映が正しい」＝常に最新バージョンへ反映する：
//   最新が下書き → その下書きに追記（同じ品目は数量加算）
//   最新が確認済/承認済 → 明細を引き継いだ新バージョン（下書き）を作成して追記
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // お客様（couple）またはスタッフ（quotes編集権限）のみ。案件メンバーであること
  const allowed = s.role === "couple" || can(s.role, "quotes", "edit");
  if (!allowed || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const reqs: { catalogItemId: string; qty: number }[] = Array.isArray(b.items)
    ? b.items
        .map((i: { catalogItemId?: string; qty?: number }) => ({
          catalogItemId: String(i?.catalogItemId ?? ""),
          qty: Math.max(1, Math.min(999, Math.round(Number(i?.qty ?? 1)) || 1)),
        }))
        .filter((i: { catalogItemId: string }) => i.catalogItemId)
    : [];
  if (reqs.length === 0) return NextResponse.json({ error: "追加する品目を選択してください" }, { status: 400 });

  const catItems = await prisma.catalogItem.findMany({
    where: { id: { in: reqs.map((r) => r.catalogItemId) }, isActive: true },
    include: { vendor: { select: { id: true, name: true } } },
  });
  if (catItems.length === 0) return NextResponse.json({ error: "品目が見つかりません" }, { status: 404 });

  // 追加する明細（価格はサーバー側でカタログ定価を採用＝お客様は定価でのみ追加できる）
  const additions = reqs.flatMap((r) => {
    const ci = catItems.find((c) => c.id === r.catalogItemId);
    if (!ci) return [];
    return [{
      name: ci.vendor ? `${ci.name}（${ci.vendor.name}）` : ci.name,
      category: ci.category,
      qty: r.qty,
      unitPrice: ci.price, // 定価
      vendorId: ci.vendorId,
    }];
  });

  const latest = await prisma.quote.findFirst({
    where: { caseId: params.id },
    orderBy: { version: "desc" },
    include: { items: true },
  });

  // ベースとなる明細（最新が下書きならその明細／それ以外は引き継ぎコピー／なければ空）
  const base: { name: string; category: string; qty: number; unitPrice: number; vendorId: string | null }[] =
    latest ? latest.items.map((i) => ({ name: i.name, category: i.category, qty: i.qty, unitPrice: i.unitPrice, vendorId: i.vendorId })) : [];

  // 同じ品目（名前・部門・単価・発注先が一致）は数量を加算、それ以外は行を追加
  for (const add of additions) {
    const hit = base.find((x) => x.name === add.name && x.category === add.category && x.unitPrice === add.unitPrice && x.vendorId === add.vendorId);
    if (hit) hit.qty += add.qty;
    else base.push({ ...add, vendorId: add.vendorId ?? null });
  }
  const total = base.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const noteAdd = `カタログから追加：${additions.map((a) => a.name).join("・")}（${s.name}）`;

  let quote;
  if (latest && latest.status === "draft") {
    // 下書きに直接反映
    await prisma.quoteItem.deleteMany({ where: { quoteId: latest.id } });
    quote = await prisma.quote.update({
      where: { id: latest.id },
      data: { total, note: latest.note ? latest.note : noteAdd, items: { create: base } },
      include: { items: true },
    });
  } else {
    // 確認済み/承認済み or 見積なし → 新バージョン（下書き）を作成して反映
    quote = await prisma.quote.create({
      data: {
        caseId: params.id,
        version: (latest?.version ?? 0) + 1,
        status: "draft",
        total,
        note: noteAdd,
        createdBy: s.userId,
        items: { create: base },
      },
      include: { items: true },
    });
  }
  await audit(s.userId, "catalog_add", "quote", quote.id, {
    version: quote.version, total,
    added: additions.map((a) => ({ name: a.name, qty: a.qty, unitPrice: a.unitPrice })),
  });
  return NextResponse.json({ quote, added: additions.length, newVersion: !(latest && latest.status === "draft") }, { status: 201 });
}
