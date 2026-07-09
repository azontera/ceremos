import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// 料理コースメニュー（原価・売値）：meals 権限で編集

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const items = await prisma.menuItem.findMany({
    where: { caseId: params.id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const okRole = can(s.role, "meals", "edit") || can(s.role, "cases", "edit");
  if (!okRole || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const caseId = params.id;
  try {
    switch (b.op) {
      case "add": {
        if (!b.name?.trim()) return NextResponse.json({ error: "品名を入力してください" }, { status: 400 });
        const last = await prisma.menuItem.findFirst({ where: { caseId }, orderBy: { sortOrder: "desc" } });
        const item = await prisma.menuItem.create({
          data: {
            caseId,
            course: String(b.course ?? "前菜"),
            name: b.name.trim(),
            desc: b.desc?.trim() || null,
            cost: Math.max(0, Math.round(Number(b.cost) || 0)),
            price: Math.max(0, Math.round(Number(b.price) || 0)),
            sortOrder: (last?.sortOrder ?? 0) + 1,
          },
        });
        await audit(s.userId, "create", "menu_item", item.id);
        return NextResponse.json({ item }, { status: 201 });
      }
      case "update": {
        if (!b.itemId) return NextResponse.json({ error: "itemId が必要です" }, { status: 400 });
        const data: Record<string, unknown> = {};
        if (b.course !== undefined) data.course = String(b.course);
        if (b.name !== undefined && String(b.name).trim()) data.name = String(b.name).trim();
        if (b.desc !== undefined) data.desc = b.desc ? String(b.desc).trim() : null;
        if (b.cost !== undefined) data.cost = Math.max(0, Math.round(Number(b.cost) || 0));
        if (b.price !== undefined) data.price = Math.max(0, Math.round(Number(b.price) || 0));
        await prisma.menuItem.updateMany({ where: { id: b.itemId, caseId }, data });
        return NextResponse.json({ ok: true });
      }
      case "delete": {
        await prisma.menuItem.deleteMany({ where: { id: b.itemId, caseId } });
        await audit(s.userId, "delete", "menu_item", b.itemId);
        return NextResponse.json({ ok: true });
      }
      case "replaceItems": {
        // 料理プランの適用：既存メニューをクリアしてから上書き
        const items = Array.isArray(b.items) ? b.items : [];
        if (items.length === 0) return NextResponse.json({ error: "適用する品目がありません" }, { status: 400 });
        const data = items.map((it: { course?: string; name?: string; desc?: string; cost?: number; price?: number }, i: number) => ({
          caseId,
          course: String(it.course ?? "その他"),
          name: String(it.name ?? "").trim() || "（品名未設定）",
          desc: it.desc?.trim() || null,
          cost: Math.max(0, Math.round(Number(it.cost) || 0)),
          price: Math.max(0, Math.round(Number(it.price) || 0)),
          sortOrder: i + 1,
        }));
        const [del] = await prisma.$transaction([
          prisma.menuItem.deleteMany({ where: { caseId } }),
          prisma.menuItem.createMany({ data }),
        ]);
        await audit(s.userId, "apply_plan", "menu_item", caseId, { deleted: del.count, created: data.length, plan: b.planName ?? null });
        return NextResponse.json({ ok: true, deleted: del.count, count: data.length });
      }
      case "applyItems": {
        // テンプレートから選んだ品目をまとめて追加（既存の品目には触らない）
        const items = Array.isArray(b.items) ? b.items : [];
        if (items.length === 0) return NextResponse.json({ error: "追加する品目がありません" }, { status: 400 });
        const last = await prisma.menuItem.findFirst({ where: { caseId }, orderBy: { sortOrder: "desc" } });
        let sort = last?.sortOrder ?? 0;
        const data = items.map((it: { course?: string; name?: string; desc?: string; cost?: number; price?: number }) => ({
          caseId,
          course: String(it.course ?? "その他"),
          name: String(it.name ?? "").trim() || "（品名未設定）",
          desc: it.desc?.trim() || null,
          cost: Math.max(0, Math.round(Number(it.cost) || 0)),
          price: Math.max(0, Math.round(Number(it.price) || 0)),
          sortOrder: ++sort,
        }));
        await prisma.menuItem.createMany({ data });
        await audit(s.userId, "apply_template", "menu_item", caseId, { count: data.length });
        return NextResponse.json({ ok: true, count: data.length });
      }
      default:
        return NextResponse.json({ error: "不正な操作です" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `サーバーエラー：${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
