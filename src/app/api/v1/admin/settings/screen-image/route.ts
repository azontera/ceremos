import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit, can } from "@/lib/rbac";
import { setSetting } from "@/lib/settings";
import { saveFile, deleteFile } from "@/lib/storage";

const IMG_KEY = "screen-idle-image"; // 映像ウィンドウの待機画像（storage内の固定キー）
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const EXT: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
};

// POST: 待機画像のアップロード（スタッフ）：再生していない間、映像ウィンドウに投影される
// 再生プレイヤーからも当日その場で差し替えられる（例：おふたりのウェルカム画像）
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "live", "edit")) return NextResponse.json({ error: "スタッフのみ操作できます" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ファイルを選択してください" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "PNG / JPG / WebP のみアップロードできます" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "10MB以下のファイルにしてください" }, { status: 400 });
  }
  for (const ext of Object.values(EXT)) await deleteFile(`${IMG_KEY}${ext}`);
  const key = `${IMG_KEY}${EXT[file.type]}`;
  await saveFile(key, Buffer.from(await file.arrayBuffer()));
  await setSetting("screen_image_key", key);
  await audit(s.userId, "update", "settings", undefined, { screenImage: file.name });
  return NextResponse.json({ ok: true, url: "/api/v1/branding/screen-image" });
}

// DELETE: 待機画像を削除（待機中は真っ黒に戻る）
export async function DELETE() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "live", "edit")) return NextResponse.json({ error: "スタッフのみ操作できます" }, { status: 403 });
  for (const ext of Object.values(EXT)) await deleteFile(`${IMG_KEY}${ext}`);
  await setSetting("screen_image_key", "");
  await audit(s.userId, "update", "settings", undefined, { screenImage: "reset" });
  return NextResponse.json({ ok: true });
}
