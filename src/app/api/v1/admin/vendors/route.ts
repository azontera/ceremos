import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";

const CATEGORIES = ["dress", "florist", "catering", "audio", "mc", "photo", "video", "gift", "print", "beauty"];

// POST: 業者の追加（管理者のみ）
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return NextResponse.json({ error: "業者名を入力してください" }, { status: 400 });
  if (!CATEGORIES.includes(b.category)) return NextResponse.json({ error: "不正なカテゴリです" }, { status: 400 });

  const dup = await prisma.vendor.findFirst({ where: { name: b.name.trim() } });
  if (dup) return NextResponse.json({ error: "同名の業者が既に登録されています" }, { status: 409 });

  const v = await prisma.vendor.create({ data: { name: b.name.trim(), category: b.category } });
  await audit(s.userId, "create", "vendor", v.id, { name: v.name });
  return NextResponse.json({ vendor: v }, { status: 201 });
}
