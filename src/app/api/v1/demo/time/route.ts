// ===== 検証用「時間を進める」API（DEMO_MODE=1 のときだけ有効）=====
// 承認猶予（10時間）の検証などに使う仮想時計。Setting demo_time_offset_ms に加算分を保存する。
// 本番では .env に DEMO_MODE を設定しない（=無効）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DEMO_MODE, getNow, getTimeOffsetMs } from "@/lib/clock";

export async function GET() {
  if (!DEMO_MODE) return NextResponse.json({ enabled: false });
  const [now, offsetMs] = await Promise.all([getNow(), getTimeOffsetMs()]);
  return NextResponse.json({ enabled: true, now: now.toISOString(), offsetMs });
}

// POST { addHours?: number, reset?: boolean }
export async function POST(req: NextRequest) {
  if (!DEMO_MODE) return NextResponse.json({ error: "検証モードは無効です" }, { status: 403 });
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const cur = await getTimeOffsetMs();
  const next = b.reset ? 0 : cur + Math.round(Number(b.addHours ?? 0) * 3600000);
  await prisma.setting.upsert({
    where: { key: "demo_time_offset_ms" },
    update: { value: String(next) },
    create: { key: "demo_time_offset_ms", value: String(next) },
  });
  const now = new Date(Date.now() + next);
  return NextResponse.json({ ok: true, now: now.toISOString(), offsetMs: next });
}
