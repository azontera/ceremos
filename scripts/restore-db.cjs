// DBバックアップの一覧表示／復元。バックアップは削除操作の直前に backups/ に自動作成される。
//
// 一覧:  node scripts/restore-db.cjs
// 復元:  node scripts/restore-db.cjs <バックアップファイル名>
//        → 現在のDBを保険として退避してから、指定バックアップを prisma/dev.db に戻す
//        → 実行後は必ず  pm2 restart wedding-erp  でアプリを再起動すること
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, "backups");
const DB_PATH = path.join(ROOT, "prisma", "dev.db");

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db")).sort().reverse(); // 新しい順
}

function human(bytes) { return `${(bytes / 1024 / 1024).toFixed(2)}MB`; }

const arg = process.argv[2];
const backups = listBackups();

if (!arg) {
  if (backups.length === 0) { console.log("バックアップはまだありません（削除操作を行うと自動で作成されます）。"); process.exit(0); }
  console.log(`バックアップ一覧（新しい順・${backups.length}件）：\n`);
  for (const f of backups) {
    const st = fs.statSync(path.join(BACKUP_DIR, f));
    console.log(`  ${f}  (${human(st.size)})`);
  }
  console.log(`\n復元するには:  node scripts/restore-db.cjs ${backups[0]}`);
  process.exit(0);
}

const src = path.join(BACKUP_DIR, arg);
if (!fs.existsSync(src)) { console.error(`✗ バックアップが見つかりません: ${arg}`); process.exit(1); }

// 現在のDBを保険として退避（復元自体を間違えても戻せるように）
if (fs.existsSync(DB_PATH)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const keep = path.join(BACKUP_DIR, `${stamp}_before-restore.db`);
  fs.copyFileSync(DB_PATH, keep);
  console.log(`現在のDBを退避しました: ${path.basename(keep)}`);
}
// WAL/SHM が残っていると復元後に上書きされうるので除去
for (const ext of ["-wal", "-shm"]) {
  const p = DB_PATH + ext;
  if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); }
}
fs.copyFileSync(src, DB_PATH);
console.log(`✓ 復元しました: ${arg} → prisma/dev.db`);
console.log(`\n次のコマンドでアプリを再起動してください:\n  pm2 restart wedding-erp`);
