// AIヒヤリングの回答保存・取得
// POST: { person: "groom"|"bride"|"host", answers: {qid: value} } — 回答を人別にマージ保存し、診断結果を再計算
// GET : 保存済みの回答＋診断結果
// 権限: 案件にアクセスできる人（スタッフ＝店頭ヒヤリング／couple＝自分のスマホで回答）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase, audit } from "@/lib/rbac";
import { buildResults, type HearingData } from "@/lib/hearing";

const PERSONS = ["groom", "bride", "host"] as const;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const c = await prisma.case.findUnique({ where: { id: params.id }, select: { hearingJson: true, caseType: true } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  let data: HearingData = { answers: {} };
  try { if (c.hearingJson) data = JSON.parse(c.hearingJson); } catch { /* ignore */ }
  return NextResponse.json({ ...data, caseType: c.caseType });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const c = await prisma.case.findUnique({ where: { id: params.id }, select: { hearingJson: true, caseType: true } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const person = PERSONS.includes(b.person) ? (b.person as (typeof PERSONS)[number]) : null;
  if (!person || typeof b.answers !== "object" || b.answers === null) {
    return NextResponse.json({ error: "person と answers が必要です" }, { status: 400 });
  }
  // 値は文字列のみ許可（設問ID→回答値）
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.answers as Record<string, unknown>)) {
    if (typeof v === "string" && v.length <= 2000) answers[k] = v;
  }

  let data: HearingData = { answers: {} };
  try { if (c.hearingJson) data = JSON.parse(c.hearingJson); } catch { /* ignore */ }
  data.answers[person] = { ...(data.answers[person] ?? {}), ...answers };
  data.results = buildResults(c.caseType, data);
  data.updatedAt = new Date().toISOString();

  await prisma.case.update({ where: { id: params.id }, data: { hearingJson: JSON.stringify(data) } });
  await audit(s.userId, "update", "case", params.id, { hearing: person });
  return NextResponse.json({ ok: true, results: data.results });
}
