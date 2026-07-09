import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createUserToken, verifyUserToken } from "@/lib/auth";
import { audit } from "@/lib/rbac";

// POST: QR登録後の必須プロフィール入力（トークン認証・承認前でも実行可）
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const { token, name, furigana, partnerName, partnerFurigana, birthDate, partnerBirthDate, phone, address, eventType } = b ?? {};

  const userId = token ? await verifyUserToken(String(token), "profile") : null;
  if (!userId) return NextResponse.json({ error: "リンクの有効期限が切れています。もう一度QRコードからやり直してください" }, { status: 403 });

  if (!name?.trim() || !furigana?.trim() || !birthDate || !phone?.trim() || !address?.trim()) {
    return NextResponse.json({ error: "お名前・ふりがな・生年月日・連絡先・ご住所は必須です" }, { status: 400 });
  }
  const type = ["wedding", "party", "other"].includes(eventType) ? eventType : "wedding";
  if (type === "wedding" && (!partnerName?.trim() || !partnerFurigana?.trim() || !partnerBirthDate)) {
    return NextResponse.json({ error: "ブライダルの場合はお相手のお名前・ふりがな・生年月日も必須です" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 404 });

  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(user.profileJson ?? "{}"); } catch { /* ignore */ }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      profileJson: JSON.stringify({
        ...existing,
        furigana: furigana.trim(),
        birthDate,
        partnerName: partnerName?.trim() || "",
        partnerFurigana: partnerFurigana?.trim() || "",
        partnerBirthDate: partnerBirthDate || "",
        eventType: type,
        profileComplete: true,
      }),
    },
  });
  await audit(user.id, "update", "user", user.id, { profileCompleted: true });
  const surveyToken = await createUserToken(user.id, "survey", "30d");
  return NextResponse.json({ ok: true, surveyToken });
}
