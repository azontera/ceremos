// 添付レコードの削除＋物理ファイルの掃除（ストレージにゴミを残さない）
import { prisma } from "./db";
import { deleteFile } from "./storage";

export async function deleteAttachmentsFor(parentType: string, parentIds: string[]) {
  if (parentIds.length === 0) return;
  const atts = await prisma.attachment.findMany({
    where: { parentType, parentId: { in: parentIds } },
  });
  for (const a of atts) await deleteFile(a.fileKey);
  if (atts.length > 0) {
    await prisma.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } });
  }
}
