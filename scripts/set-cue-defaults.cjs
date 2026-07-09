// 既存の曲でタイミング未設定のものに、シーンから標準タイミングを一括設定（1回実行すればOK）
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DEF = {
  chapel: "キャプテン指示で",
  entrance: "扉オープンと同時",
  reentry: "扉オープンと同時",
  toast: "乾杯の発声と同時",
  cake: "ケーキ入刀と同時",
  leave: "司会コメント終わりで",
  bouquet: "司会コメント終わりで",
  farewell: "時間どおり（進行時刻で）",
};

(async () => {
  const songs = await prisma.song.findMany({ where: { cueTiming: null } });
  let n = 0;
  for (const s of songs) {
    const cue = DEF[s.scene] ?? "時間どおり（進行時刻で）";
    await prisma.song.update({ where: { id: s.id }, data: { cueTiming: cue } });
    n++;
  }
  console.log(`完了：${n}曲にタイミングを自動設定しました`);
  await prisma.$disconnect();
})();
