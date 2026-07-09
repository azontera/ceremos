#!/usr/bin/env bash
# CEREMOS 日次バックアップ（SQLite DB＋添付ファイル）
# 使い方:  bash scripts/backup.sh [保存先ディレクトリ]   （既定: ./backups）
# cron例（毎日3時・14世代保持）:  0 3 * * * cd /path/to/wedding-erp && bash scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${1:-backups}"
KEEP=14 # 保持世代数
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

# SQLite はオンラインバックアップ（.backup）で安全にコピー（sqlite3 がなければ単純コピー）
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 prisma/dev.db ".backup '$DEST/dev-$STAMP.db'"
else
  cp prisma/dev.db "$DEST/dev-$STAMP.db"
fi

# 添付ファイル（storage/uploads）
if [ -d storage/uploads ]; then
  tar czf "$DEST/uploads-$STAMP.tar.gz" storage/uploads
fi

# 古い世代を削除（DB・添付それぞれ KEEP 世代）
ls -1t "$DEST"/dev-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --
ls -1t "$DEST"/uploads-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --

echo "[$(date '+%F %T')] backup ok -> $DEST/dev-$STAMP.db"
