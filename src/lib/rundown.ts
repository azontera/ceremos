// 進行表の時間自動計算エンジン
// 先頭行の時刻をアンカーとし、各行の所要分（durationMin・未設定は10分）を積み上げて
// 全行の時刻を再計算する。並び替え・所要分変更・追加削除のたびに呼ばれる。
import { prisma } from "./db";
import { deleteAttachmentsFor } from "./attachments";
import { defaultCueForScene } from "./cue-timings";

export function parseHM(t: string): number | null {
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export function fmtHM(mins: number): string {
  mins = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export const DEFAULT_DURATION = 10;

/** テンプレート内の名前トークンを実名に置換（{新郎}{新婦}=フルネーム、{新郎姓}{新婦姓}=姓） */
export function fillNameTokens<T extends string | null | undefined>(text: T, groom: string, bride: string): T {
  if (!text) return text;
  const gSei = groom.split(/[ 　]/)[0] || groom;
  const bSei = bride.split(/[ 　]/)[0] || bride;
  return text
    .replaceAll("{新郎}", groom)
    .replaceAll("{新婦}", bride)
    .replaceAll("{新郎姓}", gSei)
    .replaceAll("{新婦姓}", bSei) as T;
}

export async function recalcRundownTimes(caseId: string) {
  const items = await prisma.rundownItem.findMany({
    where: { caseId },
    orderBy: { sortOrder: "asc" },
  });
  if (items.length === 0) return;
  let cur = parseHM(items[0].time) ?? 11 * 60 + 30;
  const updates = [];
  for (const it of items) {
    const t = fmtHM(cur);
    if (it.time !== t) {
      updates.push(prisma.rundownItem.update({ where: { id: it.id }, data: { time: t } }));
    }
    cur += it.durationMin ?? DEFAULT_DURATION;
  }
  if (updates.length) await prisma.$transaction(updates);
}

/**
 * 進行行と楽曲の同期（進行表がマスター）
 * payload.use=false → 紐付き楽曲を削除、use=true → 作成 or 更新して紐付け
 */
export async function syncItemSong(
  itemId: string,
  caseId: string,
  currentSongId: string | null,
  payload: { use?: boolean; title?: string; artist?: string; durationSec?: number | string | null; memo?: string; url?: string; scene?: string },
): Promise<{ error?: string }> {
  if (payload.use === false) {
    if (currentSongId) {
      await prisma.rundownItem.update({ where: { id: itemId }, data: { songId: null } });
      await deleteAttachmentsFor("song", [currentSongId]);
      await prisma.song.delete({ where: { id: currentSongId } }).catch(() => {});
    }
    return {};
  }
  if (payload.use !== true) return {}; // 指定なし＝変更なし
  const title = payload.title?.trim() || "（曲未定）"; // 曲名は後から決めてもOK
  const data = {
    title,
    artist: payload.artist?.trim() || null,
    durationSec: payload.durationSec ? Number(payload.durationSec) : null,
    memo: payload.memo?.trim() || null,
    url: payload.url?.trim() || null, // 視聴URL（おすすめ採用時はYouTubeを自動設定）
  };
  if (currentSongId) {
    await prisma.song.update({
      where: { id: currentSongId },
      data: { ...data, ...(payload.scene ? { scene: payload.scene } : {}) },
    });
  } else {
    const scene = payload.scene || "rundown";
    const song = await prisma.song.create({
      // 流すタイミングはシーンから自動選択（後から楽曲タブ・プレイヤーで変更可）
      data: { caseId, scene, cueTiming: defaultCueForScene(scene), ...data },
    });
    await prisma.rundownItem.update({ where: { id: itemId }, data: { songId: song.id } });
  }
  return {};
}

/**
 * 進行表テンプレートを案件に適用（全置換）
 * 名前トークン置換・時刻間隔→所要分の導出・曲枠（未定）の自動作成・タイム再計算まで一括
 */
export async function applyRundownTemplateToCase(
  caseId: string,
  tmplItems: { time: string; title: string; note?: string; roles?: string; durationMin?: number; mcScript?: string }[],
  groom: string,
  bride: string,
) {
  const { defaultCueForScene } = await import("./cue-timings");
  // 旧進行表と紐付き楽曲を削除
  const old = await prisma.rundownItem.findMany({ where: { caseId }, select: { songId: true } });
  const oldSongIds = old.map((o) => o.songId).filter(Boolean) as string[];
  await prisma.rundownItem.deleteMany({ where: { caseId } });
  if (oldSongIds.length) {
    await deleteAttachmentsFor("song", oldSongIds);
    await prisma.song.deleteMany({ where: { id: { in: oldSongIds } } });
  }
  // 新規作成（所要分が無ければ時刻間隔から導出）
  await prisma.rundownItem.createMany({
    data: tmplItems.map((t, i) => {
      let dur = t.durationMin && t.durationMin > 0 ? Math.min(600, t.durationMin) : null;
      if (!dur) {
        const cur = parseHM(t.time);
        const next = tmplItems[i + 1] ? parseHM(tmplItems[i + 1].time) : null;
        const gap = cur !== null && next !== null ? (next - cur + 1440) % 1440 : null;
        dur = gap && gap > 0 && gap <= 600 ? gap : 10;
      }
      return {
        caseId,
        time: t.time,
        title: fillNameTokens(t.title, groom, bride),
        note: fillNameTokens(t.note ?? null, groom, bride),
        mcScript: fillNameTokens(t.mcScript ?? null, groom, bride),
        durationMin: dur,
        roles: t.roles ?? "",
        sortOrder: i + 1,
      };
    }),
  });
  // 曲枠（未定）を全演目に作成
  const created = await prisma.rundownItem.findMany({ where: { caseId } });
  for (const it of created) {
    const scene = sceneForTitle(it.title)
      ?? (it.title.includes("挙式") || it.title.includes("チャペル") ? "chapel" : "party");
    const song = await prisma.song.create({
      data: { caseId, scene, title: "（曲未定）", cueTiming: defaultCueForScene(scene) },
    });
    await prisma.rundownItem.update({ where: { id: it.id }, data: { songId: song.id } });
  }
  await recalcRundownTimes(caseId);
}

/** 進行タイトルから楽曲シーンを推定（進行表に曲名を表示するため） */
export function sceneForTitle(title: string): string | null {
  if (title.includes("再入場")) return "reentry";
  if (title.includes("入場")) return "entrance";
  if (title.includes("乾杯")) return "toast";
  if (title.includes("ケーキ")) return "cake";
  if (title.includes("中座")) return "leave";
  if (title.includes("手紙") || title.includes("花束")) return "bouquet";
  if (title.includes("送賓") || title.includes("お見送り")) return "farewell";
  return null;
}
