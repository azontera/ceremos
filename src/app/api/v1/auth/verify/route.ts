import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/rbac";

// GET: メール認証リンク → 認証完了して /login へリダイレクト
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const to = (path: string) => NextResponse.redirect(new URL(path, process.env.APP_URL ?? req.nextUrl.origin));
  if (!token) return to("/login?verify=invalid");

  const u = await prisma.user.findUnique({ where: { verifyToken: token } });
  if (!u) return to("/login?verify=invalid");

  await prisma.user.update({
    where: { id: u.id },
    data: { emailVerified: true, verifyToken: null },
  });
  await audit(u.id, "verify-email", "user", u.id);
  return to("/login?verify=ok");
}
