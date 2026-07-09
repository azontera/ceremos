import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";

const TYPES = ["meeting", "quote", "rundown", "mc_script", "audio_script", "meal_sheet", "order_sheet", "pack"];

// GET: テンプレート一覧（?type= で絞込。スタッフは閲覧可）
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "couple") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const type = req.nextUrl.searchParams.get("type");
  const templates = await prisma.template.findMany({
    where: type ? { type } : undefined,
    orderBy: { type: "asc" },
  });
  return NextResponse.json({ templates });
}

// POST: マイテンプレートの保存（進行表などを自分の型として登録。プランナー以上）
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["admin", "manager", "planner"].includes(s.role)) {
    return NextResponse.json({ error: "テンプレートの保存はプランナー以上のみ可能です" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));

  // ===== AIテンプレ一式（pack）のインポート：単体 or 配列JSONを検証して登録 =====
  if (b.type === "pack" || b.import) {
    const raw = typeof b.bodyJson === "string" ? b.bodyJson : JSON.stringify(b.bodyJson ?? {});
    const { parseLenientJson } = await import("@/lib/json-lenient");
    let list: unknown[] = [];
    try {
      // AI出力にありがちなコードフェンス・コメント・末尾カンマ・前後の説明文も許容して読み込む
      const parsed = parseLenientJson(raw);
      list = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return NextResponse.json({ error: "JSONとして読み込めません（AIの出力に説明文が混ざっていないか、途中で切れていないか確認してください）" }, { status: 400 });
    }
    const { parsePack } = await import("@/lib/template-pack");
    const { importCatalog } = await import("@/lib/catalog-import");
    const created: { id: string; name: string }[] = [];
    const errors: string[] = [];
    for (let i = 0; i < list.length; i++) {
      // 🛍 カタログ（kind: "ceremos-catalog"）：テンプレ一式と同じ貼り付け欄で一括読み込み
      const el = list[i] as { kind?: string } | null;
      if (el && typeof el === "object" && el.kind === "ceremos-catalog") {
        const r = await importCatalog(el);
        if (r.itemCount > 0) {
          created.push({ id: "catalog", name: `カタログ ${r.itemCount}品目（新規業者${r.vendorCount}件・写真つき）` });
          await audit(s.userId, "import", "catalog_item", undefined, { itemCount: r.itemCount, vendorCount: r.vendorCount });
        }
        errors.push(...r.errors);
        continue;
      }
      const { pack, error } = parsePack(JSON.stringify(list[i]));
      if (!pack) { errors.push(`${i + 1}件目：${error}`); continue; }
      const t = await prisma.template.create({
        data: { type: "pack", name: pack.name.trim(), bodyJson: JSON.stringify(pack), isSystem: false },
      });
      created.push({ id: t.id, name: t.name });
      await audit(s.userId, "create", "template", t.id, { type: "pack", name: t.name });
    }
    if (created.length === 0) {
      return NextResponse.json({ error: `読み込めるテンプレがありません（${errors.join("／") || "内容を確認してください"}）` }, { status: 400 });
    }
    return NextResponse.json({ created, errors }, { status: 201 });
  }

  // ===== まとめて削除（bulk）：POST { bulkDelete: true, ids?: string[], type?: string, all?: boolean } =====
  // ※ DELETEはbodyが届かない環境があるためPOSTで受ける。管理者のみ。
  if (b.bulkDelete) {
    if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ削除できます" }, { status: 403 });
    let where: { id?: { in: string[] }; type?: string } = {};
    if (Array.isArray(b.ids) && b.ids.length > 0) {
      where = { id: { in: b.ids.filter((x: unknown): x is string => typeof x === "string" && x.length > 0) } };
    } else if (b.all) {
      where = typeof b.type === "string" && b.type ? { type: b.type } : {};
    } else {
      return NextResponse.json({ error: "削除対象が指定されていません" }, { status: 400 });
    }
    if (where.id && where.id.in.length === 0) return NextResponse.json({ error: "削除対象が指定されていません" }, { status: 400 });
    // 削除前に自動バックアップ（失敗したら中止）
    const { backupDb } = await import("@/lib/db-backup");
    const bk = await backupDb("template-bulk-delete");
    if (!bk) return NextResponse.json({ error: "バックアップに失敗したため、削除を中止しました。時間をおいて再度お試しください。" }, { status: 500 });
    const del = await prisma.template.deleteMany({ where });
    await audit(s.userId, "delete", "template", undefined, { bulk: true, count: del.count, ...where });
    return NextResponse.json({ ok: true, count: del.count });
  }

  if (!TYPES.includes(b.type)) return NextResponse.json({ error: "不正な種類です" }, { status: 400 });
  if (!b.name?.trim()) return NextResponse.json({ error: "テンプレート名を入力してください" }, { status: 400 });

  const t = await prisma.template.create({
    data: {
      type: b.type,
      name: b.name.trim(),
      bodyJson: typeof b.bodyJson === "string" ? b.bodyJson : JSON.stringify(b.bodyJson ?? {}),
      isSystem: false, // 自作テンプレ（標準テンプレの一括差し替え対象外）
    },
  });
  await audit(s.userId, "create", "template", t.id, { type: t.type, name: t.name });
  return NextResponse.json({ template: t }, { status: 201 });
}
