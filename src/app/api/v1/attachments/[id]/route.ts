import { createReadStream } from "fs";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase, audit } from "@/lib/rbac";
import { deleteFile, statFile } from "@/lib/storage";

// 添付の所属案件を解決（権限チェック用）
async function resolveCaseId(parentType: string, parentId: string): Promise<string | null> {
  if (parentType === "case") return parentId;
  if (parentType === "meeting") {
    return (await prisma.meeting.findUnique({ where: { id: parentId } }))?.caseId ?? null;
  }
  if (parentType === "chat_message") {
    return (await prisma.chatMessage.findUnique({ where: { id: parentId } }))?.caseId ?? null;
  }
  if (parentType === "song") {
    return (await prisma.song.findUnique({ where: { id: parentId } }))?.caseId ?? null;
  }
  return null;
}

// GET: ファイル配信（案件メンバーのみ）
// ?download=1&name=整理済みファイル名 でエクスポート（名前を付けてダウンロード）
// 動画・音源の再生用に Range リクエスト（部分読み込み）対応＋ストリーミング配信
// （大きい1080p動画などは Range 非対応だと <video> が再生できない／シークできない）
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const att = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!att) return NextResponse.json({ error: "not found" }, { status: 404 });
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // カタログ画像はログイン済みなら誰でも閲覧可（案件内カタログで使用）。それ以外は案件メンバーのみ
  if (att.parentType !== "catalog") {
    const caseId = await resolveCaseId(att.parentType, att.parentId);
    if (!caseId || !(await canAccessCase(s, caseId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  const st = await statFile(att.fileKey);
  if (!st) return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });

  const isDownload = req.nextUrl.searchParams.get("download") === "1";
  const rawName = req.nextUrl.searchParams.get("name") || att.fileName;
  // 拡張子は元ファイルのものを必ず維持する
  const ext = att.fileName.includes(".") ? att.fileName.slice(att.fileName.lastIndexOf(".")) : "";
  const base = rawName.replace(/[\\/:*?"<>|]/g, "_").replace(new RegExp(`${ext.replace(".", "\\.")}$`), "");
  const exportName = `${base}${ext}`;
  const baseHeaders: Record<string, string> = {
    "Content-Type": att.mime ?? "application/octet-stream",
    "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(exportName)}`,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  };

  // Range リクエスト（動画・音源のシーク／Safari再生に必須）
  const range = req.headers.get("range");
  if (!isDownload && range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= st.size) end = st.size - 1;
      if (start > end || start >= st.size) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
      }
      const stream = Readable.toWeb(createReadStream(st.path, { start, end })) as ReadableStream;
      return new NextResponse(stream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${st.size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  // 全体配信（メモリに全読みせずストリーミング）
  const stream = Readable.toWeb(createReadStream(st.path)) as ReadableStream;
  return new NextResponse(stream, {
    headers: { ...baseHeaders, "Content-Length": String(st.size) },
  });
}

// DELETE: 添付削除（アップロード者に限らず、案件メンバーのスタッフのみ）
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "couple") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const att = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!att) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (att.parentType === "catalog") {
    // カタログ画像：スタッフまたは品目の所属業者のみ削除可
    const item = await prisma.catalogItem.findUnique({ where: { id: att.parentId } });
    const isStaff = ["admin", "manager", "planner"].includes(s.role);
    if (!isStaff && !(s.vendorId && item && s.vendorId === item.vendorId)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else {
    const caseId = await resolveCaseId(att.parentType, att.parentId);
    if (!caseId || !(await canAccessCase(s, caseId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  await prisma.attachment.delete({ where: { id: att.id } });
  await deleteFile(att.fileKey); // 物理ファイルも削除
  await audit(s.userId, "delete", "attachment", att.id, { fileName: att.fileName });
  return NextResponse.json({ ok: true });
}
