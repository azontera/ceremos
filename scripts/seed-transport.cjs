// 送迎・車両（transport）カテゴリの式場品目を追加（フル画面カタログの「バス・タクシー」セクション用）
// 使い方: node scripts/seed-transport.cjs   （同名スキップで何度でも安全）
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ITEMS = [
  { name: "送迎マイクロバス（27名・往復）", price: 66000, desc: "最寄駅〜式場のゲスト送迎。運転手付き・往復" },
  { name: "送迎大型バス（45名・往復）",     price: 110000, desc: "遠方ゲストの一括送迎に。運転手付き・往復" },
  { name: "ゲスト送迎タクシー手配（1台）",   price: 8000,  desc: "ご年配・お身体の不自由なゲストの個別送迎" },
  { name: "新郎新婦ハイヤー（貸切・半日）",   price: 38000, desc: "挙式前後の移動・お見送りまで専属" },
];

(async () => {
  // 部門マスタに「送迎・車両」を追加（DBにマスタ行が保存済みの環境用。無ければ既定値にtransportが入っている）
  const catRows = await prisma.masterOption.count({ where: { group: "quote_category" } });
  if (catRows > 0) {
    const has = await prisma.masterOption.findFirst({ where: { group: "quote_category", value: "transport" } });
    if (!has) {
      const max = await prisma.masterOption.aggregate({ where: { group: "quote_category" }, _max: { sortOrder: true } });
      await prisma.masterOption.create({
        data: { group: "quote_category", value: "transport", label: "送迎・車両", sortOrder: (max._max.sortOrder ?? 0) + 1 },
      });
      console.log("＋ 部門マスタ: 送迎・車両");
    }
  }

  let created = 0, skipped = 0;
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    const exists = await prisma.catalogItem.findFirst({ where: { name: it.name, vendorId: null } });
    if (exists) { skipped++; continue; }
    await prisma.catalogItem.create({
      data: { name: it.name, category: "transport", price: it.price, desc: it.desc, vendorId: null, sortOrder: i },
    });
    created++;
    console.log(`＋ ${it.name}`);
  }
  console.log(`完了：新規${created}件・スキップ${skipped}件（写真は generate-catalog-art.cjs で生成）`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
