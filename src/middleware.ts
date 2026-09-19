import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = [
  "/login", "/signup", "/survey",
  "/api/v1/auth/login", "/api/v1/auth/signup", "/api/v1/auth/verify",
  "/api/v1/auth/complete-profile", "/api/v1/auth/survey",
  "/api/v1/auth/demo-login", // 🧪 検証ワンクリックログイン（DEMO_MODE=1のときだけ中身が有効）
  "/api/v1/branding",        // 公開ロゴ・式場名（ログイン画面で使用）
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }
  const token = req.cookies.get("werp_session")?.value;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret"));
      return NextResponse.next();
    } catch { /* fallthrough */ }
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
