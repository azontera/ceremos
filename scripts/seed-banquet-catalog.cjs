// 宴会・式典・イベント案件で不足していたカタログ品目を追加
// 対象: mc / audio / video / beauty / service（宴会場用のvenue品目も1件追加）
// 使い方: node scripts/seed-banquet-catalog.cjs   （同名スキップで何度でも安全）
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ITEMS = [
  { category: "venue", name: "宴会場利用料（4時間）", price: 200000, desc: "企業周年・式典・パーティ向け宴会場。基本音響・照明含む" },
  { category: "mc", name: "司会進行（プロ司会者・4時間）", price: 80000, desc: "式次第の構成・台本作成・当日進行を一括で担当" },
  { category: "mc", name: "司会台本作成・打合せ", price: 20000, desc: "登壇者・進行内容のヒアリングと台本の作成" },
  { category: "audio", name: "音響・マイク一式手配", price: 60000, desc: "ワイヤレスマイク・スピーカー・ミキサー一式＋設営" },
  { category: "audio", name: "BGM・当日オペレーター", price: 40000, desc: "開宴〜お開きのBGM運営・音響オペレーター常駐" },
  { category: "video", name: "エンドロール映像制作＆当日上映", price: 90000, desc: "写真・メッセージを編集し会場スクリーンで上映" },
  { category: "video", name: "スクリーン・プロジェクター機材", price: 50000, desc: "会場設営含む映像機材一式（式典・表彰式のスライド上映に）" },
  { category: "beauty", name: "登壇者・主催者ヘアメイク（1名）", price: 15000, desc: "式典・祝賀会の登壇者向けフルメイク" },
  { category: "service", name: "受付スタッフ手配（1名）", price: 12000, desc: "受付・ご祝儀/会費対応・名簿チェック" },
  { category: "service", name: "サービススタッフ増員（1名・4時間）", price: 15000, desc: "配膳・ドリンクサービスの増員" },
  { category: "service", name: "クローク・荷物預かり運営", price: 10000, desc: "受付付近でのお荷物・お土産のお預かり運営" },
];

async function addItem({ category, name, desc, price }) {
  const dup = await prisma.catalogItem.findFirst({ where: { name, vendorId: null } });
  if (dup) { console.log(`  = スキップ（既存）: ${name}`); return; }
  const maxSort = await prisma.catalogItem.aggregate({ where: { category }, _max: { sortOrder: true } });
  await prisma.catalogItem.create({
    data: { vendorId: null, category, name, desc, price, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
  });
  console.log(`  + 登録: ${name}（${category}・¥${price.toLocaleString("ja-JP")}）`);
}

async function main() {
  console.log("🥂 宴会・式典向けカタログ品目の投入を開始…");
  for (const it of ITEMS) await addItem(it);
  const total = await prisma.catalogItem.count();
  console.log(`\n完了 🎉 カタログ品目 合計${total}件（案件の「🛍 カタログ」タブ／管理→カタログ管理で確認できます）`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
