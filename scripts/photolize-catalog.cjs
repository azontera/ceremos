// カタログ品目の写真を「日本らしい・高画質の実写真」に差し替える。
// 取得元: loremflickr.com（Flickrの実写真をキーワードで取得。Creative Commons ライセンス）。
// 使い方:
//   node scripts/photolize-catalog.cjs          … 未取得（SVG等）の品目だけ実写真化
//   node scripts/photolize-catalog.cjs --force   … 既存の実写真も含めて全品目を撮り直す（日本寄せ・高画質化の反映用）
// ・各品目の品名・カテゴリから「japan/japanese」を優先したキーワードで検索。該当写真が無い組み合わせは
//   loremflickrの汎用プレースホルダー画像が返るため、それを検出して japan 無しキーワードに自動フォールバック。
// ・解像度は1200x900（高画質）。1600x1200でリトライも可能なようレート制限にsleepを挟む。
// ・DL失敗時は既存写真を残す（消さない）。
// ※ 実写真はCCライセンスの仮素材。本番でお客様に見せるなら式場ご自身の写真／正規ライセンス品への差し替えを推奨。
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");
const FORCE = process.argv.includes("--force");
const W = 1200, H = 900;

// 品名キーワード（英語）— カテゴリ既定より優先。先頭に japan/japanese を必ず入れて日本らしさを優先
const NAME_KW = [
  [/白無垢|色打掛|打掛|紋付|留袖|和装|着物|和婚/, "japan,kimono,wedding"],
  [/タキシード|モーニング|tuxedo|新郎/, "japan,groom,tuxedo"],
  [/ボレロ|アクセサリー|小物|ベール|ティアラ|ネックレス/, "japan,bridal,jewelry"],
  [/ブーケ|花束|bouquet/, "japan,wedding,bouquet"],
  [/装花|高砂|フラワーシャワー|花びら|コーディネート/, "japan,wedding,flowers"],
  [/ケーキ|cake/, "japan,wedding,cake"],
  [/ドリンク|シャンパン|乾杯|ワイン|飲み放題|フリードリンク/, "japan,champagne,toast"],
  [/前撮り/, "japan,wedding,couple"],
  [/アルバム|album|台紙/, "japan,photo,album"],
  [/エンドロール|ムービー|映像|ビデオ|撮影/, "japan,wedding,photography"],
  [/招待状|席次|席札|ペーパー|メニュー表|プロフィール|印刷/, "japan,wedding,stationery"],
  [/引菓子|スイーツ|菓子|マドレーヌ|焼き菓子|和三盆/, "japan,wagashi,sweets"],
  [/タオル/, "japan,towel,gift"],
  [/カタログギフト|引出物|引き出物|縁起物|名入れ|プチギフト|ギフト/, "japan,gift,box"],
  [/コース|料理|ビュッフェ|会席|フレンチ|前菜|メイン|ディナー/, "japan,cuisine,restaurant"],
  [/チャペル|挙式|神前|人前式|式/, "japan,wedding,ceremony"],
  [/会場|披露宴|ホール|バンケット|ガーデン|貸切/, "japan,banquet,hall"],
  [/ドレス|dress|ガウン|gown|衣装|衣裳/, "japan,wedding,dress"],
];
// japan付きで該当写真が無い場合のフォールバック（日本語圏でヒットしやすい一般キーワード）
const NAME_KW_FALLBACK = [
  [/白無垢|色打掛|打掛|紋付|留袖|和装|着物|和婚/, "kimono,wedding"],
  [/タキシード|モーニング|tuxedo|新郎/, "groom,tuxedo,suit"],
  [/ボレロ|アクセサリー|小物|ベール|ティアラ|ネックレス/, "bridal,accessory,jewelry"],
  [/ブーケ|花束|bouquet/, "wedding,bouquet,flowers"],
  [/装花|高砂|フラワーシャワー|花びら|コーディネート/, "wedding,flowers,decoration"],
  [/ケーキ|cake/, "wedding,cake"],
  [/ドリンク|シャンパン|乾杯|ワイン|飲み放題|フリードリンク/, "champagne,toast,drinks"],
  [/前撮り/, "wedding,portrait,couple"],
  [/アルバム|album|台紙/, "photo,album"],
  [/エンドロール|ムービー|映像|ビデオ|撮影/, "wedding,photography,film"],
  [/招待状|席次|席札|ペーパー|メニュー表|プロフィール|印刷/, "wedding,invitation,stationery"],
  [/引菓子|スイーツ|菓子|マドレーヌ|焼き菓子|和三盆/, "sweets,dessert,gift"],
  [/タオル/, "towel,gift"],
  [/カタログギフト|引出物|引き出物|縁起物|名入れ|プチギフト|ギフト/, "gift,box,present"],
  [/コース|料理|ビュッフェ|会席|フレンチ|前菜|メイン|ディナー/, "gourmet,cuisine,plate"],
  [/チャペル|挙式|神前|人前式|式/, "wedding,chapel,ceremony"],
  [/会場|披露宴|ホール|バンケット|ガーデン|貸切/, "banquet,hall,wedding"],
  [/ドレス|dress|ガウン|gown|衣装|衣裳/, "wedding,dress,gown"],
];
const CATEGORY_KW = {
  venue: "japan,banquet,hall", ceremony: "japan,wedding,ceremony", catering: "japan,cuisine,restaurant",
  dress: "japan,wedding,dress", beauty: "japan,bridal,makeup", florist: "japan,wedding,bouquet",
  photo: "japan,wedding,photography", video: "japan,wedding,film", mc: "japan,wedding,microphone",
  audio: "japan,stage,lighting", print: "japan,wedding,stationery", gift: "japan,gift,box",
  other: "japan,wedding",
};
const CATEGORY_KW_FALLBACK = {
  venue: "banquet,hall,wedding", ceremony: "wedding,chapel,ceremony", catering: "gourmet,cuisine,plate",
  dress: "wedding,dress,gown", beauty: "bridal,makeup", florist: "wedding,flowers,bouquet",
  photo: "wedding,photography", video: "wedding,film", mc: "wedding,microphone,host",
  audio: "stage,lighting,concert", print: "wedding,invitation,stationery", gift: "gift,box,present",
  other: "wedding",
};
function keywordFor(category, name) {
  for (const [re, kw] of NAME_KW) if (re.test(name)) return kw;
  return CATEGORY_KW[category] || CATEGORY_KW.other;
}
function fallbackKeywordFor(category, name) {
  for (const [re, kw] of NAME_KW_FALLBACK) if (re.test(name)) return kw;
  return CATEGORY_KW_FALLBACK[category] || CATEGORY_KW_FALLBACK.other;
}

