// AIヒヤリング（診断型）— リニューアル仕様書 4章
// 「楽しんで受けられる診断」: 1問1画面・章ごとにミニ結果・MBTI/生年月日系/相性診断。
// 診断は接客のための演出（娯楽）であり、結果文面にもその旨を明記する。
// 回答は Case.hearingJson に保存し、診断・攻略変換はすべてこのファイルのロジックで行う（AI不要）。
// AIが必要なのはテンプレ一式（進行表・台本・見積）の生成のみ → hearing/md ルートが生成依頼MDを出力。

export type HearingQuestion = {
  id: string;
  chapter: number;
  text: string;
  type: "choice" | "text" | "date";
  options?: { value: string; label: string }[];
  axis?: "EI" | "SN" | "TF" | "JP"; // MBTI設問のみ。選択肢valueは axis の1文字目/2文字目
};

export type HearingChapter = { num: number; title: string; desc: string };

// ============ 婚礼用（新郎・新婦それぞれが回答／約30問） ============

export const WEDDING_CHAPTERS: HearingChapter[] = [
  { num: 1, title: "おふたりのこと", desc: "まずはあなたのことを教えてください" },
  { num: 2, title: "性格診断", desc: "直感で選んでください（12問）" },
  { num: 3, title: "好み・価値観", desc: "理想の一日のイメージを聞かせてください" },
  { num: 4, title: "ゲストとご予算", desc: "最後に当日の規模感について" },
];

const MBTI_Q = (id: string, text: string, axis: "EI" | "SN" | "TF" | "JP", a: string, b: string): HearingQuestion => ({
  id, chapter: 2, text, type: "choice", axis,
  options: [
    { value: axis[0], label: a },
    { value: axis[1], label: b },
  ],
});

