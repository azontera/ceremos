// 🖼 フル画面カタログ（/catalog）用の公開API — ログイン不要で閲覧できる
// 返すもの：式場名・ロゴ／公開中の全品目（定価・写真）／閲覧者情報（ログイン中なら見積反映先の案件）
// ※ 価格は定価のみ。見積への反映は既存の catalog-add API（要ログイン・価格はサーバー強制）を使う
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { can, caseScopeWhere } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const [items, venueName, venueLogo] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { isActive: true },
      include: { vendor: { select: { name: true } } },
      orderBy: [{ category: "asc" }, { vendorId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    getSetting("venue_name"),
    getSetting("venue_logo"),
  ]);
  const atts = await prisma.attachment.findMany({
    where: { parentType: "catalog", parentId: { in: items.map((i) => i.id) } },
    select: { id: true, parentId: true },
  });

  // 閲覧者（ログインしていれば）：coupleは自分の案件へ自動反映、スタッフ（見積編集権限あり）は案件を選んで反映
  const s = await getSession().catch(() => null);
  let viewer: { role: string; name: string; caseId: string | null; cases: { id: string; label: string }[] } | null = null;
  if (s) {
    let caseId: string | null = null;
    let cases: { id: string; label: string }[] = [];
    if (s.role === "couple") {
      const m = await prisma.caseMember.findFirst({
        where: { userId: s.userId },
        orderBy: { case: { createdAt: "desc" } },
        select: { caseId: true },
      });
      caseId = m?.caseId ?? null;
    } else if (can(s.role, "quotes", "edit")) {
      const rows = await prisma.case.findMany({
        where: await caseScopeWhere(s),
        orderBy: { weddingDate: "desc" },
        select: { id: true, groomName: true, brideName: true, weddingDate: true },
        take: 200,
      });
      cases = rows.map((c) => ({
        id: c.id,
        label: `${c.groomName}・${c.brideName}（${c.weddingDate.toLocaleDateString("ja-JP")}）`,
      }));
    }
    viewer = { role: s.role, name: s.name, caseId, cases };
  }

  return NextResponse.json({
    venueName, venueLogo,
    viewer,
    items: items.map((i) => ({
      id: i.id, category: i.category, name: i.name, desc: i.desc, price: i.price,
      vendorName: i.vendor?.name ?? null,
      imageId: atts.find((a) => a.parentId === i.id)?.id ?? null,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
