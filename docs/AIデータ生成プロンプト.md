# CEREMOS 初期データ生成プロンプト（AIに貼り付ける用）

このファイルの「ここからAIへ」以降を ChatGPT / Claude / Gemini などにそのまま貼り付けてください。
出力されたJSONを、CEREMOSの **管理 → テンプレート → 「📥 AIテンプレ読み込み」** に貼り付ければ、
**テンプレ一式（見積・料理・進行台本・リソース）＋カタログ（業者・品目・写真）** が1回で登録されます。
入力画面はこの1か所だけです。

- 最新のプロンプトはアプリ内の「🤖 AIプロンプトをコピー」ボタンでも取得できます（内容は同じ）
- 写真は**全品目に自動で入ります**。品名・カテゴリから品目に合った絵文字＋上品な配色の写真が自動生成されるため、AI側で画像を用意する必要はありません（imageSvg・emoji・color は任意）
- 見積・料理・カタログの価格は同期するようプロンプトで指示済みです
- 読み込み側は寛容です。AIの出力にコードブロック（```）・コメント・末尾カンマ・前後の説明文が混ざっていても、自動で取り除いて読み込みます（それでも上の出力ルールを守ると確実です）

---

## ここからAIへ

あなたは日本の結婚式場・宴会場のベテランプランナーです。
式場ERP「CEREMOS」に読み込む「テンプレート一式＋カタログ（JSON）」を作成してください。

# 出力ルール（厳守／これを守らないと読み込めません）
- 出力は **有効なJSONのみ**。先頭・末尾に説明文やあいさつを付けない。コードブロック（```）で囲まない。
- 全体を **1つのJSON配列** [ {...}, {...} ] にする。テンプレ一式（各プラン）とカタログ（1個）を同じ配列に入れる。
- **コメント（// や /* */）は絶対に書かない**（下のスキーマ例のコメントは説明用。出力には残さない）。
- **末尾カンマを付けない**（配列・オブジェクトの最後の要素の後にカンマを置かない）。
- 引用符は必ず **半角のダブルクォート "**。全角の “ ” や 半角シングル ' をキー/値の区切りに使わない。
- 文字列の中で改行したいときは \n を使う（生の改行を入れない）。文字列内の " は \" にする。
- **途中で切らず、最後まで完全なJSONを出力する**。長くなりすぎる場合は各品目の imageSvg を省略してよい（写真は読み込み時に自動生成される）。
- 文字列内の {新郎} {新婦} {新郎姓} {新婦姓} は実名に自動置換されるトークンなのでそのまま使う。
- 金額は日本円の整数（unitPrice/cost/price/カタログprice）。数量×単価で合計される。
- 人数分の品目（料理・ドリンク・引出物・ペーパーアイテム等）には必ず perGuest を付ける（適用時に案件の人数で自動調整されるため）。サービススタッフには perGuests を付ける。
- 進行表は durationMin（実所要分）を必ず入れる。時刻は先頭から自動再計算される。
- mcScript（司会台本）は実際に読み上げられる自然な日本語で、各演目2〜6文程度。
- 料理は原価(cost)と売値(price)の両方を現実的な水準で入れる。

# 価格の同期（最重要）
テンプレの見積・料理・カタログの3つは同じ商品を指すため、価格・名称を必ず一致させる：
- 見積(quote)の料理品目の unitPrice ＝ 料理(menu)の売値(price)の1名合計
- カタログの式場品目（会場費・挙式料・コース料理）は、テンプレ見積の同名品目と同じ名称・同じ価格
- カタログのドレス・引出物・装花などの定価は、テンプレ見積で使う単価と同じ水準

# JSONスキーマ①：テンプレ一式（プランごとに1個。コメントは説明。実際の出力にコメントは書かない）
{
  "kind": "ceremos-template-pack",
  "version": 1,
  "name": "ガーデンウェディング（60名・約390万）",
  "category": "bridal",            // "bridal"（ブライダル）| "banquet"（宴会・式典）| "other"
  "description": "ガーデン挙式＋披露宴。デザートビュッフェ・バルーンリリース付き",
  "wizard": {                       // ウィザードのおすすめ判定に使う適合条件
    "styles": ["garden", "casual"], // chapel/garden/night/wakon/small/casual/formal/party/ceremony/dinnershow
    "guestMin": 40, "guestMax": 80,
    "budgetManMin": 300, "budgetManMax": 450,   // 万円
    "timeSlots": ["day"]            // day（昼）/ evening（夕方）/ night（夜）
  },
  "quote": { "items": [             // 見積明細。category: ceremony/venue/catering/florist/dress/beauty/photo/video/mc/audio/print/gift/service/discount/other
    { "name": "ガーデン挙式料（人前式）", "category": "ceremony", "qty": 1, "unitPrice": 250000 },
    { "name": "コース料理（9品） × 60名", "category": "catering", "qty": 60, "unitPrice": 17800, "perGuest": 1 },
    { "name": "引出物 × 30セット", "category": "gift", "qty": 30, "unitPrice": 6000, "perGuest": 0.5 }
    // perGuest: 1名あたり品目の係数。適用時に案件の人数で qty と品名の「◯名/◯セット」が自動調整される
    //（1=人数分、0.5=2名に1つ。品名に「× ◯名」があれば省略しても1名あたり扱い）
  ]},
  "menu": { "items": [              // 料理コース。course: 乾杯酒/アミューズ/前菜/スープ/魚料理/お口直し/肉料理/デザート/パン・飲物/その他
    { "course": "前菜", "name": "季節野菜のテリーヌ", "desc": "彩り野菜と海の幸", "cost": 800, "price": 2200 }
  ]},
  "rundown": {                      // 進行表。durationMinが実所要分。mcScriptは司会の台本
    "startTime": "10:30",
    "items": [
      { "time": "10:30", "title": "ガーデン挙式（人前式）", "durationMin": 30, "roles": "mc,audio,photo",
        "note": "雨天時はチャペルへ変更", "mcScript": "皆さま、ようこそ…{新郎}さん、{新婦}さんの人前式を…" }
    ]
  },
  "resources": {                    // 当日リソース。offset分は開始/終了時刻からの相対（負=前）
    "useRooms": true,               // 控室・厨房の自動割当（会場マスタから）
    "staff": [
      { "label": "キャプテン（現場統括）", "startOffsetMin": -120, "endOffsetMin": 60 },
      { "label": "サービススタッフ（配膳）", "startOffsetMin": -60, "endOffsetMin": 30, "perGuests": 20 }
      // perGuests: ゲスト◯名につきスタッフ1名（人数に応じて①②…と自動展開）
    ],
    "equipment": [
      { "label": "ガーデン音響セット", "startOffsetMin": -180, "endOffsetMin": 60 }
    ]
  },
  "seating": { "perTable": 8 }      // 席次の1卓あたり人数
}

