import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { freeeConfigured, freeeAuthUrl } from "@/lib/freee";

// freee連携の開始（管理者のみ）：freeeの許可画面へリダイレクト
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s || !["admin", "manager"].includes(s.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!freeeConfigured()) {
    return NextResponse.json(
      { error: ".env に FREEE_CLIENT_ID / FREEE_CLIENT_SECRET を設定してください（freeeアプリストアで発行）" },
      { status: 400 },
    );
  }
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  return NextResponse.redirect(freeeAuthUrl(`${origin}/api/v1/freee/callback`));
}
