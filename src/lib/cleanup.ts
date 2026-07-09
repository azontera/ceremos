// 式終了後の本番用楽曲データ（アップロード音源・映像）の自動削除
// 挙式日から一定日数（既定365日=1年・Setting: song_media_retention_days で変更可）が過ぎた案件の
// 楽曲添付ファイルをストレージとDBから削除する。曲名・アーティスト等のJASRAC申請情報は残す。
// 呼び出し：ダッシュボード表示時（1日1回まで）＋ scripts/cleanup-song-media.cjs（cron用）
import { prisma } from "./db";
import { deleteAttachmentsFor } from "./attachments";

let lastRunAt = 0; // プロセス内スロットル（1日1回）

export async function cleanupExpiredSongMedia(force = false): Promise<{ cases: number; files: number }> {
  if (!force && Date.now() - lastRunAt < 86400000) return { cases: 0, files: 0 };
  lastRunAt = Date.now();

  const setting = await prisma.setting.findUnique({ where: { key: "song_media_retention_days" } });
  const days = Math.max(0, Number(setting?.value ?? 365) || 365); // 既定=式後1年

  const cutoff = new Date(Date.now() - days * 86400000);

  // 挙式日が締切より前の案件の楽曲ID
  const songs = await prisma.song.findMany({
    where: { case: { weddingDate: { lt: cutoff } } },
    select: { id: true, caseId: true },
  });
  if (songs.length === 0) return { cases: 0, files: 0 };

  const songIds = songs.map((s) => s.id);
  // 添付が残っているものだけ対象（毎回全件走査しない）
  const atts = await prisma.attachment.findMany({
    where: { parentType: "song", parentId: { in: songIds } },
    select: { parentId: true },
  });
  if (atts.length === 0) return { cases: 0, files: 0 };

  const targetSongIds = [...new Set(atts.map((a) => a.parentId))];
  await deleteAttachmentsFor("song", targetSongIds);

  const caseIds = new Set(songs.filter((s) => targetSongIds.includes(s.id)).map((s) => s.caseId));
  await prisma.auditLog.create({
    data: {
      action: "cleanup", targetType: "song_media",
      diffJson: JSON.stringify({ cases: caseIds.size, files: atts.length, retentionDays: days }),
    },
  });
  console.log(`[cleanup] 式終了後の本番楽曲データを削除：${caseIds.size}案件 ${atts.length}ファイル（保持${days}日）`);
  return { cases: caseIds.size, files: atts.length };
}
