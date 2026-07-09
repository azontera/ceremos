import { redirect } from "next/navigation";

// （統合）お客様の入口はログイン画面に一本化されました（Google／メールの2ボタン）
// 旧QR（/signup?quick=…）で読み取った場合も quick を引き継いでリダイレクト
export default function SignupPage({ searchParams }: { searchParams: { quick?: string } }) {
  redirect(searchParams.quick ? `/login?quick=${encodeURIComponent(searchParams.quick)}` : "/login");
}