export const WEDDING_QUESTIONS: HearingQuestion[] = [
  // ---- 第1章 おふたりのこと ----
  { id: "birthDate", chapter: 1, text: "お誕生日を教えてください", type: "date" },
  {
    id: "meet", chapter: 1, text: "おふたりの出会いは？", type: "choice",
    options: [
      { value: "school", label: "学生時代から" }, { value: "work", label: "職場・仕事" },
      { value: "friend", label: "友人の紹介" }, { value: "app", label: "アプリ・ネット" },
      { value: "other", label: "その他・ヒミツ" },
    ],
  },
  {
    id: "propose", chapter: 1, text: "結婚式で一番大切にしたいのは？", type: "choice",
    options: [
      { value: "guests", label: "ゲストへの感謝" }, { value: "family", label: "家族との時間" },
      { value: "couple", label: "ふたりらしさ" }, { value: "memory", label: "一生の思い出づくり" },
    ],
  },
  { id: "story", chapter: 1, text: "おふたりの馴れ初めを少しだけ（任意・進行や台本づくりの参考にします）", type: "text" },

  // ---- 第2章 性格診断（MBTI簡易12問） ----
  MBTI_Q("m1", "初対面の集まりでは？", "EI", "自分から話しかけるほう", "話しかけられるのを待つほう"),
  MBTI_Q("m2", "休日のリフレッシュは？", "EI", "友達と会って充電", "ひとり時間で充電"),
  MBTI_Q("m3", "写真を撮られるのは？", "EI", "けっこう好き", "ちょっと照れる"),
  MBTI_Q("m4", "旅行の楽しみ方は？", "SN", "実際の景色・食・体験", "行く前の妄想と計画"),
  MBTI_Q("m5", "説明を聞くときは？", "SN", "具体例があると分かる", "全体像から掴みたい"),
  MBTI_Q("m6", "新しいものに対しては？", "SN", "定番・実績を選ぶ", "新しい・珍しいものに惹かれる"),
  MBTI_Q("m7", "友達の相談には？", "TF", "解決策を一緒に考える", "まず気持ちに寄り添う"),
  MBTI_Q("m8", "何かを選ぶ基準は？", "TF", "納得できる理由・コスパ", "ときめき・フィーリング"),
  MBTI_Q("m9", "意見がぶつかったら？", "TF", "筋を通して話し合う", "空気と関係を大事にする"),
  MBTI_Q("m10", "旅行のスタイルは？", "JP", "しっかり計画派", "行き当たりばったり派"),
  MBTI_Q("m11", "締め切りに対しては？", "JP", "余裕を持って終わらせる", "追い込まれてから本気"),
  MBTI_Q("m12", "部屋の状態は？", "JP", "だいたい片付いている", "散らかっててもどこに何があるか分かる"),

  // ---- 第3章 好み・価値観 ----
  {
    id: "vibe", chapter: 3, text: "理想の式の雰囲気は？", type: "choice",
    options: [
      { value: "classic", label: "王道・上品・ホテルライク" }, { value: "natural", label: "ナチュラル・ガーデン" },
      { value: "wa", label: "和・伝統" }, { value: "casual", label: "カジュアル・パーティ" },
      { value: "photogenic", label: "とにかく写真映え" },
    ],
  },
  {
    id: "food", chapter: 3, text: "お料理へのこだわりは？", type: "choice",
    options: [
      { value: "high", label: "料理が一番大事！" }, { value: "mid", label: "美味しければOK" },
      { value: "low", label: "他を優先したい" },
    ],
  },
  {
    id: "photo", chapter: 3, text: "写真・映像は？", type: "choice",
    options: [
      { value: "high", label: "全部残したい（前撮りも）" }, { value: "mid", label: "当日はしっかり残したい" },
      { value: "low", label: "最低限でいい" },
    ],
  },
  {
    id: "music", chapter: 3, text: "音楽・演出は？", type: "choice",
    options: [
      { value: "high", label: "曲や演出にこだわりたい" }, { value: "mid", label: "おまかせで素敵にしてほしい" },
      { value: "low", label: "シンプルでいい" },
    ],
  },
  {
    id: "flower", chapter: 3, text: "お花・装飾は？", type: "choice",
    options: [
      { value: "high", label: "たっぷり華やかに" }, { value: "mid", label: "ポイントを押さえて" },
      { value: "low", label: "控えめでいい" },
    ],
  },
  {
    id: "dress", chapter: 3, text: "衣装は？", type: "choice",
    options: [
      { value: "multi", label: "お色直しもしたい" }, { value: "one", label: "運命の一着を着たい" },
      { value: "wa", label: "和装に興味あり" }, { value: "cost", label: "費用を抑えたい" },
    ],
  },
  {
    id: "worry", chapter: 3, text: "いま一番の不安は？", type: "choice",
    options: [
      { value: "cost", label: "費用のこと" }, { value: "prep", label: "準備が大変そう" },
      { value: "host", label: "人前に立つのが苦手" }, { value: "guests", label: "ゲストに楽しんでもらえるか" },
      { value: "none", label: "特にない・楽しみ！" },
    ],
  },

  // ---- 第4章 ゲストとご予算 ----
  {
    id: "guests", chapter: 4, text: "ゲストは何名くらいの予定ですか？", type: "choice",
    options: [
      { value: "s", label: "〜30名（家族中心）" }, { value: "m", label: "31〜60名" },
      { value: "l", label: "61〜100名" }, { value: "xl", label: "100名以上" },
    ],
  },
  {
    id: "budget", chapter: 4, text: "ご予算のイメージは？", type: "choice",
    options: [
      { value: "s", label: "〜200万円" }, { value: "m", label: "200〜350万円" },
      { value: "l", label: "350〜500万円" }, { value: "xl", label: "こだわり優先で柔軟に" },
    ],
  },
  {
    id: "priority", chapter: 4, text: "予算を一番かけたいのは？", type: "choice",
    options: [
      { value: "food", label: "料理・おもてなし" }, { value: "dress", label: "衣装" },
      { value: "photo", label: "写真・映像" }, { value: "deco", label: "会場装飾・お花" },
      { value: "show", label: "演出・音楽" },
    ],
  },
];

// ============ 宴会用（主催者が回答） ============

export const BANQUET_CHAPTERS: HearingChapter[] = [
  { num: 1, title: "会について", desc: "どんな会にしたいか教えてください" },
  { num: 2, title: "主催者タイプ診断", desc: "直感で選んでください（6問）" },
  { num: 3, title: "運営と規模", desc: "当日の運営イメージについて" },
];

