// 🛍 カタログのサンプルデータ投入（写真つき）
// 使い方: node scripts/seed-catalog.cjs
// ・式場品目（会場費・料理）＋ドレス2店舗・引出物・装花のサンプルを登録
// ・写真はSVGのサンプル画像を生成して storage/uploads に保存（Attachment parentType="catalog"）
// ・同名の品目が既にあればスキップ（何度実行しても重複しない）
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

// サンプル画像（SVG）を生成：グラデーション背景＋絵文字＋品目名
function svgImage(emoji, title, c1, c2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <circle cx="400" cy="252" r="150" fill="rgba(255,255,255,.35)"/>
  <text x="400" y="310" font-size="170" text-anchor="middle">${emoji}</text>
  <rect x="60" y="452" width="680" height="92" rx="14" fill="rgba(255,255,255,.88)"/>
  <text x="400" y="512" font-size="38" text-anchor="middle" font-weight="bold"
    font-family="'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif" fill="#4a3f36">${title}</text>
  <text x="770" y="586" font-size="16" text-anchor="end" fill="rgba(255,255,255,.85)"
    font-family="sans-serif">SAMPLE</text>
</svg>`;
}

async function ensureVendor(name, category) {
  const v = await prisma.vendor.findFirst({ where: { name } });
  if (v) return v;
  const created = await prisma.vendor.create({ data: { name, category } });
  console.log(`  + 業者を作成: ${name}（${category}）`);
  return created;
}

async function addItem({ vendorId, category, name, desc, price, emoji, c1, c2, sortOrder }) {
  const dup = await prisma.catalogItem.findFirst({ where: { name, vendorId: vendorId ?? null } });
  if (dup) { console.log(`  = スキップ（既存）: ${name}`); return; }
  const item = await prisma.catalogItem.create({
    data: { vendorId: vendorId ?? null, category, name, desc, price, sortOrder: sortOrder ?? 0 },
  });
  // サンプル写真（SVG）
  const key = `${randomUUID()}.svg`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, key), svgImage(emoji, name, c1, c2), "utf8");
  await prisma.attachment.create({
    data: { parentType: "catalog", parentId: item.id, fileKey: key, fileName: `${name}.svg`, mime: "image/svg+xml" },
  });
  console.log(`  + 登録: ${name}（¥${price.toLocaleString("ja-JP")}・写真つき）`);
}

async function main() {
  console.log("🛍 カタログサンプルの投入を開始…");

  // ===== 業者（ドレスは2店舗＝出店イメージ。3店舗目はセルフ登録で試せる） =====
  const dress1 = await ensureVendor("ドレスサロン美翔", "dress");
  const dress2 = await ensureVendor("ブライダルコスチューム花衣", "dress");
  const gift1 = await ensureVendor("ギフト住吉", "gift");
  const flor1 = await ensureVendor("フローラ武蔵野", "florist");

  // ===== 式場品目（会場費・料理・その他） =====
  console.log("🏛 式場カタログ");
  await addItem({ vendorId: null, category: "venue", name: "披露宴会場A 利用料（4時間）", desc: "最大120名。音響・照明・プロジェクター含む", price: 200000, emoji: "🏛", c1: "#e8d9c4", c2: "#b9976d", sortOrder: 1 });
  await addItem({ vendorId: null, category: "venue", name: "チャペル挙式料", desc: "牧師・聖歌隊・オルガン奏者・リハーサル含む", price: 150000, emoji: "⛪", c1: "#dfe8f3", c2: "#8fa8cc", sortOrder: 2 });
  await addItem({ vendorId: null, category: "venue", name: "ガーデン利用料（デザートビュッフェ会場）", desc: "屋外音響・ガーデンテーブルセット含む", price: 80000, emoji: "🌿", c1: "#e2efdb", c2: "#88b57e", sortOrder: 3 });
  await addItem({ vendorId: null, category: "catering", name: "婚礼フルコース「エクラ」（1名）", desc: "全9品。オマール海老と国産牛のWメイン", price: 18000, emoji: "🍽", c1: "#f6e8e0", c2: "#c98f6e", sortOrder: 4 });
  await addItem({ vendorId: null, category: "catering", name: "婚礼コース「クレール」（1名）", desc: "全7品。魚・肉のWメインの定番コース", price: 14000, emoji: "🥂", c1: "#f3ecdc", c2: "#c9b06e", sortOrder: 5 });
  await addItem({ vendorId: null, category: "catering", name: "フリードリンク（1名・3時間）", desc: "ビール・ワイン・カクテル・ソフトドリンク", price: 3500, emoji: "🍹", c1: "#e0eef3", c2: "#6ea9c9", sortOrder: 6 });
  await addItem({ vendorId: null, category: "other", name: "ウェルカムスペース装飾", desc: "受付まわりの装飾一式（お持込写真の飾り付け含む）", price: 20000, emoji: "🎀", c1: "#f3e0ea", c2: "#c96e9f", sortOrder: 7 });

  // ===== ドレス（2店舗） =====
  console.log(`👗 ${dress1.name}`);
  await addItem({ vendorId: dress1.id, category: "dress", name: "Aラインドレス「クレール」", desc: "オフショルダー・チャペル映えするロングトレーン", price: 250000, emoji: "👰", c1: "#f7f3ee", c2: "#cbb8a0", sortOrder: 1 });
  await addItem({ vendorId: dress1.id, category: "dress", name: "プリンセスライン「ローズ」", desc: "総レース・ボリュームスカートの王道シルエット", price: 280000, emoji: "👗", c1: "#f9e9ef", c2: "#d387a8", sortOrder: 2 });
  await addItem({ vendorId: dress1.id, category: "dress", name: "タキシード「ノーブル」", desc: "ネイビー・スリーピース。お直し1回含む", price: 120000, emoji: "🤵", c1: "#e2e6ef", c2: "#5f6f96", sortOrder: 3 });
  console.log(`👘 ${dress2.name}`);
  await addItem({ vendorId: dress2.id, category: "dress", name: "カラードレス「ミモザ」", desc: "お色直しに人気のレモンイエロー", price: 230000, emoji: "💛", c1: "#faf3d9", c2: "#d8bc5a", sortOrder: 1 });
  await addItem({ vendorId: dress2.id, category: "dress", name: "白無垢「鶴の舞」", desc: "正絹・綿帽子込み。神前式に", price: 190000, emoji: "👘", c1: "#f5f0ea", c2: "#b8a58c", sortOrder: 2 });

  // ===== 引出物 =====
  console.log(`🎁 ${gift1.name}`);
  await addItem({ vendorId: gift1.id, category: "gift", name: "カタログギフト「琥珀」（1名）", desc: "約1,200点から選べる定番カタログ", price: 5500, emoji: "🎁", c1: "#efe6da", c2: "#a9825c", sortOrder: 1 });
  await addItem({ vendorId: gift1.id, category: "gift", name: "今治タオルセット", desc: "縁起の良い白タオル・木箱入り", price: 3300, emoji: "🕊", c1: "#e8f0f2", c2: "#7fa9b5", sortOrder: 2 });
  await addItem({ vendorId: gift1.id, category: "gift", name: "焼菓子詰合せ（引菓子）", desc: "フィナンシェ＆クッキー12個入り", price: 1500, emoji: "🍪", c1: "#f6ecdD", c2: "#c99a5b", sortOrder: 3 });

  // ===== 装花（その他カテゴリの例として florist 部門で登録） =====
  console.log(`💐 ${flor1.name}`);
  await addItem({ vendorId: flor1.id, category: "florist", name: "メインテーブル装花（高砂）", desc: "季節の花でボリュームたっぷりに", price: 55000, emoji: "💐", c1: "#f0e6f2", c2: "#a678b5", sortOrder: 1 });
  await addItem({ vendorId: flor1.id, category: "florist", name: "ゲスト卓装花（1卓）", desc: "ゲステーブル用アレンジメント", price: 8000, emoji: "🌸", c1: "#fbe9ec", c2: "#d3798b", sortOrder: 2 });
  await addItem({ vendorId: flor1.id, category: "florist", name: "ブーケ・ブートニアセット", desc: "生花。挙式後は押し花加工も可（別料金）", price: 38000, emoji: "🌹", c1: "#f7e3e3", c2: "#c25e5e", sortOrder: 3 });

  const total = await prisma.catalogItem.count();
  console.log(`\n完了 🎉 カタログ品目 合計${total}件（案件の「🛍 カタログ」タブ／管理→カタログ管理で確認できます）`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
