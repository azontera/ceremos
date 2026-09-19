# CEREMOS 未解決・保留（TODO）

旧CLAUDE.mdから2026-07-09に移設。解決したら理由と日付を添えて取り消し線 or 削除。

0. **YouTubeタイトル表示は仕様として容認**（2026-07-06、ユーザー判断で見送り）… showinfoパラメータ廃止によりURL指定では消せない。黒カバー/クロップ/自前ホスティングいずれも今回は採用しない。再燃したら上記3案から選定
1. **控室・スタッフ割当（旧リソースタブ）の Application error (Digest:1220081727)** … ガード（エラーカード化）はデプロイ済みのはず。2026-09-19 から📋進行タブ内 `#resources` セクションに移動。再発したら `pm2 logs wedding-erp --err --lines 200 | grep -A5 'DayVenueChart failed'` の出力をもらう
2. sudoパスワード不明（サーバー）… 必要時はGRUB recovery手順
3. **フェーズ2（2026-09-19）の実機確認が未実施** … サンドボックスで tsc のみ。本番反映後に (a) 案件画面5タブ／お客様4タブと `?tab=旧名` のリダイレクト＋アンカースクロール、(b) スマホ幅でお客様下部ナビ6項目が1行に収まるか、(c) ダッシュボードの見積下書き・未入金リンク、を確認する

## 本番反映時の注意（2026-09-19 フェーズ1・2の削除分）
**rsync は削除を同期しない**ので、サーバー側で以下のパスを `rm -rf` してから `scripts/server-update.sh` を実行する（残骸が残るとビルドエラー）。
```
cd ~/wedding-erp && rm -rf \
  "docs/AIデータ生成プロンプト.md" "docs/リニューアル仕様書_v1.md" \
  "src/app/(app)/approvals" "src/app/(app)/cases/[id]/hearing" "src/app/(app)/vendors" \
  src/app/api/v1/auth/complete-profile src/app/api/v1/auth/signup src/app/api/v1/auth/verify \
  "src/app/api/v1/cases/[id]/hearing" "src/app/api/v1/cases/[id]/quote-recommendation" "src/app/api/v1/cases/[id]/save-as-template" \
  src/app/api/v1/catalog/public src/app/api/v1/customers src/app/api/v1/quote-items src/app/api/v1/signup \
  src/app/catalog src/app/print/signup-qr src/app/signup \
  src/components/ai-plan-import.tsx src/components/catalog-showcase.tsx src/components/customer-wizard.tsx \
  src/components/hearing-wizard.tsx src/components/pending-approvals.tsx src/components/section-modal.tsx \
  src/components/strategy-panel.tsx src/components/tab-advice.tsx src/components/vendor-panels.tsx \
  src/lib/fortune-print.ts src/lib/hearing.ts src/lib/mail.ts src/lib/meal-templates.ts src/lib/notify.ts \
  src/lib/quote-recommend.ts src/lib/sales-steps.ts src/lib/template-pack-prompt.ts src/lib/template-pack-spec.ts
```
（`git diff --name-status 59a01e3 HEAD | grep '^D'` から算出。ディレクトリ丸ごと消えたものはディレクトリで記載）

**DBカラムは意図して残置**（データ保全・`prisma db push` で消さない）: `Case.hearingJson` / `Case.lostStep` / `Case.slot` / `User.approved` / `User.emailVerified` / `User.vendorId`。コードからは参照しない。

## 解決済み
- ~~メール不達~~ … 2026-09-19 メール送信機能（セルフ登録のメール認証）ごと廃止。src/lib/mail.ts 削除
- ~~🎲全曲おまかせの全入れ替えモード~~ … 2026-07-06実装済み
- ~~Google認証~~ … 2026-09-19 廃止（ログインはID/PWのみ）
