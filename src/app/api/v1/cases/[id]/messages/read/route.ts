import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase } from "@/lib/rbac";

// POST: この案件の未読メッセージをすべて既読にする
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const unread = await prisma.chatMessage.findMany({
    where: {
      caseId: params.id,
      NOT: { senderId: s.userId },
      reads: { none: { userId: s.userId } },
    },
    select: { id: true },
  });
  if (unread.length > 0) {
    await prisma.chatRead.createMany({
      data: unread.map((m) => ({ messageId: m.id, userId: s.userId })),
    });
  }
  return NextResponse.json({ marked: unread.length });
}
