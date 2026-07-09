// 破壊的操作（まとめて削除・案件削除）の直前にDBのバックアップを取る。
// SQLite の VACUUM INTO で「整合性の取れた1ファイルのスナップショット」を backups/ に作成する。
// ・rsyncは backups を除外するのでデプロイで消えない。
// ・世代管理：新しい順に MAX_BACKUPS 件だけ残す。
// 復元は scripts/restore-db.cjs（アプリ停止→置換→再起動）。
import fs from "fs";
import path from "path";
import { prisma } from "./db";

const BACKUP_DIR = path.join(process.cwd(), "backups");
const MAX_BACKUPS = 40;

// ラベルをファイル名に使える形へ
function safeLabel(label: string): string {
  return (label || "backup").replace(/[^\w.\-一-龠ぁ-んァ-ヶ]/g, "_").slice(0, 48);
}

// 直前バックアップを作成。成功時は作成パス、失敗時は null（呼び出し側で扱いを判断）
export async function backupDb(label: string): Promise<string | null> {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-"); // 例 2026-07-08T05-12-33-123Z
    const file = path.join(BACKUP_DIR, `${stamp}_${safeLabel(label)}.db`);
    // VACUUM INTO はトランザクション外で実行される必要がある（$executeRawUnsafe は単文実行なのでOK）
    await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    // 世代管理：ISOタイムスタンプ先頭なので辞書順＝時系列。古いものから削除
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db")).sort();
    while (files.length > MAX_BACKUPS) {
      const old = files.shift();
      if (old) { try { fs.rmSync(path.join(BACKUP_DIR, old), { force: true }); } catch { /* ignore */ } }
    }
    return file;
  } catch (e) {
    console.error("[db-backup] バックアップに失敗:", e);
    return null;
  }
}