export const BANQUET_QUESTIONS: HearingQuestion[] = [
  {
    id: "purpose", chapter: 1, text: "会の目的は？", type: "choice",
    options: [
      { value: "anniv", label: "周年記念・式典" }, { value: "party", label: "懇親会・歓送迎会" },
      { value: "award", label: "表彰式・祝賀会" }, { value: "show", label: "ディナーショー・イベント" },
      { value: "reunion", label: "同窓会・OB会" },
    ],
  },
  { id: "goal", chapter: 1, text: "この会が終わったとき、参加者にどう思われたら大成功ですか？", type: "text" },
  {
    id: "formality", chapter: 1, text: "会の格式は？", type: "choice",
    options: [
      { value: "formal", label: "フォーマル（式典寄り）" }, { value: "semi", label: "セミフォーマル" },
      { value: "casual", label: "カジュアル" },
    ],
  },
  // 主催者タイプ診断（format / excite / cost の3軸×2問）
  { id: "b1", chapter: 2, text: "会の成功とは？", type: "choice", options: [{ value: "format", label: "つつがなく格式高く終わること" }, { value: "excite", label: "参加者が盛り上がること" }] },
  { id: "b2", chapter: 2, text: "進行はどちらが好み？", type: "choice", options: [{ value: "format", label: "式次第どおりキッチリ" }, { value: "excite", label: "多少の脱線も味" }] },
  { id: "b3", chapter: 2, text: "料理・ドリンクは？", type: "choice", options: [{ value: "excite", label: "少し贅沢に印象づけたい" }, { value: "cost", label: "予算内で賢く収めたい" }] },
  { id: "b4", chapter: 2, text: "装飾・演出は？", type: "choice", options: [{ value: "format", label: "格式が伝わる正統派" }, { value: "cost", label: "必要十分でスマートに" }] },
  { id: "b5", chapter: 2, text: "参加者への案内は？", type: "choice", options: [{ value: "format", label: "紙の招待状・式次第を用意" }, { value: "excite", label: "メールやLINEで気軽に" }] },
  { id: "b6", chapter: 2, text: "予算オーバーの提案があったら？", type: "choice", options: [{ value: "excite", label: "効果があるなら検討する" }, { value: "cost", label: "基本は予算厳守" }] },
  // 運営と規模
  {
    id: "speeches", chapter: 3, text: "ご挨拶・乾杯の登壇者は？", type: "choice",
    options: [
      { value: "few", label: "1〜2名" }, { value: "some", label: "3〜5名" }, { value: "many", label: "6名以上・表彰あり" },
    ],
  },
  {
    id: "show", chapter: 3, text: "余興・アトラクションは？", type: "choice",
    options: [
      { value: "yes", label: "あり（出し物・抽選会など）" }, { value: "pro", label: "プロに頼みたい" }, { value: "no", label: "なし・歓談中心" },
    ],
  },
  {
    id: "guests", chapter: 3, text: "参加人数の見込みは？", type: "choice",
    options: [
      { value: "s", label: "〜30名" }, { value: "m", label: "31〜60名" }, { value: "l", label: "61〜100名" }, { value: "xl", label: "100名以上" },
    ],
  },
  {
    id: "budget", chapter: 3, text: "ご予算の考え方は？", type: "choice",
    options: [
      { value: "perhead", label: "会費制（1名あたりで考える）" }, { value: "total", label: "総額で考える" }, { value: "flexible", label: "内容次第で柔軟に" },
    ],
  },
];

export function hearingSet(caseType: string | null | undefined): { chapters: HearingChapter[]; questions: HearingQuestion[] } {
  const bridal = !caseType || caseType === "wedding";
  return bridal
    ? { chapters: WEDDING_CHAPTERS, questions: WEDDING_QUESTIONS }
    : { chapters: BANQUET_CHAPTERS, questions: BANQUET_QUESTIONS };
}

// ============ 診断ロジック ============

export type Answers = Record<string, string>;

