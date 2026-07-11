import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/rbac";
import { sendMail } from "@/lib/mail";
import { emailVerificationEnabled } from "@/lib/settings";
import { validatePassword } from "@/lib/password";
import { createUserToken, verifyUserToken } from "@/lib/auth";

// POST: 顧客セルフ登録（新郎新婦・宴会顧客共通 role=couple）
// 通常登録：メール認証（設定でON/OFF）のみ。管理者承認は不要で即ログイン可
//   → プランナーが新規案件画面でこのお客様を選んで案件に紐づけることで実業務が始まる
// クイック登録（quickトークン付き・24時間有効）：名前＋メール＋パスワードだけで即ログイン可
//   → 承認不要・仮の案件を自動作成。本人確認（メール認証）や詳細情報はログイン後に追記
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const { name, furigana, partnerName, partnerFurigana, birthDate, partnerBirthDate, email, password, address, phone, eventType } = b ?? {};

  // ===== クイック登録（店頭QR・24時間） =====
  if (b?.quick) {
    const staffId = await verifyUserToken(String(b.quick), "quick-signup");
    if (!staffId) return NextResponse.json({ error: "QRコードの有効期限が切れています。スタッフに新しいQRの表示をお願いしてください" }, { status: 400 });
    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "お名前・メールアドレス・パスワードを入力してください" }, { status: 400 });
    }
    const policyErr2 = validatePassword(String(password));
    if (policyErr2) return NextResponse.json({ error: policyErr2 }, { status: 400 });
    const normEmail2 = String(email).trim().toLowerCase();
    const dup2 = await prisma.user.findUnique({ where: { email: normEmail2 } });
    if (dup2) return NextResponse.json({ error: "このメールアドレスは既に登録されています" }, { status: 409 });

    const verifyToken2 = randomBytes(24).toString("hex");
    // 案件はここでは作らない：プランナーが新規案件画面でこのお客様を選んで作成・紐付けする
    const u = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normEmail2,
        passwordHash: await bcrypt.hash(String(password), 10),
        role: "couple",
        phone: phone?.trim() || null,
        profileJson: JSON.stringify({
          quickSignup: true,
          partnerName: partnerName?.trim() || "",
          eventType: eventType === "party" ? "party" : "wedding",
          profileComplete: false, survey: {},
        }),
        approved: true,        // クイック登録は承認不要（QR自体がスタッフ発行のため）
        emailVerified: false,  // 本人確認はログイン後のクエストで（メール認証）
        verifyToken: verifyToken2,
      },
    });
    await audit(u.id, "signup_quick", "user", u.id, { byStaffQr: staffId });
    // 本人確認メール（届かなくてもログインは可能。クエストで再送できる）
    const base = process.env.APP_URL ?? req.nextUrl.origin;
    await sendMail(
      normEmail2,
      "【CEREMOS】メールアドレスの確認",
      `${u.name} 様\n\nご登録ありがとうございます。\n以下のURLをクリックしてメールアドレスの確認（本人確認）を完了してください。\n\n${base}/api/v1/auth/verify?token=${verifyToken2}\n`,
    );
    return NextResponse.json({ ok: true, quick: true }, { status: 201 });
  }
  // ===== 業者（お取引先）のセルフ登録 =====
  // 店舗名・カテゴリ・担当者名・メール・パスワードで登録 → 承認前でも10時間は仮利用可
  // 10時間経過後は承認まで利用停止（データは残る）。否認＝削除で消える
  if (b?.accountType === "vendor") {
    const vendorName = String(b.vendorName ?? "").trim();
    const category = String(b.category ?? "").trim();
    const VENDOR_ROLE: Record<string, string> = {
      dress: "dress", florist: "florist", catering: "chef", audio: "audio", mc: "mc",
      photo: "photo", video: "photo", gift: "gift", print: "print", beauty: "dress",
    };
    if (!vendorName || !VENDOR_ROLE[category]) {
      return NextResponse.json({ error: "店舗名とカテゴリを入力してください" }, { status: 400 });
    }
    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "担当者名・メールアドレス・パスワードを入力してください" }, { status: 400 });
    }
    const policyErrV = validatePassword(String(password));
    if (policyErrV) return NextResponse.json({ error: policyErrV }, { status: 400 });
    const normEmailV = String(email).trim().toLowerCase();
    const dupV = await prisma.user.findUnique({ where: { email: normEmailV } });
    if (dupV) return NextResponse.json({ error: "このメールアドレスは既に登録されています" }, { status: 409 });

    // 既存の同名業者に相乗り／なければ新規作成
    const vendor =
      (await prisma.vendor.findFirst({ where: { name: vendorName, category } })) ??
      (await prisma.vendor.create({ data: { name: vendorName, category } }));
    const uv = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normEmailV,
        passwordHash: await bcrypt.hash(String(password), 10),
        role: VENDOR_ROLE[category],
        vendorId: vendor.id,
        phone: phone?.trim() || null,
        profileJson: JSON.stringify({ accountType: "vendor", vendorName, category }),
        approved: false,      // プランナー確認待ち（10時間は仮利用可）
        emailVerified: true,
      },
    });
    await audit(uv.id, "signup_vendor", "user", uv.id, { vendorId: vendor.id, category });
    return NextResponse.json({ ok: true, vendor: true, vendorId: vendor.id }, { status: 201 });
  }

  // ===== 通常のセルフ登録：お名前・メールアドレス・パスワードだけ =====
  // （ふりがな・生年月日・ご住所などの詳細は、承認後のプロフィール・アンケートで追記）
  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "お名前・メールアドレス・パスワードを入力してください" }, { status: 400 });
  }
  const type = ["wedding", "party", "other"].includes(eventType) ? eventType : "wedding";
  const policyErr = validatePassword(String(password));
  if (policyErr) return NextResponse.json({ error: policyErr }, { status: 400 });
  const normEmail = String(email).trim().toLowerCase();
  const dup = await prisma.user.findUnique({ where: { email: normEmail } });
  if (dup) return NextResponse.json({ error: "このメールアドレスは既に登録されています" }, { status: 409 });

  const needVerify = await emailVerificationEnabled();
  const verifyToken = needVerify ? randomBytes(24).toString("hex") : null;

  const u = await prisma.user.create({
    data: {
      name: String(name).trim(),
      email: normEmail,
      passwordHash: await bcrypt.hash(String(password), 10),
      role: "couple",
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      // プロフィール（承認画面・案件作成の参考情報）。詳細は登録後のクエスト・アンケートで追記
      profileJson: JSON.stringify({
        furigana: furigana?.trim() || "",
        birthDate: birthDate || "",
        partnerName: partnerName?.trim() || "",
        partnerFurigana: partnerFurigana?.trim() || "",
        partnerBirthDate: partnerBirthDate || "",
        eventType: type,
        profileComplete: false,
        survey: {},
      }),
      approved: true,        // お客様は承認不要で即ログイン可（プランナーが案件に紐づけて実業務が始まる）
      emailVerified: !needVerify,
      verifyToken,
    },
  });
  // 登録直後にアンケート（任意）へ進める30日トークン
  const surveyToken = await createUserToken(u.id, "survey", "30d");
  await audit(u.id, "signup", "user", u.id);

  // 登録と同時に仮の案件カードを自動作成して紐づける（開催日未定＝半年後の仮日程・仮予約扱い）
  // プランナーへの紐付け作業は不要：案件一覧に「仮予約」で並ぶので、担当プランナーが詳細を詰める
  const provisionalDate = new Date();
  provisionalDate.setDate(provisionalDate.getDate() + 180);
  provisionalDate.setHours(type === "party" ? 18 : 11, type === "party" ? 0 : 30, 0, 0);
  const provisionalEnd = new Date(provisionalDate);
  provisionalEnd.setHours(type === "party" ? 21 : 15, 30, 0, 0);
  const autoCase = await prisma.case.create({
    data: {
      groomName: String(name).trim(),
      brideName: type === "wedding" ? (partnerName?.trim() || "（お相手 未定）") : "―",
      weddingDate: provisionalDate,
      endTime: provisionalEnd,
      caseType: type,
      status: "tentative",
      email: normEmail,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      members: { create: { userId: u.id, roleInCase: "couple" } },
    },
  });
  await audit(u.id, "create", "case", autoCase.id, { auto: "signup" });

  if (needVerify) {
    const base = process.env.APP_URL ?? req.nextUrl.origin;
    const url = `${base}/api/v1/auth/verify?token=${verifyToken}`;
    const r = await sendMail(
      normEmail,
      "【CEREMOS】メールアドレスの確認",
      `${u.name} 様\n\nCEREMOSへのご登録ありがとうございます。\n以下のURLをクリックしてメールアドレスの確認を完了してください。\n\n${url}\n\n確認が完了しましたら、そのままログインしてご利用いただけます。\n※ 心当たりのない場合はこのメールを破棄してください。`,
    );
    return NextResponse.json({
      ok: true,
      needVerify: true,
      mailStub: r.stub, // 未契約時：ログにURLを出力（開発用）
      surveyToken,
    }, { status: 201 });
  }
  return NextResponse.json({ ok: true, needVerify: false, surveyToken }, { status: 201 });
}
