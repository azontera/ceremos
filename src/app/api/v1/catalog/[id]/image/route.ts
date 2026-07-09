// カタログ品目の画像アップロード（1品目1枚・差し替え式）
// スタッフ＝全品目／業者ユーザー＝自社品目のみ
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";
import { saveFile, deleteFile, safeKey, MAX_FILE_SIZE } from "@/lib/storage";

const IMAGE_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const item = await prisma.catalogItem.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const isStaff = ["admin", "manager", "planner"].includes(s.role);
  if (!isStaff && !(s.vendorId && s.vendorId === item.vendorId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "ファイルの受信に失敗しました" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "画像は10MBまでです" }, { status: 400 });
  const mime = file.type || "application/octet-stream";
  if (!IMAGE_MIME.includes(mime)) return NextResponse.json({ error: "画像ファイル（JPEG/PNG/WebP等）を選択してください" }, { status: 400 });

  // 既存画像は差し替え
  const olds = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: item.id } });
  for (const o of olds) {
    await prisma.attachment.delete({ where: { id: o.id } });
    await deleteFile(o.fileKey);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const key = safeKey(id, file.name);
  await saveFile(key, buf);
  const att = await prisma.attachment.create({
    data: { parentType: "catalog", parentId: item.id, fileKey: key, fileName: file.name, mime, size: file.size },
  });
  await audit(s.userId, "create", "attachment", att.id, { fileName: file.name, parentType: "catalog" });
  return NextResponse.json({ imageId: att.id }, { status: 201 });
}