const MBTI_NAMES: Record<string, { name: string; hint: string }> = {
  INTJ: { name: "建築家", hint: "構想と計画の人" }, INTP: { name: "論理学者", hint: "探究心の人" },
  ENTJ: { name: "指揮官", hint: "決断と推進の人" }, ENTP: { name: "討論者", hint: "アイデアの人" },
  INFJ: { name: "提唱者", hint: "静かな情熱の人" }, INFP: { name: "仲介者", hint: "理想と共感の人" },
  ENFJ: { name: "主人公", hint: "みんなを導く人" }, ENFP: { name: "広報運動家", hint: "自由な発想の人" },
  ISTJ: { name: "管理者", hint: "実直と信頼の人" }, ISFJ: { name: "擁護者", hint: "献身と気配りの人" },
  ESTJ: { name: "幹部", hint: "段取りと責任の人" }, ESFJ: { name: "領事", hint: "おもてなしの人" },
  ISTP: { name: "巨匠", hint: "手際と冷静の人" }, ISFP: { name: "冒険家", hint: "感性と自然体の人" },
  ESTP: { name: "起業家", hint: "行動力の人" }, ESFP: { name: "エンターテイナー", hint: "場を明るくする人" },
};

export function mbtiFromAnswers(a: Answers): { type: string; name: string; hint: string } | null {
  const axes: ["EI", "SN", "TF", "JP"] = ["EI", "SN", "TF", "JP"];
  let type = "";
  for (const axis of axes) {
    const qs = WEDDING_QUESTIONS.filter((q) => q.axis === axis).map((q) => a[q.id]).filter(Boolean);
    if (qs.length === 0) return null;
    const first = qs.filter((v) => v === axis[0]).length;
    type += first >= qs.length - first ? axis[0] : axis[1];
  }
  const meta = MBTI_NAMES[type];
  return meta ? { type, ...meta } : null;
}

const SIGNS: [string, number, number][] = [
  ["やぎ座", 1, 19], ["みずがめ座", 2, 18], ["うお座", 3, 20], ["おひつじ座", 4, 19],
  ["おうし座", 5, 20], ["ふたご座", 6, 21], ["かに座", 7, 22], ["しし座", 8, 22],
  ["おとめ座", 9, 22], ["てんびん座", 10, 23], ["さそり座", 11, 22], ["いて座", 12, 21], ["やぎ座", 12, 31],
];
const ELEMENTS = ["金", "金", "水", "水", "木", "木", "火", "火", "土", "土"]; // 年の十干（西暦下1桁: 0庚..9己）
const ELEMENT_NOTE: Record<string, string> = {
  木: "まっすぐ伸びる成長の気質。自然や緑のある空間と好相性",
  火: "場を明るく照らす情熱の気質。キャンドルや照明演出が映える",
  土: "みんなが安心する包容の気質。あたたかいおもてなしが得意",
  金: "美意識と品格の気質。上質・フォーマルな空間が似合う",
  水: "しなやかな知性の気質。音楽や物語性のある演出と好相性",
};

export function fortuneFromBirthDate(iso: string | undefined): { sign: string; element: string; note: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1, day = d.getDate();
  const sign = (SIGNS.find(([, mm, dd]) => m < mm || (m === mm && day <= dd)) ?? SIGNS[0])[0];
  const element = ELEMENTS[d.getFullYear() % 10];
  return { sign, element, note: ELEMENT_NOTE[element] };
}

/** 五行の相生（そうじょう）関係か（木→火→土→金→水→木） */
const FEEDS: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CLASHES: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

export type PersonResult = {
  label: string;
  mbti?: string; mbtiName?: string; mbtiHint?: string;
  sign?: string; element?: string; elementNote?: string;
};

