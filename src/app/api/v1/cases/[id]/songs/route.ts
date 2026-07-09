import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { deleteAttachmentsFor } from "@/lib/attachments";

// PUT: シーン別楽曲の一括更新（scene ごとに upsert / 空なら削除）
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "songs", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const songs: { scene: string; title: string; artist?: string; durationSec?: number; memo?: string; url?: string }[] =
    Array.isArray(b.songs) ? b.songs : [];

  try {
    for (const sg of songs) {
      if (!sg.scene) continue;
      const existing = await prisma.song.findFirst({ where: { caseId: params.id, scene: sg.scene } });
      if (!sg.title?.trim()) {
        if (existing) {
          await deleteAttachmentsFor("song", [existing.id]);
          await prisma.song.delete({ where: { id: existing.id } });
        }
        continue;
      }
      const data = {
        title: sg.title.trim(),
        artist: sg.artist?.trim() || null,
        durationSec: sg.durationSec ? Number(sg.durationSec) : null,
        memo: sg.memo?.trim() || null,
        url: sg.url?.trim() || null,
      };
      if (existing) await prisma.song.update({ where: { id: existing.id }, data });
      else await prisma.song.create({ data: { caseId: params.id, scene: sg.scene, ...data } });
    }
    await audit(s.userId, "update", "songs", params.id);
    const result = await prisma.song.findMany({ where: { caseId: params.id } });
    return NextResponse.json({ songs: result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `サーバーエラー：${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
