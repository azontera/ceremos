// ===== 検証用ワンクリックログイン（DEMO_MODE=1 のときだけ有効）=====
// ログイン画面に「お客・管理・プランナー・各業者」のボタンを出し、クリックだけでログインできる。
// 本番では .env に DEMO_MODE を設定しない（=無効）。コードを消す必要はない。
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/clock";
import { audit } from "@/lib/rbac";

const CAT_LABEL: Record<string, string> = {
  dress: "ドレス", florist: "花", catering: "料理", audio: "音響", mc: "司会",
  photo: "写真", video: "映像", gift: "引出物", print: "印刷", beauty: "美容",
};
const VENDOR_ROLE: Record<string, string> = {
  dress: "dress", florist: "florist", catering: "chef", audio: "audio", mc: "mc",
  photo: "photo", video: "photo", gift: "gift", print: "print", beauty: "dress",
};
// デモボタンに出す業者カテゴリ（要望どおりドレス・引出物・花の3種のみ）
const DEMO_VENDOR_CATS: string[] = ["dress", "gift", "florist"];
const ROLE_JP: Record<string, string> = { admin: "管理者", manager: "支配人", planner: "プランナー", couple: "お客様" };

// GET: デモアカウント一覧（ボタン表示用）— 管理者1・プランナー2・新郎新婦3組・業者3（ドレス/引出物/花）
export async function GET() {
  if (!DEMO_MODE) return NextResponse.json({ enabled: false, accounts: [] });
  const [staff, coupleUsers, vendors] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["admin", "planner"] }, isActive: true },
      orderBy: { createdAt: "asc" }, select: { id: true, name: true, role: true },
    }),
    prisma.user.findMany({
      where: { role: "couple", isActive: true, approved: true },
      orderBy: { createdAt: "asc" }, take: 3, select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
      where: { category: { in: DEMO_VENDOR_CATS } },
      include: { users: { where: { isActive: true }, take: 1, select: { id: true, name: true } } },
    }),
  ]);
  const accounts: { key: string; label: string; userId?: string; role?: string; vendorCategory?: string; seq?: number }[] = [];

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

  // 業者×3（ドレス／引出物／花。各カテゴリ最初の1社を採用、無ければ自動作成）
  for (const cat of DEMO_VENDOR_CATS) {
    const v = vendors.find((x) => x.category === cat);
    const u = v?.users[0];
    if (u) accounts.push({ key: `vendor:${cat}`, label: `🏪 業者・${CAT_LABEL[cat]}（${v!.name}）`, userId: u.id, vendorCategory: cat });
    else accounts.push({ key: `vendor:${cat}`, label: `🏪 業者・${CAT_LABEL[cat]}（自動作成）`, vendorCategory: cat });
  }

  return NextResponse.json({ enabled: true, accounts });
}

// POST: ワンクリックログイン { userId } または { role, seq? } / { vendorCategory }（居なければデモユーザーを自動作成）
// seq: role内で複数の別アカウントを区別するための連番（例: プランナー1/2）。メールを固定してべき等に作成する
export async function POST(req: NextRequest) {
  if (!DEMO_MODE) return NextResponse.json({ error: "検証モードは無効です" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  let user = b.userId ? await prisma.user.findUnique({ where: { id: String(b.userId) } }) : null;

  if (!user && (b.role || b.vendorCategory)) {
    const hash = await bcrypt.hash("wedding2026", 10);
    if (b.vendorCategory) {
      const cat = String(b.vendorCategory);
      if (!VENDOR_ROLE[cat]) return NextResponse.json({ error: "不正なカテゴリです" }, { status: 400 });
      const existing = await prisma.vendor.findFirst({ where: { category: cat }, include: { users: { where: { isActive: true }, take: 1 } } });
      if (existing?.users[0]) {
        user = await prisma.user.findUnique({ where: { id: existing.users[0].id } });
      } else {
        const vendorRec = existing
          ?? await prisma.vendor.create({ data: { name: `デモ${CAT_LABEL[cat]}店`, category: cat } });
        user = await prisma.user.create({
          data: {
            name: `${vendorRec.name} 担当`, email: `demo-vendor-${cat}@example.com`,
            passwordHash: hash, role: VENDOR_ROLE[cat], vendorId: vendorRec.id,
          },
        });
      }
    } else {
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
  }
  if (!user || !user.isActive) return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 404 });
  await createSession({ userId: user.id, name: user.name, role: user.role, vendorId: user.vendorId });
  await audit(user.id, "demo_login", "auth");
  return NextResponse.json({ ok: true, role: user.role });
}
