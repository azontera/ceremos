import { NextRequest, NextResponse } from "next/server";
import { getSession, createUserToken } from "@/lib/auth";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET: お客様クイック登録用URL（24時間有効・プランナー承認不要）
// 新規案件作成画面のQRに使用。打ち合わせ席でその場で読み取ってもらう想定
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "cases", "edit")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const token = await createUserToken(s.userId, "quick-signup", "24h");
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  // 入口はログイン画面に一本化（QR付きは承認不要）
  return NextResponse.json({ url: `${base}/login?quick=${encodeURIComponent(token)}` });
}
