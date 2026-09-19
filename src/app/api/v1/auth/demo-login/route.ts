// ===== 検証用ワンクリックログイン（DEMO_MODE=1 のときだけ有効）=====
// ログイン画面に「お客・管理・プランナー」のボタンを出し、クリックだけでログインできる。
// 本番では .env に DEMO_MODE を設定しない（=無効）。コードを消す必要はない。
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/clock";
import { audit } from "@/lib/rbac";

const ROLE_JP: Record<string, string> = { admin: "管理者", manager: "支配人", planner: "プランナー", couple: "お客様" };

// GET: デモアカウント一覧（ボタン表示用）— 管理者1・プランナー2・新郎新婦3組
export async function GET() {
  if (!DEMO_MODE) return NextResponse.json({ enabled: false, accounts: [] });
  const [staff, coupleUsers] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["admin", "planner"] }, isActive: true },
      orderBy: { createdAt: "asc" }, select: { id: true, name: true, role: true },
    }),
    prisma.user.findMany({
      where: { role: "couple", isActive: true },
      orderBy: { createdAt: "asc" }, take: 3, select: { id: true, name: true },
    }),
  ]);
  const accounts: { key: string; label: string; userId?: string; role?: string; seq?: number }[] = [];

  const admin = staff.find((u) => u.role === "admin");
  if (admin) accounts.push({ key: "admin", label: `👑 管理者（${admin.name}）`, userId: admin.id });
  else accounts.push({ key: "admin", label: "👑 管理者（自動作成）", role: "admin", seq: 1 });

  // プランナー×2（1人しかいない/いない環境でも2つ目を自動作成して独立ログインできるように）
  const planners = staff.filter((u) => u.role === "planner");
  for (let i = 0; i < 2; i++) {
    const p = planners[i];
    if (p) accounts.push({ key: `planner${i + 1}`, label: `💐 プランナー${i + 1}（${p.name}）`, userId: p.id });
    else accounts.push({ key: `planner${i + 1}`, label: `💐 プランナー${i + 1}（自動作成）`, role: "planner", seq: i + 1 });
  }

  // 新郎新婦×3組
  for (let i = 0; i < 3; i++) {
    const c = coupleUsers[i];
    if (c) accounts.push({ key: `couple${i + 1}`, label: `👰 新郎新婦${i + 1}組（${c.name}）`, userId: c.id });
    else accounts.push({ key: `couple${i + 1}`, label: `👰 新郎新婦${i + 1}組（自動作成）`, role: "couple", seq: i + 1 });
  }

  return NextResponse.json({ enabled: true, accounts });
}

// POST: ワンクリックログイン { userId } または { role, seq? }（居なければデモユーザーを自動作成）
// seq: role内で複数の別アカウントを区別するための連番（例: プランナー1/2）。メールを固定してべき等に作成する
export async function POST(req: NextRequest) {
  if (!DEMO_MODE) return NextResponse.json({ error: "検証モードは無効です" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  let user = b.userId ? await prisma.user.findUnique({ where: { id: String(b.userId) } }) : null;

  if (!user && b.role) {
    const hash = await bcrypt.hash("wedding2026", 10);
    const role = String(b.role);
    if (!["admin", "manager", "planner", "couple"].includes(role)) {
      return NextResponse.json({ error: "不正なロールです" }, { status: 400 });
    }
    const seq = Math.max(1, Number(b.seq) || 1);
    if (seq === 1) {
      // 1人目は既存の最古アカウントを優先（本番投入済みの実データを壊さない）
      user = await prisma.user.findFirst({ where: { role, isActive: true }, orderBy: { createdAt: "asc" } })
        ?? await prisma.user.create({
          data: { name: `デモ ${ROLE_JP[role] ?? role}`, email: `demo-${role}@example.com`, passwordHash: hash, role },
        });
    } else {
      // 2人目以降はメールで固定し、同じ人を指すよう冪等に作成
      const email = `demo-${role}-${seq}@example.com`;
      user = await prisma.user.findUnique({ where: { email } })
        ?? await prisma.user.create({
          data: { name: `デモ ${ROLE_JP[role] ?? role}${seq}`, email, passwordHash: hash, role },
        });
    }
  }
  if (!user || !user.isActive || user.vendorId) return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 404 });
  await createSession({ userId: user.id, name: user.name, role: user.role });
  await audit(user.id, "demo_login", "auth");
  return NextResponse.json({ ok: true, role: user.role });
}
