import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";

const TYPES = ["banquet", "chapel", "waiting", "kitchen", "external"];
const MAX_BANQUET = 6;

// POST: 会場の追加（管理者のみ・宴会場は6会場まで）
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return NextResponse.json({ error: "会場名を入力してください" }, { status: 400 });
  const type = TYPES.includes(b.type) ? b.type : "banquet";

  if (type === "banquet") {
    const count = await prisma.venue.count({ where: { type: "banquet" } });
    if (count >= MAX_BANQUET) {
      return NextResponse.json({ error: `宴会場は最大${MAX_BANQUET}会場までです` }, { status: 400 });
    }
  }
  const dup = await prisma.venue.findFirst({ where: { name: b.name.trim() } });
  if (dup) return NextResponse.json({ error: "同名の会場が既に登録されています" }, { status: 409 });

  const v = await prisma.venue.create({
    data: {
      name: b.name.trim(), type, capacity: Number(b.capacity ?? 0),
      // 会場サイズ（m）。登録すると席次表キャンバスが実寸比になる
      widthM: b.widthM ? Math.max(3, Math.min(60, Number(b.widthM))) : null,
      depthM: b.depthM ? Math.max(3, Math.min(60, Number(b.depthM))) : null,
    },
  });
  await audit(s.userId, "create", "venue", v.id, { name: v.name });
  return NextResponse.json({ venue: v }, { status: 201 });
}
