// 本番用：初期管理者アカウントの作成（デモデータなし）
// 使い方: node scripts/create-admin.cjs "式場 管理者" admin@your-domain.jp "安全なパスワード"
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error('使い方: node scripts/create-admin.cjs "氏名" メールアドレス パスワード');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("本番用パスワードは12文字以上にしてください");
    process.exit(1);
  }
  const u = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role: "admin", isActive: true },
    create: {
      name,
      email: email.toLowerCase(),
      role: "admin",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  // 会場マスタが空なら初期登録（多め・不要なら管理画面で削除）
  if ((await prisma.venue.count()) === 0) {
    await prisma.venue.createMany({
      data: [
        { name: "チャペル", type: "chapel", capacity: 120 },
        { name: "披露宴会場A", type: "banquet", capacity: 120 },
        { name: "披露宴会場B", type: "banquet", capacity: 90 },
        { name: "披露宴会場C", type: "banquet", capacity: 60 },
        { name: "ガーデン", type: "banquet", capacity: 80 },
        { name: "控室A（新郎新婦）", type: "waiting", capacity: 8 },
        { name: "控室B（親族）", type: "waiting", capacity: 20 },
        { name: "厨房", type: "kitchen", capacity: 0 },
      ],
    });
    console.log("会場マスタを初期登録しました（管理画面「ユーザー・権限」の会場マスタで編集できます）");
  }
  // 選択肢マスタ（案件種別・間柄・部門）が空なら初期登録
  if ((await prisma.masterOption.count()) === 0) {
    const { DEFAULT_MASTERS } = require("../prisma/masters.cjs");
    await prisma.masterOption.createMany({ data: DEFAULT_MASTERS });
    console.log("選択肢マスタを初期登録しました（管理画面「選択肢マスタ」で編集できます）");
  }
  // テンプレートが空なら初期登録（7種・実用内容入り）
  if ((await prisma.template.count()) === 0) {
    const { buildTemplates } = require("../prisma/templates.cjs");
    await prisma.template.createMany({ data: buildTemplates() });
  }
  console.log(`管理者を作成しました: ${u.email}`);
  console.log("ログイン後、管理画面からスタッフ・業者・新郎新婦のアカウントを発行してください。");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