export function compatOf(
  g: { mbti: string | null; element: string | null },
  b: { mbti: string | null; element: string | null },
): { score: number; decisionMaker: string; friction: string; tips: string[] } | null {
  if (!g.mbti || !b.mbti) return null;
  let score = 68;
  const tips: string[] = [];
  if (g.mbti[0] !== b.mbti[0]) { score += 6; tips.push("社交性のバランス型。にぎやかな演出と静かな時間の両方を進行に入れると満足度が高い"); }
  else if (g.mbti[0] === "E") { score += 4; tips.push("おふたりとも社交派。ゲスト参加型の演出（テーブルラウンド等）が刺さる"); }
  else { score += 4; tips.push("おふたりとも落ち着き派。少人数感のあるアットホームな進行が心地よい"); }
  if (g.mbti[1] === b.mbti[1]) { score += 8; tips.push("ものの見方が近く、打ち合わせの意思決定が速いタイプ"); }
  if (g.mbti[2] !== b.mbti[2]) { score += 6; }
  if (g.mbti[3] !== b.mbti[3]) { tips.push("計画派×柔軟派の組み合わせ。宿題の期限は計画派の方に合わせて設定するとスムーズ"); }
  else if (g.mbti[3] === "P") { tips.push("おふたりとも柔軟派。決めごとは打ち合わせのその場で決め切るのがコツ"); }
  if (g.element && b.element) {
    if (FEEDS[g.element] === b.element || FEEDS[b.element] === g.element) { score += 10; }
    else if (CLASHES[g.element] === b.element || CLASHES[b.element] === g.element) { score -= 2; }
    else { score += 4; }
  }
  score = Math.max(58, Math.min(98, score));
  // 意思決定の主導: J（計画）優先、同じならT（論理）優先、それも同じなら新婦
  const gJ = g.mbti[3] === "J", bJ = b.mbti[3] === "J";
  const decisionMaker = gJ && !bJ ? "新郎" : bJ && !gJ ? "新婦" : g.mbti[2] === "T" && b.mbti[2] === "F" ? "新郎" : "新婦";
  const friction =
    g.mbti[2] !== b.mbti[2]
      ? "コスパ重視×ときめき重視で予算判断が割れやすい。金額の話は「理由＋気持ち」の両面で"
      : g.mbti[3] !== b.mbti[3]
        ? "決めるペースがずれやすい。期限は余裕を持って提示を"
        : "大きな衝突は起きにくい組み合わせ";
  return { score, decisionMaker, friction, tips: tips.slice(0, 3) };
}

// 好み回答 → 刺さる提案・NG・アップセル候補
const VIBE_PROPOSAL: Record<string, string> = {
  classic: "王道・格式を求めるおふたり。「一生に一度の正装の日」という言葉が刺さる",
  natural: "ガーデン・ナチュラル志向。屋外デザートビュッフェ・緑を使った装花提案が刺さる",
  wa: "和の伝統に惹かれるおふたり。白無垢・色打掛と和モダン装花をセットで提案",
  casual: "堅苦しさが苦手。会費制・余興・ゲスト距離の近い進行を提案",
  photogenic: "写真映え最優先。光の入る時間帯の見学案内・前撮りとエンドロールを早めに提案",
};

export type Upsell = { name: string; reason: string; price?: number };

function upsellsFrom(merged: Answers): Upsell[] {
  const u: Upsell[] = [];
  if (merged.photo === "high" || merged.priority === "photo") {
    u.push({ name: "エンドロール撮影＆当日上映", reason: "写真・映像重視の回答。当日の感動をその場で見せる演出が刺さる", price: 90000 });
    u.push({ name: "前撮り（スタジオ・1着）", reason: "「全部残したい」回答。前撮りは満足度・SNS拡散ともに高い", price: 80000 });
  }
  if (merged.food === "high" || merged.priority === "food") {
    u.push({ name: "婚礼フルコース「エクラ」（1名）", reason: "料理最重視の回答。ゲスト満足に直結するコースランクアップを最初に提案", price: 18000 });
  }
  if (merged.flower === "high" || merged.priority === "deco") {
    u.push({ name: "会場装花トータルコーディネート", reason: "装飾重視の回答。単品積み上げよりトータル提案の方が刺さる", price: 200000 });
  }
  if (merged.dress === "multi") {
    u.push({ name: "カラードレス「ミモザ」", reason: "お色直し希望。カラードレスの試着予約を早めに", price: 230000 });
  }
  if (merged.dress === "wa" || merged.vibe === "wa") {
    u.push({ name: "色打掛「花霞」", reason: "和装への興味あり。和装は早期予約が効く", price: 350000 });
  }
  if (merged.guests === "l" || merged.guests === "xl") {
    u.push({ name: "送迎マイクロバス（27名・往復）", reason: "ゲスト多数。遠方ゲスト送迎はおもてなし提案として喜ばれる", price: 66000 });
  }
  return u.slice(0, 4);
}

