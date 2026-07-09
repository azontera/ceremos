---
name: deploy
description: CEREMOS（wedding-erp）の本番デプロイ手順。「デプロイして」「本番に反映」で発動。rsync除外リスト厳守・削除非同期の罠・デプロイ後確認まで含む。
---

# CEREMOS デプロイ手順

## 前提チェック（デプロイ前）
1. `npx tsc --noEmit` 全通過（エラー1つでサーバービルドが失敗する）
2. スキーマ変更がある場合: ローカルで `npx prisma db push && npx prisma generate` 済みか（サーバーは server-update.sh の db push で反映される）
3. **ローカルでファイルを削除したか？** → rsyncは削除を同期しない。先にサーバー側で同じパスを `rm` する手順を用意（残骸がビルドエラーになった事故あり）

## デプロイコマンド（必ずMacの apple@ プロンプトから。サーバー内で実行しない）
```
rsync -av --exclude node_modules --exclude .next --exclude prisma/dev.db --exclude storage --exclude .env --exclude backups ~/Documents/wedding-erp/ ubuntu@os3-314-46741.vs.sakura.ne.jp:~/wedding-erp/ && ssh ubuntu@os3-314-46741.vs.sakura.ne.jp "bash ~/wedding-erp/scripts/server-update.sh" 2>&1 | tail -3
```
- **除外リストを絶対に崩さない**（--delete は使用禁止。DB消失事故の教訓）
- server-update.sh が `prisma db push`・ビルド・pm2 restart を実行する

## デプロイ後確認（quality_checklist.md「デプロイ後」と同じ）
1. `pm2 logs wedding-erp --err --lines 20` に新規エラーがないか
2. ブラウザ Cmd+Shift+R → タブタイトルのビルド日時（NEXT_PUBLIC_BUILD_AT）が更新されたか
3. 主要動線1本（ログイン→対象機能）
4. **一時フラグ確認: DEMO_MODEを本番でONにしない**（2026-07-08〜09残置事故あり。検証は必ずローカルの .env で）

## 本番サーバー情報
- Sakura VPS: `ubuntu@os3-314-46741.vs.sakura.ne.jp`（pm2 app名 `wedding-erp`・ポート3200・nginx経由。同居アプリ: lion-app/stagestock/vehicle-inspection）
- 本番への書き込みコマンドは実行前にユーザーへ提示して承認を得る
