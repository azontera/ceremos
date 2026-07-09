// ユーザーのロール変更（管理画面に入れないときの救済用）
// 使い方: node scripts/set-role.cjs tera@azon.jp admin
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ROLES = ["admin", "manager", "planner", "chef", "audio", "mc", "dress", "florist", "photo", "print", "gift", "service", "couple"];

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !ROLES.includes(role)) {
    console.error("使い方: node scripts/set-role.cjs メールアドレス ロール");
    console.error(`ロール: ${ROLES.join(" / ")}`);
    process.exit(1);
  }
  const u = await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { role, isActive: true, approved: true },
  });
  console.log(`✓ ${u.name}（${u.email}）のロールを「${role}」に変更しました`);
}

main()
  .catch((e) => { console.error("エラー:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
