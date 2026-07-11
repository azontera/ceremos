# CEREMOS 実装履歴（CHANGELOG）

旧CLAUDE.mdから2026-07-09に移設（原文のまま・掲載順は概ね新しい順だが一部前後あり）。
**以後のセッションの実装記録は、このファイルの先頭（この行の下）に追記する。CLAUDE.mdには書かない。**

## 2026-07-11（宴会モードの機能ギャップを一括修正：カタログ・帳票・タイトル・ウィザード）
調査エージェントによる監査結果をもとに、婚礼用語ハードコード・データ不足を修正。
- `src/lib/mc-templates.ts`: 宴会・式典・イベント案件用の司会コメントバンク`BANQUET_BANK`を新設（新婦・両家などの婚礼用語ゼロ、{新郎}は代表者名として使用）。`mcTemplates()`に`bridal`引数を追加し、呼び出し元`rundown-editor.tsx`から渡すように
- `src/app/print/[id]/[doc]/page.tsx`: 席次表・出席リスト帳票の「新郎側/新婦側」ハードコードをterms.tsの`t("groomSide"/"brideSide", caseType)`に置換
- `scripts/seed-banquet-catalog.cjs`（新規）: カタログのmc/audio/video/beauty/serviceカテゴリが0件だった問題を解消。司会進行・音響/マイク手配・エンドロール映像・ヘアメイク・受付/サービススタッフ手配・宴会場利用料（汎用）など11品目を追加投入
- `src/app/live/[id]/audio/page.tsx`: 再生プレイヤーのタイトルが宴会案件で「―家」等に壊れる問題を修正（brideName==="―"ならgroomNameのみ表示）
- `src/components/customer-wizard.tsx` + `dashboard/page.tsx`: お客様向け「プランづくりウィザード」のスタイル選択肢が常にブライダル固定だった問題を修正。`caseType`propを追加し、宴会案件では式典/フォーマル/カジュアル/パーティ/ディナーショー/ナイトの選択肢に切替、取得したプランもcategory（bridal/banquet/other）で絞り込み。文言も「おふたりの」→「会の」に出し分け
- `src/app/api/v1/cases/[id]/quotes/route.ts`: 旧テンプレ名連動パス（type="quote"の残存テンプレ使用時のみ到達する経路）のリソース自動登録で「新郎新婦 控室」「親族控室」が宴会案件でも固定表示だった箇所をcaseType分岐（主催者 控室／スタッフ控室）
- 検証: `npx tsc --noEmit`・`npm run build`通過。ローカルDEMO_MODEで宴会案件（株式会社アゾン 50周年）のカタログタブに新カテゴリ（司会・音響・映像・美容・サービス）の品目が表示されること、会場カテゴリに汎用「宴会場利用料」が追加されたことをブラウザで確認

## 2026-07-11（お客様サインアップの承認待ち廃止・サイドバー自動縮小・案件詳細タブの再編）
- お客様の通常セルフ登録を`approved: true`に変更し、承認待ち10時間の仮利用期間を廃止（登録後すぐにログイン可）。プランナーが新規案件画面で直近72時間以内・案件未紐付けの顧客を選ぶ既存の仕組み（`/api/v1/customers/recent-quick`）で案件に紐づけると実業務が始まる。業者のセルフ登録は従来通り10時間の承認猶予付きで維持（正当性の確認が必要なため）。login/route.ts・(app)/layout.tsx・clock.ts・approvals/page.tsxのコメント/文言も整合させ、login/page.tsxの登録後案内文は宴会/ブライダルと業者で出し分け
- サイドバー（sidebar-shell.tsx）のデフォルト状態を「自動で縮小（アイコンのみ）」に変更。ユーザーが手動で広げた場合はその選択をlocalStorageで記憶
- 案件詳細ページ（cases/[id]/page.tsx）: タブバーに新郎新婦名・日取・進捗をまとめて統合（`.tabs-bar`＋`.tabs-meta`、タブ本体は左・要約は右の1行）。独立タブだった「🪜進め方」を廃止し、商談ステップのうち今のステップに対応するタブ（案件/打ち合わせ/見積/進行/リソース）の中に、さりげなく閉じられるアドバイスカード（新規`tab-advice.tsx`。案件×ステップキーごとにlocalStorageで非表示を記憶）として表示するよう再設計。旧`sales-step-nav.tsx`と関連CSSは削除
- 「🎵選曲」を進行タブから独立タブへ分離（STAFF_TABS・COUPLE_TABS両方に追加）。mobile-nav.tsxが以前から`?tab=songs`にリンクしていたが受け皿が無く実質死んでいたリンクも合わせて機能するように
- 検証: ローカルDEMO_MODEでブラウザ実機確認（デスクトップ=タブバー統合表示・アドバイスカードの表示/展開/✕での非表示/リロード後の記憶を確認、モバイル幅375pxでお客様ロールがタブ非表示でも名前・日取・進捗が見えることを確認）、新規登録フォームでブライダル/宴会は承認待ち文言なし・業者のみ従来の10時間案内が出ることを確認。tsc/build通過

## 2026-07-11（検証用ワンクリックログインを9ボタン構成に整理）
- demo-login route（GET/POST）を再設計: 👑管理者1・💐プランナー2・👰新郎新婦3組・🏪業者3（ドレス／引出物／花のみ、他カテゴリのボタンは非表示）の計9ボタンに
- POSTに`seq`（role内の連番）を追加。2人目以降は`demo-role-seq@example.com`で固定し、ボタンを何度押しても同じ別アカウントに戻る（重複作成されない）よう冪等化。1人目は既存最古アカウント優先で本番データを壊さない
- ログイン画面（login/page.tsx）・DemoBar（アカウント切替）双方が同じaccountsレスポンスを描画するため型追加のみで両方に反映
- 検証: ローカルDEMO_MODEでプランナー2・業者ドレスの自動作成→再クリックで重複しないことをAPI直叩きとDB確認で検証。ログイン画面・DemoBar両方で9ボタン表示を確認。tsc/build通過


## 2026-07-11（トップバーの余白を撤去・席次プレビューを本当の「画像」に）
- トップバーのタイトル非表示ページ（案件詳細配下）で、日付を含むタイトルブロックごと消していたため上に空白だけが残っていた問題を修正。topbar-title.tsxのTopbarTitleを`Topbar`に拡張し、ヘッダー全体（bell含む）を1コンポーネントで組み立てて`.topbar-slim`（padding 14px→8px）を動的付与。空白ゼロに
- 席次プレビュー（previewOnly）から🔍ズームツールバー（−/＋/全体/100%＋操作ヒント文）と「未割当のゲスト＋一括追加フォーム＋CSV入出力」セクションを撤去。編集する前は卓配置図だけのシンプルな画像に。編集専用ページ（/cases/[id]/seating）側は従来通りフルツール
- 検証: PCブラウザでトップバーの余白解消・席次プレビューの簡素化・編集ページのツール温存をスクリーンショットで確認。tsc/build通過


## 2026-07-11（トップバーの重複タイトル撤去・席次をプレビュー専用＋専用編集ページに分離）
- トップバーの汎用タイトル「案件詳細」＋日付を、案件詳細配下ページ（/cases/[id]以下すべて）で非表示に（topbar-title.tsx: SUPPRESS_ON正規表現）。ページ内に独自の大見出しを持つため純粋な重複だった
- 🪑席次タブ: ロック/編集トグルと🔒バナーを撤去し、読み取り専用プレビュー＋「✏編集する→」導線に変更（SeatingPanelに`previewOnly`/`editHref`prop追加。かんたん入力トグルも隠し常にレイアウト表示）
- 新設: 専用編集ページ `/cases/[id]/seating`（hearingページと同じ独立ページパターン）。`defaultEditMode`propでロック解除の一手間なく開いた瞬間から編集可能に
- スマホでの卓レイアウト編集（ドラッグ配置）は既存の`.pc-only`（720px以下で非表示）＋simpleMode自動判定で元々iPad可・スマホ不可だったため追加のデバイス判定は不要と判明。お客様がスマホで行う「かんたん入力（ゲスト登録・新郎新婦分担）」は対象外のまま維持（ユーザーに確認済み）
- 検証: PC（編集ページ=即編集可）・iPad幅820px（レイアウト編集ツールバー＋切替ボタンあり）・スマホ幅375px（かんたん入力のみ・切替ボタン非表示）をブラウザ実機で確認。tsc/build通過


