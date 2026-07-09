import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { getBranding } from "@/lib/settings";
import { PrintBrand } from "@/components/print-brand";
import { PrintButton } from "../[id]/[doc]/print-button";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "お客様登録用QRポスター" };
}

// お客様アカウント登録用のQRポスター（A4縦・そのまま印刷して店頭・打ち合わせ席へ）
export default async function SignupQrPage() {
  const s = await getSession();
  if (!s || s.role === "couple") redirect("/login");

  const branding = await getBranding();
  const h = headers();
  const base = process.env.APP_URL
    ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const signupUrl = `${base}/login`; // 入口はログイン画面に一本化（メールアドレス＋パスワード）
  // QR画像（外部の無料QR生成API。オフライン環境では qrcode ライブラリへの差し替えを検討）
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=2&data=${encodeURIComponent(signupUrl)}`;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px", background: "#fff", color: "#1c1a18", textAlign: "center" }}>
      <style>{`
        @media print { .no-print { display: none !important } body { background: #fff } }
        @page { size: A4 portrait; margin: 16mm }
      `}</style>

      <div className="no-print" style={{ marginBottom: 20, display: "flex", gap: 8, justifyContent: "center" }}>
        <PrintButton />
        <a href="/admin/settings" style={{ fontSize: 13, alignSelf: "center" }}>← 設定に戻る</a>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <PrintBrand logoUrl={branding.logoUrl} name={branding.name} />
      </div>
      <h1 style={{ fontSize: 26, margin: "18px 0 6px", letterSpacing: ".06em" }}>お客様専用ページのご案内</h1>
      <p style={{ fontSize: 14, lineHeight: 2, color: "#555" }}>
        ご結婚式・ご宴会の準備状況の確認、お打ち合わせ内容の共有、<br />
        プランナーとのチャットにご利用いただけます。
      </p>

      <div style={{ display: "inline-block", border: "3px solid #b06a5e", borderRadius: 18, padding: 24, margin: "22px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt="登録用QRコード" width={300} height={300} style={{ display: "block" }} />
      </div>

      <p style={{ fontSize: 15, fontWeight: 700 }}>スマートフォンのカメラでQRコードを読み取り、<br />ご登録・ログインをお願いいたします</p>
      <p style={{ fontSize: 12, color: "#888", marginTop: 10 }}>
        読み取れない場合はこちらへアクセス：<b>{signupUrl}</b>
      </p>

      <div style={{ borderTop: "1px solid #ddd", marginTop: 26, paddingTop: 14, fontSize: 11.5, color: "#666", textAlign: "left", lineHeight: 2 }}>
        ① QRコードからログイン画面を開き、「新規登録」タブでお名前・メールアドレス・パスワードをご登録ください<br />
        ② ご登録後、当式場のプランナーが確認・承認いたします<br />
        ③ 承認後は、このQRコードから<b>メールアドレスとパスワードだけ</b>でいつでもログインいただけます
      </div>

      <p style={{ marginTop: 26, fontSize: 10.5, color: "#999" }}>
        {branding.name || "CEREMOS"}{branding.info ? `　${branding.info.split("\n").join("　")}` : ""}
      </p>
    </div>
  );
}
