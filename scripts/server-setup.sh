#!/usr/bin/env bash
# Wedding ERP VPS自動セットアップ（Ubuntu 24.04）
# 使い方: ~/wedding-erp に配置した状態で
#   bash scripts/server-setup.sh "管理者名" admin@example.jp "管理者パスワード12文字以上"
set -e

NAME="${1:-式場 管理者}"
EMAIL="${2:-}"
PASS="${3:-}"

if [ -z "$EMAIL" ] || [ -z "$PASS" ]; then
  echo '使い方: bash scripts/server-setup.sh "管理者名" メールアドレス "パスワード(12文字以上)"'
  exit 1
fi

cd "$(dirname "$0")/.."
echo "==> 1/6 Node.js 22 をインストール"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt -y install nodejs
fi
node -v

echo "==> 2/6 pm2 をインストール"
sudo npm install -g pm2 >/dev/null

echo "==> 3/6 依存パッケージをインストール"
npm install

echo "==> 4/6 環境設定（.env）"
if [ ! -f .env ] || grep -q "change-me" .env; then
  SECRET=$(openssl rand -base64 32)
  cat > .env <<EOF
DATABASE_URL="file:./dev.db"
SESSION_SECRET="$SECRET"
EOF
  echo "  SESSION_SECRET を自動生成しました"
fi

echo "==> 5/6 データベース初期化・管理者作成・ビルド"
npx prisma db push
node scripts/create-admin.cjs "$NAME" "$EMAIL" "$PASS"
npm run build

echo "==> 6/6 常駐化（pm2）"
pm2 delete wedding-erp 2>/dev/null || true
pm2 start npm --name wedding-erp -- run start
pm2 save
sudo env PATH=$PATH pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null || true

IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')
echo ""
echo "======================================"
echo " セットアップ完了 🎉"
echo " ブラウザで http://${IP}:3000 を開き、"
echo " ${EMAIL} でログインしてください。"
echo " （パケットフィルターで TCP 3000 の許可が必要）"
echo "======================================"
