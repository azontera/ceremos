# CEREMOS 開発引き継ぎメモ

結婚式場・宴会場向けERP「CEREMOS」。このファイルには**常時守るルールと構成だけ**を書く。
**セッションの実装履歴 → docs/CHANGELOG.md ／ 未解決・保留 → docs/TODO.md**（このファイルに履歴を書かない・200行以内を維持）。

## プロジェクト概要
- Next.js 14.2 App Router / Prisma 5.22 + SQLite / JWT(jose) / bcryptjs
- 場所: `~/Documents/oldpc/wedding-erp`（**ここが正本**・2026-09-18に旧PCの部分コピーから.git経由で復旧。旧`~/Documents/wedding-erp`・`~/Documents/Codex/wedding-erp`はもう無い前提）
- 実装依頼は都度でOK（溜める必要なし）。Cowork経由の作業では調査・実装をサブエージェントに委譲してトークン節約
- 本番: Sakura VPS `os3-314-46741.vs.sakura.ne.jp`（IP 49.212.230.245・pm2 app名 `wedding-erp`・ポート3200・nginx・同居アプリ: lion-app/stagestock/vehicle-inspection）。公開URL: http://ceremos.grandeclat.jp ※DNS切替待ち（旧IP 133.167.93.62 のまま）・切替後にHTTPS化。旧サーバー os3-376-21308 は廃止
- ユーザー: 寺沢真彦さん（tera@azon.jp）。日本語でやりとり。要望は都度対応
- Git: GitHub `azontera/ceremos`（private・2026-09-18〜）。作業単位でコミットし **コミット後は必ず `git push`**（鍵は `.deploy/github_key`・core.sshCommand設定済み）

## デプロイ（Cowork の device_bash から専用鍵で直接実行可・2026-09-18〜）
詳細手順・前後チェックは `.claude/skills/deploy/SKILL.md`（「デプロイして」で発動）。SSH: `ssh -F .deploy/ssh-config ceremos-prod`（鍵は `.deploy/`・gitignore済み）。以下はMacターミナルから実行する場合の予備コマンド。
```
rsync -av --exclude node_modules --exclude .next --exclude prisma/dev.db --exclude storage --exclude .env --exclude backups ~/Documents/oldpc/wedding-erp/ ubuntu@os3-314-46741.vs.sakura.ne.jp:~/wedding-erp/ && ssh ubuntu@os3-314-46741.vs.sakura.ne.jp "bash ~/wedding-erp/scripts/server-update.sh" 2>&1 | tail -3
```
- server-update.sh が `prisma db push` とビルド・pm2 restart を実行
- **注意: rsyncは削除を同期しない**。ローカルでファイルを削除したデプロイでは、サーバー側でも該当パスを `rm` してからビルド（残骸ビルドエラーの事故歴あり）
- ブラウザ確認は Cmd+Shift+R。タブタイトルに更新(ビルド)日時（NEXT_PUBLIC_BUILD_AT）
- **DEMO_MODEを本番でONにしない**（2026-07-08〜09に残置事故。検証はローカルの .env で行う）

## ローカル検証
- `npx tsc --noEmit` 全通過が下限。**スキーマ変更時は `npx prisma db push && npx prisma generate` をセットで即実行**
- サンドボックス環境でのPrisma生成回避策・詳細は `.claude/skills/verify-local/SKILL.md`（「型チェック」で発動）

## 主要ファイルマップ
- 現行仕様の正本は `docs/仕様_現行.md`（コンセプト・ロール・フロー・タブ構成・見積状態・削除済み機能）
- `src/app/(app)/cases/[id]/page.tsx` … 案件詳細。**案件画面のタブ構成は固定。変更する場合はユーザーの明示承認が必要**
  - スタッフ5タブ: 📌案件(info) ／ 💰お金(money) ／ 🪑席次(seating) ／ 📋進行(rundown) ／ 💬連絡(chat)
  - お客様4タブ: 💰お見積り(money) ／ 🪑席次 ／ 📋当日の流れ(rundown) ／ 💬連絡
  - タブ内はセクション（`.section-h` + id）。旧タブ名は `TAB_ALIAS` で新タブ＋アンカー（`?tab=money#billing` 等）へリダイレクト。新しいリンクは必ず新タブ名で書く
