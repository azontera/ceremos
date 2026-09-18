---
name: verify-local
description: CEREMOS（wedding-erp）のローカル検証手順（型チェック・Prisma生成・サンドボックス環境での回避策）。「型チェック」「検証して」「tsc通して」で発動。
---

# ローカル検証手順

## 通常環境（Mac直）
- 型チェック: `npx tsc --noEmit`
- スキーマ変更後: `npx prisma db push && npx prisma generate` を先に実行（生成済みクライアントが古いとtscが通らない）

## Cowork（device_bash・Linux VM）での回避策 ※2026-09-18確認済み・最短
- binaries.prisma.sh が403で落ちるため、ダミーのエンジンパスを指定してダウンロードをスキップ:
  `touch $HOME/dummy.so.node && PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 PRISMA_QUERY_ENGINE_LIBRARY=$HOME/dummy.so.node npx prisma generate`
- これで node_modules/.prisma/client/index.d.ts（型）だけ生成され `npx tsc --noEmit` が通る（実行時エンジンは無いので dev サーバーは不可＝型検証専用）
- 削除系操作は device_request_delete_permission 承認後に rm 可

## サンドボックス環境での回避策（Claude Code実行時にnpx prismaが失敗する場合）
- `/tmp/werp/`（他ユーザー所有の場合は `$HOME/werp`）に package.json `{"name":"werp-check","private":true}` を作成
- node_modules を repo に symlink、schema を sed で `output = "/tmp/werp/client"` 追記して:
  `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 PRISMA_QUERY_ENGINE_LIBRARY=$PWD/node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node npx prisma generate --schema /tmp/werp/schema.prisma`
- 型チェック: `npx tsc -p /tmp/werp/tsconfig.check.json`（/tmpが消えていたら再構築）
- マウント先で rm/unlink 不可の場合 → 廃止ファイルは Write で `export {};` スタブ化 or redirectページ化
- シェルは毎回独立・cwd引き継ぎなし → 絶対パスで実行

## 実挙動確認
- 開発サーバー: preview_start（.claude/launch.json の `wedding-erp-dev`・port 3000）
- 権限別確認: お客様(couple)/プランナー/業者/管理者で見え方が変わる機能は各役割でチェック
