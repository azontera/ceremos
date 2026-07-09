import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";
import { MASTER_GROUPS } from "@/lib/masters";

// GET: 選択肢一覧（管理者・支配人・プランナーは閲覧可）
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const group = req.nextUrl.searchParams.get("group") ?? undefined;
  const options = await prisma.masterOption.findMany({
    where: group ? { group } : {},
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
  });
  return NextResponse.json({ options });
}

// POST: 選択肢の追加（管理者のみ）
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!MASTER_GROUPS[b.group]) return NextResponse.json({ error: "不正なグループです" }, { status: 400 });
  if (!b.label?.trim()) return NextResponse.json({ error: "表示名を入力してください" }, { status: 400 });
  const value = (b.value?.trim() || `opt_${Date.now().toString(36)}`).toLowerCase();

  const dup = await prisma.masterOption.findUnique({ where: { group_value: { group: b.group, value } } });
  if (dup) return NextResponse.json({ error: "同じ内部値が既に登録されています" }, { status: 409 });

  const max = await prisma.masterOption.aggregate({ where: { group: b.group }, _max: { sortOrder: true } });
  const o = await prisma.masterOption.create({
    data: { group: b.group, value, label: b.label.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  await audit(s.userId, "create", "master_option", o.id, { group: o.group, label: o.label });
  return NextResponse.json({ option: o }, { status: 201 });
}
