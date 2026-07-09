import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/rbac";
import { getSetting, setSetting, SETTING_DEFAULTS } from "@/lib/settings";

// GET: 設定一覧（管理者のみ）
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });
  const entries = await Promise.all(
    Object.keys(SETTING_DEFAULTS).map(async (key) => [key, await getSetting(key)] as const),
  );
  return NextResponse.json({ settings: Object.fromEntries(entries) });
}

// PATCH: 設定の更新（管理者のみ）
export async function PATCH(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    if (b[key] !== undefined) await setSetting(key, String(b[key]));
  }
  await audit(s.userId, "update", "settings", undefined, b);
  return NextResponse.json({ ok: true });
}
