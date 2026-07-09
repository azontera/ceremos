// 標準テンプレート定義
// 2026-07: 内蔵テンプレは全廃止。テンプレはAIで生成したJSON（テンプレ一式=pack）を
// 管理画面「テンプレート」→「📥 AIテンプレ読み込み」で登録する方式に移行した。
// （既存DBのテンプレを消すには: node scripts/clear-templates.cjs --yes）
/* eslint-disable */
function buildTemplates() {
  return []; // 内蔵テンプレなし（seed時にも何も作らない）
}
module.exports = { buildTemplates };
