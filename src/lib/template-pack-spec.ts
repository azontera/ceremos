// テンプレ一式（pack）の作成要件ドキュメント（Markdown）
// 管理画面の「⬇ 要件MD」ダウンロードと docs/template-pack-spec.md の元データ
import { PACK_JSON_SCHEMA, CATALOG_JSON_SCHEMA } from "./template-pack-prompt";

export function buildSpecMarkdown(): string {
  return `# CEREMOS テンプレ一式（pack）作成要件

AI（ChatGPT・Claude・Gemini等）や手作業で作成したJSONを、管理画面「テンプレート」→「📥 AIテンプレ読み込み」で登録します。
1つのJSONに **見積・料理・進行台本（司会台本込み）・当日リソース（STAFF/設備）・ウィザード適合条件** をまとめた「テンプレ一式」です。

## 基本ルール

- 形式は **JSON 1個**。複数プランをまとめる場合は **配列** \`[ {...}, {...} ]\`
- \`kind\` は \`"ceremos-template-pack"\`
- **必須**: \`name\`（テンプレ名）＋ \`quote\` / \`menu\` / \`rundown\` のいずれか1つ以上に items があること
- \`category\`: \`"bridal"\`（ブライダル）/ \`"banquet"\`（宴会・式典）/ \`"other"\`
- 金額はすべて **日本円の整数**

## 各セクションの要件

### 💰 quote（見積）
- \`items[].name\` 必須
- \`category\` は次の15種: \`ceremony / venue / catering / florist / dress / beauty / photo / video / mc / audio / print / gift / service / discount / other\`
- 小計 = \`qty × unitPrice\`。人数分の項目は qty=人数にする（例: コース料理 × 60名 → qty:60）
- **人数連動**: 1名あたり品目には \`perGuest\` を付ける（1=人数分、0.5=2名に1つ など）。適用時に**案件の予定人数で qty と品名の「◯名/◯セット」が自動調整**される。品名に「× ◯名」があれば perGuest 省略でも1名あたり扱い
- 値引き・特典は \`category:"discount"\` で **マイナス金額**

### 🍽 menu（料理コース）
- \`items[].name\` 必須
- \`course\` は: 乾杯酒 / アミューズ / 前菜 / スープ / 魚料理 / お口直し / 肉料理 / デザート / パン・飲物 / その他
- \`cost\`=原価・\`price\`=売値（お品書き印刷と原価管理に使用）

### 📋 rundown（進行表・司会台本）
- \`items[].title\` 必須
- \`durationMin\`（**実所要分**）を必ず入れる。時刻は先頭時刻から自動再計算される
- \`startTime\` で先頭時刻を指定可（例 "10:30"。省略時は案件側で調整）
- \`mcScript\` = 司会がそのまま読み上げられる自然な日本語の台本（各演目2〜6文）
- \`roles\` = 担当のカンマ区切り: \`mc, audio, catering, service, photo\`
- 文中の \`{新郎} {新婦} {新郎姓} {新婦姓}\` は適用時に実名へ自動置換
- 適用時、全演目に曲枠（曲未定）が自動作成され、楽曲タブで選曲する

### 👥 resources（当日リソース）
- \`staff\` / \`equipment\` の各行: \`label\` ＋ \`startOffsetMin\` / \`endOffsetMin\`
  - 開催の **開始/終了時刻からの相対分**。負の値=前（例: startOffsetMin:-120 → 開始2時間前から）
- **人数連動**: スタッフ行に \`perGuests\`（ゲスト◯名につき1名）を付けると、案件の人数に応じて ①②③… と必要人数分の行に自動展開される（例: perGuests:20 × 60名 → 3名）
- \`useRooms: true\` で控室・厨房を会場マスタから自動割当

### 🧭 wizard（ウィザードのおすすめ判定）
- \`styles\`: \`chapel / garden / night / wakon / small / casual / formal / party / ceremony / dinnershow\`
- \`guestMin\` / \`guestMax\`: 対応人数レンジ
- \`budgetManMin\` / \`budgetManMax\`: 対応予算レンジ（**万円**）
- \`timeSlots\`: \`day\`（昼）/ \`evening\`（夕方）/ \`night\`（夜）
- お客様・プランナーのウィザード回答とマッチングされ、スコア順におすすめ表示される

### 🪑 seating（席次）
- \`perTable\`: 1卓あたり人数（**案件の予定人数**÷perTableで円卓＋高砂を自動レイアウト）

### 👨‍👩‍👧 人数連動のまとめ
適用時は案件の「予定人数」を基準に、次が自動で変わる:
見積の数量（perGuest / 「× ◯名」品目）／席次の卓数／サービススタッフの人数（perGuests）。
料理は1名あたり単価のため品目は変わらない（数量は見積側で人数反映）。

## 適用のルール（重要）

- 適用は**コピー方式**。適用後にテンプレを編集しても案件には**同期しない**（逆も同じ）
- 見積: 常に**新バージョン（下書き）**を作成
- 料理・席次・リソース: 案件に**既存データが無いときのみ**作成
- 進行表: **未編集**（司会台本なし・全曲未定）のときのみ置換
- 手配リスト（発注）: 発注が無いときのみ、見積の部門から自動作成（納期=開催14日前）

## 🛍 カタログ（業者・品目・写真）— 同じ貼り付け欄で一括読み込み

テンプレ一式と**同じJSON配列**に \`kind: "ceremos-catalog"\` のオブジェクトを1個入れると、
業者（出店）・カタログ品目・写真まで一括で登録される。

- \`vendors[]\`: 業者名＋カテゴリ（\`dress / florist / catering / audio / mc / photo / video / gift / print / beauty\`）。既存の同名業者は再利用。**出店は1カテゴリ最大3店舗**
- \`items[]\`: \`vendor\`（業者名。**省略=式場自身の品目**＝会場費・自社料理など）・\`category\`（見積部門）・\`name\`・\`desc\`・\`price\`（**定価**。お客様はこの価格でのみ見積に追加できる。値引きはプランナーが見積編集で）
- 同じ業者×品目名は**上書き**（何度読み込んでも重複しない）
- **写真**: **全品目に自動で入る**。品名・カテゴリから品目に合った絵文字＋上品な配色の写真が自動生成されるため、通常は画像指定不要。
  こだわる品目だけ \`emoji / color1 / color2\`（手軽）または \`imageSvg\`（800×600のSVGコード。\`<script>\`・イベント属性・外部URL参照は禁止・60KB以内）を指定
- **価格の同期**: カタログの式場品目（会場費・コース料理）はテンプレ見積の同名品目と**同じ名称・同じ価格**にすること（見積・料理・カタログの3つが同じ商品を指すため）

## スキーマ例

※ コメント（\`//\`）は説明用。実際のJSONには書かないこと。

### ① テンプレ一式（プランごとに1個）

\`\`\`jsonc
${PACK_JSON_SCHEMA}
\`\`\`

### ② カタログ（配列の最後に1個）

\`\`\`jsonc
${CATALOG_JSON_SCHEMA}
\`\`\`

---
最終更新: 2026-07-08 ／ CEREMOS
`;
}