## 2026-07-10（散らかっていたヘッダー周りを全面整理：失注・顧客攻略を案件タブへ、チャットをタブ化）
- タイトル行に浮いていた「失注にする…」ボタンを撤去し、📌案件タブの中（ヒーロー直下）へ移動
- 🎯顧客攻略（旧・右サイドの折りたたみパネル）を撤去し、📌案件タブ内のAIヒヤリングカードの直下にインライン表示に変更（strategy-panel.tsx: aside固定幅→カードグリッドのインラインブロック。close/reopenの記憶機能は維持）
- 🔮AIヒヤリングカードも全タブ共通表示から📌案件タブ内へ移動（1タブ=1業務を徹底、他タブの作業エリアがさらに広くなる）
- 案件コックピットの`.cockpit/.cockpit-main/.cockpit-right`（flex分割レイアウト）を撤去。全タブが常時フル幅に
- 💬チャットを右下フローティングバブル（ChatDock）から「💬チャット」タブに変更（リソースタブの隣）。chat-dock.tsx削除・ChatPanelを直接タブ内に描画。新着メッセージがあるとタブに赤い点滅バッジ（未読件数はchatMessage+ChatReadから算出）
- 検証: PC/モバイル両方の実機スクリーンショットでヘッダー周りの浮遊要素が解消したことを確認。未読→バッジ点滅→既読で消えるまでAPI経由で実地検証。tsc/build通過


---

## 2026-07-10（案件詳細ヘッダーの整理：リソースをタブ分離・ヒーロー圧縮）
- 「🏛 リソース確認」（DayVenueChart＋AssignmentsPanel）を📌案件タブから独立タブ「🏛 リソース」へ分離（STAFF_TABS追加・TAB_ALIASから`resources`エイリアス削除）。案件タブは基本情報・準備チェックリスト・アンケートのみに整理
- ヒーローカードを大型カウントダウン箱＋縦積み情報から、日付/会場・進捗バー・クイック操作を1行に収めるスリムバー（.hero-slim）に圧縮。タイトル行の`dday`ピルと重複していた大きい日数表示を削除
- 商談ステップ「当日」のリンク先を新設のリソースタブに変更（sales-steps.ts）
- 検証: ブラウザ実機でリソースタブの単独表示・ヒーロー圧縮を確認、tsc/build通過

---

## 2026-07-10（中央エリア最大化：ステップをタブへ分離・サイドバー折りたたみ）
- 商談ステップナビをコックピット左固定ペインから独立タブ「🪜 進め方」へ移動（sales-step-nav.tsxはカードのグリッド表示に対応するCSS追加）。中央の作業エリアが常時最大幅に
- 顧客攻略パネルはflexboxベースに変更（.cockpit-rightをgridからflexへ）。折りたたみ時に自動で中央エリアが広がる
- グローバル左サイドバーに折りたたみボタンを追加（sidebar-shell.tsx）。アイコンのみの縮小表示（60px）⇄通常（232px）をワンクリック切替、状態はlocalStorageで維持
  - 実装メモ: flexアイテムの flex-basis:auto をCSSクラスだけで縮小させようとすると環境によって効かないケースがあったため、幅はReact state からインラインstyle（width/minWidth/flexBasis）で直接指定する方式に変更（確実に効く）
- 検証: 進め方タブのカード表示・サイドバー展開/折りたたみの両方をブラウザ実機のスクリーンショットで確認、tsc/build通過

## 2026-07-09（コックピットの助言セクションを閉じられるように）
- 商談ステップの「トーク・チェック」詳細に✕ボタン（sales-step-nav.tsx）。クリックした瞬間の表示/非表示はセッション内のみ（次回訪問時は現在ステップが再び開く仕様は維持）
- 右の「顧客攻略」パネル全体に✕ボタン（strategy-panel.tsx）。閉じると縦の細いタブに折りたたまれ、クリックで再表示。状態はlocalStorageに案件ごとに保存され次回訪問でも維持
- 検証: 開閉・再表示・リロード後の永続化をブラウザ実機で確認、tsc/build通過

## 2026-07-09（AI生成プランの取り込み口・診断書印刷・MD強化）
- **AI生成結果の取り込みを案件ページに新設**: 🔮ヒヤリングカードの「📥 生成結果を取り込む」（ai-plan-import.tsx）。AIの回答全文（アドバイス文・コードフェンス混在OK=既存の寛容パーサ）を貼り付け→pack登録→「この案件へすぐ適用」で見積新Ver・進行表・台本・料理・席次・リソースまで自動セットアップ。チェックを外せばテンプレ保存のみ（見積に影響させない）。従来の管理→テンプレート読み込みも併存
- **生成依頼MD強化**（hearing/md）: 診断結果（MBTI/五行/相性）を提案の根拠に使う指示＋出力を2部構成に（pack JSON＋「プランナーへのアドバイス」400〜600字=売り方・接客注意・アップセルの狙い目）
- **ご縁の診断書（印刷）**: /print/[id]/fortune（fortune-print.ts）。2人分1枚・お客様に渡す用。MBTI（ユングのタイプ論の蘊蓄）・12星座・五行の相生相剋・相性スコア（格付けコメント）・「袖振り合うも多生の縁」からの式場との縁を寿ぐ結び文。宴会は主催者タイプ版。ヒヤリングカードと診断完了画面に🖨ボタン
- 検証: 文章混在貼り付け→登録→適用→(テストデータ後始末)をAPIで実証・診断書のブラウザ表示確認・tsc/build通過

## 2026-07-09（案件詳細をタブ化）
- 縦に全セクションが並ぶLP型をやめ、**タブ切替**に再構成（ユーザー要望）。スタッフ: 📌案件（基本情報・ToDo・リソース確認）／📝打ち合わせ（モーダル廃止）／💰みつもり（見積・カタログ・発注・料理・請求）／🪑席次／📋進行（進行表・楽曲）。お客様: お見積り／えらぶ（カタログ）／席次／当日の流れ（楽曲）
- 旧リンク互換: ?tab=catalog/orders/meals/billing/songs等は対応タブへ自動振替（スマホ下部ナビ・過去リンクを壊さない）。商談ステップナビ・チェックリストのリンクもタブ遷移に変更
- 検証: 全タブの表示分離をスタッフ/couple両ロールでHTML検証・tsc/build通過

## 2026-07-09（新本番デプロイ・Google/freee廃止・サーバー移行判明）
- **本番デプロイ完了**: 新サーバー os3-314-46741（IP 49.212.230.245・pm2 `wedding-erp`・ポート3200・nginx・複数アプリ同居）へリニューアル版（P0〜P5＋機能廃止）を反映。ビルド日時 7/9 21:44 を実機確認。カタログ69品目＋テンプレ15本を投入済み（DBは空スタート方針・案件1/ユーザー1は既存のまま）。pm2エラーログなし・DEMO_MODEなし
- **判明した移行状況**: 旧サーバー os3-376-21308 は廃止（アプリ・.env・DBなし・サイト応答なし）。公開ドメイン ceremos.grandeclat.jp のDNSが旧IP 133.167.93.62 を向いたまま → **要DNS切替（→49.212.230.245）。切替後にHTTPS化（certbot）**。CLAUDE.md・deployスキルの接続先は新サーバーに更新済み
- **Googleログイン・freee連携を廃止**（ユーザー指示）: freeeはlib/API3ルート/請求画面の同期・CSV・連携UI/Invoice.freeeDealId列まで削除。GoogleはOAuth本体が既に無く文言残骸と.envのGOOGLE_*を掃除。QRコード登録フローは存続。クリーンビルド46ページ
- デプロイ時の教訓: 旧サーバーへ誤rsyncしないこと（このセッションで1回発生・実害なし）。サーバーのnode/npmはnvmではなく /usr/bin 直（非対話sshでそのまま使える）

