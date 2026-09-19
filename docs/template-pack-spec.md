# CEREMOS テンプレ一式（pack）作成要件

AI（ChatGPT・Claude・Gemini等）や手作業で作成したJSONを、管理画面「テンプレート」→「📥 テンプレ一式（JSON）を読み込み」で登録します。
1つのJSONに **見積・料理・進行台本（司会台本込み）・当日リソース（STAFF/設備）・ウィザード適合条件** をまとめた「テンプレ一式」です。

## 基本ルール

- 形式は **JSON 1個**。複数プランをまとめる場合は **配列** `[ {...}, {...} ]`
- `kind` は `"ceremos-template-pack"`
- **必須**: `name`（テンプレ名）＋ `quote` / `menu` / `rundown` のいずれか1つ以上に items があること
- `category`: `"bridal"`（ブライダル）/ `"banquet"`（宴会・式典）/ `"other"`
- 金額はすべて **日本円の整数**

## 各セクションの要件

### 💰 quote（見積）
- `items[].name` 必須
- `category` は次の15種: `ceremony / venue / catering / florist / dress / beauty / photo / video / mc / audio / print / gift / service / discount / other`
- 小計 = `qty × unitPrice`。人数分の項目は qty=人数にする（例: コース料理 × 60名 → qty:60）
- **人数連動**: 1名あたり品目には `perGuest` を付ける（1=人数分、0.5=2名に1つ など）。適用時に**案件の予定人数で qty と品名の「◯名/◯セット」が自動調整**される。品名に「× ◯名」があれば perGuest 省略でも1名あたり扱い
- 値引き・特典は `category:"discount"` で **マイナス金額**

### 🍽 menu（料理コース）
- `items[].name` 必須
- `course` は: 乾杯酒 / アミューズ / 前菜 / スープ / 魚料理 / お口直し / 肉料理 / デザート / パン・飲物 / その他
- `cost`=原価・`price`=売値（お品書き印刷と原価管理に使用）

### 📋 rundown（進行表・司会台本）
- `items[].title` 必須
- `durationMin`（**実所要分**）を必ず入れる。時刻は先頭時刻から自動再計算される
- `startTime` で先頭時刻を指定可（例 "10:30"。省略時は案件側で調整）
- `mcScript` = 司会がそのまま読み上げられる自然な日本語の台本（各演目2〜6文）
- `roles` = 担当のカンマ区切り: `mc, audio, catering, service, photo`
- 文中の `{新郎} {新婦} {新郎姓} {新婦姓}` は適用時に実名へ自動置換
- 適用時、全演目に曲枠（曲未定）が自動作成され、楽曲タブで選曲する

### 👥 resources（当日リソース）
- `staff` / `equipment` の各行: `label` ＋ `startOffsetMin` / `endOffsetMin`
  - 開催の **開始/終了時刻からの相対分**。負の値=前（例: startOffsetMin:-120 → 開始2時間前から）
- **人数連動**: スタッフ行に `perGuests`（ゲスト◯名につき1名）を付けると、案件の人数に応じて ①②③… と必要人数分の行に自動展開される（例: perGuests:20 × 60名 → 3名）
- `useRooms: true` で控室・厨房を会場マスタから自動割当

### 🧭 wizard（ウィザードのおすすめ判定）
- `styles`: `chapel / garden / night / wakon / small / casual / formal / party / ceremony / dinnershow`
- `guestMin` / `guestMax`: 対応人数レンジ
- `budgetManMin` / `budgetManMax`: 対応予算レンジ（**万円**）
- `timeSlots`: `day`（昼）/ `evening`（夕方）/ `night`（夜）
- お客様・プランナーのウィザード回答とマッチングされ、スコア順におすすめ表示される

### 🪑 seating（席次）
- `perTable`: 1卓あたり人数（**案件の予定人数**÷perTableで円卓＋高砂を自動レイアウト）

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

## スキーマ例

※ コメント（`//`）は説明用。実際のJSONには書かないこと。

```jsonc
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
```

---
最終更新: 2026-07-06 ／ CEREMOS
