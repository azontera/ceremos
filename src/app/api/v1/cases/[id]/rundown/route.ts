import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { recalcRundownTimes, syncItemSong, fillNameTokens, sceneForTitle } from "@/lib/rundown";
import { defaultCueForScene } from "@/lib/cue-timings";
import { deleteAttachmentsFor } from "@/lib/attachments";

// GET: 進行表（当日運営のポーリングにも使用）
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const items = await prisma.rundownItem.findMany({
    where: { caseId: params.id },
    orderBy: { sortOrder: "asc" },
    include: { song: true },
  });
  // 本番再生用：曲に紐付くアップロード音源（当日運営モードのプレイヤーで使用）
  const songIds = items.map((i) => i.songId).filter(Boolean) as string[];
  const atts = songIds.length
    ? await prisma.attachment.findMany({ where: { parentType: "song", parentId: { in: songIds } } })
    : [];
  return NextResponse.json({
    items: items.map((it) => ({
      ...it,
      song: it.song
        ? {
            id: it.song.id,
            title: it.song.title, artist: it.song.artist,
            durationSec: it.song.durationSec, startSec: it.song.startSec,
            volume: it.song.volume, fadeInSec: it.song.fadeInSec,
            fadeOutSec: it.song.fadeOutSec, videoOn: it.song.videoOn,
            cueTiming: it.song.cueTiming,
            memo: it.song.memo, url: it.song.url,
            mediaId: atts.find((a) => a.parentId === it.song!.id)?.id ?? null,
            mediaMime: atts.find((a) => a.parentId === it.song!.id)?.mime ?? null,
          }
        : null,
    })),
  });
}

// POST: 行の追加
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "rundown", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (!b.title?.trim()) {
    return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });
  }
  const last = await prisma.rundownItem.findFirst({
    where: { caseId: params.id },
    orderBy: { sortOrder: "desc" },
  });
  const item = await prisma.rundownItem.create({
    data: {
      caseId: params.id,
      time: b.time?.trim() || "11:30", // 先頭行以外は自動計算で上書きされる
      title: b.title.trim(),
      note: b.note?.trim() || null,
      mcScript: b.mcScript?.trim() || null,
      durationMin: b.durationMin ? Math.max(1, Number(b.durationMin)) : 10,
      roles: typeof b.roles === "string" ? b.roles : "",
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  await recalcRundownTimes(params.id); // タイム自動計算
  // 楽曲の同期（新規行に楽曲を付ける）
  if (b.song?.use) {
    const r = await syncItemSong(item.id, params.id, null, b.song);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  await audit(s.userId, "create", "rundown_item", item.id);
  return NextResponse.json({ item }, { status: 201 });
}

// PUT: 進行表の一括置換（「元に戻す」用スナップショット復元）
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "rundown", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const items: {
    time?: string; title?: string; note?: string | null; mcScript?: string | null;
    durationMin?: number | null; roles?: string; status?: string; songId?: string | null;
  }[] = Array.isArray(b.items) ? b.items : [];
  if (items.some((i) => !i.title?.trim())) {
    return NextResponse.json({ error: "不正なデータです" }, { status: 400 });
  }
  const validSongIds = new Set(
    (await prisma.song.findMany({ where: { caseId: params.id }, select: { id: true } })).map((x) => x.id),
  );
  // テンプレ読込時の名前トークン置換（{新郎}{新婦} 等 → 実名）
  const cc = await prisma.case.findUnique({ where: { id: params.id }, select: { groomName: true, brideName: true } });
  const g = cc?.groomName ?? "新郎";
  const br = cc?.brideName ?? "新婦";
  await prisma.$transaction([
    prisma.rundownItem.deleteMany({ where: { caseId: params.id } }),
    prisma.rundownItem.createMany({
      data: items.map((i, idx) => ({
        caseId: params.id,
        time: i.time ?? "11:30",
        title: fillNameTokens(i.title!.trim(), g, br),
        note: fillNameTokens(i.note ?? null, g, br),
        mcScript: fillNameTokens(i.mcScript ?? null, g, br),
        durationMin: i.durationMin ?? 10,
        roles: i.roles ?? "",
        status: i.status ?? "todo",
        songId: i.songId && validSongIds.has(i.songId) ? i.songId : null, // 楽曲リンクも復元
        sortOrder: idx + 1,
      })),
    }),
  ]);
  // 進行表由来の楽曲でどの行からも参照されなくなったものは削除（孤児掃除）
  const usedSongIds = new Set(
    (await prisma.rundownItem.findMany({ where: { caseId: params.id }, select: { songId: true } }))
      .map((x) => x.songId).filter(Boolean) as string[],
  );
  const orphans = await prisma.song.findMany({
    where: { caseId: params.id, scene: "rundown", id: { notIn: [...usedSongIds] } },
    select: { id: true },
  });
  if (orphans.length > 0) {
    await deleteAttachmentsFor("song", orphans.map((o) => o.id));
    await prisma.song.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  }
  // 楽曲は基本すべてON：曲枠が無い行に（曲未定）＋シーン別タイミングを自動作成
  const noSong = await prisma.rundownItem.findMany({ where: { caseId: params.id, songId: null } });
  for (const it of noSong) {
    const scene = sceneForTitle(it.title)
      ?? (it.title.includes("挙式") || it.title.includes("チャペル") ? "chapel" : "party");
    const song = await prisma.song.create({
      data: { caseId: params.id, scene, title: "（曲未定）", cueTiming: defaultCueForScene(scene) },
    });
    await prisma.rundownItem.update({ where: { id: it.id }, data: { songId: song.id } });
  }
  await recalcRundownTimes(params.id);
  await audit(s.userId, "restore", "rundown", params.id, { rows: items.length });
  return NextResponse.json({ ok: true });
}
