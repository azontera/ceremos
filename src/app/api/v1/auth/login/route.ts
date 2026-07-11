import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";
import { getNow, graceRemainingMs } from "@/lib/clock";

export async function POST(req: NextRequest) {
  const { email, password, remember } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "メールアドレスとパスワードを入力してください" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "メールアドレスまたはパスワードが正しくありません" }, { status: 401 });
  }
  // セルフ登録アカウント：メール認証の完了が必要
  // ※ クイック登録（店頭QR）はメール認証前でもログイン可（本人確認はログイン後のクエストで実施）
  let quickSignup = false;
  try { quickSignup = !!JSON.parse(user.profileJson ?? "{}").quickSignup; } catch { /* ignore */ }
  if (!user.emailVerified && !quickSignup) {
    return NextResponse.json({ error: "メールアドレスの確認が完了していません。登録時にお送りしたメールのリンクをクリックしてください" }, { status: 403 });
  }
  // 承認猶予：業者のセルフ登録は承認前でも登録から10時間は利用できる（お客様は登録時に承認不要のため対象外）。
  // 期限切れでも情報は消えない（プランナーの承認で再びログイン可。否認＝削除で消える）
  let grace: { remainingMs: number } | null = null;
  if (!user.approved) {
    const remainingMs = graceRemainingMs(user.createdAt, await getNow());
    if (remainingMs <= 0) {
      return NextResponse.json({
        error: "仮利用期間（登録から10時間）が終了しました。プランナーの確認・承認が完了しますと再びログインできます。ご登録の情報は保存されています",
      }, { status: 403 });
    }
    grace = { remainingMs };
  }
  await createSession({ userId: user.id, name: user.name, role: user.role, vendorId: user.vendorId }, !!remember);
  await audit(user.id, "login", "auth");
  return NextResponse.json({ ok: true, role: user.role, grace });
}
