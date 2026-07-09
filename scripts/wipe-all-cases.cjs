// 案件カード全削除（Case + 紐づく全データをカスケード削除）
// 使い方: node scripts/wipe-all-cases.cjs
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const cases = await prisma.case.findMany({ select: { id: true } });
  const caseIds = cases.map((c) => c.id);

  if (caseIds.length === 0) {
    console.log("案件カードは0件でした（削除不要）");
    await prisma.$disconnect();
    return;
  }

  const meetings = await prisma.meeting.findMany({
    where: { caseId: { in: caseIds } },
    select: { id: true },
  });
  const songs = await prisma.song.findMany({
    where: { caseId: { in: caseIds } },
    select: { id: true },
  });
  const meetingIds = meetings.map((m) => m.id);
  const songIds = songs.map((s) => s.id);

  const result = await prisma.case.deleteMany({});

  // Attachment は caseId 等への外部キー制約が無い（parentType/parentId の擬似リレーション）ため
  // カスケードされない。削除された案件・打合せ・楽曲に紐づく添付ファイルのレコードも手動で削除する。
  await prisma.attachment.deleteMany({
    where: { parentType: "case", parentId: { in: caseIds } },
  });
  if (meetingIds.length) {
    await prisma.attachment.deleteMany({
      where: { parentType: "meeting", parentId: { in: meetingIds } },
    });
  }
  if (songIds.length) {
    await prisma.attachment.deleteMany({
      where: { parentType: "song", parentId: { in: songIds } },
    });
  }

  console.log(`削除完了: 案件 ${result.count} 件（打合せ・見積・発注・進行表・席次・楽曲・請求書等も連動削除）`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
