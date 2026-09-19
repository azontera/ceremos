import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase } from "@/lib/rbac";
import { suggestSongs, SCENE_LABELS, MusicPrefs, SONG_DB, SONG_DB_SIZE_TOTAL } from "@/lib/song-db";

export const dynamic = "force-dynamic";

// GET: シーン別おすすめ楽曲（毎回シャッフル10曲・q=キーワード）
// caseId を渡すと好みのアーティスト・曲でスコアリングし、精度を上げる
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scene = req.nextUrl.searchParams.get("scene");
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const caseId = req.nextUrl.searchParams.get("caseId");

  let prefs: MusicPrefs | null = null;
  if (caseId && (await canAccessCase(s, caseId))) {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { musicPrefsJson: true } });
    try { prefs = c?.musicPrefsJson ? JSON.parse(c.musicPrefsJson) : null; } catch { prefs = null; }
  }
  const songs = suggestSongs(scene, q, 10, prefs);
  return NextResponse.json({
    scene, sceneLabel: scene ? SCENE_LABELS[scene] ?? null : null,
    prefsApplied: !!(prefs?.groomArtists?.trim() || prefs?.brideArtists?.trim()),
    dbSize: SONG_DB_SIZE_TOTAL + SONG_DB.length, // 検索対象の総曲数（約2万曲）
    songs,
  });
}
