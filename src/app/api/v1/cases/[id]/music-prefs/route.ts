import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";

// GET: 楽曲の好み診断の回答
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const c = await prisma.case.findUnique({ where: { id: params.id }, select: { musicPrefsJson: true } });
  let prefs = null;
  try { prefs = c?.musicPrefsJson ? JSON.parse(c.musicPrefsJson) : null; } catch { /* ignore */ }
  return NextResponse.json({ prefs });
}

// PUT: 診断の保存（songs編集権＝プランナー・音響・新郎新婦）
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "songs", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const prefs = b.prefs && typeof b.prefs === "object" ? b.prefs : {};
  await prisma.case.update({
    where: { id: params.id },
    data: { musicPrefsJson: JSON.stringify(prefs) },
  });
  await audit(s.userId, "update", "music_prefs", params.id);
  return NextResponse.json({ ok: true });
}
