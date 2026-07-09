import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_VERSION, BUILD_AT } from "@/lib/version";

// ブラウザタブには更新（ビルド）日時だけを表示（デプロイ反映の確認用）
export const metadata: Metadata = {
  title: `CEREMOS｜更新 ${BUILD_AT}`,
  description: "Ceremony & Event Platform — セレモニー・式典・イベント・ブライダルの運営基盤",
  // PWA：お客様が「ホーム画面に追加」するとアプリとして起動する（アドレスバー無しのスタンドアロン表示）
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/app-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CEREMOS",
  },
};

// スマホでの表示品質：デバイス幅に固定し、ノッチ（セーフエリア）まで背景を届かせる
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#141312" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
