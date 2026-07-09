/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // ビルド時刻（ブラウザタブに表示 → デプロイが反映されたか一目で分かる）
    NEXT_PUBLIC_BUILD_AT: new Date().toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    }),
  },
};
export default nextConfig;