export type HearingData = {
  answers: Partial<Record<"groom" | "bride" | "host", Answers>>;
  results?: unknown;
  updatedAt?: string;
};

/** 回答から診断・攻略パネル用データ（StrategyData互換）を生成する */
export function buildResults(caseType: string, data: HearingData) {
  const bridal = !caseType || caseType === "wedding";
  if (bridal) {
    const g = data.answers.groom ?? {}, b = data.answers.bride ?? {};
    const gM = mbtiFromAnswers(g), bM = mbtiFromAnswers(b);
    const gF = fortuneFromBirthDate(g.birthDate), bF = fortuneFromBirthDate(b.birthDate);
    const persons: PersonResult[] = [];
    if (Object.keys(g).length) persons.push({ label: "新郎", mbti: gM?.type, mbtiName: gM?.name, mbtiHint: gM?.hint, sign: gF?.sign, element: gF?.element, elementNote: gF?.note });
    if (Object.keys(b).length) persons.push({ label: "新婦", mbti: bM?.type, mbtiName: bM?.name, mbtiHint: bM?.hint, sign: bF?.sign, element: bF?.element, elementNote: bF?.note });
    const merged: Answers = { ...g, ...b }; // 好みは後勝ち（新婦優先）
    const vibe = merged.vibe ?? "classic";
    const proposals: string[] = [];
    if (VIBE_PROPOSAL[vibe]) proposals.push(VIBE_PROPOSAL[vibe]);
    if (merged.worry === "cost") proposals.push("費用が不安。見積は総額より「1名あたり」で語り、削れる項目を先に示すと安心する");
    if (merged.worry === "host") proposals.push("人前が苦手。高砂に座りっぱなしにならない「ゲスト回遊型」の進行を提案");
    if (merged.worry === "guests") proposals.push("ゲスト満足が不安。料理・引出物・送迎などおもてなし系の提案から入ると信頼される");
    if (merged.music === "high") proposals.push("音楽こだわり派。選曲タブの好みアーティスト登録を初回打ち合わせでやると喜ばれる");
    const ng: string[] = [];
    const anyF = (gM?.type[2] ?? "") === "F" || (bM?.type[2] ?? "") === "F";
    const anyT = (gM?.type[2] ?? "") === "T" || (bM?.type[2] ?? "") === "T";
    if (anyT) ng.push("根拠のない「おすすめです」はNG。理由と比較を添える");
    if (anyF) ng.push("数字とプランの話だけで進めるのはNG。情景・気持ちの言葉を添える");
    if ((gM?.type[3] ?? "") === "J" || (bM?.type[3] ?? "") === "J") ng.push("期限・段取りが曖昧な案内はNG。次のアクションを必ず明確に");
    const typeTitle = bM && gM
      ? `${gM.name} × ${bM.name}カップル`
      : (gM ?? bM) ? `${(gM ?? bM)!.name}タイプ` : "診断中";
    const compat = compatOf(
      { mbti: gM?.type ?? null, element: gF?.element ?? null },
      { mbti: bM?.type ?? null, element: bF?.element ?? null },
    );
    return {
      typeCard: {
        title: typeTitle,
        summary: [
          gF?.note ? `新郎: ${gF.note}` : "",
          bF?.note ? `新婦: ${bF.note}` : "",
        ].filter(Boolean).join("。") || "回答が集まると人物像が表示されます",
        proposals: proposals.slice(0, 4),
        ng: ng.slice(0, 3),
      },
      compat: compat ?? undefined,
      persons,
      upsells: upsellsFrom(merged),
    };
  }
  // 宴会: 主催者タイプ診断
  const h = data.answers.host ?? {};
  const counts = { format: 0, excite: 0, cost: 0 };
  for (const k of ["b1", "b2", "b3", "b4", "b5", "b6"]) {
    const v = h[k] as keyof typeof counts | undefined;
    if (v && v in counts) counts[v]++;
  }
  const top = (Object.entries(counts).sort((a, b2) => b2[1] - a[1])[0]?.[0] ?? "format") as "format" | "excite" | "cost";
  const HOST_TYPES = {
    format: {
      title: "格式重視型の主催者様",
      summary: "つつがなく・恥をかかない会が最優先。式次第と段取りの丁寧な確認が信頼につながる",
      proposals: ["式次第（紙）と登壇者リストのテンプレを先に渡す", "「格式が伝わる」正統派の装飾・進行を提案", "リハーサル・音響チェックの時間を必ず確保"],
      ng: ["カジュアルすぎる提案", "当日変更が発生しうる曖昧な段取り"],
    },
    excite: {
      title: "盛り上がり重視型の主催者様",
      summary: "参加者の笑顔と一体感が最優先。演出・余興・サプライズの提案が刺さる",
      proposals: ["抽選会・映像演出・BGMの提案から入る", "会場レイアウトは歓談・回遊しやすい配置を提案", "「参加者に◯◯と言われる会にしましょう」とゴール共有"],
      ng: ["格式を理由に演出を削る提案", "堅い進行の押しつけ"],
    },
    cost: {
      title: "コスパ重視型の主催者様",
      summary: "予算内で賢く最大効果が最優先。金額根拠と松竹梅の比較提示が信頼につながる",
      proposals: ["見積は1名あたり単価と総額の両方で提示", "「削っても印象が落ちない項目」を先に示す", "会費制シミュレーションを一緒に作る"],
      ng: ["根拠のないアップセル", "予算オーバーの提案を先に出す"],
    },
  }[top];
  const upsells: Upsell[] = [];
  if (h.show === "pro" || h.show === "yes") upsells.push({ name: "エンドロール撮影＆当日上映", reason: "余興・演出に前向き。映像演出は宴会でも盛り上がる", price: 90000 });
  if (h.guests === "l" || h.guests === "xl") upsells.push({ name: "送迎大型バス（45名・往復）", reason: "大人数の会。駅からの送迎は主催者の株が上がる提案", price: 110000 });
  if (top !== "cost") upsells.push({ name: "フリードリンク（1名・3時間）", reason: "ドリンクのグレードは満足度に直結。先に確保を提案", price: 3500 });
  return {
    typeCard: HOST_TYPES,
    persons: [{ label: "主催者", mbti: undefined }],
    upsells: upsells.slice(0, 3),
  };
}

