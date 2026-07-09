// テンプレートの全削除（AIテンプレ方式への移行用）
// 使い方: node scripts/clear-templates.cjs --yes            ← 全テンプレ削除（pack含む）
//         node scripts/clear-templates.cjs --yes --keep-pack ← pack（AIテンプレ一式）は残す
// ※ 案件へ適用済みの見積・進行表などはコピーのため影響しません
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  if (!process.argv.includes("--yes")) {
    console.log("確認: 全テンプレートを削除します。実行するには --yes を付けてください。");
    console.log("  node scripts/clear-templates.cjs --yes            # 全削除");
    console.log("  node scripts/clear-templates.cjs --yes --keep-pack # AIテンプレ一式(pack)は残す");
    process.exit(0);
  }
  const keepPack = process.argv.includes("--keep-pack");
  const where = keepPack ? { type: { not: "pack" } } : {};
  const del = await prisma.template.deleteMany({ where });
  console.log(`✓ テンプレートを${del.count}件削除しました${keepPack ? "（packは残しています）" : ""}`);
  console.log("→ 新しいテンプレは管理画面「テンプレート」→ 🤖 AIプロンプトをコピー → 📥 AIテンプレ読み込み で登録してください");
}

main()
  .catch((e) => { console.error("エラー:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
