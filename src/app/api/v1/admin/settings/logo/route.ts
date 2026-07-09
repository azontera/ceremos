import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";
import { setSetting, SETTING_DEFAULTS } from "@/lib/settings";
import { saveFile, deleteFile } from "@/lib/storage";

const LOGO_KEY = "venue-logo-upload"; // storage/uploads 内の固定キー（拡張子は付け替え）
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const EXT: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg",
};

// POST: 式場ロゴのアップロード（管理者のみ・PNG/JPG/WebP/SVG・5MBまで）
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ファイルを選択してください" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "PNG / JPG / WebP / SVG のみアップロードできます（.ai は事前にPNG等へ書き出してください）" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "5MB以下のファイルにしてください" }, { status: 400 });
  }
  // 旧拡張子のファイルを掃除してから保存
  for (const ext of Object.values(EXT)) await deleteFile(`${LOGO_KEY}${ext}`);
  const key = `${LOGO_KEY}${EXT[file.type]}`;
  await saveFile(key, Buffer.from(await file.arrayBuffer()));
  // URLに ?v=時刻 を付けて保存 → 差し替え時に全画面の <img> が新URLになり、ブラウザキャッシュが残らない
  const url = `/api/v1/branding/logo?v=${Date.now()}`;
  await setSetting("venue_logo", url);
  await setSetting("venue_logo_key", key);
  await audit(s.userId, "update", "settings", undefined, { logo: file.name });
  return NextResponse.json({ ok: true, url });
}

// DELETE: アップロードを削除して初期表示（ロゴなし＝ソフト名「CEREMOS」）に戻す
export async function DELETE() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });
  for (const ext of Object.values(EXT)) await deleteFile(`${LOGO_KEY}${ext}`);
  await setSetting("venue_logo", SETTING_DEFAULTS.venue_logo);
  await setSetting("venue_logo_key", "");
  await audit(s.userId, "update", "settings", undefined, { logo: "reset" });
  return NextResponse.json({ ok: true, url: SETTING_DEFAULTS.venue_logo });
}
