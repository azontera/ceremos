// 品目が0の業者カタログをまとめて作成 — 写真つき。
// 使い方: node scripts/fill-empty-catalog.cjs
// ・DATA に列挙した業者へ、カテゴリに合った品目＋SVG写真を作成。
// ・既に同名品目があればスキップ（何度実行しても安全）。業者が無ければスキップ。
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

const DATA = [
  { vendor: "Maison Lumiere", category: "dress", items: [
    { name: "インポートドレス「リュミエール」",        price: 380000, desc: "フランス直輸入のクチュールライン",       emoji: "👰", c1: "#f5f0fa", c2: "#b79bc4" },
    { name: "クラシカルドレス「ヴィンテージローズ」",  price: 330000, desc: "アンティークレースの気品あるドレス",   emoji: "👗", c1: "#fbeef2", c2: "#d99bb2" },
    { name: "2WAYドレス「パピヨン」",                price: 360000, desc: "披露宴〜二次会まで映える2WAY仕様",     emoji: "👗", c1: "#fdf2e6", c2: "#d9a86b" },
    { name: "ボレロ＆アクセサリーセット",            price: 60000,  desc: "羽織りもの・小物一式",               emoji: "🎀", c1: "#fdeef4", c2: "#e0a7c1" },
  ]},
  { vendor: "フローラ武蔵野", category: "florist", items: [
    { name: "高砂装花（ハイテーブル）",          price: 120000, desc: "メインテーブルの豪華装花",           emoji: "💐", c1: "#eef6e8", c2: "#8fbf7a" },
    { name: "ゲストテーブル装花（1卓）",         price: 8000,   desc: "卓上のコーディネート花",             emoji: "🌸", c1: "#fbeef2", c2: "#cf9bb0" },
    { name: "ブライダルブーケ＆ブートニア",       price: 25000,  desc: "生花のブーケ＆ブートニアセット",     emoji: "💐", c1: "#eef6e8", c2: "#7bb06a" },
    { name: "会場装花トータルコーディネート",     price: 200000, desc: "入口〜会場までの装花一式",           emoji: "🌿", c1: "#eef4ec", c2: "#7aa87a" },
  ]},
  { vendor: "花司アトリエ凛", category: "florist", items: [
    { name: "和モダン高砂装花",                 price: 130000, desc: "和の花材を活かした高砂装花",         emoji: "🌾", c1: "#f4efe0", c2: "#b9a06a" },
    { name: "水引ブーケ",                       price: 22000,  desc: "和婚に映える水引×生花のブーケ",     emoji: "💐", c1: "#fbe9ec", c2: "#c98aa0" },
    { name: "装花「四季彩」ゲスト卓（1卓）",     price: 9000,   desc: "季節の花のテーブル装花",             emoji: "🌸", c1: "#fdeef4", c2: "#d9a0b8" },
    { name: "フラワーシャワー花びら（30名分）", price: 18000,  desc: "退場演出用の花びら",                 emoji: "🌷", c1: "#fdf2e6", c2: "#d9a86b" },
  ]},
  { vendor: "ギフト住吉", category: "gift", items: [
    { name: "カタログギフト「雅」",             price: 5500,   desc: "人気の選べるカタログギフト",         emoji: "🎁", c1: "#f6ece6", c2: "#cc9377" },
    { name: "引菓子「和三盆詰合せ」",           price: 1800,   desc: "上品な和のお菓子",                   emoji: "🍬", c1: "#f5efe4", c2: "#c2a878" },
    { name: "縁起物「鰹節・紅白麺」",           price: 1200,   desc: "定番の縁起物",                       emoji: "🎀", c1: "#f6ece6", c2: "#cc9377" },
    { name: "引出物3点セット",                  price: 8000,   desc: "メイン＋引菓子＋縁起物のセット",     emoji: "🎁", c1: "#f4e7d6", c2: "#c99b63" },
  ]},
  { vendor: "ギフト工房結", category: "gift", items: [
    { name: "名入れギフト「結（ゆい）」",       price: 4800,   desc: "名入れの記念ギフト",                 emoji: "🎁", c1: "#f6ece6", c2: "#cc9377" },
    { name: "オーガニックタオルセット",         price: 3500,   desc: "上質な今治タオルのセット",           emoji: "🧺", c1: "#eef4ec", c2: "#8fb08a" },
    { name: "スイーツBOX「彩」",                price: 2200,   desc: "焼き菓子アソート",                   emoji: "🍰", c1: "#fceef0", c2: "#dc9aa8" },
    { name: "プチギフト「ハニーマドレーヌ」",   price: 300,    desc: "お見送りのプチギフト",               emoji: "🍯", c1: "#f3ecd8", c2: "#c9b25f" },
  ]},
  { vendor: "スタジオ・ルーチェ", category: "photo", items: [
    { name: "挙式・披露宴 撮影（全データ）",     price: 180000, desc: "当日撮影＋全カットデータ納品",       emoji: "📷", c1: "#e7edf3", c2: "#7f9bb8" },
    { name: "前撮り（スタジオ・1着）",          price: 80000,  desc: "記念の前撮り撮影",                   emoji: "📸", c1: "#e6e9f2", c2: "#7b83b8" },
    { name: "台紙アルバム（20P）",              price: 120000, desc: "高級台紙アルバム",                   emoji: "📖", c1: "#eef2f6", c2: "#8fa0b8" },
    { name: "エンドロール撮影＆当日上映",       price: 90000,  desc: "当日撮影のエンドロールムービー",     emoji: "🎬", c1: "#e6e9f2", c2: "#7b83b8" },
  ]},
  { vendor: "アルバ堂", category: "print", items: [
    { name: "招待状（1部）",                    price: 400,    desc: "印刷・封入込みの招待状",             emoji: "💌", c1: "#f5efe4", c2: "#c2a878" },
    { name: "席次表（1部）",                    price: 500,    desc: "会場レイアウト入りの席次表",         emoji: "🗺", c1: "#f5efe4", c2: "#c2a878" },
    { name: "席札（1枚）",                      price: 150,    desc: "お名前入りの席札",                   emoji: "🏷", c1: "#f6ece6", c2: "#cc9377" },
    { name: "メニュー表＆プロフィールブック",   price: 800,    desc: "当日の読み物一式",                   emoji: "📖", c1: "#f5efe4", c2: "#c2a878" },
  ]},
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
        data: { name: it.name, category: group.category, price: it.price, desc: it.desc, vendorId: vendor.id, sortOrder: i },
      });
      created++;
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