## 2026-07-09（UI全面リニューアル P0〜P5 実装）
仕様書 = `docs/リニューアル仕様書_v1.md`（確定版）。コミット acedd8a〜aad3dae の6段階。

- **P0 用語辞書**: `src/lib/terms.ts` — `t(key, caseType)` で婚礼/宴会の用語を自動切替（新郎新婦→主催者等）。Caseに hearingJson / lostReason / lostNote / lostStep / lostAt を追加（db push済み）
- **P1 案件コックピット**: 案件詳細をスタッフ向け3ペイン化（左=`sales-step-nav.tsx` 商談ステップナビ〔8ステップ・トーク/チェック/完了自動判定=`src/lib/sales-steps.ts`〕／右=`strategy-panel.tsx` 顧客攻略）。デザイントークンを白基調＋ゴールドに変更・見出しをセリフ体に（globals.css）
- **P2 AIヒヤリング**: `/cases/[id]/hearing` — 1問1画面ウィザード（婚礼26問・宴会13問・章末ミニ診断）。診断=`src/lib/hearing.ts`（MBTI16/星座・五行/新郎×新婦相性/主催者タイプ・全てルールベースでAI不要）。結果は hearingJson に保存され攻略パネル（タイプ・刺さる提案・NG・アップセル候補）に反映。`GET /api/v1/cases/[id]/hearing/md` がpack生成依頼MDを出力（外部AI→テンプレ読込の既存フローに接続・将来API組込用にルート内へ隔離）
- **P3 お客様スマホPWA**: coupleホームをタスクフィード型に（準備完了度ゲージ＋今やること）。下部ナビをホーム/準備/えらぶ/診断/メニューの5タブ化。席次は新郎側/新婦側の担当分担（`src/lib/couple-side.ts` で担当解決・seating APIでサーバー強制・相手側は閲覧のみ）。`src/lib/notify.ts` = Notifier抽象化＋LINE Messaging API骨格（LINE_CHANNEL_TOKEN 未設定ならno-op・宿題登録時に発火）
- **P4 テンプレ15本＋宴会モード**: `node scripts/seed-template-packs.cjs` で婚礼10・宴会5のpack登録（見積・コース料理・進行台本mcScript・リソース・wizard条件込み・冪等）。宴会モードは9コンポーネントで用語切替・dressカタログ非表示・婚礼専用進行プリセット除外。宴会packに婚礼用語ゼロを機械チェック済み
- **P5 失注＋成果**: `POST/DELETE /api/v1/cases/[id]/lost`（理由必須・失注ステップ自動記録）＋案件ページ右上に失注ボタン。`/reports` 成果ダッシュボード（成約/失注/成約率/平均単価/プランナー別/失注理由・ステップ集計）
- **検証**: 各Phaseで `npx tsc --noEmit` 全通過＋ブラウザ実挙動確認（ヒヤリング回答→診断→攻略パネル、テンプレ適用→進行表15演目・実名置換・曲枠8、席次の側強制403、失注記録→集計反映→取消、宴会案件で婚礼用語ゼロ）。最終 `npm run build` 成功（48ページ）
- **本番未反映**。デプロイ時はサーバーで `prisma db push`（server-update.shが実行）後、`node scripts/rebuild-catalog-with-photos.cjs` と `node scripts/seed-template-packs.cjs` を1回ずつ実行

## 2026-07-09（カタログ再構築・UIリニューアル仕様書v1）
- **カタログ消失の調査と再構築**：ローカルDBの CatalogItem が0件だったのが原因（ページ・API・導線は無傷。0件だとカタログ画面から品目が全部消える設計）。本番は backups/ 不存在＝削除ボタンの形跡なし・sqlite3未導入のため件数未確認（確認するなら node + Prisma で）。
  - **`scripts/rebuild-catalog-with-photos.cjs` を新設**：全69品目＋業者10社を、実写真（`catalog-photo-assets-all/` の PNG・manifest.tsv 対応表どおり）つきで一括投入。既存があればスキップ・写真が無ければ写真だけ付ける冪等設計。品目定義は seed-catalog / fill-empty-catalog / restore-dress-catalog / seed-transport / seed-family-attire に準拠して1本に統合。
  - 検証：投入後 total=69/active=69/写真69枚、`/api/v1/catalog/public` が69件（全件imageIdあり）、/catalog 画面でステップ表示＋実写真レンダリングをブラウザ実機確認。
- **UI全面リニューアル仕様書 v1 作成**：`docs/リニューアル仕様書_v1.md`（ヒヤリング8問の回答反映済み・寺沢さんレビュー待ち）。UI層のみ刷新／プランナーPC=案件コックピット＋商談ステップナビ＋顧客攻略パネル／お客様=スマホPWA（席次は新郎新婦の担当分担・アンケート別回答）／AIヒヤリング=MBTI+生年月日系+相性診断・MD入出力併用／宴会モード=用語辞書で自動切替／初期テンプレ婚礼10+宴会5。
- その他：`.claude/launch.json` に autoPort 追加（ポート3000競合時に自動で別ポート起動）。

## 直近セッションの実装（2026-07-08・カタログ／承認猶予10h／検証モード）
- **業者カタログ＋出店**：新モデル `CatalogItem`（vendorId=null は式場品目。定価price・desc・isActive・画像=Attachment parentType="catalog"）。出店は**1カテゴリ最大3店舗**（品目POST時にサーバー検証）。API: `GET/POST /api/v1/catalog`、`PATCH/DELETE /api/v1/catalog/[id]`、`POST /api/v1/catalog/[id]/image`（1品目1枚差替）。業者ページ（vendors/[id]）に自社カタログCRUD、admin/settings に式場カタログ（`vendor-catalog.tsx`）
- **カタログ→見積反映**：案件タブ「🛍 カタログ」（`catalog-panel.tsx`・CUSTOMER_TABSにも追加）。`POST /api/v1/cases/[id]/quotes/catalog-add`＝**お客様も利用可・価格はサーバーでカタログ定価を強制**。最新が下書き→追記（同一品目は数量加算）／確認済・承認済→明細引継ぎの新Ver作成＝「最後の反映が必ず見積カードに載る」。値引きはプランナーが見積編集で
- **承認猶予10時間**：`src/lib/clock.ts`（APPROVAL_GRACE_MS/graceRemainingMs/getNow）。セルフ登録（お客様・業者）は登録後すぐ自動ログインして利用開始、未承認のまま10h経過でログイン不可（login route）＋セッション中も(app)/layoutで判定→`/login?grace=expired`。情報は消えない。**否認＝削除**：admin/users/[id] DELETE を「未承認ユーザーはプランナー以上で削除可」に緩和（業者は空Vendorも掃除）。PATCHも業者承認キーをプランナー以上に緩和
- **業者セルフ登録**：ログイン画面の新規登録に「お取引先（業者）」タブ（店舗名＋カテゴリ→Vendor自動作成・role=カテゴリ対応）。承認画面（approvals）に業者承認/否認セクション＋仮利用残り時間表示
- **検証モード（DEMO_MODE=1・.envで設定）**：ログイン画面ワンクリックログイン（客/管理/支配人/プランナー/各業者・居なければ自動作成）`/api/v1/auth/demo-login`。時間送り `/api/v1/demo/time`（Setting demo_time_offset_ms、+1h/+5h/+10h/+1日/リセット）＝猶予判定に効く。(app)レイアウト上部に🧪バー（`demo-bar.tsx`・アカウント切替つき）。**本番はrsyncが.envを除外するため自動で無効**
  - 2026-07-08 ユーザー要望で**本番にも一時的にON**（誰でも管理者に入れる状態＝検証後は必ずOFF）。
    ON: `ssh ubuntu@… 'grep -q "^DEMO_MODE" ~/wedding-erp/.env 2>/dev/null || echo DEMO_MODE=1 >> ~/wedding-erp/.env; pm2 restart wedding-erp'`
    OFF: `ssh ubuntu@… 'sed -i "/^DEMO_MODE/d" ~/wedding-erp/.env && pm2 restart wedding-erp'`（OFF前に🧪バーで時間オフセットをリセット）
