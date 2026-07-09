// 既存ユーザーのパスワードをリセットする（本番でログインできなくなったとき用）
// 使い方: node scripts/reset-password.cjs メールアドレス 新しいパスワード
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("使い方: node scripts/reset-password.cjs メールアドレス 新しいパスワード");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("パスワードは12文字以上にしてください");
    process.exit(1);
  }
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!u) {
    console.error(`該当ユーザーが見つかりません: ${email}`);
    process.exit(1);
  }
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await bcrypt.hash(password, 12), isActive: true, approved: true },
  });
  console.log(`パスワードを更新しました: ${u.name}（${u.email}・role=${u.role}）`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