- `src/app/(app)/layout.tsx`（サイドバー）／ `src/components/mobile-nav.tsx`（スマホ下部ナビ）… ナビは仕様_現行.md 4章の並びに固定
- `src/app/(app)/dashboard/page.tsx` + `getDashboard`（`src/lib/queries.ts`）… スタッフ: 今日・今週／タスク／見積下書き・未入金／未対応クレーム。お客様: 「今やること」
- `src/lib/quote-status.ts` … 見積ステータス draft / confirmed / archived（旧 approved 等は確定として読む）
- `src/components/quotes-panel.tsx` … 見積UI（新規=ウィザード、確定済は「新Ver作成」）。保存時に `packId`／`templateName` を渡すと自動セットアップ
- `src/app/api/v1/cases/[id]/quotes/route.ts` … 見積保存時の自動セットアップ（料理／席次／リソース／進行表／発注）。`apply-pack/route.ts` は新規案件作成直後のテンプレ一式適用
- `src/app/api/v1/cases/[id]/customers/route.ts` … お客様アカウント発行（同メールが既存なら紐付けのみ）。UI=`customer-account-panel.tsx`
- テンプレは**テンプレ一式（type="pack"）JSON方式**: `src/lib/template-pack.ts`（parsePack/scorePack/applyPackToCase/loadPacks）＋`pack-scaling.ts`（人数スケーリング）＋`catalog-import.ts`。管理画面からJSONを読み込み。JSON要件=`docs/template-pack-spec.md`
- `src/lib/terms.ts` … 婚礼／宴会の用語辞書 `t()`・`isBridal()`。画面文言は原則これを通す
- `src/lib/survey.ts` + `src/app/survey/page.tsx` … お客様ヒヤリング（婚礼10問／宴会10問・User.profileJson.survey）
- `src/lib/rundown.ts` … recalcRundownTimes / fillNameTokens / applyRundownTemplateToCase / sceneForTitle
- `src/lib/cue-timings.ts` `src/lib/menu-presets.ts` `src/lib/song-db.ts`（好みアーティスト+30ブースト）`src/lib/mc-templates.ts`（婚礼／宴会の司会コメントバンク）
- `src/components/songs-panel.tsx` … 選曲（📋進行タブ内 `#songs`）。🎲全曲おまかせ／♪全シーンに曲枠作成／⏱cueTiming
- `src/components/audio-console.tsx` … 再生プレイヤー（Space/Esc・波形シーク・F.I/F.O・投影モニター・暗転・待機画像）
- `src/app/live/[id]/…` … 当日運営（page=進行ボード・audio=プレイヤー・screen=映像ウィンドウ）。BroadcastChannel名 `ceremos-live-${caseId}`
- `src/components/seating-panel.tsx` … 席次表エディタ（ズーム・編集モード・実寸m・アレルギー⚠）。案件画面はプレビュー、編集は `/cases/[id]/seating`
- `src/components/day-venue-chart.tsx` + `assignments-panel.tsx` … 控室・厨房・スタッフ割当（📋進行タブ内 `#resources`。カレンダー日別でも使用）
- `src/components/new-case-form.tsx` … 新規案件（テンプレ一式を選ぶと作成時に一括セットアップ。未選択なら見積作成時に選べる）
- `src/components/settings-admin.tsx` … 会場・設備マスタ（実寸m）／ロゴ／待機画像。`/admin/catalog`=カタログ管理（`vendor-catalog.tsx`）
- `src/app/login/page.tsx` … ログインのみ（ID+PW・全ロール共通）。DEMO_MODE時は検証用ワンクリックログイン
- `src/lib/db-backup.ts` … 破壊的一括処理前の自動バックアップ（VACUUM INTO・backups/40世代）。復元=`node scripts/restore-db.cjs`

## 設計上の約束事
- **案件画面は5タブ／お客様4タブで固定**。新機能は既存タブ内のセクションとして追加し、タブは増やさない（変更はユーザー承認必須）
- 新しい画面内リンクは `?tab=<新タブ名>#<anchor>` 形式。旧タブ名を新規コードで使わない
- 見積ステータスは draft / confirmed / archived の3つだけ（判定は quote-status.ts の関数経由）。確定済みは直接編集せず「新Ver作成」
- 価格・権限・検証はサーバーで強制（例: カタログ→見積反映はサーバーが定価を強制）
- 進行表の時刻は「先頭時刻＋durationMinの積み上げ」で自動再計算（編集APIは必ずrecalc）
- テンプレ台本の {新郎}{新婦}{新郎姓}{新婦姓} は適用時に実名置換
- 見積テンプレ名のキーワードが自動セットアップに連動（ガーデン→②、和婚→⑦、宴会/式典/パーティ/ディナーショー→⑪ など）
- 進行表の楽曲は「（曲未定）」行=枠として全シーンON。選曲は選曲セクションのみ（進行表から曲編集しない）
- 音量初期70／F.O初期2秒／cueTimingはシーン別プリセット
- 新規案件作成では進行表を作らない（テンプレ一式の適用時または見積テンプレ保存時に自動作成）
- 婚礼用語（新郎/新婦/両家）を画面に直書きしない。`t()`か `isBridal()` 分岐を通す（MC台本バンク・印刷帳票は除く）
- 削除済み機能（営業OS・AI生成・公開カタログ・業者ログイン・セルフ登録・承認）は復活させない。一覧は `docs/仕様_現行.md` 7章

## 運用ルール
- 実装履歴は docs/CHANGELOG.md の先頭に追記（日付・何を・なぜ・検証結果）
- 未解決・保留は docs/TODO.md で管理
- 働き方・品質基準・禁止事項の全体ルールは `~/.claude/CLAUDE.md` と execution-pack スキルに従う
- 一括削除系スクリプト（wipe-all-cases / clear-templates / restore-db）は実行前にユーザー承認必須
