import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, verifyUserToken } from "@/lib/auth";
import { audit } from "@/lib/rbac";

// 事前アンケート（任意）— 登録直後の30日トークン、またはログイン済み顧客セッションで読み書き
async function resolveUserId(req: NextRequest, tokenFromBody?: string): Promise<string | null> {
  const token = tokenFromBody ?? req.nextUrl.searchParams.get("token") ?? "";
  if (token) return verifyUserToken(token, "survey");
  const s = await getSession();
  return s?.userId ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileJson: true, phone: true, address: true },
  });
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
  let p: Record<string, unknown> = {};
  try { p = JSON.parse(u.profileJson ?? "{}"); } catch { /* ignore */ }
  return NextResponse.json({
    survey: p.survey ?? {},
    // 生年月日は登録時の必須項目のためアンケートでは扱わない
    basics: {
      gender: p.gender ?? "", hasChildren: p.hasChildren ?? "",
      // 個人情報（ログイン後に入力・修正できる）
      furigana: p.furigana ?? "", partnerName: p.partnerName ?? "",
      phone: u.phone ?? "", address: u.address ?? "",
    },
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const userId = await resolveUserId(req, b.token);
  if (!userId) return NextResponse.json({ error: "リンクの有効期限が切れています。ログイン後に再度お試しください" }, { status: 401 });

  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || !u.isActive) return NextResponse.json({ error: "not found" }, { status: 404 });

  let p: Record<string, unknown> = {};
  try { p = JSON.parse(u.profileJson ?? "{}"); } catch { /* ignore */ }
  const basics = b.basics && typeof b.basics === "object" ? b.basics : {};
  await prisma.user.update({
    where: { id: userId },
    data: {
      // 個人情報（電話・住所）はUser本体へ（プランナーの案件画面にも反映）
      ...(typeof basics.phone === "string" ? { phone: basics.phone.trim() || null } : {}),
      ...(typeof basics.address === "string" ? { address: basics.address.trim() || null } : {}),
      profileJson: JSON.stringify({
        ...p,
        // birthDate は登録時の値を保持（アンケートから上書きしない）
        gender: basics.gender ?? p.gender ?? "",
        hasChildren: basics.hasChildren ?? p.hasChildren ?? "",
        furigana: typeof basics.furigana === "string" && basics.furigana.trim() ? basics.furigana.trim() : p.furigana ?? "",
        partnerName: typeof basics.partnerName === "string" && basics.partnerName.trim() ? basics.partnerName.trim() : p.partnerName ?? "",
        survey: b.survey && typeof b.survey === "object" ? b.survey : p.survey ?? {},
      }),
    },
  });
  await audit(userId, "update", "user", userId, { surveyUpdated: true });
  return NextResponse.json({ ok: true });
}
