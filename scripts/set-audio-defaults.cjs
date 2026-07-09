// 再生プレイヤーの初期値を新しい既定値に合わせる（1回実行すればOK）
// 旧既定値のままの曲だけ更新：音量100→70、F.O 1秒/3秒→2秒（手で変えた値は触らない）
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const v = await prisma.song.updateMany({ where: { volume: 100 }, data: { volume: 70 } });
  const f = await prisma.song.updateMany({ where: { fadeOutSec: { in: [1, 3] } }, data: { fadeOutSec: 2 } });
  console.log(`完了：音量を${v.count}曲、F.Oを${f.count}曲 更新しました（新既定値：音量70／F.O 2秒）`);
  await prisma.$disconnect();
})();
