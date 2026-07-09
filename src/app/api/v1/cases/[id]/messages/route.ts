import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase } from "@/lib/rbac";

// GET: メッセージ一覧（ポーリング用に軽量整形）
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const messages = await prisma.chatMessage.findMany({
    where: { caseId: params.id },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { name: true } },
      reads: { select: { userId: true } },
      reactions: { select: { userId: true, emoji: true } },
    },
    take: 200,
  });
  const atts = await prisma.attachment.findMany({
    where: { parentType: "chat_message", parentId: { in: messages.map((m) => m.id) } },
  });
  const bodyById = new Map(messages.map((m) => [m.id, m.body]));
  const senderById = new Map(messages.map((m) => [m.id, m.sender.name]));
  return NextResponse.json({
    messages: messages.map((m) => {
      // リアクションを絵文字ごとに集計
      const grouped = new Map<string, { count: number; mine: boolean }>();
      for (const r of m.reactions) {
        const g = grouped.get(r.emoji) ?? { count: 0, mine: false };
        g.count++;
        if (r.userId === s.userId) g.mine = true;
        grouped.set(r.emoji, g);
      }
      return {
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        senderName: m.sender.name,
        createdAt: m.createdAt,
        readByOthers: m.reads.some((r) => r.userId !== m.senderId),
        threadParentId: m.threadParentId,
        parentPreview: m.threadParentId
          ? `${senderById.get(m.threadParentId) ?? ""}: ${(bodyById.get(m.threadParentId) ?? "").slice(0, 40)}`
          : null,
        reactions: Array.from(grouped.entries()).map(([emoji, g]) => ({ emoji, ...g })),
        attachments: atts
          .filter((a) => a.parentId === m.id)
          .map((a) => ({ id: a.id, fileName: a.fileName, mime: a.mime })),
      };
    }),
  });
}

// POST: メッセージ送信
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "chat", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { body, threadParentId } = await req.json().catch(() => ({}));
  if (!body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "メッセージを入力してください" }, { status: 400 });
  }
  // 返信先の検証（同一案件のメッセージのみ）
  let parentId: string | null = null;
  if (threadParentId) {
    const parent = await prisma.chatMessage.findFirst({
      where: { id: String(threadParentId), caseId: params.id },
    });
    if (parent) parentId = parent.id;
  }
  const m = await prisma.chatMessage.create({
    data: { caseId: params.id, senderId: s.userId, body: body.trim(), threadParentId: parentId },
  });
  return NextResponse.json({ message: m }, { status: 201 });
}
