// apply-real-photos.cjs の初回実行で判明した誤マッピングを是正する（manifest.tsv 突合の結果）。
// ①行き場のない写真を無関係品目に無理やり割り当てていた7品目 → 生成SVGに差し戻す
// ②ゲストテーブル装花系3点（file17/24/29）が1つずつズレていた → 正しい品目に付け替え
// 前提: storage/photo-import/ に 24-guest-table-flowers-alt.png と 29-seasonal-guest-flowers.png が必要
// 使い方: node scripts/fix-photo-mapping.cjs
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const { SCENES, PALETTES, sceneFor, frame, seeded, hashCode } = require("./generate-catalog-art.cjs");

const prisma = new PrismaClient();
const SOURCE_DIR = path.join(process.cwd(), "storage", "photo-import");
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

// ① 誤って写真を割り当てていた品目 → SVG生成アートに差し戻す
const REVERT_TO_SVG = [
  "ナチュラルドレス「リーフ」",
  "シンプルドレス「エミリア」",
  "引出物「寿ぎ三品セット」",
  "引出物「グリーンギフト三品セット」",
  "引出物「和み三品セット」",
  "メイン装花「和花あしらい」",
  "メイン装花「ボタニカルガーデン」",
];

// ② 正しい写真に付け替え（file17は行き場がないため使用しない）
const REASSIGN = [
  ["24-guest-table-flowers-alt.png", "ゲストテーブル装花（1卓）"],
  ["29-seasonal-guest-flowers.png", "装花「四季彩」ゲスト卓（1卓）"],
];

async function replaceAttachment(item, build) {
  const olds = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: item.id } });
  for (const o of olds) {
    try { fs.rmSync(path.join(UPLOAD_DIR, o.fileKey), { force: true }); } catch { /* ignore */ }
    await prisma.attachment.delete({ where: { id: o.id } });
  }
  const { key, fileName, mime } = build();
  await prisma.attachment.create({ data: { parentType: "catalog", parentId: item.id, fileKey: key, fileName, mime } });
}

(async () => {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  console.log("① 誤割当を生成SVGへ差し戻し中…");
  for (const name of REVERT_TO_SVG) {
    const item = await prisma.catalogItem.findFirst({ where: { name } });
    if (!item) { console.warn(`⚠ 品目が見つかりません: 「${name}」`); continue; }
    await replaceAttachment(item, () => {
      const rnd = seeded(hashCode(item.id + item.name));
      const { scene, pal, sub, arg } = sceneFor(item.category, item.name, rnd);
      const svg = frame(SCENES[scene](rnd, arg), { ...PALETTES[pal], title: item.name, sub });
      const key = `${randomUUID()}.svg`;
      fs.writeFileSync(path.join(UPLOAD_DIR, key), svg, "utf8");
      return { key, fileName: `${item.name}.svg`, mime: "image/svg+xml" };
    });
    console.log(`  ↩ ${name} → SVGに戻しました`);
  }

  console.log("\n② 正しい写真へ付け替え中…");
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`画像フォルダが見つかりません: ${SOURCE_DIR}（24・29の画像を配置してから再実行してください）`);
    await prisma.$disconnect();
    return;
  }
  for (const [file, name] of REASSIGN) {
    const src = path.join(SOURCE_DIR, file);
    if (!fs.existsSync(src)) { console.warn(`⚠ 画像ファイルなし: ${file}`); continue; }
    const item = await prisma.catalogItem.findFirst({ where: { name } });
    if (!item) { console.warn(`⚠ 品目が見つかりません: 「${name}」`); continue; }
    await replaceAttachment(item, () => {
      const key = `${randomUUID()}.png`;
      fs.copyFileSync(src, path.join(UPLOAD_DIR, key));
      return { key, fileName: `${item.name}.png`, mime: "image/png" };
    });
    console.log(`  📷 ${name} ← ${file}`);
  }

  console.log("\n完了");
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
