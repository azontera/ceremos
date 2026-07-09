import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { readFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET: 映像ウィンドウの待機画像を配信（未設定なら404→ウィンドウ側は真っ黒表示）
export async function GET() {
  const s = await getSession();
  if (!s) return new NextResponse("unauthorized", { status: 401 });
  const key = await getSetting("screen_image_key");
  if (!key) return new NextResponse("not found", { status: 404 });
  const buf = await readFile(key);
  if (!buf) return new NextResponse("not found", { status: 404 });
  const mime = key.endsWith(".jpg") ? "image/jpeg" : key.endsWith(".webp") ? "image/webp" : "image/png";
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=60" },
  });
}
