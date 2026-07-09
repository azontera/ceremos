// 発注の品目名から「（テンプレ・見積Ver.◯より自動作成）」等の注記を除去する一回きりの整理スクリプト
// 使い方: node scripts/clean-order-notes.cjs
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({ where: { note: { contains: "より自動作成" } } });
  let n = 0;
  for (const o of orders) {
    const cleaned = o.note.replace(/（[^（）]*より自動作成）/g, "").trim();
    if (cleaned && cleaned !== o.note) {
      await prisma.order.update({ where: { id: o.id }, data: { note: cleaned } });
      n++;
    }
  }
  console.log(`✓ 発注 ${n}件の品目名を整理しました（例：「料理（テンプレ・見積Ver.1より自動作成）」→「料理」）`);
}

main()
  .catch((e) => { console.error("エラー:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
