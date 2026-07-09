// 誤削除された業者カタログ（ドレス業者）の再作成 — 写真つき。
// 使い方: node scripts/restore-dress-catalog.cjs
// ・対象業者は「品目が0の指定ドレス業者」。既に同名品目があればスキップ（何度実行しても安全）。
// ・写真は 800x600 のSVGを storage/uploads に生成し Attachment(parentType="catalog") として登録。
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

// 生成する品目（元と同一ではない“新規”の現実的なドレス品目・写真つき）
const DATA = [
  {
    vendor: "ブライダルコスチューム花衣",
    items: [
      { name: "カラードレス「セレスト」",        price: 290000, desc: "深いブルーのサテンが映えるロングドレス",             emoji: "👗", c1: "#e7eef8", c2: "#8fa8cc" },
      { name: "プリンセスライン「フルール」",     price: 340000, desc: "ボリュームチュールの主役級ドレス",                 emoji: "👗", c1: "#fbeef2", c2: "#d99bb2" },
      { name: "エンパイアドレス「ソレイユ」",     price: 260000, desc: "高めの切り替えで軽やかな印象のドレス",             emoji: "👗", c1: "#fdf2e6", c2: "#d9a86b" },
      { name: "色打掛「花霞」",                  price: 350000, desc: "桜文様の華やかな色打掛（和装）",                   emoji: "👘", c1: "#fbe9ec", c2: "#c98aa0" },
      { name: "ロングトレーン「ブランシュ」",     price: 310000, desc: "大聖堂式に映える長いトレーンのドレス",             emoji: "👰", c1: "#f5f0fa", c2: "#b79bc4" },
    ],
  },
  {
    vendor: "二光",
    items: [
      { name: "モーニングコート「グラン」",       price: 140000, desc: "新郎・親御様の昼の正礼装",                       emoji: "🤵", c1: "#eceff2", c2: "#8f9bab" },
      { name: "カラータキシード「ミッドナイト」", price: 150000, desc: "濃紺のスタイリッシュなタキシード",                 emoji: "🤵", c1: "#e6e9f2", c2: "#6f78a8" },
      { name: "色留袖「松風」",                  price: 180000, desc: "ご親族の和装フォーマル",                         emoji: "👘", c1: "#eef4ec", c2: "#8fb08a" },
      { name: "マーメイドドレス「アダージョ」",   price: 300000, desc: "体のラインを美しく見せるマーメイドライン",         emoji: "👗", c1: "#fbeef2", c2: "#d38aa4" },
      { name: "ベビードレス＆リングピロー",       price: 45000,  desc: "お子様の衣装・演出小物セット",                   emoji: "🎀", c1: "#fdeef4", c2: "#e0a7c1" },
    ],
  },
];

function autoSvg(emoji, title, c1, c2) {
  const esc = String(title).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <circle cx="400" cy="252" r="150" fill="rgba(255,255,255,.35)"/>
  <text x="400" y="310" font-size="170" text-anchor="middle">${emoji}</text>
  <rect x="60" y="452" width="680" height="92" rx="14" fill="rgba(255,255,255,.88)"/>
  <text x="400" y="512" font-size="36" text-anchor="middle" font-weight="bold" font-family="'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif" fill="#4a3f36">${esc}</text>
</svg>`;
}

(async () => {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  let created = 0, skipped = 0, photos = 0;
  for (const group of DATA) {
    const vendor = await prisma.vendor.findFirst({ where: { name: group.vendor } });
    if (!vendor) { console.log(`⚠ 業者が見つかりません: ${group.vendor}（スキップ）`); continue; }
    for (let i = 0; i < group.items.length; i++) {
      const it = group.items[i];
      const exists = await prisma.catalogItem.findFirst({ where: { name: it.name, vendorId: vendor.id } });
      if (exists) { skipped++; console.log(`= 既存: ${group.vendor} / ${it.name}`); continue; }
      const item = await prisma.catalogItem.create({
        data: { name: it.name, category: "dress", price: it.price, desc: it.desc, vendorId: vendor.id, sortOrder: i },
      });
      created++;
      // 写真
      const svg = autoSvg(it.emoji, it.name, it.c1, it.c2);
      const key = `${randomUUID()}.svg`;
      fs.writeFileSync(path.join(UPLOAD_DIR, key), svg, "utf8");
      await prisma.attachment.create({
        data: { parentType: "catalog", parentId: item.id, fileKey: key, fileName: `${it.name}.svg`, mime: "image/svg+xml" },
      });
      photos++;
      console.log(`＋ 作成: ${group.vendor} / ${it.name}（写真つき）`);
    }
  }
  console.log(`\n完了：新規${created}品目・写真${photos}枚・スキップ${skipped}件`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