- **その他**：左上タイトル既定値を CEREMOS に（settings.ts venue_name）。couple の rundown を edit に（お客様が台本まで作れる＝誰でもプランナー化）。スマホmenuにカタログ。v0.10.0
- **追加（同日）**：カタログ写真の**拡大表示**（catalog-panel ライトボックス／vendor-catalog サムネは別タブ）。**カタログ管理ページ `/admin/catalog`**（プランナー以上・式場品目＋全業者品目を編集。ナビ・スマホmenuにリンク）。**サンプル投入 `node scripts/seed-catalog.cjs`**（式場・ドレス2店舗・引出物・装花＝計18品目・SVGサンプル写真を storage/uploads に生成。同名スキップで何度でも安全）
- **追加（同日その2）カタログもAI JSONで一括投入＝入力画面は1か所**：`src/lib/catalog-import.ts`（kind:"ceremos-catalog" を業者作成＋品目upsert＋写真保存。imageSvgは<script>等を拒否・60KB以内・省略時はemoji/色から自動生成）。templates POST のpack importループがcatalog要素も処理→**管理→テンプレート「📥 AIテンプレ読み込み」1か所でテンプレ一式＋カタログ（写真つき）を登録**。AIプロンプト（template-pack-prompt.ts）にCATALOG_JSON_SCHEMA＋**価格同期ルール**（見積catering単価=料理売値合計、カタログ式場品目=見積と同名同価格）を追加。要件MD（template-pack-spec.ts）にもカタログ節。ユーザー向けコピー用MD: `docs/AIデータ生成プロンプト.md`。※料理タブの「料理プランから選ぶ」9種は内蔵プリセットのままで、AIデータとは別物（同期しない）
- **デプロイ時の注意**：スキーマ追加あり → サーバーは server-update.sh の db push でOK。**ローカルMacは `npx prisma db push && npx prisma generate` が必要**

## 直近セッションの実装（2026-07-08 その3・不具合修正＋円卓サイズ）
- **ロゴ差し替えが反映されない問題**：原因=①/api/v1/branding/logo が要ログイン（ログイン画面で401）②Cache-Control max-age=300でブラウザが旧ロゴを保持。→ 認証不要＋no-cacheに変更、アップロード時に venue_logo へ `?v=時刻` 付きURLを保存（全<img>が新URLに）。middleware PUBLIC に /api/v1/branding 追加済み
- **見積「編集できない」対策**：確認済/承認済は履歴保護で直接編集不可のまま、操作列に「✏ 編集（新Ver作成）」を追加（明細引き継ぎで即編集開始）。quotes-panel
- **円卓サイズ変更**：SeatingTable.sizeCm（Int・default200・120〜300cm）。renameTable/addTable/restore が sizeCm 対応。席次表の選択ツールバーに「サイズ」select（Ø1.2〜3.0m）。描画=tableDiscPx/tableSeatR（1m=80px実寸比・座席リングは縁+24px）。印刷（print seating）も卓ごとのsizeCmで半径計算。**スキーマ変更あり→ローカルは `npx prisma db push && npx prisma generate`**
- 検証：prisma generate＋tsc全通過

## 直近セッションの実装（2026-07-08 その4・席次編集モード＋料理DB一本化）
- **席次表の編集モード**：seating-panel の canEdit プロップを canEditProp に改名し `canEdit = canEditProp && editMode` でシャドーイング。右上「✏ 編集する」→編集開始、「✅ 編集を抜ける」→閲覧ロック（誤ドラッグ防止）。かんたん入力（MobileSeating）と下部の「リストに追加」「CSV」は編集モード不要（canEditProp）。閲覧時はロック案内文を表示
- **料理プランのデータベースをテンプレ一式に一本化**：meals-panel の「料理プランから選ぶ」を内蔵 MEAL_TEMPLATES から **/api/v1/templates?type=pack の body.menu.items** に変更（ブライダル/宴会/その他でグループ表示・1名あたり金額つき・クリア上書きは従来どおり）。src/lib/meal-templates.ts は未使用化（ファイルは残置）。見積・料理・カタログはすべてAIテンプレJSONが唯一のデータ源になった
- 検証：tsc全通過

## 直近セッションの実装（2026-07-07 その3・楽曲データ保持期間）
- **本番楽曲データの自動削除を式後3日→365日（1年）に変更**：`src/lib/cleanup.ts` と `scripts/cleanup-song-media.cjs` の既定値。Setting `song_media_retention_days` があればそちら優先（現状ローカル・本番とも行なし=既定値365が有効）
- 検証：`npx tsc --noEmit`・`node --check` 通過

## 直近セッションの実装（2026-07-07 その2・席次表の縮尺/会場範囲）
- **円卓をØ2mに変更**：.stable .disc 144→160px、SEAT_R 96→104。印刷（print/[id]/[doc] seating）もR=80/SR=104に同期
- **会場範囲の明示**：.seat-canvas-wrap背景をsurface2（会場外=グレー）、.seat-canvasにinset box-shadow 5pxの「壁」＋左上に `.hall-label`（披露宴会場 ◯m × ◯m）
- 検証：`npx tsc --noEmit` 通過

## 直近セッションの実装（2026-07-07・席次表エディタPC向け全面改善）
- **本体ドラッグ移動**：円卓disc・floor-obj本体をそのままドラッグ（✥ハンドル撤去）。button/input/form/.seat-chip/.fo-resize上のpointerdownは除外。移動量<3pxは保存スキップ（クリック=選択扱い）
- **選択→上部ツールバー編集**：卓内の席±/編集/削除ボタンとfo-actionsホバーボタンを廃止し、クリック選択（amber枠）→ズームバー下のツールバーに集約（卓=席±・名前変更・削除／長机=席±・回転／オブジェクト=名前変更・削除）。背景クリックで選択解除。旧renaming inline formはトリガーなしの残骸（無害）
- **パン・ズーム**：背景ドラッグでスクロール。Ctrl(⌘)+ホイールはカーソル位置基準（scrollLeft/Top補正）。全体フィットは幅+高さ両対応＆rAF計測
- **中央追加**：＋円卓（2卓目以降）・長机・椅子・オブジェクトは表示中画面の中央に追加（centerPos）
- **スマホはかんたん入力専用**：レイアウト切替ボタンを pc-only 化
- 検証：`npx tsc --noEmit` 通過

## 直近セッションの実装（2026-07-06 その7・案件削除機能）
- **案件の完全削除（テストデータ掃除用）**：`DELETE /api/v1/cases/[id]`（支配人以上のみ）。Caseカスケードで関連データ連動削除＋Attachment（case/meeting/song）はレコードと実ファイル（deleteFile）を手動削除。audit記録あり
- `src/components/case-delete-button.tsx`：案件一覧カードの🗑ボタン（admin/managerのみ表示・confirm付き・Link内なのでpreventDefault/stopPropagation）
- デプロイコマンドのパスを ~/Desktop → **~/Documents** に修正（フォルダ移動済みのため）
- 検証：`npx tsc --noEmit` 通過

## 直近セッションの実装（2026-07-06 その6・席次表ズーム）
- **ズーム機能**：`seating-panel.tsx` に zoom state（0.25〜2.0）。ズームバー（−/＋/⤢全体/100%）＋Ctrl(⌘)+ホイール。キャンバスは `transform:scale(zoom)`（origin 0 0）＋外側サイズ調整divでスクロール対応。初回ロード時は全体フィット
- **ドラッグ補正**：startDrag の dx/dy を zoomRef で除算（卓移動・オブジェクト移動・リサイズすべて対応）
- **会場サイズをm指定に**：⚙会場サイズはメートル入力（9〜30m × 6〜20m、1m=80px換算）。表示もm。適用後は自動で全体フィット。サーバー側clamp(700-2400/480-1600px)と整合
- `.seat-canvas-wrap` に max-height:74vh・overscroll-behavior:contain
- 補足: 縮尺は元々実寸比で正しい（円卓Ø1.8m=144px・1m=80px）。「合っていない」と感じる原因はズーム不在だった
- 検証：`npx tsc --noEmit` 通過

