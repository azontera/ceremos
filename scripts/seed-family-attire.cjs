// 衣装カテゴリに「ご両親／お子様／ペット」の式場品目を追加
// （フル画面カタログ・ウィザードの衣装ステップで着用者別グループに振り分けるため）
// 使い方: node scripts/seed-family-attire.cjs   （同名スキップで何度でも安全）
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ITEMS = [
  // ご両親（カタログウィザードの「留袖|黒留袖|色留袖|父親|母親|親御」判定に一致させる）
  { name: "黒留袖レンタル（母親用）", price: 45000, desc: "ご両親の正礼装。着付け別途" },
  { name: "色留袖レンタル", price: 40000, desc: "母親・親族女性の準礼装。着付け別途" },
  { name: "父親用モーニングレンタル", price: 30000, desc: "父親の正礼装。ベスト・アスコットタイ付き" },
  // お子様（「子ども|キッズ|ベビー|お子様」判定に一致させる）
  { name: "子どもフォーマル（男の子・スーツ）", price: 12000, desc: "リングボーイ等に。3〜8歳対応" },
  { name: "子どもフォーマル（女の子・ワンピース）", price: 12000, desc: "フラワーガール等に。3〜8歳対応" },
  { name: "ベビードレス（リングボーイ・フラワーガール）", price: 8000, desc: "1〜3歳向けの小さめサイズ" },
  // ペット（「ペット」判定に一致させる）
  { name: "ペット用タキシード（小型犬）", price: 6000, desc: "チワワ〜Mダックス程度のサイズ" },
  { name: "ペット用ドレス（小型犬）", price: 6000, desc: "チワワ〜Mダックス程度のサイズ" },
  { name: "ペット参列サポート（お預かり・アテンド）", price: 15000, desc: "式中〜披露宴のお預かり・誘導スタッフ" },
];

(async () => {
  let created = 0, skipped = 0;
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    const exists = await prisma.catalogItem.findFirst({ where: { name: it.name, vendorId: null } });
    if (exists) { skipped++; continue; }
    await prisma.catalogItem.create({
      data: { name: it.name, category: "dress", price: it.price, desc: it.desc, vendorId: null, sortOrder: 900 + i },
    });
    created++;
    console.log(`＋ ${it.name}`);
  }
  console.log(`完了：新規${created}件・スキップ${skipped}件`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
