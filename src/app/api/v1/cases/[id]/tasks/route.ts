import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase, audit } from "@/lib/rbac";
import { notifyCaseCustomers } from "@/lib/notify";

// POST: タスク（宿題）追加
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.title?.trim()) return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });

  const t = await prisma.task.create({
    data: {
      caseId: params.id,
      title: b.title.trim(),
      dueAt: b.dueAt ? new Date(b.dueAt) : null,
      assigneeId: s.userId,
    },
  });
  await audit(s.userId, "create", "task", t.id);
  // スタッフが登録した宿題はお客様へ通知（LINE連携時のみ実送信・未連携なら何もしない）
  if (s.role !== "couple") {
    void notifyCaseCustomers(params.id, {
      title: "新しい宿題が届きました",
      body: `${t.title}${t.dueAt ? `（期限: ${t.dueAt.toLocaleDateString("ja-JP")}）` : ""}`,
      href: `/cases/${params.id}`,
    });
  }
  return NextResponse.json({ task: t }, { status: 201 });
}
