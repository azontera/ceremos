import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLES, audit } from "@/lib/rbac";
import { validatePassword } from "@/lib/password";

// POST: ユーザー作成（管理者のみ）
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim() || !b.email?.trim() || !b.role || !b.password) {
    return NextResponse.json({ error: "氏名・メール・ロール・初期パスワードは必須です" }, { status: 400 });
  }
  if (!ROLES[b.role]) return NextResponse.json({ error: "不正なロールです" }, { status: 400 });
  const policyErr = validatePassword(String(b.password));
  if (policyErr) return NextResponse.json({ error: policyErr }, { status: 400 });
  try {
    const u = await prisma.user.create({
      data: {
        name: b.name.trim(),
        email: b.email.trim().toLowerCase(),
        role: b.role,
        passwordHash: await bcrypt.hash(String(b.password), 10),
      },
    });
    await audit(s.userId, "create", "user", u.id, { role: u.role });
    return NextResponse.json({ user: { id: u.id, name: u.name, email: u.email } }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message.includes("Unique")
      ? "このメールアドレスは既に登録されています"
      : `サーバーエラー：${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
