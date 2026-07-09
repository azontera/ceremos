import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";
import { validatePassword } from "@/lib/password";

// POST: 自分のパスワード変更（現在のパスワード確認必須）
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "現在のパスワードと新しいパスワードを入力してください" }, { status: 400 });
  }
  const policyErr = validatePassword(String(newPassword));
  if (policyErr) return NextResponse.json({ error: policyErr }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!user || !(await bcrypt.compare(String(currentPassword), user.passwordHash))) {
    return NextResponse.json({ error: "現在のパスワードが正しくありません" }, { status: 403 });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(String(newPassword), 10) },
  });
  await audit(s.userId, "update", "user", user.id, { passwordChanged: true });
  return NextResponse.json({ ok: true });
}
