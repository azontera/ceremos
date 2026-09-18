---
name: deploy
description: CEREMOS（wedding-erp）の本番デプロイ手順。「デプロイして」「本番に反映」で発動。rsync除外リスト厳守・削除非同期の罠・デプロイ後確認まで含む。
---

# CEREMOS デプロイ手順

## 前提チェック（デプロイ前）
1. `npx tsc --noEmit` 全通過（エラー1つでサーバービルドが失敗する）
2. スキーマ変更がある場合: ローカルで `npx prisma db push && npx prisma generate` 済みか（サーバーは server-update.sh の db push で反映される）
3. **ローカルでファイルを削除したか？** → rsyncは削除を同期しない。先にサーバー側で同じパスを `rm` する手順を用意（残骸がビルドエラーになった事故あり）

## デプロイコマンド（Cowork/device_bash から実行。2026-09-18〜）
専用鍵 `.deploy/ceremos_deploy`（gitignore済み・サーバーのauthorized_keysに登録済み）と `.deploy/ssh-config`（Host `ceremos-prod`）を使う。
ネットワーク設定が「すべてのドメインを許可」になっていることが前提（許可リスト方式だとポート22がForbidden）。
```
cd $HOME/mnt/wedding-erp && rsync -av --exclude node_modules --exclude .next --exclude prisma/dev.db --exclude storage --exclude .env --exclude backups --exclude .deploy --exclude .git --exclude .claude --exclude .DS_Store --exclude 'catalog-*' --exclude '*.tsbuildinfo' -e "ssh -F .deploy/ssh-config -o BatchMode=yes" ./ ceremos-prod:~/wedding-erp/ | tail -3
ssh -F .deploy/ssh-config -o BatchMode=yes ceremos-prod "nohup bash ~/wedding-erp/scripts/server-update.sh > ~/wedding-erp/update.log 2>&1 &"
```
- server-update.sh（npm install→prisma db push→build→pm2 restart）は2〜3分かかり device_bash の180秒上限を超えるため **nohupでバックグラウンド起動→ `ssh ... 'tail -5 ~/wedding-erp/update.log'` で完了（「更新完了 🎉」）を確認**
- 事前に `rsync -n --itemize-changes --checksum ...` で転送内容を確認してから本送信する

## 旧: Macのターミナルから実行する場合（Cowork経由が使えない時の予備）
```
rsync -av --exclude node_modules --exclude .next --exclude prisma/dev.db --exclude storage --exclude .env --exclude backups ~/Documents/oldpc/wedding-erp/ ubuntu@os3-314-46741.vs.sakura.ne.jp:~/wedding-erp/ && ssh ubuntu@os3-314-46741.vs.sakura.ne.jp "bash ~/wedding-erp/scripts/server-update.sh" 2>&1 | tail -3
```
- **除外リストを絶対に崩さない**（--delete は使用禁止。DB消失事故の教訓）
- server-update.sh が `prisma db push`・ビルド・pm2 restart を実行する

## デプロイ後確認（quality_checklist.md「デプロイ後」と同じ）
1. `pm2 logs wedding-erp --err --lines 20` に新規エラーがないか
2. `ssh -F .deploy/ssh-config ceremos-prod 'pm2 logs wedding-erp --err --lines 20 --nostream'` に新規エラーがないか（1と同じ）
2'. ブラウザ Cmd+Shift+R → タブタイトルのビルド日時（NEXT_PUBLIC_BUILD_AT）が更新されたか
3. 主要動線1本（ログイン→対象機能）
4. **一時フラグ確認: DEMO_MODEを本番でONにしない**（2026-07-08〜09残置事故あり。検証は必ずローカルの .env で）

## 本番サーバー情報
- Sakura VPS: `ubuntu@os3-314-46741.vs.sakura.ne.jp`（pm2 app名 `wedding-erp`・ポート3200・nginx経由。同居アプリ: lion-app/stagestock/vehicle-inspection）
- 本番への書き込みコマンドは実行前にユーザーへ提示して承認を得る
