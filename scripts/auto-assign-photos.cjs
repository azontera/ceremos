// フォルダに画像＋manifest.tsvを置くだけで、カタログ品目へ自動で写真を反映する。
// manifest.tsv 形式（タブ区切り・ヘッダー行なしでも可）: 連番<TAB>ファイル名<TAB>品目名
//   例: 1	01-xxx.png	コース料理「セレモス・クラシック」
// ルール:
//   ・品目名が完全一致した場合のみ反映する（前回の教訓＝近い名前への無理な割当はしない）
//   ・一致しない行は skipped-manifest.tsv に書き出し、既存品目へは絶対に割り当てない
// 使い方: node scripts/auto-assign-photos.cjs [フォルダパス]
//   フォルダパス省略時は storage/photo-import/ を見る
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const DIR = path.resolve(process.argv[2] || path.join(process.cwd(), "storage", "photo-import"));
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");
const MANIFEST = path.join(DIR, "manifest.tsv");

const EXT_MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

(async () => {
  if (!fs.existsSync(DIR)) { console.error(`フォルダが見つかりません: ${DIR}`); process.exit(1); }
  if (!fs.existsSync(MANIFEST)) { console.error(`manifest.tsv が見つかりません: ${MANIFEST}`); process.exit(1); }
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const rows = fs.readFileSync(MANIFEST, "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split("\t")).filter((cols) => cols.length >= 3)
    .map(([, file, name]) => ({ file: file.trim(), name: name.trim() }));

  let done = 0, skipped = [];
  for (const { file, name } of rows) {
    const ext = path.extname(file).toLowerCase();
    const mime = EXT_MIME[ext];
    const src = path.join(DIR, file);
    if (!mime || !fs.existsSync(src)) { skipped.push({ file, name, reason: "画像ファイルなし/非対応形式" }); continue; }

    const item = await prisma.catalogItem.findFirst({ where: { name } });
    if (!item) { skipped.push({ file, name, reason: "品目名が完全一致しない（未登録 or 表記違い）" }); continue; }

    const olds = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: item.id } });
    for (const o of olds) {
      try { fs.rmSync(path.join(UPLOAD_DIR, o.fileKey), { force: true }); } catch { /* ignore */ }
      await prisma.attachment.delete({ where: { id: o.id } });
    }
    const key = `${randomUUID()}${ext}`;
    fs.copyFileSync(src, path.join(UPLOAD_DIR, key));
    await prisma.attachment.create({ data: { parentType: "catalog", parentId: item.id, fileKey: key, fileName: `${item.name}${ext}`, mime } });
    done++;
    console.log(`📷 ${name} ← ${file}`);
  }

  if (skipped.length) {
    const out = path.join(DIR, "skipped-manifest.tsv");
    fs.writeFileSync(out, skipped.map((s) => `${s.file}\t${s.name}\t${s.reason}`).join("\n"), "utf8");
    console.log(`\n⚠ 反映できなかった${skipped.length}件を skipped-manifest.tsv に書き出しました（品目名を管理画面で確認・修正してください）`);
  }
  console.log(`\n完了：反映${done}件・スキップ${skipped.length}件`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