# JSONスキーマ②：カタログ（配列の最後に1個だけ入れる）
{
  "kind": "ceremos-catalog",
  "version": 1,
  "vendors": [                       // 出店する業者（既存名は再利用）。出店は1カテゴリ最大3店舗
    { "name": "ドレスサロン美翔", "category": "dress" }
    // category: dress/florist/catering/audio/mc/photo/video/gift/print/beauty
  ],
  "items": [
    { "vendor": "ドレスサロン美翔",   // 省略 or null = 式場自身の品目（会場費・自社料理など）
      "category": "dress",           // 見積部門: venue/catering/dress/gift/florist/beauty/photo/video/mc/audio/print/other
      "name": "Aラインドレス「クレール」",
      "desc": "オフショルダー・ロングトレーン",
      "price": 250000,               // 定価（お客様はこの価格でのみ見積に追加できる）
      "imageSvg": "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600'>…</svg>"
      // 写真：800x600のSVGコード。省略時は emoji/color1/color2 から自動生成
      // <script>・イベント属性・外部URL参照は禁止（読み込み時に拒否される）
    },
    { "category": "venue", "name": "披露宴会場A 利用料（4時間）", "price": 200000, "emoji": "🏛", "color1": "#e8d9c4", "color2": "#b9976d" }
  ]
}

# カタログの写真（自動で全品目に入ります）
- 写真は読み込み時に**全品目へ自動生成される**ため、imageSvg は基本 **省略してよい**（品名・カテゴリに合った絵文字と上品な色の写真が自動で付く）。JSONを軽くするため省略推奨。
- こだわりたい品目だけ、以下のどちらかを指定：
  - emoji ＋ color1 ＋ color2（#RRGGBB）… 手軽。指定した見た目で自動生成される
  - imageSvg（800x600のSVGコード・任意）… グラデ背景＋図形/絵文字＋品目名（日本語フォント 'Hiragino Kaku Gothic ProN','Noto Sans JP'）。<script>・onXxx属性・外部URL参照は禁止・1個60KB以内

# 作成する内容
以下のプランを作成してください（必要に応じて書き換えてください）：
1. ブライダル標準（チャペル挙式＋披露宴・60名・約350万・昼）styles:["chapel","formal"]
2. ガーデンウェディング（60名・約390万・昼）styles:["garden","casual"]
3. ナイトウェディング（50名・約330万・夜）styles:["night","casual"]
4. 和婚・神前式（40名・約300万・昼）styles:["wakon","formal"]
5. 少人数・家族会食（15名・約120万・昼）styles:["small"]
6. 二部制（挙式披露宴＋友人パーティ・80名・約450万）styles:["chapel","casual"]
7. 宴会・企業パーティ（80名・約150万・夜）category:"banquet" styles:["party"]
8. 式典・表彰式（100名・約120万・昼）category:"banquet" styles:["ceremony"]
9. ディナーショー（120名・約250万・夜）category:"banquet" styles:["dinnershow"]

各プランに 見積(20〜35品目・特典/値引き行含む)・料理(8〜12品)・進行表(12〜18演目・司会台本つき)・
リソース(STAFF 4〜8名・設備 3〜6件) をすべて入れてください。

カタログ（配列の最後に1個）には以下を入れてください：
- 式場品目（vendor省略）：会場費・チャペル挙式料・コース料理（テンプレ見積と同名・同価格）・フリードリンク・その他
- ドレス店2店舗（各3〜4品目）・引出物店1店舗（3品目）・装花店1店舗（3品目）
- 写真は自動で全品目に入るので imageSvg は不要（emoji/color1/color2 も任意）。品目名は具体的に付けること（写真の絵文字が品名から自動選択されるため）
