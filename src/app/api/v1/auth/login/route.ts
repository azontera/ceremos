import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const { email, password, remember } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "メールアドレスとパスワードを入力してください" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "メールアドレスまたはパスワードが正しくありません" }, { status: 401 });
  }
  // 業者アカウント（vendorId持ち）はログイン対象外（業者はマスタとしてスタッフが管理する）
  if (user.vendorId) {
    return NextResponse.json({ error: "このアカウントはログインできません" }, { status: 403 });
  }
  await createSession({ userId: user.id, name: user.name, role: user.role }, !!remember);
  await audit(user.id, "login", "auth");
  return NextResponse.json({ ok: true, role: user.role });
}
