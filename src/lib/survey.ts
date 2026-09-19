// 顧客プロフィール項目＋ヒヤリング10問（式場ヒアリングの定番）
// ヒヤリングはすべて任意。回答は User.profileJson に保存され、案件ページでスタッフに共有される。

export type SurveyQ = { key: string; q: string; type: "select" | "text"; opts?: string[] };

export const GENDER_OPTS = ["男性", "女性", "その他・回答しない"];
export const CHILDREN_OPTS = ["なし", "あり"];
export const EVENT_TYPE_OPTS: [string, string][] = [
  ["wedding", "ブライダル（挙式・披露宴）"],
  ["party", "宴会（懇親会・同窓会・祝賀会など）"],
  ["other", "その他（式典・イベントなど）"],
];

// ブライダル用（10問）— 登録直後のヒヤリングページで表示
export const WEDDING_SURVEY: SurveyQ[] = [
  { key: "timing", q: "1. ご希望の開催時期", type: "select", opts: ["3ヶ月以内", "半年以内", "1年以内", "1年以上先", "未定"] },
  { key: "dayOfWeek", q: "2. ご希望の曜日", type: "select", opts: ["土曜", "日曜", "祝日", "平日でもOK", "未定"] },
  { key: "timeSlot", q: "3. ご希望の時間帯", type: "select", opts: ["午前", "午後", "夕方〜ナイト", "未定"] },
  { key: "guests", q: "4. 予想されるゲスト人数", type: "select", opts: ["〜30名", "31〜60名", "61〜90名", "91名以上", "未定"] },
  { key: "budget", q: "5. ご予算のイメージ", type: "select", opts: ["〜200万円", "200〜300万円", "300〜400万円", "400万円以上", "未定"] },
  { key: "style", q: "6. 挙式スタイルのご希望", type: "select", opts: ["教会式", "人前式", "神前式", "挙式なし（会食のみ）", "未定"] },
  { key: "visits", q: "7. 式場見学は何件目ですか？", type: "select", opts: ["初めて", "2〜3件目", "4件以上"] },
  { key: "foodPriority", q: "8. お料理の重視度", type: "select", opts: ["最重視", "重視", "ふつう"] },
  { key: "photoVideo", q: "9. 写真・映像の希望", type: "select", opts: ["しっかり残したい", "最低限でよい", "未定"] },
  { key: "concerns", q: "10. その他ご要望・ご不安なこと", type: "text" },
];

// 宴会・式典・イベント用（10問）— 登録直後のヒヤリングページで表示
export const BANQUET_SURVEY: SurveyQ[] = [
  { key: "timing", q: "1. ご希望の開催時期", type: "select", opts: ["3ヶ月以内", "半年以内", "1年以内", "1年以上先", "未定"] },
  { key: "dayOfWeek", q: "2. ご希望の曜日", type: "select", opts: ["土曜", "日曜", "祝日", "平日", "未定"] },
  { key: "timeSlot", q: "3. ご希望の時間帯", type: "select", opts: ["昼", "夕方", "ナイト", "未定"] },
  { key: "guests", q: "4. 予想される人数", type: "select", opts: ["〜30名", "31〜60名", "61〜90名", "91名以上", "未定"] },
  { key: "budget", q: "5. ご予算のイメージ（総額）", type: "select", opts: ["〜50万円", "50〜100万円", "100〜200万円", "200万円以上", "未定"] },
  { key: "purpose", q: "6. 会の目的・種類", type: "select", opts: ["周年記念・式典", "歓送迎会・懇親会", "表彰式・祝賀会", "同窓会・OB会", "その他"] },
  { key: "visits", q: "7. 会場見学は何件目ですか？", type: "select", opts: ["初めて", "2〜3件目", "4件以上"] },
  { key: "foodPriority", q: "8. お料理の重視度", type: "select", opts: ["最重視", "重視", "ふつう"] },
  { key: "avNeeds", q: "9. 音響・映像演出の希望", type: "select", opts: ["しっかり用意したい", "最低限でよい", "未定"] },
  { key: "concerns", q: "10. その他ご要望・ご不安なこと", type: "text" },
];

// 各画面のラベル表示用（両方を合わせた辞書。実際に出す質問セットは案件種別で選ぶ）
export const SURVEY_ALL: SurveyQ[] = [...WEDDING_SURVEY, ...BANQUET_SURVEY];

export type CustomerProfile = {
  age?: string; gender?: string; birthDate?: string; hasChildren?: string;
  eventType?: string; // wedding / party / other
  survey?: Record<string, string>;
};
