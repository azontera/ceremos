// 既存案件の進行表を一括修正（1回実行すればOK・何度実行しても安全）
// 1) 表示中の時刻の「間隔」から全行の所要分を再導出（時刻を正として扱う）
// 2) 先頭時刻＋所要分の積み上げで全行の時刻を再計算（以後はアプリが自動で維持）
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const parseHM = (t) => {
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fmtHM = (m) => {
  m = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

(async () => {
  const cases = await prisma.case.findMany({ select: { id: true, groomName: true, brideName: true } });
  let fixed = 0;
  for (const c of cases) {
    const items = await prisma.rundownItem.findMany({
      where: { caseId: c.id },
      orderBy: { sortOrder: "asc" },
    });
    if (items.length === 0) continue;
    let changed = false;
    // 1) 所要分＝次の行までの間隔（最終行は既存値 or 10分）
    for (let i = 0; i < items.length; i++) {
      const cur = parseHM(items[i].time);
      const next = items[i + 1] ? parseHM(items[i + 1].time) : null;
      const gap = cur !== null && next !== null ? (next - cur + 1440) % 1440 : null;
      const dur = gap && gap > 0 && gap <= 600 ? gap : (items[i].durationMin ?? 10);
      if (items[i].durationMin !== dur) {
        items[i].durationMin = dur;
        await prisma.rundownItem.update({ where: { id: items[i].id }, data: { durationMin: dur } });
        changed = true;
      }
    }
    // 2) 先頭時刻から積み上げて再計算
    let curMin = parseHM(items[0].time) ?? 11 * 60 + 30;
    for (const it of items) {
      const t = fmtHM(curMin);
      if (it.time !== t) {
        await prisma.rundownItem.update({ where: { id: it.id }, data: { time: t } });
        changed = true;
      }
      curMin += it.durationMin ?? 10;
    }
    if (changed) { fixed++; console.log(`✔ ${c.groomName} & ${c.brideName}: 所要分・時刻を修正`); }
  }
  console.log(`完了：${cases.length}案件を確認、${fixed}案件を修正しました`);
  await prisma.$disconnect();
})();
