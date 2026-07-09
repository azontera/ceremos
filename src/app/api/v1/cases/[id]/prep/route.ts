import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase } from "@/lib/rbac";

// 準備チェックリスト（招待状発送・衣装決定などの手動チェック）
// お客様・スタッフの両方から更新でき、双方で進捗を確認できる
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.key) return NextResponse.json({ error: "key が必要です" }, { status: 400 });
  const c = await prisma.case.findUnique({ where: { id: params.id }, select: { prepJson: true } });
  let prep: Record<string, boolean> = {};
  try { prep = JSON.parse(c?.prepJson ?? "{}"); } catch { /* ignore */ }
  prep[String(b.key)] = !!b.done;
  await prisma.case.update({ where: { id: params.id }, data: { prepJson: JSON.stringify(prep) } });
  return NextResponse.json({ ok: true, prep });
}
