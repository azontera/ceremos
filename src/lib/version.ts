// アプリのバージョン表記（サイドバー下部・ログイン画面に小さく表示）
// リリース時はここを更新する
export const APP_VERSION = "評価版 v0.10.0";
export const APP_VERSION_DATE = "2026.07.08";
// ビルド時刻（next.config.mjs で自動設定。デプロイのたびに更新される）
export const BUILD_AT = process.env.NEXT_PUBLIC_BUILD_AT ?? "dev";
