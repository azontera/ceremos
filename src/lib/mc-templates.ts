// 司会コメントのテンプレート（各シーン・約10種＋自由入力）
// {新郎}{新婦} は自動で名前に置換される
// ※ フォーマル/あたたかい/シンプル は元の手書き版。それ以外7種はシンプル版をベースに口調違いで自動展開（検証用に量を増やしたもの）

type Tmpl = { name: string; text: string };

const TONE_WRAPS: { name: string; wrap: (plain: string) => string }[] = [
  { name: "上品", wrap: (p) => `皆さま、今しばらくご清聴くださいませ。${p}` },
  { name: "明るい", wrap: (p) => `さあ、盛り上がってまいりました！${p}` },
  { name: "感動的", wrap: (p) => `胸が熱くなる瞬間でございます。${p}` },
  { name: "落ち着いた", wrap: (p) => `それでは、ゆったりとした空気の中で。${p}` },
  { name: "ユーモラス", wrap: (p) => `さてさて、お待たせいたしました。${p}` },
  { name: "クラシック", wrap: (p) => `しきたりに則りまして、${p}` },
  { name: "情熱的", wrap: (p) => `熱い想いを込めまして、${p}` },
];

const BANK: { match: (t: string) => boolean; templates: Tmpl[] }[] = [
  {
    match: (t) => t.includes("入場") && !t.includes("再入場"),
    templates: [
      { name: "フォーマル", text: "皆さま、大変長らくお待たせいたしました。新郎{新郎}さん、新婦{新婦}さんのご入場です。盛大な拍手でお迎えください。" },
      { name: "あたたかい", text: "それでは、おふたりの晴れの舞台の始まりです。新郎{新郎}さん、新婦{新婦}さん、ご入場です！どうぞ大きな拍手でお迎えください。" },
      { name: "シンプル", text: "新郎新婦のご入場です。拍手でお迎えください。" },
    ],
  },
  {
    match: (t) => t.includes("乾杯"),
    templates: [
      { name: "フォーマル", text: "それではご来賓の〇〇様より、乾杯のご発声を賜りたく存じます。皆さま、グラスのご用意をお願いいたします。" },
      { name: "あたたかい", text: "お待たせいたしました、乾杯のお時間です。〇〇様、ご発声をお願いいたします。皆さまグラスをお手元にどうぞ。" },
      { name: "シンプル", text: "〇〇様より乾杯のご発声です。グラスのご用意をお願いします。" },
    ],
  },
  {
    match: (t) => t.includes("ケーキ"),
    templates: [
      { name: "フォーマル", text: "続きまして、おふたりによるウェディングケーキ入刀です。おふたりの初めての共同作業をどうぞお近くでご覧ください。" },
      { name: "あたたかい", text: "さあ、お待ちかねのケーキ入刀です！シャッターチャンスですので、どうぞ前の方へお集まりください。" },
      { name: "シンプル", text: "ウェディングケーキ入刀です。ご歓談のままお楽しみください。" },
    ],
  },
  {
    match: (t) => t.includes("中座"),
    templates: [
      { name: "フォーマル", text: "新婦{新婦}さんはお色直しのため、いったん中座いたします。皆さまはどうぞご歓談のままお過ごしください。" },
      { name: "あたたかい", text: "{新婦}さんはここでお支度のため中座です。エスコートは〇〇様。あたたかい拍手でお送りください。" },
      { name: "シンプル", text: "新婦中座です。拍手でお送りください。" },
    ],
  },
  {
    match: (t) => t.includes("再入場"),
    templates: [
      { name: "フォーマル", text: "皆さま、お待たせいたしました。装いも新たに、おふたりの再入場です。盛大な拍手でお迎えください。" },
      { name: "あたたかい", text: "会場の後方にご注目ください。雰囲気をがらりと変えて、おふたりの再入場です！" },
      { name: "シンプル", text: "新郎新婦の再入場です。拍手でお迎えください。" },
    ],
  },
  {
    match: (t) => t.includes("手紙") || t.includes("花束"),
    templates: [
      { name: "フォーマル", text: "ここで新婦{新婦}さんより、ご両親へ感謝の手紙を読ませていただきます。皆さま、しばしお耳をお貸しください。" },
      { name: "あたたかい", text: "披露宴もいよいよ結びに近づいてまいりました。{新婦}さんから、これまで育ててくれたご両親へ、心を込めたお手紙です。" },
      { name: "シンプル", text: "新婦からご両親への手紙、続いて花束の贈呈です。" },
    ],
  },
  {
    match: (t) => t.includes("送賓") || t.includes("お見送り"),
    templates: [
      { name: "フォーマル", text: "本日はお忙しい中お越しいただき、誠にありがとうございました。おふたりとご両家の皆さまが、お出口にてお見送りいたします。" },
      { name: "あたたかい", text: "名残惜しいですが、お開きのお時間です。おふたりからささやかなお土産がございますので、どうぞお受け取りください。" },
      { name: "シンプル", text: "以上をもちましてお開きです。お忘れ物のないようお気をつけください。" },
    ],
  },
  {
    match: (t) => t.includes("挙式"),
    templates: [
      { name: "フォーマル", text: "（挙式進行）ゲスト着席の確認後、開式のアナウンス。式次第に沿って進行します。" },
      { name: "あたたかい", text: "（挙式進行）リラックスした雰囲気で開式をアナウンス。おふたりらしい人前式であることを一言添える。" },
      { name: "シンプル", text: "（挙式進行）開式アナウンスのみ。" },
    ],
  },
  {
    match: (t) => t.includes("謝辞") || t.includes("結び"),
    templates: [
      { name: "フォーマル", text: "それでは結びにあたり、新郎{新郎}さん、ならびにご両家を代表いたしまして〇〇様よりご挨拶を申し上げます。" },
      { name: "あたたかい", text: "たくさんの笑顔に包まれた披露宴も、いよいよ結びです。新郎{新郎}さんよりご挨拶です。" },
      { name: "シンプル", text: "新郎謝辞、続いて両家代表謝辞です。" },
    ],
  },
];

const GENERIC: Tmpl[] = [
  { name: "フォーマル", text: "続きまして「{演目}」でございます。皆さまどうぞご注目ください。" },
  { name: "あたたかい", text: "さてお次は「{演目}」です！どうぞお楽しみください。" },
  { name: "シンプル", text: "「{演目}」です。" },
];

// 各シーンに TONE_WRAPS を掛け合わせ、手書き3種＋自動生成7種＝約10種にする（検証用の量産）
function expand(list: Tmpl[]): Tmpl[] {
  const base = list.find((t) => t.name === "シンプル") ?? list[list.length - 1];
  const extra = TONE_WRAPS.map((tw) => ({ name: tw.name, text: tw.wrap(base.text) }));
  return [...list, ...extra];
}

export function mcTemplates(title: string, groom: string, bride: string): Tmpl[] {
  const hit = BANK.find((b) => b.match(title));
  const list = expand(hit ? hit.templates : GENERIC);
  const g = groom.split(" ").pop() ?? groom;
  const b2 = bride.split(" ").pop() ?? bride;
  return list.map((t) => ({
    name: t.name,
    text: t.text.replaceAll("{新郎}", g).replaceAll("{新婦}", b2).replaceAll("{演目}", title),
  }));
}
