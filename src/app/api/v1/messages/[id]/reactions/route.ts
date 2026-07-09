import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase } from "@/lib/rbac";

const ALLOWED = ["👍", "❤️", "🎉", "😂", "🙏", "✅"];

// POST: リアクションのトグル（付与/解除）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const msg = await prisma.chatMessage.findUnique({ where: { id: params.id } });
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canAccessCase(s, msg.caseId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { emoji } = await req.json().catch(() => ({}));
  if (!ALLOWED.includes(emoji)) return NextResponse.json({ error: "不正な絵文字です" }, { status: 400 });

  const key = { messageId_userId_emoji: { messageId: params.id, userId: s.userId, emoji } };
  const existing = await prisma.chatReaction.findUnique({ where: key });
  if (existing) {
    await prisma.chatReaction.delete({ where: key });
    return NextResponse.json({ toggled: "off" });
  }
  await prisma.chatReaction.create({ data: { messageId: params.id, userId: s.userId, emoji } });
  return NextResponse.json({ toggled: "on" });
}
