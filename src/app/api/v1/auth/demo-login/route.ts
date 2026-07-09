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
  dress: "ドレス", florist: "装花", catering: "料理", audio: "音響", mc: "司会",
  photo: "写真", video: "映像", gift: "引出物", print: "印刷", beauty: "美容",
};
const VENDOR_ROLE: Record<string, string> = {
  dress: "dress", florist: "florist", catering: "chef", audio: "audio", mc: "mc",
  photo: "photo", video: "photo", gift: "gift", print: "print", beauty: "dress",
};

// GET: デモアカウント一覧（ボタン表示用）
export async function GET() {
  if (!DEMO_MODE) return NextResponse.json({ enabled: false, accounts: [] });
  const [staff, coupleUsers, vendors] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["admin", "manager", "planner"] }, isActive: true },
      orderBy: { createdAt: "asc" }, select: { id: true, name: true, role: true },
    }),
    prisma.user.findMany({
      where: { role: "couple", isActive: true, approved: true },
      orderBy: { createdAt: "asc" }, take: 3, select: { id: true, name: true },
    }),
    prisma.vendor.findMany({ include: { users: { where: { isActive: true }, take: 1, select: { id: true, name: true } } } }),
  ]);
  const pick = (role: string) => staff.find((u) => u.role === role);
  const accounts: { key: string; label: string; userId?: string; role?: string; vendorCategory?: string }[] = [];
  const admin = pick("admin"); const manager = pick("manager"); const planner = pick("planner");
  if (admin) accounts.push({ key: "admin", label: `👑 管理（${admin.name}）`, userId: admin.id });
  if (manager) accounts.push({ key: "manager", label: `🎩 支配人（${manager.name}）`, userId: manager.id });
  if (planner) accounts.push({ key: "planner", label: `💐 プランナー（${planner.name}）`, userId: planner.id });
  else accounts.push({ key: "planner", label: "💐 プランナー（自動作成）", role: "planner" });
  if (coupleUsers[0]) accounts.push({ key: "couple", label: `👰 お客様（${coupleUsers[0].name}）`, userId: coupleUsers[0].id });
  else accounts.push({ key: "couple", label: "👰 お客様（自動作成）", role: "couple" });
  // 業者：カテゴリごとに1ボタン（ユーザーがいない業者・カテゴリは自動作成で対応）
  const seen = new Set<string>();
  for (const v of vendors) {
    if (seen.has(v.category)) continue;
    seen.add(v.category);
    const u = v.users[0];
    accounts.push({
      key: `vendor:${v.category}`,
      label: `🏪 ${CAT_LABEL[v.category] ?? v.category}業者（${v.name}）`,
      userId: u?.id, vendorCategory: v.category,
    });
  }
  for (const cat of ["dress", "gift", "catering"]) {
    if (!seen.has(cat)) accounts.push({ key: `vendor:${cat}`, label: `🏪 ${CAT_LABEL[cat]}業者（自動作成）`, vendorCategory: cat });
  }
  return NextResponse.json({ enabled: true, accounts });
}

// POST: ワンクリックログイン { userId } または { role } / { vendorCategory }（居なければデモユーザーを自動作成）
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
      user = await prisma.user.findFirst({ where: { role, isActive: true } })
        ?? await prisma.user.create({
          data: {
            name: role === "couple" ? "デモ お客様" : `デモ ${role}`,
            email: `demo-${role}@example.com`, passwordHash: hash, role,
          },
        });
    }
  }
  if (!user || !user.isActive) return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 404 });
  await createSession({ userId: user.id, name: user.name, role: user.role, vendorId: user.vendorId });
  await audit(user.id, "demo_login", "auth");
  return NextResponse.json({ ok: true, role: user.role });
}
