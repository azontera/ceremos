# CEREMOS 未解決・保留（TODO）

旧CLAUDE.mdから2026-07-09に移設。解決したら理由と日付を添えて取り消し線 or 削除。

0. **YouTubeタイトル表示は仕様として容認**（2026-07-06、ユーザー判断で見送り）… showinfoパラメータ廃止によりURL指定では消せない。黒カバー/クロップ/自前ホスティングいずれも今回は採用しない。再燃したら上記3案から選定
1. **リソースタブ Application error (Digest:1220081727)** … ガード（エラーカード化）はデプロイ済みのはず。再発したら `pm2 logs wedding-erp --err --lines 200 | grep -A5 'DayVenueChart failed'` の出力をもらう
2. **メール不達** … Resend APIキー設定済み（re_GtwdKS…）。お試しモードは登録本人(tera@azon.jp)宛のみ。独自ドメインをResendでDNS認証→ .env の MAIL_FROM 設定で解禁
3. ~~🎲全曲おまかせの全入れ替えモード~~ … 2026-07-06実装済み（全曲設定済みなら確認→全入替）
4. Google認証 … 顧客ログインはID/PWに一本化したため優先度低（API・envは残っている）
5. sudoパスワード不明（サーバー）… 必要時はGRUB recovery手順

