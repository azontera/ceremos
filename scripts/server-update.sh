#!/usr/bin/env bash
# 本番サーバーの更新（コード反映後に実行）
# 使い方: Macから rsync で転送 → サーバーで bash ~/wedding-erp/scripts/server-update.sh
set -e
cd "$(dirname "$0")/.."

echo "==> 依存パッケージ更新"
npm install

echo "==> データベーススキーマ反映（データは保持されます）"
npx prisma db push

echo "==> ビルド"
npm run build

echo "==> 再起動"
pm2 restart wedding-erp
pm2 save

echo ""
echo "更新完了 🎉  ブラウザをリロードしてください。"
