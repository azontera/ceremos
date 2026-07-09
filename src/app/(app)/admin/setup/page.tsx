import { redirect } from "next/navigation";

// （統合）初期セットアップは「設定」画面に統合されました
export default function SetupPage() {
  redirect("/admin/settings");
}