/** 章ごとのミニ結果（体験演出）。回答途中でも出せるものだけ返す */
export function chapterReward(caseType: string, chapter: number, answers: Answers): string | null {
  const bridal = !caseType || caseType === "wedding";
  if (bridal) {
    if (chapter === 1) {
      const f = fortuneFromBirthDate(answers.birthDate);
      return f ? `あなたは${f.sign}・五行は「${f.element}」。${f.note}タイプです🕯` : null;
    }
    if (chapter === 2) {
      const m = mbtiFromAnswers(answers);
      return m ? `診断結果：${m.type}「${m.name}」— ${m.hint}✨` : null;
    }
    if (chapter === 3) {
      const v = answers.vibe;
      const label: Record<string, string> = {
        classic: "上質クラシック派", natural: "ナチュラルガーデン派", wa: "和モダン派",
        casual: "フリースタイル派", photogenic: "フォトジェニック派",
      };
      return v ? `あなたの結婚式スタイルは「${label[v] ?? v}」🌿` : null;
    }
  } else if (chapter === 2) {
    const counts = { format: 0, excite: 0, cost: 0 };
    for (const k of ["b1", "b2", "b3", "b4", "b5", "b6"]) {
      const v = answers[k] as keyof typeof counts | undefined;
      if (v && v in counts) counts[v]++;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const label: Record<string, string> = { format: "格式重視型", excite: "盛り上がり重視型", cost: "コスパ重視型" };
    return top ? `あなたは「${label[top]}」の主催者タイプ🥂` : null;
  }
  return null;
}
