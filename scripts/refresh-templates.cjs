// 見積などの標準テンプレートを最新定義（prisma/templates.cjs）に差し替える
// データを消さずにテンプレだけ更新したいとき用。
// 使い方: node scripts/refresh-templates.cjs           ← 見積テンプレのみ差し替え
//         node scripts/refresh-templates.cjs --all     ← 7種すべて差し替え
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const { buildTemplates } = require("../prisma/templates.cjs");
const prisma = new PrismaClient();

async function main() {
  const all = process.argv.includes("--all");
  const templates = buildTemplates().filter((t) => all || t.type === "quote");
  const types = [...new Set(templates.map((t) => t.type))];
  const del = await prisma.template.deleteMany({ where: { type: { in: types }, isSystem: true } });
  await prisma.template.createMany({ data: templates });
  console.log(`✓ テンプレートを差し替えました（削除${del.count}件 → 追加${templates.length}件：${types.join(", ")}）`);
  console.log("※ 管理画面「テンプレート」で編集した内容は上書きされます（isSystem=true のもののみ対象）");
}

main()
  .catch((e) => { console.error("エラー:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
