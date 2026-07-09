import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// PATCH: 楽曲の内容変更（曲名・アーティスト・使用秒・メモ・視聴URL）
// ※ 楽曲の追加・削除・順序は進行表側で管理（進行表がマスター）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const song = await prisma.song.findUnique({ where: { id: params.id } });
  if (!song) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!can(s.role, "songs", "edit") || !(await canAccessCase(s, song.caseId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = String(b.title).trim() || "（曲未定）"; // 曲名は任意（未定でOK）
  if (b.artist !== undefined) data.artist = b.artist?.trim() || null;
  if (b.durationSec !== undefined) data.durationSec = b.durationSec ? Number(b.durationSec) : null;
  if (b.startSec !== undefined) data.startSec = b.startSec !== null && b.startSec !== "" ? Math.max(0, Math.min(36000, Number(b.startSec) || 0)) : null;
  // 本番再生の設定（シーンごと）：音量・フェードイン/アウト・映像ON
  if (b.volume !== undefined) data.volume = Math.max(0, Math.min(100, Math.round(Number(b.volume) ?? 100)));
  if (b.fadeInSec !== undefined) data.fadeInSec = Math.max(0, Math.min(30, Math.round(Number(b.fadeInSec) || 0)));
  if (b.fadeOutSec !== undefined) data.fadeOutSec = Math.max(0, Math.min(30, Math.round(Number(b.fadeOutSec) || 0)));
  if (b.videoOn !== undefined) data.videoOn = !!b.videoOn;
  if (b.cueTiming !== undefined) data.cueTiming = b.cueTiming?.trim() || null; // 流すタイミング
  if (b.memo !== undefined) data.memo = b.memo?.trim() || null;
  if (b.url !== undefined) data.url = b.url?.trim() || null;

  const updated = await prisma.song.update({ where: { id: params.id }, data });
  await audit(s.userId, "update", "song", song.id, data);
  return NextResponse.json({ song: updated });
}
