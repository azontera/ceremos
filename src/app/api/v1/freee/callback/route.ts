import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { exchangeCode } from "@/lib/freee";

// freee OAuth コールバック：トークン交換→事業所を保存
export async function GET(req: NextRequest) {
  const s = await getSession();
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  if (!s || !["admin", "manager"].includes(s.role)) {
    return NextResponse.redirect(`${origin}/login`);
  }
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/dashboard?freee=error`);
  try {
    const co = await exchangeCode(code, `${origin}/api/v1/freee/callback`);
    return NextResponse.redirect(`${origin}/dashboard?freee=connected&company=${encodeURIComponent(co?.display_name ?? "")}`);
  } catch (e) {
    console.error("freee callback failed:", e);
    return NextResponse.redirect(`${origin}/dashboard?freee=error`);
  }
}
