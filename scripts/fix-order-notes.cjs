#!/usr/bin/env node
// 発注の「品目」欄バグ修正：見積保存時の自動作成発注に、識別できない共通文言
// 「見積Ver.X から自動作成（手配リスト）」が入っていたものを、部門名入りの文言に直す。
// 使い方: node scripts/fix-order-notes.cjs
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CAT_LABEL = {
  dress: "ドレス", florist: "装花", catering: "料理", audio: "音響",
  mc: "司会", photo: "写真", video: "映像", gift: "引出物", print: "印刷物", beauty: "美容",
};

// 旧: 「見積Ver.1 から自動作成（手配リスト）」（version前後の空白ゆれを許容）
const OLD_PATTERN = /^見積Ver\.(\d+)\s*から自動作成（手配リスト）$/;

async function main() {
  const orders = await prisma.order.findMany({ where: { note: { not: null } } });
  const targets = orders.filter((o) => o.note && OLD_PATTERN.test(o.note));
  if (targets.length === 0) {
    console.log("[fix-order-notes] 対象なし（修正不要）");
    return;
  }
  let fixed = 0;
  for (const o of targets) {
    const m = o.note.match(OLD_PATTERN);
    const version = m ? m[1] : "?";
    const label = CAT_LABEL[o.category] ?? o.category;
    const newNote = `${label}（見積Ver.${version}より自動作成）`;
    await prisma.order.update({ where: { id: o.id }, data: { note: newNote } });
    fixed++;
  }
  await prisma.auditLog.create({
    data: { action: "fix", targetType: "order_note", diffJson: JSON.stringify({ count: fixed, via: "script" }) },
  });
  console.log(`[fix-order-notes] ${fixed}件の発注の品目名を修正しました`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
