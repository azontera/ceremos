import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { readFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET: アップロードされた式場ロゴの配信（帳票・画面左上・ログイン画面の <img> から参照）
// ・ログイン画面でも表示するため認証不要（ロゴは公開情報）
// ・差し替えが即時反映されるようキャッシュしない（アップロード時にURLへ ?v= も付与）
export async function GET() {
  const key = await getSetting("venue_logo_key");
  if (!key) return new NextResponse("not found", { status: 404 });
  const buf = await readFile(key);
  if (!buf) return new NextResponse("not found", { status: 404 });
  const mime = key.endsWith(".svg") ? "image/svg+xml"
    : key.endsWith(".jpg") ? "image/jpeg"
    : key.endsWith(".webp") ? "image/webp" : "image/png";
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": mime, "Cache-Control": "no-cache" },
  });
}