// loremflickrは該当写真が無いと汎用プレースホルダー(defaultImage)を返す。それを検出して弾く＝品質保証
async function fetchPhoto(kw, lockSeed) {
  const url = `https://loremflickr.com/${W}/${H}/${encodeURIComponent(kw)}?lock=${lockSeed}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  const res = await fetch(url, { redirect: "follow", signal: ctrl.signal });
  clearTimeout(to);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error(`not image (${type})`);
  if (/defaultImage/i.test(res.url)) throw new Error("該当写真なし（プレースホルダー）");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 15000) throw new Error(`低画質/破損の疑い（${buf.length}B）`);
  return buf;
}

// 日本キーワードで検索→無ければフォールバックキーワードで再検索
async function download(category, name, lockSeed) {
  const primary = keywordFor(category, name);
  const fallback = fallbackKeywordFor(category, name);
  try {
    return { buf: await fetchPhoto(primary, lockSeed), kw: primary };
  } catch (e1) {
    if (primary === fallback) throw e1;
    try {
      return { buf: await fetchPhoto(fallback, lockSeed + 500), kw: fallback };
    } catch (e2) {
      throw new Error(`${e1.message} / フォールバックも失敗: ${e2.message}`);
    }
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const items = await prisma.catalogItem.findMany({
    include: { vendor: { select: { name: true } } },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
  let done = 0, skipped = 0, failed = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const cur = await prisma.attachment.findFirst({ where: { parentType: "catalog", parentId: it.id } });
    if (!FORCE && cur && cur.mime === "image/jpeg") { skipped++; continue; } // 既に実写真（--force未指定なら維持）

    try {
      const { buf, kw } = await download(it.category, it.name, 1000 + i);
      const key = `${randomUUID()}.jpg`;
      fs.writeFileSync(path.join(UPLOAD_DIR, key), buf);
      // 旧写真を削除
      const olds = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: it.id } });
      for (const o of olds) {
        try { fs.rmSync(path.join(UPLOAD_DIR, o.fileKey), { force: true }); } catch { /* ignore */ }
        await prisma.attachment.delete({ where: { id: o.id } });
      }
      await prisma.attachment.create({
        data: { parentType: "catalog", parentId: it.id, fileKey: key, fileName: `${it.name}.jpg`, mime: "image/jpeg" },
      });
      done++;
      console.log(`📷 ${done}/${items.length} ${it.vendor?.name ?? "式場"} / ${it.name}  [${kw}]`);
    } catch (e) {
      failed++;
      console.log(`✗ 失敗（既存写真を維持）: ${it.name}  → ${e.message}`);
    }
    await sleep(300); // 取得元への配慮
  }
  console.log(`\n完了：実写真に差替 ${done}件 / スキップ ${skipped}件 / 失敗 ${failed}件`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
