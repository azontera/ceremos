import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

const TYPES = ["contact", "handover", "claim", "other"];

// GET: アフター記録一覧（社内向け：顧客ロールは閲覧不可）
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "couple" || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const followups = await prisma.followUp.findMany({
    where: { caseId: params.id },
    include: { staff: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ followups });
}

// POST: アフター記録の追加
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const canEdit = can(s.role, "meetings", "edit") || can(s.role, "cases", "edit");
  if (s.role === "couple" || !canEdit || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (!b.body?.trim()) return NextResponse.json({ error: "内容を入力してください" }, { status: 400 });
  const type = TYPES.includes(b.type) ? b.type : "contact";

  const f = await prisma.followUp.create({
    data: {
      caseId: params.id,
      type,
      body: b.body.trim(),
      status: "open",
      staffId: s.userId,
    },
  });
  await audit(s.userId, "create", "followup", f.id, { type });
  return NextResponse.json({ followup: f }, { status: 201 });
}
