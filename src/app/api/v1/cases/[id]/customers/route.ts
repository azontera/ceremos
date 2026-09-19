import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { validatePassword } from "@/lib/password";

// POST: お客様（新郎新婦・主催者）のログインアカウントを作成して案件に紐付ける（プランナー以上）
// { name, email, password, phone?, side? ("groom"|"bride") }
// 同じメールの顧客アカウントが既にあれば、その顧客をこの案件に紐付けるだけ（パスワードは変更しない）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["admin", "manager", "planner"].includes(s.role) || !can(s.role, "cases", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const c = await prisma.case.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const phone = String(b.phone ?? "").trim() || null;
  const side = b.side === "groom" || b.side === "bride" ? b.side : "couple";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "メールアドレスの形式が正しくありません" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  let userId: string;
  let created = false;
  if (existing) {
    if (existing.role !== "couple") {
      return NextResponse.json({ error: "このメールアドレスはスタッフのアカウントで使用されています" }, { status: 409 });
    }
    userId = existing.id;
  } else {
    if (!name) return NextResponse.json({ error: "お名前を入力してください" }, { status: 400 });
    const policyErr = validatePassword(String(b.password ?? ""));
    if (policyErr) return NextResponse.json({ error: policyErr }, { status: 400 });
    const u = await prisma.user.create({
      data: {
        name, email, phone,
        passwordHash: await bcrypt.hash(String(b.password), 10),
        role: "couple",
        approved: true,
        emailVerified: true,
      },
    });
    userId = u.id;
    created = true;
  }
  await prisma.caseMember.upsert({
    where: { caseId_userId: { caseId: c.id, userId } },
    update: { roleInCase: side },
    create: { caseId: c.id, userId, roleInCase: side },
  });
  await audit(s.userId, created ? "create" : "link", "case_customer", c.id, { userId, email, side });
  return NextResponse.json({ ok: true, created, userId }, { status: created ? 201 : 200 });
}
