#!/usr/bin/env node
// 式終了後の本番用楽曲データ（アップロード音源・映像）を削除するバッチ
// 使い方: node scripts/cleanup-song-media.cjs
// cron例（毎日4時）: 0 4 * * * cd ~/wedding-erp && node scripts/cleanup-song-media.cjs >> logs/cleanup.log 2>&1
// 保持日数は Setting テーブルの song_media_retention_days（既定365日=式後1年）
const path = require("path");
const fs = require("fs/promises");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

async function main() {
  const setting = await prisma.setting.findUnique({ where: { key: "song_media_retention_days" } });
  const days = Math.max(0, Number(setting?.value ?? 365) || 365); // 既定=式後1年
  const cutoff = new Date(Date.now() - days * 86400000);

  const songs = await prisma.song.findMany({
    where: { case: { weddingDate: { lt: cutoff } } },
    select: { id: true, caseId: true },
  });
  const songIds = songs.map((s) => s.id);
  const atts = songIds.length
    ? await prisma.attachment.findMany({ where: { parentType: "song", parentId: { in: songIds } } })
    : [];
  if (atts.length === 0) {
    console.log(`[cleanup] 対象なし（保持${days}日・${new Date().toISOString()}）`);
    return;
  }
  for (const a of atts) {
    try { await fs.unlink(path.join(UPLOAD_DIR, path.basename(a.fileKey))); } catch { /* 既に無ければ無視 */ }
  }
  await prisma.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } });
  const caseIds = new Set(songs.filter((s) => atts.some((a) => a.parentId === s.id)).map((s) => s.caseId));
  await prisma.auditLog.create({
    data: {
      action: "cleanup", targetType: "song_media",
      diffJson: JSON.stringify({ cases: caseIds.size, files: atts.length, retentionDays: days, via: "script" }),
    },
  });
  console.log(`[cleanup] ${caseIds.size}案件 ${atts.length}ファイルを削除（保持${days}日）`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
