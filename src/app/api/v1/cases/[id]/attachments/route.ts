import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase, audit } from "@/lib/rbac";
import { saveFile, safeKey, MAX_FILE_SIZE, MAX_MEDIA_SIZE, ALLOWED_MIME, MEDIA_MIME } from "@/lib/storage";

// POST: ファイルアップロード（multipart/form-data）
// フィールド: file, parentType（case | meeting | chat）, parentId（meeting の場合）
// parentType=chat の場合はチャットメッセージも自動作成する
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "ファイルの受信に失敗しました" }, { status: 400 });
  }
  const file = form.get("file");
  const parentType = String(form.get("parentType") || "case");
  const parentIdRaw = form.get("parentId") ? String(form.get("parentId")) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
  }
  if (!["case", "meeting", "chat", "song"].includes(parentType)) {
    return NextResponse.json({ error: "不正な添付先です" }, { status: 400 });
  }
  const mime = file.type || "application/octet-stream";
  const isMedia = parentType === "song";
  if (isMedia) {
    // 本番用メディア（WAV/MP3/MP4等・200MBまで）
    if (file.size > MAX_MEDIA_SIZE) {
      return NextResponse.json({ error: "メディアファイルは200MBまでです" }, { status: 400 });
    }
    if (!MEDIA_MIME.includes(mime)) {
      return NextResponse.json({ error: `この形式（${mime}）は登録できません。WAV / MP3 / MP4 / M4A に対応しています` }, { status: 400 });
    }
  } else {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "ファイルサイズは10MBまでです" }, { status: 400 });
    }
    if (!ALLOWED_MIME.includes(mime)) {
      return NextResponse.json({ error: `このファイル形式（${mime}）は添付できません` }, { status: 400 });
    }
  }
  // meeting / song の場合は案件との紐付きを検証
  if (parentType === "meeting") {
    const m = parentIdRaw
      ? await prisma.meeting.findFirst({ where: { id: parentIdRaw, caseId: params.id } })
      : null;
    if (!m) return NextResponse.json({ error: "打ち合わせが見つかりません" }, { status: 404 });
  }
  if (parentType === "song") {
    const sg = parentIdRaw
      ? await prisma.song.findFirst({ where: { id: parentIdRaw, caseId: params.id } })
      : null;
    if (!sg) return NextResponse.json({ error: "楽曲が見つかりません（先に曲名を保存してください）" }, { status: 404 });
    // 既存の本番メディアは差し替え（1曲1ファイル）
    await prisma.attachment.deleteMany({ where: { parentType: "song", parentId: parentIdRaw! } });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const id = randomUUID();
    const key = safeKey(id, file.name);
    await saveFile(key, buf);

    let resolvedType = parentType;
    let resolvedId: string = parentType === "meeting" || parentType === "song" ? parentIdRaw! : params.id;

    // チャット添付：メッセージを自動作成して紐付け
    if (parentType === "chat") {
      const msg = await prisma.chatMessage.create({
        data: { caseId: params.id, senderId: s.userId, body: `📎 ${file.name}` },
      });
      resolvedType = "chat_message";
      resolvedId = msg.id;
    }

    const att = await prisma.attachment.create({
      data: {
        parentType: resolvedType,
        parentId: resolvedId,
        fileKey: key,
        fileName: file.name,
        mime,
        size: file.size,
      },
    });
    await audit(s.userId, "create", "attachment", att.id, { fileName: file.name, parentType: resolvedType });
    return NextResponse.json({ attachment: { id: att.id, fileName: att.fileName, mime: att.mime } }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `アップロードに失敗しました：${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