## 直近セッションの実装（2026-07-06 その5・楽曲タブのスマホ最適化）
- globals.css に楽曲用モバイルCSS追加：`.sp-hide`（720px以下で非表示）／`.songs-head`（ヘッダーボタン2列グリッド）／`.song-flex`（入力欄100%縦積み・ボタン半々min-height42・演目pill折返し）／`.quiz-artists` 1列／`.song-suggest`（おすすめ曲リスト＝曲名の下に▶視聴・採用を半々配置）
- `songs-panel.tsx`：技術項目（秒数・音響メモ・視聴URL・⏱cueTiming select）は `isStaff ? … : "sp-hide"` でお客様のスマホのみ非表示（PC・スタッフは従来どおり）。JASRACピル・進行表/台本リンク=couple は `pc-only`。曲カード行・提案ボックス検索行・曲枠なし行に `song-flex` 適用
- 検証：`npx tsc --noEmit` 通過

## 直近セッションの実装（2026-07-06 その4・客用UI再設計）
- **エレガントテーマ統一**：`(app)/layout.tsx` が couple のとき `.app.couple-app` を付与。globals.css の `.couple-app` でクリーム×ローズゴールドのCSS変数上書き＋見出し明朝（topbar h1/section-h h2/dday-big/.eg-serif）。下部ナビ・進捗バー・btn.primary(#4a3f36)も統一
- **メニュー一本化**：スマホのお客様導線は下部ナビ＋☰メニューのみに集約。案件ページのタブ列=coupleは `pc-only`、ヒーローの quick-actions=スタッフ専用に変更、ホームの7カードグリッド=`pc-only`。`.pc-only`（720px以下 display:none）を globals.css に追加
- **PWA起動誘導**：`src/components/a2hs-banner.tsx`（couple×スマホ×非standaloneのみ表示。Android=beforeinstallprompt捕捉でワンタップ追加／iOS=共有→ホーム画面に追加の手順案内。localStorage `ceremos-a2hs-dismissed` で再表示なし）。`.a2hs` スタイル追加
- **TopbarTitle** に couple prop（ダッシュボード→ホーム、案件詳細→マイページ等、業務用語を見せない）
- 検証：`npx tsc --noEmit` 通過

## 直近セッションの実装（2026-07-06 その3・客用アプリ品質改善）
- **PWA化**：`public/manifest.webmanifest`（standalone・start_url=/dashboard）＋`public/app-icon.svg`／`apple-touch-icon.png`（180px・スクリプト生成）。`src/app/layout.tsx` に metadata（manifest/icons/appleWebApp）と `viewport`（device-width・viewportFit:cover・themeColor明暗）を追加 → ホーム画面に追加でアプリ起動
- **お客様用の下部ナビ**：`mobile-nav.tsx` を couple 専用タブ（🏠ホーム/💰お見積り/📋当日の流れ/🎵楽曲/☰メニュー＝案件タブへ直行）に切替。`(app)/layout.tsx` が coupleCaseId（直近案件）を渡す。useSearchParams使用のためSuspenseでラップ。メニューシートに席次・打ち合わせ・チャット
- **サイズアウト（横はみ出し）修正**：globals.css＝`img/video/canvas max-width:100%`・`.tbl-scroll`ユーティリティ・720px以下で `.main/.content overflow-x:clip`・`.card>table.tbl` 横スクロール・`.section-h h2` 折返し・topbarセーフエリア（env(safe-area-inset-top)）
- **進行表のスマホ表示**：`.rg-wrap`（PC=min-width:700px、スマホ=縦積み2列。3・4列目は演目の下に回り込み、ヘッダは2列のみ）。rundown-editor の inline minWidth→classへ。quotes-panel の編集テーブルを `.tbl-scroll` でラップ（minWidth:640）
- タップ質感（:activeで縮小・tap-highlight除去）。検証：`npx tsc --noEmit` 通過（サンドボックスのLinuxでは binaries.prisma.sh が403で prisma generate 不可→既存 .prisma/client の型で確認。/tmp/werp は他ユーザー所有のため $HOME/werp を使うこと）

## 直近セッションの実装（2026-07-06 その2・一括7件）
- **テンプレ全面刷新（AIテンプレ一式=pack方式へ移行）**
  - 内蔵テンプレ廃止：`prisma/templates.cjs`→空、`quote-templates.cjs`/`rundown-templates.cjs` 削除。`scripts/clear-templates.cjs --yes` でDBの旧テンプレ全削除（本番・ローカルで各1回実行が必要）
  - 新形式「テンプレ一式（type="pack"）」＝1つのJSONに 見積+料理+進行台本(司会台本込)+STAFF/設備リソース+ウィザード適合条件（`src/lib/template-pack.ts`: parsePack/scorePack/applyPackToCase）
  - 管理画面テンプレート（`templates-admin.tsx`）：🤖AIプロンプトをコピー（`src/lib/template-pack-prompt.ts`）→ChatGPT等でJSON生成→📥貼り付け/JSONファイルで読み込み。編集(JSON)・削除も可
  - 適用はコピー方式＝**適用後の編集はテンプレと同期しない**（仕様として明言）
  - API: `POST /api/v1/templates`(type=pack, 配列可・検証つき) / `DELETE /api/v1/templates/[id]` / `GET /api/v1/template-packs`(couple閲覧可・回答でスコア順) / `POST /api/v1/cases/[id]/apply-pack`
- **ウィザード両方**：①お客様ホーム（見積0件の案件に表示、`customer-wizard.tsx`：スタイル/人数/予算/時間帯の4問→おすすめ3件+全件から自分で選択→apply-packで見積下書き等作成。coupleは見積が既にあると適用不可） ②新規案件フォーム（`new-case-form.tsx`にパック選択カード、作成直後にapply-pack） ③見積ウィザード（`quotes-panel.tsx`がpackも一覧表示・保存時packIdで quotes route が applyPackToCase 実行）
- **再生プレイヤーMP4対応**：アップロード動画(video/*)+映像ONで映像ウィンドウに投影（`screen/page.tsx`に`<video>`プレイヤー追加、cmd:loadに`mediaUrl`。音量/シーク/F.O/暗転/自動再生ブロック対応共通）。コンソール（`audio-console.tsx`）に動画ファイルの映像ONトグル・ミュート同期モニター。rundown APIが`mediaMime`を返すように
- **進行表に音/動画バッジ**：🎬(動画ファイル or 映像ON)／🎵(音源)／♪YouTube を行に表示（rundown-editor+cases page）。プレイヤーのシーン一覧にも「🎬動画ファイル/🎵音源/🎬YouTube映像/♪YouTube」pill
- **客用アプリ強化**：CUSTOMER_TABSに 💰見積(+お支払いスケジュール・入金状況カード)・📋進行表(閲覧) を追加。ホームのメニューに「お見積り・支払い」「当日の流れ」追加。カウントダウン/準備クエスト/ゲスト席次/チャットは既存
- **楽曲DB 約2万曲**：`scripts/generate-song-db.cjs`→`src/lib/song-db-large.json`（19,876曲：実在の定番+映画/ディズニー/ジブリ/ジャズ/クラシック+婚礼BGM定番アレンジ版）。song-db.tsが統合（検索=全体、おすすめ=厳選+原曲のみ）。楽曲タブのおすすめカード内に「🔎DB検索」ボックス
- **料理プラン化＋クリア上書き**（追加要望）：`meal-templates.ts`を9プランに再編（結婚式コース3/宴会ビュッフェ3/宴会コース3・MEAL_KIND_LABELS）。料理タブ「🍽 料理プランから選ぶ」＝確認→クリア上書き（menu APIに op:"replaceItems"）。パック適用の料理もクリア上書きに変更。発注の品目名から「（…より自動作成）」注記を除去（既存データは `scripts/clean-order-notes.cjs`）
- **人数連動**（追加要望）：`src/lib/pack-scaling.ts`（scaleQuoteItems/expandStaffCount）。パック適用時に案件の予定人数で 見積qty（perGuest係数 or 品名「× ◯名」自動判定・品名の数字も置換）／席次卓数／スタッフ行数（perGuests=ゲスト◯名につき1名→①②…展開、既定でサービススタッフ20名/人）が自動調整。見積ウィザードのパック選択時もclient側でスケール（QuotesPanelにguestCount prop）。スキーマ・AIプロンプト・要件MDにも反映
- **掃除**：Google/マジックリンク認証API削除（auth/google, magic, magic-link, methods＋middleware・auth.tsの残骸）。保留#3「🎲全曲おまかせ全入替」実装（全曲設定済みなら確認→全入替）
- 検証：Prismaクライアント再生成のうえ `tsc` 全ファイル型チェック通過。**ローカルでも `node scripts/clear-templates.cjs --yes` と `npx prisma generate` を実行推奨**（node_modulesの生成済みクライアントが古くtscが通らないため）

## 直近セッションの実装（2026-07-06）
- **YouTubeタイトル隠しは断念**: 黒カバー方式（独立オーバーレイ）を試作したが、実装前にユーザーと再検討し「あきらめる」で決定。代替案（iframe拡大+overflow hiddenでのクロップ、動画の自前ホスティング）も提示したが、今回はどちらも採用しない結論。`src/app/live/[id]/screen/page.tsx` は2026-07-05時点の「読み込んだら即表示（タイトルは出るが確実に映る）」のコードのまま変更なし

## 直近セッションの実装（2026-07-05）
- **映像出力が真っ暗バグ修正**（多段修正）: ①「終了0.9秒前」判定が次の動画の読み込み中に前の動画のt/dを見て即endNow→state=1のみに限定＋loadでstateRefリセット ②タイトル隠し黒カバー＆videoOn表示ゲートを**全面撤去**（ユーザー了承済み：開始時にYouTubeタイトルが出てもよい→「読み込んだら即表示」に単純化）。YouTube APIが#screen-playerをiframeに**置換**するためReactのstyle更新が届かない問題も解消（表示制御は外側ラッパーdivで実施） ③自動再生ブロック対策（3秒でミュート再生フォールバック→クリックで音声ON） ④YouTubeエラー表示（onError: embed禁止150等を画面とコンソールに表示、cmd:screen-error）。yt-player.ts に unMute/isMuted 追加
- **リソース機能は存続**（廃止要望は撤回された）
- **見積自動セットアップ拡張**: ⑤手配リスト＝見積部門から発注(pending)を自動作成（納期=挙式14日前・そのカテゴリの業者が1社なら自動セット）。備品＝テンプレ名キーワードで追加（ガーデン/ナイト/和婚/ディナーショー・式典）
- **ヒアリング→見積テンプレ推奨**: `src/lib/quote-recommend.ts`＋`GET /api/v1/cases/[id]/quote-recommendation`。coupleメンバーのsurvey回答（style/guests/budget/timeSlot等）＋案件種別・人数からテンプレ名の「◯名 約◯万」を採点。見積ウィザードStep1に🎯おすすめカード表示
- **席次スマホかんたん入力**: `src/components/mobile-seating.tsx`（名前入力しながら卓・席番号を指定、卓/側/間柄は連続入力で引き継ぎ）。seating-panelにトグル（幅700px以下は自動ON）
- **式後の本番楽曲データ自動削除**: `src/lib/cleanup.ts`（挙式日+3日経過、Setting `song_media_retention_days` で変更可）。ダッシュボード表示時に1日1回実行＋`scripts/cleanup-song-media.cjs`(cron用)。曲名等の記録は残る
- **お客様の個人情報入力**: /survey の基本情報にふりがな・お相手名・電話・住所を追加（電話住所はUser本体へ保存→プランナー画面に反映）。準備クエストのprofileリンクを/surveyに変更
- お客アプリの他要件（ID/PW認証・承認・TODO・チャット・楽曲好み/UPLOAD/視聴）は既存実装で充足と確認済み

## 直近セッションの実装（2026-07-08 その6・フル画面公開カタログ「Wedding Collection」）
- **方針**：カタログ選んで→料理選んで→見積もり、を1つの美しい公開ページで完結させる。業務画面とは**全く別アプリ**（データ・見積は同期）
- **ウィザード形式に全面改修（同日・ユーザーFB「カード並べるだけは選びにくい」）**：表紙→ジャンルごとに1ページずつ→最後に見積もり完成。**選択ルールをUIで強制**＝挙式1択／披露宴会場1択／料理コース1択＋ドリンク1択（カテゴリ＋品名キーワードで自動振り分け：コース=`/コース|ビュッフェ|会席|懐石/`・ドリンク=`/ドリンク|飲み放題|乾杯|シャンパン/`・会場=venue×`/利用料|貸切/`・衣装本体=`/ドレス|タキシード|白無垢|色打掛|紋付|袴|留袖|振袖/`）／衣装3着まで（上限トースト表示）／オプション類は数量つきで何個でも。1択は選ぶと他が外れる（再タップで解除）。ヘッダーに進捗ステップドット（✓済み・クリックでジャンプ）、下部固定バーに合計＋戻る/次へ。見積もりページから各ステップへ「変更する」リンク。選択はlocalStorage継続（表紙に「つづきから選ぶ」）
- **写真生成の制約**：この環境にAI画像生成ツールが無いため実写風写真は生成不可。現状は自作SVGイラスト（生成アート）。**ユーザーが画像生成APIキー（OpenAI/Stability等）を用意すれば一括差し替えスクリプトを組む**と案内済み
- **公開ショーケース `/catalog`**（`src/app/catalog/page.tsx`＋`catalog.css`＋`src/components/catalog-showcase.tsx`）：URL共有で**ログイン不要で誰でも閲覧**。墨×生成り×ゴールドの明朝デザイン。ヒーロー（花びらが舞う・グラデタイトル）→ 01会場（チャペル/ガーデン/バンケット/控室）→02料理→03衣装→04贈りもの→05ペーパー→06装花→07演出（音響映像照明/司会/写真）→08送迎（バス・タクシー）→09その他 → 見積もりプレビュー。カード出現アニメ・ホバー・カート追加ポップ・現在地ナビ・写真拡大
- **見積もりリスト（カート）**：localStorage `ceremos-catalog-cart` に保存（未ログインでも消えない）。右ドロワーでセクション別に数量調整。「見積もりにする」→紙風の見積もりプレビュー（新デザイン）→ couple ログイン中なら既存 `catalog-add` API で案件見積に保存（価格はサーバー定価強制・紙吹雪演出）／未ログインは /login へ誘導。スタッフ・業者は保存不可（案内表示）
- **公開API** `GET /api/v1/catalog/public`（式場名・品目・写真ID・viewer情報）。middleware PUBLIC に `/catalog`・`/api/v1/catalog/public`・`/api/v1/attachments` を追加。**attachments routeはカタログ画像のみ匿名許可**（他parentTypeは従来どおり要ログイン＝chat添付で401確認済み）
- **写真は全品目「生成アート」に差替**：`scripts/generate-catalog-art.cjs`（ネット写真は全廃・著作権フリーの自作SVGイラスト。チャペル/ガーデン/バンケット/控室/料理/ドリンク/ケーキ/ドレス/タキシード/和装/ブーケ/装花/ペーパー/ギフト/菓子/カメラ/映像/音響/司会/バス/タクシー/美容 等20シーン×配色を品名・カテゴリで自動選択。1200x900・下部に明朝の品名ラベル）。本番101品目差替済み。業者があとで「📷写真」から実写真に差し替える前提。※「マイクロバス」が「マイク」に誤マッチするバグは修正済み（transport判定を先に）
- **送迎カテゴリ**：`scripts/seed-transport.cjs`（式場品目4件＝マイクロバス/大型バス/タクシー手配/ハイヤー＋部門マスタ「送迎・車両」transport追加）。masters.ts の既定にも transport 追加
- **導線**：案件「🛍カタログ」タブと管理→カタログに「✨フル画面カタログ」リンク（別タブ）

## 直近セッションの実装（2026-07-08 その5・AI取込写真の確実化／一括削除／自動バックアップ）
- **AI取込カタログの写真を全品目に自動**：`src/lib/catalog-import.ts` に `pickArt(category,name)`（カテゴリ既定＋品名キーワードで絵文字・上品なグラデ色を選択）。AIが imageSvg/emoji/color を省略しても全品目に品目内容に合った写真を自動生成。プロンプト（template-pack-prompt.ts）・要件（template-pack-spec.ts）・配布MD（docs/AIデータ生成プロンプト.md）を「写真は自動・画像指定は任意」に更新
- **AI取込JSONの寛容パース**：`src/lib/json-lenient.ts`（コードフェンス```・前後の説明文・// /* */コメント・末尾カンマを自動除去。文字列内は保護）。templates POST が使用。プロンプトの出力ルールも強化（コメント禁止・末尾カンマ禁止・半角"・途中で切らない）
- **テンプレのまとめて削除**：`POST /api/v1/templates { bulkDelete:true, ids?/all?/type? }`（管理者）。templates-admin.tsx にチェックボックス＋「選択削除／すべて削除」。ヘッダーを簡素化（主要2ボタン＋「ⓘ使い方・要件」折りたたみ）＋「🛍 取り込んだカタログ（写真）を見る→」導線
- **カタログのまとめて削除**：`POST /api/v1/catalog { bulkDelete:true, ids?/all?/vendorId? }`（写真=Attachment＋実ファイルも削除。スタッフ=全件／業者=自社のみ）。vendor-catalog.tsx に各セクション「🗑 すべて削除」、admin/catalog ページ上部に `catalog-delete-all.tsx` の「🗑 全カタログを削除」
- **削除前 自動DBバックアップ**：`src/lib/db-backup.ts`（SQLite `VACUUM INTO` で backups/ に整合スナップショット・新しい順40世代）。カタログ一括削除／テンプレ一括削除／案件削除の直前に実行し、**失敗時は削除を中止**（復元できない削除を防ぐ）。復元＝`node scripts/restore-db.cjs [ファイル名]`（現DBを退避→置換→`pm2 restart wedding-erp`）。backupsはrsync除外なのでデプロイで消えない
- **誤削除の復旧（1回限り）**：業者カタログ誤削除の復旧に `scripts/restore-dress-catalog.cjs`（ドレス2社）・`scripts/fill-empty-catalog.cjs`（空業者7社に写真つき品目投入）。既存同名はスキップで何度でも安全。※本番でカタログ97品目・写真97枚に復旧済み
- **カタログ写真を実写真に差替＋日本寄せ・高画質化**：`scripts/photolize-catalog.cjs`（loremflickr＝Flickr CC画像をキーワード取得。1200x900。品名→英語キーワード「japan/japanese」を優先付与し、該当写真が無い組合せ（プレースホルダー画像を検出）はjapan無しキーワードへ自動フォールバック）。`--force`オプションで既存jpgも含め全件撮り直し。jpg済みはスキップ（--force無し時）・失敗は既存維持で再実行安全。本番97品目中94品目が日本寄せ高画質版、残り3品目（該当写真が無かった具体的すぎる品目名）は従来の実写真のまま。**注意：CCライセンスの仮素材**なので、本番でお客様に見せるなら式場自身の写真／正規ライセンス品への差替を推奨（Unsplash/Pexels APIキーがあれば無償・帰属不要に切替可）
- **席次エディタのツールバー固定**：seating-panel.tsx のツールバー（＋円卓/長机等）を `position:sticky; top:58`（topbar高さ分の下）に。ページを縦スクロールしても追加ボタンが画面外に消えない（「上が見えない・机が追加できない」対策）

## 直近セッションの実装（2026-07-09・衣装ステップの着用者別化＋実写風写真の全面反映）
- **衣装ステップを着用者別グループに分割**（`src/components/catalog-showcase.tsx`）：👰新婦の衣装（4着まで）／🤵新郎の衣装（4着まで）／👘ご両親の衣装（何個でも）／🧒お子様の衣装（何個でも）／🐶ペットの衣装（何個でも）／💍小物・美容（何個でも）。品名キーワードで自動振り分け（`isBrideAttire`/`isGroomAttire`/`isParentAttire`/`isChildAttire`/`isPetAttire`）。上限超過トーストにグループ名を表示するよう `toggleMax` にgroupName引数を追加
- **ご両親・お子様・ペットの衣装を新規追加**：`scripts/seed-family-attire.cjs`（式場品目9件＝黒留袖レンタル・色留袖レンタル・父親用モーニング・子どもフォーマル男女・ベビードレス・ペット用タキシード/ドレス・ペット参列サポート。category="dress"・同名スキップで何度でも安全）
- **ユーザー提供のAI生成写真（実写風PNG・69枚）を全カタログ品目に反映**：`scripts/apply-real-photos.cjs`（品目名の完全一致マッピング表を内蔵。`storage/photo-import/`に画像を配置して実行→旧SVG添付を削除し新PNGに差替）。本番110品目中110品目（100%）に実写風写真が反映済み。**画像は著作権フリーのAI生成**（ユーザーがChatGPT等の画像生成で作成し提供）。マッピングは会場3・挙式4(チャペル系で共有)・料理/ドリンク3・衣装19・装花11・ギフト11・撮影/映像4・ペーパー4・送迎4・家族/子/ペット衣装9の計72件
- 今後同様の写真差し替えを行う際は `scripts/apply-real-photos.cjs` のMAP配列に追記し、`storage/photo-import/`に新画像を置いて再実行すればよい（idempotent・存在しない品目/ファイルは警告のみでスキップ）
- 検証：`npx tsc --noEmit` 通過。本番で反映件数72・画像なし0・品目未検出0を確認
- **写真提供元がmanifest.tsv（各画像の意図した品目名）を後日共有 → 突合の結果、誤マッピングを発見・是正**：`catalog-photo-assets-all/manifest.tsv`（ファイル名↔意図した品目名の対応表）と本番カタログの実際の品目名を1件ずつ突合。以下2種の誤りを検出：①manifest上の品目名がカタログ未登録（例:「プリンセスライン「ローズ」」「カタログギフト「琥珀」」等）なのに、無関係な既存品目（ナチュラルドレス「リーフ」等）へ強引に写真を割り当てていた7件 ②装花のゲスト卓系3点（file17/24/29）で写真が1つずつズレていた。`scripts/fix-photo-mapping.cjs`で是正：誤爆7件は生成SVGへ差し戻し、装花3点は正しい品目へ付け替え。`scripts/apply-real-photos.cjs`のMAPもmanifest突合済みの正しい対応のみに更新（誤りは削除しコメントで理由を残す）。**教訓：AI生成写真の一括反映では提供元の意図（manifest）と実データの品目名を必ず突合してから確定させる。近い名前への近似マッチは「行き場のない写真」を無関係品目に誤爆させるリスクがある**

## 直近セッションの実装（2026-07-09 その2・写真の自動アサイン化）
- **`scripts/auto-assign-photos.cjs`**（新規）：フォルダに画像＋`manifest.tsv`（連番・ファイル名・品目名のタブ区切り）を置いて実行するだけで、**品目名が完全一致した場合のみ**自動で写真を反映する。一致しない行は`skipped-manifest.tsv`に書き出すだけで、既存品目へは絶対に押し込まない（前回の誤爆の教訓を反映）。使い方: `node scripts/auto-assign-photos.cjs [フォルダパス]`（省略時 `storage/photo-import/`）
- 本番で実写未反映（SVGのまま）の品目は43件確認（catering中心・venue多数・dress一部・gift一部・mc/photo/audio）。これらの写真生成をユーザーに依頼中

## 直近セッションの実装（2026-07-09 その3・スタッフも見積もり保存OKに）
- 公開カタログ `/catalog` の見積もり保存が、これまでcouple（お客様）ログイン限定だった制限を緩和。**見積編集権限を持つスタッフ（admin/manager/planner等）もログインすれば保存できる**ようにした
- `src/app/api/v1/catalog/public/route.ts`：viewerに`cases`配列を追加（`can(role,"quotes","edit")`のスタッフには`caseScopeWhere`でアクセス可能な案件一覧＝admin/managerは全件、それ以外は担当案件のみを返す。ラベルは「新郎・新婦（挙式日）」）
- `src/components/catalog-showcase.tsx`：見積もりページに案件選択セレクトを追加（スタッフでcaseId未確定の場合のみ表示）。保存ボタンの活性化は`saveCaseId = viewer?.caseId || pickedCaseId`で判定。保存後の「マイページで見る」リンクも選択した案件へ遷移
- 保存API（`/api/v1/cases/[id]/quotes/catalog-add`）は元々スタッフのquotes:edit権限＋canAccessCaseを許可済みだったため、サーバー側の変更は不要だった

## 直近セッションの実装（2026-07-09 その4・準備クエスト廃止）
- お客様ホーム＆案件詳細overviewタブに出ていた「🏰 結婚式の準備クエスト」ウィジェットを撤去（ユーザー判断で廃止）
- 削除箇所：`src/app/(app)/dashboard/page.tsx`・`src/app/(app)/cases/[id]/page.tsx` から `<PrepQuest>` と `buildQuest` 呼び出しを除去。未使用になった `src/components/prep-quest.tsx`・`src/lib/prep-quest.ts` を削除。signup route のコメント文言も追従修正
- 検証：`npx tsc --noEmit` 通過

## 直近セッションの実装（2026-07-09 その5・概要/打ち合わせ統合・料理カタログ同期・アレルギー席次統合）
- **概要タブと打ち合わせタブを統合**：`TABS`/`CUSTOMER_TABS`から`meetings`を削除し、打ち合わせ記録セクションを概要タブ内（タスク・宿題の下）に統合表示。進捗チェックリストの「打ち合わせ開始」ジャンプ先も`overview`に変更。`mobile-nav.tsx`の「📝打ち合わせ記録」リンクは概要に統合されたため削除
- **料理タブ「料理プランから選ぶ」をカタログデータと同期**：`meals-panel.tsx`が`/api/v1/templates?type=pack`（テンプレ一式）ではなく`/api/v1/catalog?category=catering`（見積・カタログページと同じCatalogItemデータ）から取得するよう変更。カタログの料理・飲物品目を品名キーワードでコース/ドリンク/その他に自動分類（`catalog-showcase.tsx`と同じ正規表現）。1品目＝1行（コース料理は分解せず単価のまま）。COURSES配列に「コース料理」「ドリンク」を追加（お品書き印刷の並び順にも反映、`print/[id]/[doc]/page.tsx`のORDER配列も同期）
- **アレルギーを席次表（Guest）に統合**：`prisma/schema.prisma`のGuestモデルに`allergy String?`追加。seating API（addGuest/updateGuest/restore/importGuests）が対応。`seating-panel.tsx`（PC版・選択中ゲストのツールバーに⚠ボタン、卓上チップに⚠マーク表示、CSVエクスポート/インポートにアレルギー列追加）・`mobile-seating.tsx`（かんたん入力の各ゲスト行に⚠ボタン）で編集可能に。**印刷物にも反映**：受付表（`doc=guests`）の備考列、配置図（`doc=seating`）の円卓/長机の名前チップ・卓別リスト・椅子席リストすべてに⚠マーク＋アレルギー内容を強調表示（赤字）。既存の「配慮事項」（MealRequirement・宗教対応/お子様/苦手食材含む）はmeals-panelの汎用フォームとして従来通り存続（allergyタイプも残置・後方互換）
- **注意**：スキーマ変更あり。ローカルは`npx prisma generate && npx prisma db push`実行済み。本番はserver-update.shのdb pushで反映
- 検証：`npx tsc --noEmit`通過

## 直近セッションの実装（2026-07-09 その6・タブ廃止「案件カード」化）
- **案件詳細ページのタブ切り替えを完全廃止**。`src/app/(app)/cases/[id]/page.tsx`を全面書き換え：`tab`クエリによる条件分岐レンダリングをやめ、**全セクションを1枚の長いカードとして常時表示**（打ち合わせ→見積→カタログ→発注→料理→席次表→進行表→楽曲→リソース→請求・入金の順）。「概要」という概念も廃止（ヒーロー・基本情報・チェックリスト・打ち合わせ記録は常設セクションとして先頭に統合済み＝前回セッションの統合がベースになった）
- タブ用データ取得（`tab === "orders"`等の条件付きfetch）を全廃し、**全データを`Promise.all`で常時並列取得**に変更（vendors/quoteCategories/relationOptions/paymentPlans/invoices/caseAtts/infoVenues等/customerMembers/meetingAtts/songAtts/menuItems/assignments等）
- ナビは「タブ」から**同一ページ内アンカーリンク**（`<a href="#quotes">`等）に変更。チェックリストの項目クリックも`#quotes`等へのスクロールジャンプに変更（ページ遷移なし）
- **お客様（couple）には引き続き発注・料理・リソース・請求セクションを非表示**（`isStaff`でラップ。従来のCUSTOMER_TABS制限と同じアクセス境界を維持）。お客様向けページは短く、スタッフ向けは全セクション表示の長いページになる
- **懸念点**：1ページに重量級クライアントコンポーネント（SeatingPanel・SongsPanel・RundownEditor・QuotesPanel等）が同時マウントされるため、初期表示の負荷が上がる可能性がある。動作確認では全セクションのAPI呼び出しは正常（200 OK）・エラーなしを確認したが、体感速度が問題になる場合は遅延マウント（IntersectionObserverでスクロール到達時にAPIフェッチ）の追加を検討
- 検証：`npx tsc --noEmit`通過。ローカルでデモアカウント（管理者）で新規案件を作成し、`preview_inspect`で全セクション（見積・席次表・請求等）が正しい順序・位置でレンダリングされることを確認（スクリーンショット機能はタイムアウトしたため代替検証）。本番デプロイ後、pm2エラーログに新規エラーなしを確認（既知の「stale Server Action」ノイズのみ）

## 直近セッションの実装（2026-07-09 その7・カタログベースのテンプレート構築＋会場サイズ入力）
- **会場マスタにサイズ（間口×奥行・m）入力欄を追加**：`venues-admin.tsx`（追加フォーム＋名称変更フォームの両方）・API（`admin/venues/route.ts`はPOSTで既に対応済みだったが`[id]/route.ts`のPATCHが未対応だったため追加）。登録すると席次表キャンバスが実寸比になる（既存の`widthM`/`depthM`スキーマ・`seating`ルートのロジックは元々存在、UIが無かっただけ）
- **「カタログで作った見積もりをテンプレ登録」機能**：見積タブの最新Ver（確認済/承認済）に「📥 テンプレとして保存」ボタンを追加（`quotes-panel.tsx`）。`POST /api/v1/cases/[id]/save-as-template`（新規route）が案件の見積・料理・進行表（司会台本含む）・リソース・席次卓サイズから`TemplatePack`を逆生成しテンプレ登録。`src/lib/template-pack.ts`に`buildPackFromCase`・`stripNameTokens`（実名→{新郎}{新婦}トークンへの逆置換）・`stripLabelNumber`（スタッフ行の①②③連番除去）を追加
- **カタログ実データからテンプレ一式を自動生成**：`scripts/generate-templates-from-catalog.cjs`（新規）。カタログの挙式・会場・料理・衣装・装花・引出物・撮影・司会・音響・印刷物品目を組み合わせ、**ブライダル15パターン＋宴会7パターン（式典・ディナーショー含む）**の計22テンプレートを自動登録。品目名・価格はカタログと完全一致（同期ズレなし）。司会台本・進行の流れは定番シーンライブラリ（開式の辞・入場・誓いの言葉・乾杯・歓談・ケーキ入刀・中座・再入場・花束贈呈・送賓／宴会は開宴〜閉宴／ディナーショーはライブステージ演出）＋{新郎}{新婦}トークン付き定型文を組み合わせて自動生成。同名スキップで何度でも再実行安全。本番で22件生成・全件バリデーション通過（parsePack検証OK）を確認
- **既存のAI JSON貼り付け方式（📥AIテンプレ読み込み）は併存**（廃止していない）。他社カタログや特殊テンプレを作る際はそちらも引き続き利用可
- 検証：`npx tsc --noEmit`通過。本番で生成した「ブライダル01」の中身を確認：見積13品目（カタログと同名同価格）・進行14演目・司会台本に{新郎}{新婦}トークン正しく挿入

