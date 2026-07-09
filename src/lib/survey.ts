// 顧客セルフ登録のプロフィール項目＋アンケート30問（式場ヒアリングの定番）
// アンケートはすべて任意。回答は User.profileJson に保存され、承認画面・案件作成の参考に使う。

export type SurveyQ = { key: string; q: string; type: "select" | "text"; opts?: string[] };

export const GENDER_OPTS = ["男性", "女性", "その他・回答しない"];
export const CHILDREN_OPTS = ["なし", "あり"];
export const EVENT_TYPE_OPTS: [string, string][] = [
  ["wedding", "ブライダル（挙式・披露宴）"],
  ["party", "宴会（懇親会・同窓会・祝賀会など）"],
  ["other", "その他（式典・イベントなど）"],
];

export const SURVEY_30: SurveyQ[] = [
  { key: "timing", q: "1. ご希望の開催時期", type: "select", opts: ["3ヶ月以内", "半年以内", "1年以内", "1年以上先", "未定"] },
  { key: "dayOfWeek", q: "2. ご希望の曜日", type: "select", opts: ["土曜", "日曜", "祝日", "平日でもOK", "未定"] },
  { key: "timeSlot", q: "3. ご希望の時間帯", type: "select", opts: ["午前", "午後", "夕方〜ナイト", "未定"] },
  { key: "guests", q: "4. 予想されるゲスト人数", type: "select", opts: ["〜30名", "31〜60名", "61〜90名", "91名以上", "未定"] },
  { key: "budget", q: "5. ご予算のイメージ", type: "select", opts: ["〜200万円", "200〜300万円", "300〜400万円", "400万円以上", "未定"] },
  { key: "style", q: "6. 挙式スタイルのご希望", type: "select", opts: ["教会式", "人前式", "神前式", "挙式なし（会食のみ）", "未定"] },
  { key: "visits", q: "7. 式場見学は何件目ですか？", type: "select", opts: ["初めて", "2〜3件目", "4件以上"] },
  { key: "otherVenues", q: "8. 他にご検討中の会場", type: "text" },
  { key: "registryDate", q: "9. ご入籍（予定）日", type: "text" },
  { key: "howMet", q: "10. おふたりの出会い", type: "text" },
  { key: "propose", q: "11. プロポーズのエピソード", type: "text" },
  { key: "rings", q: "12. 婚約指輪・結婚指輪", type: "select", opts: ["準備済み", "検討中", "未定"] },
  { key: "families", q: "13. 両家顔合わせ", type: "select", opts: ["済んでいる", "これから予定", "未定"] },
  { key: "partnerName", q: "14. パートナーのお名前", type: "text" },
  { key: "partnerAge", q: "15. パートナーのご年齢", type: "text" },
  { key: "jobs", q: "16. おふたりのご職業", type: "text" },
  { key: "guestsFrom", q: "17. 遠方からのゲスト", type: "select", opts: ["ほぼ地元", "半々くらい", "遠方が多い"] },
  { key: "kidsGuests", q: "18. お子様ゲスト", type: "select", opts: ["いる", "いない", "未定"] },
  { key: "elderly", q: "19. ご年配ゲストへの配慮（バリアフリー等）", type: "select", opts: ["必要", "不要", "未定"] },
  { key: "foodPriority", q: "20. お料理の重視度", type: "select", opts: ["最重視", "重視", "ふつう"] },
  { key: "allergy", q: "21. アレルギー・食の配慮（わかる範囲で）", type: "text" },
  { key: "performance", q: "22. やってみたい演出", type: "text" },
  { key: "dress", q: "23. 衣装のこだわり・着たいドレス", type: "text" },
  { key: "photoVideo", q: "24. 写真・映像の希望", type: "select", opts: ["しっかり残したい", "最低限でよい", "未定"] },
  { key: "spendOn", q: "25. 予算をかけたいところ", type: "select", opts: ["料理", "衣装", "装花・会場装飾", "写真・映像", "演出", "未定"] },
  { key: "saveOn", q: "26. 節約したいところ", type: "select", opts: ["料理", "衣装", "装花・会場装飾", "写真・映像", "演出", "特になし"] },
  { key: "afterParty", q: "27. 二次会のご予定", type: "select", opts: ["あり", "なし", "未定"] },
  { key: "honeymoon", q: "28. ハネムーンのご予定", type: "select", opts: ["あり", "なし", "未定"] },
  { key: "source", q: "29. 当式場を知ったきっかけ", type: "select", opts: ["SNS", "ご紹介", "ネット検索", "雑誌・広告", "ブライダルフェア", "その他"] },
  { key: "concerns", q: "30. その他ご要望・ご不安なこと", type: "text" },
];

export type CustomerProfile = {
  age?: string; gender?: string; birthDate?: string; hasChildren?: string;
  eventType?: string; // wedding / party / other
  survey?: Record<string, string>;
};
