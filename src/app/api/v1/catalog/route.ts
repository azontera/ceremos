// 業者カタログ API
// GET: ログイン中の全ユーザー（お客様含む）が閲覧可。?category= で絞り込み
// POST: 品目の作成 — スタッフは任意（vendorId=null は自社品目）、業者ユーザーは自社のみ
//       出店（品目を持つ業者）は1カテゴリ最大3店舗までサーバー側で検証
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";
import { deleteFile } from "@/lib/storage";

const MAX_VENDORS_PER_CATEGORY = 3;

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const category = req.nextUrl.searchParams.get("category") || undefined;
  const vendorId = req.nextUrl.searchParams.get("vendorId") || undefined;
  const items = await prisma.catalogItem.findMany({
    where: { isActive: true, ...(category ? { category } : {}), ...(vendorId ? { vendorId } : {}) },
    include: { vendor: { select: { id: true, name: true, category: true } } },
    orderBy: [{ category: "asc" }, { vendorId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  // 画像（Attachment parentType="catalog"）をまとめて取得
  const atts = await prisma.attachment.findMany({
    where: { parentType: "catalog", parentId: { in: items.map((i) => i.id) } },
  });
  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id, category: i.category, name: i.name, desc: i.desc, price: i.price,
      vendorId: i.vendorId, vendorName: i.vendor?.name ?? null,
      imageId: atts.find((a) => a.parentId === i.id)?.id ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const isStaff = ["admin", "manager", "planner"].includes(s.role);
  if (!isStaff && !s.vendorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));

  // ===== まとめて削除（bulk）：POST { bulkDelete: true, ids?: string[], all?: boolean, vendorId?: string|null } =====
  // ※ DELETEはbodyが届かない環境があるためPOSTで受ける。写真（Attachment＋実ファイル）も一緒に削除。
  //   権限：スタッフ=全品目／業者ユーザー=自社品目のみ（対象を権限のあるものだけに絞ってから削除）。
  if (b.bulkDelete) {
    let where: { id?: { in: string[] }; vendorId?: string | null } = {};
    if (Array.isArray(b.ids) && b.ids.length > 0) {
      where.id = { in: b.ids.filter((x: unknown): x is string => typeof x === "string" && x.length > 0) };
      if (where.id.in.length === 0) return NextResponse.json({ error: "削除対象が指定されていません" }, { status: 400 });
    } else if (b.all) {
      // all のときは対象範囲を vendorId で限定（null=式場品目・省略/未指定=全業者＋式場）
      if (b.vendorId !== undefined) where.vendorId = b.vendorId ? String(b.vendorId) : null;
    } else {
      return NextResponse.json({ error: "削除対象が指定されていません" }, { status: 400 });
    }
    // 業者ユーザーは自社品目のみに強制
    if (!isStaff) where = { ...where, vendorId: s.vendorId! };

    const targets = await prisma.catalogItem.findMany({ where, select: { id: true } });
    const ids = targets.map((t) => t.id);
    if (ids.length === 0) return NextResponse.json({ ok: true, count: 0 });
    // 削除前に自動バックアップ（失敗したら削除を中止＝復元できない削除を防ぐ）
    const { backupDb } = await import("@/lib/db-backup");
    const bk = await backupDb(`catalog-delete-${ids.length}`);
    if (!bk) return NextResponse.json({ error: "バックアップに失敗したため、削除を中止しました。時間をおいて再度お試しください。" }, { status: 500 });
    // 写真（実ファイル→Attachmentレコード）を削除
    const atts = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: { in: ids } } });
    for (const att of atts) await deleteFile(att.fileKey);
    await prisma.attachment.deleteMany({ where: { parentType: "catalog", parentId: { in: ids } } });
    const del = await prisma.catalogItem.deleteMany({ where: { id: { in: ids } } });
    await audit(s.userId, "delete", "catalog_item", undefined, { bulk: true, count: del.count });
    return NextResponse.json({ ok: true, count: del.count });
  }

  const name = String(b.name ?? "").trim();
  const category = String(b.category ?? "other").trim() || "other";
  const price = Math.max(0, Math.round(Number(b.price ?? 0)));
  if (!name) return NextResponse.json({ error: "品目名を入力してください" }, { status: 400 });

  // 業者ユーザーは自社品目のみ／スタッフは任意（未指定=自社=式場品目）
  const vendorId: string | null = isStaff ? (b.vendorId ? String(b.vendorId) : null) : s.vendorId!;

  // 出店数の制限：このカテゴリに品目を持つ業者が既に3店舗あり、自分が未出店なら不可
  if (vendorId) {
    const rows = await prisma.catalogItem.findMany({
      where: { category, isActive: true, vendorId: { not: null } },
      select: { vendorId: true }, distinct: ["vendorId"],
    });
    const vendorIds = new Set(rows.map((r) => r.vendorId));
    if (!vendorIds.has(vendorId) && vendorIds.size >= MAX_VENDORS_PER_CATEGORY) {
      return NextResponse.json({ error: `このカテゴリへの出店は${MAX_VENDORS_PER_CATEGORY}店舗までです（現在${vendorIds.size}店舗が出店中）` }, { status: 400 });
    }
  }

  const item = await prisma.catalogItem.create({
    data: { name, category, price, desc: b.desc ? String(b.desc) : null, vendorId, sortOrder: Number(b.sortOrder ?? 0) || 0 },
  });
  await audit(s.userId, "create", "catalog_item", item.id, { name, category, price, vendorId });
  return NextResponse.json({ item }, { status: 201 });
}
