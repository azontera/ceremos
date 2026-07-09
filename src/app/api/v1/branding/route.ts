import { NextResponse } from "next/server";
import { getBranding } from "@/lib/settings";

export const dynamic = "force-dynamic";

// GET: 式場ロゴ・名称（ログイン画面など未ログインでも使う公開情報のみ）
export async function GET() {
  const b = await getBranding();
  return NextResponse.json({ logoUrl: b.logoUrl, name: b.name });
}
