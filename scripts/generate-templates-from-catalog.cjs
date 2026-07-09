// カタログの実データ（会場・料理・衣装・装花・引出物・撮影・司会等）を組み合わせて、
// テンプレート一式（type=pack）をブライダル15パターン・宴会7パターン（ディナーショー・式典含む）
// 自動生成する。品目は完全一致でカタログ名・価格を採用＝見積とテンプレの価格が常に一致する。
// 司会台本・進行の流れは定番シーン構成＋定型文の組み合わせで自動生成。
// 使い方: node scripts/generate-templates-from-catalog.cjs   （同名テンプレはスキップ・何度でも安全）
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ===== カタログ品目の分類（catalog-showcase.tsxと同じキーワード判定） =====
const isVenueMain = (n) => /利用料|貸切/.test(n);
const isCourse = (n) => /コース|ビュッフェ|会席|懐石/.test(n);
const isDrink = (n) => /ドリンク|飲み放題|乾杯酒?|シャンパン(?!.*ケーキ)/.test(n);
const isBrideAttire = (n) => /ドレス|ガウン|白無垢|色打掛|打掛|振袖/.test(n) && !/留袖|父親|母親|子ども|キッズ|ベビー|お子様|ペット/.test(n);
const isGroomAttire = (n) => /タキシード|紋付|袴|モーニング|フロックコート/.test(n) && !/留袖|父親|母親|子ども|キッズ|ベビー|お子様|ペット/.test(n);

// ===== MC台本シーンライブラリ（定番構成＋定型文。{新郎}{新婦}{新郎姓}{新婦姓}は適用時に実名置換） =====
const SCENES = {
  chapelOpen: { title: "開式の辞", dur: 5, roles: "mc", mcScript: "本日はお日柄もよく、皆様にはお忙しい中ご列席を賜り、誠にありがとうございます。ただいまより、{新郎}様と{新婦}様の結婚式を執り行います。" },
  gardenOpen: { title: "開式の辞（ガーデン）", dur: 5, roles: "mc", mcScript: "本日はお足元の悪い中、また皆様にはご多用の中お集まりいただき、誠にありがとうございます。ただいまより、{新郎}様{新婦}様おふたりの人前式を執り行います。" },
  shintoOpen: { title: "参進・開式の辞（神前式）", dur: 8, roles: "mc", mcScript: "本日はご列席賜り、誠にありがとうございます。ただいまより、{新郎}様{新婦}様の神前式を執り行います。雅楽の調べとともに、新郎新婦のご入場です。" },
  entrance: { title: "新郎新婦 入場", dur: 5, roles: "mc,audio,photo", mcScript: "新郎新婦の入場です。皆様、盛大な拍手でお迎えください。" },
  vows: { title: "誓いの言葉・指輪交換", dur: 10, roles: "mc,photo", mcScript: "おふたりより、永遠の愛を誓う「誓いの言葉」です。続いて、指輪の交換を行います。" },
  ceremonyClose: { title: "閉式の辞・退場", dur: 5, roles: "mc,audio", mcScript: "これにて、{新郎}様{新婦}様の挙式はすべて滞りなく執り納めることができました。皆様、今一度盛大な拍手をお願いいたします。" },
  reception: { title: "披露宴 開宴・新郎新婦入場", dur: 8, roles: "mc,audio,photo", mcScript: "皆様、大変お待たせいたしました。ただいまより、{新郎}様{新婦}様の披露宴を開宴いたします。新郎新婦の入場です。" },
  hostGreeting: { title: "主賓・来賓ご挨拶", dur: 10, roles: "mc", mcScript: "続きまして、ご来賓を代表しまして、ご祝辞を賜りたく存じます。" },
  toast: { title: "乾杯のご発声", dur: 8, roles: "mc,catering", mcScript: "それでは乾杯のご発声を賜りたいと存じます。皆様、グラスのご準備をお願いいたします。乾杯！　それでは皆様、ご歓談ください。" },
  meal: { title: "お食事・ご歓談", dur: 30, roles: "catering,service", mcScript: null },
  speech: { title: "ご友人によるスピーチ・余興", dur: 15, roles: "mc,audio", mcScript: "続きまして、ご友人の皆様より、心温まるスピーチ・余興を頂戴いたします。" },
  cake: { title: "ケーキ入刀・ファーストバイト", dur: 10, roles: "mc,audio,photo", mcScript: "おふたりの、初めての共同作業です。ケーキ入刀の瞬間を、どうぞご覧ください。" },
  leave: { title: "中座（お色直し）", dur: 20, roles: "mc,audio", mcScript: "ここでおふたりは、お色直しのため、しばらく中座いたします。皆様には、今しばらくご歓談くださいませ。" },
  reentry: { title: "再入場・キャンドルサービス", dur: 15, roles: "mc,audio,photo", mcScript: "皆様、大変お待たせいたしました。装いも新たに、新郎新婦の再入場です。盛大な拍手でお迎えください。" },
  bouquet: { title: "花束贈呈・ご両親へのお手紙", dur: 15, roles: "mc,audio", mcScript: "ここで新婦より、ご両親への感謝の気持ちを込めて、お手紙を読み上げさせていただきます。" },
  farewell: { title: "送賓（お見送り・プチギフト）", dur: 15, roles: "mc,service", mcScript: "以上をもちまして、{新郎}様{新婦}様の披露宴はすべてお開きとさせていただきます。皆様、出口にて新郎新婦がお見送りいたします。" },
  corpOpen: { title: "開宴・主催者挨拶", dur: 10, roles: "mc", mcScript: "本日はご多用の中、多数ご参加いただき誠にありがとうございます。ただいまより、開宴いたします。はじめに主催者よりご挨拶を頂戴いたします。" },
  corpToast: { title: "乾杯のご挨拶", dur: 8, roles: "mc,catering", mcScript: "それでは乾杯のご発声を賜りたいと存じます。ご唱和のほど、よろしくお願いいたします。乾杯！" },
  corpBuffet: { title: "お食事・歓談・写真撮影", dur: 40, roles: "catering,service,photo", mcScript: null },
  corpProgram: { title: "アトラクション・余興コーナー", dur: 20, roles: "mc,audio", mcScript: "続きまして、会場を盛り上げるアトラクションのお時間です。皆様、ぜひご参加ください。" },
  corpClose: { title: "閉宴のご挨拶", dur: 8, roles: "mc", mcScript: "宴もたけなわではございますが、これにてお開きとさせていただきます。本日はまことにありがとうございました。" },
  showOpen: { title: "開宴・本日の主役ご紹介", dur: 10, roles: "mc,audio", mcScript: "皆様、本日はようこそお越しくださいました。華やかなディナーショーのひとときを、どうぞお楽しみください。" },
  showStage: { title: "ライブステージ", dur: 30, roles: "mc,audio,photo", mcScript: "それでは皆様、お待ちかねのステージです。会場の照明を落とし、スポットライトの中へ——。" },
  showToast: { title: "乾杯・お食事", dur: 10, roles: "mc,catering", mcScript: "それでは乾杯のご発声とともに、お食事をお楽しみください。" },
};

// ===== 進行の型（シーンキーの並び。ceremony=true のパターンには挙式シーンを先頭に付加） =====
const FLOW_BRIDAL = ["reception", "hostGreeting", "toast", "meal", "speech", "cake", "leave", "reentry", "bouquet", "farewell"];
const FLOW_BANQUET = ["corpOpen", "corpToast", "corpBuffet", "corpProgram", "corpClose"];
const FLOW_DINNERSHOW = ["showOpen", "showToast", "showStage", "corpProgram", "corpClose"];

function buildRundown(startTime, ceremonyOpenKey, flowKeys) {
  const keys = ceremonyOpenKey ? [ceremonyOpenKey, "entrance", "vows", "ceremonyClose", ...flowKeys] : flowKeys;
  return {
    startTime,
    items: keys.map((k) => {
      const sc = SCENES[k];
      return { title: sc.title, durationMin: sc.dur, roles: sc.roles, mcScript: sc.mcScript ?? undefined };
    }),
  };
}

function pick(arr, i) { return arr.length ? arr[((i % arr.length) + arr.length) % arr.length] : null; }
function qi(item, catOverride) { return item ? { name: item.name, category: catOverride ?? item.category, unitPrice: item.price } : null; }

(async () => {
  const all = await prisma.catalogItem.findMany({ where: { isActive: true } });
  const by = (cat) => all.filter((i) => i.category === cat);

  const ceremonies = by("ceremony");
  const venueMain = by("venue").filter((i) => isVenueMain(i.name));
  const venueOpt = by("venue").filter((i) => !isVenueMain(i.name));
  const courses = by("catering").filter((i) => isCourse(i.name));
  const drinks = by("catering").filter((i) => isDrink(i.name) && !isCourse(i.name));
  const brides = by("dress").filter((i) => isBrideAttire(i.name));
  const grooms = by("dress").filter((i) => isGroomAttire(i.name));
  const florists = by("florist");
  const gifts = by("gift");
  const photos = by("photo");
  const mcs = by("mc");
  const audios = by("audio");
  const prints = by("print");

  if (ceremonies.length === 0 && venueMain.length === 0) {
    console.error("カタログ品目が見つかりません（先にカタログを登録してください）");
    await prisma.$disconnect();
    process.exit(1);
  }

  const STYLE_OF_CEREMONY = (name) => {
    if (/ガーデン/.test(name)) return "garden";
    if (/ナイト/.test(name)) return "night";
    if (/神前/.test(name)) return "wakon";
    if (/家族/.test(name)) return "small";
    if (/二部制/.test(name)) return "formal";
    return "chapel";
  };
  const OPEN_SCENE_OF_STYLE = (style) => (style === "garden" ? "gardenOpen" : style === "wakon" ? "shintoOpen" : "chapelOpen");
  const VENUE_KEYWORD_OF_STYLE = { garden: "ガーデン", night: "ナイト", wakon: "和モダン", small: "会食", formal: "二部制" };

  let created = 0, skipped = 0;
  const packs = [];

  // ===== ブライダル15パターン =====
  for (let i = 0; i < 15; i++) {
    const ceremony = pick(ceremonies, i);
    if (!ceremony) break;
    const style = STYLE_OF_CEREMONY(ceremony.name);
    const kw = VENUE_KEYWORD_OF_STYLE[style];
    const matchedVenue = kw ? venueMain.find((v) => v.name.includes(kw)) : null;
    const venue = matchedVenue ?? pick(venueMain, i);
    const course = pick(courses, i);
    const drink = pick(drinks, i + 1);
    const bride = pick(brides, i);
    const groom = pick(grooms, i);
    const florist = pick(florists, i);
    const florist2 = florists.length > 1 ? pick(florists, i + 5) : null;
    const gift = pick(gifts, i);
    const photo = pick(photos, i);
    const mc = pick(mcs, 0); // 披露宴司会は基本1種類
    const audio = pick(audios, i);
    const print = pick(prints, i);

    const guestBase = 50 + (i % 5) * 15; // 50〜110名で幅を持たせる
    const quoteItems = [ceremony, venue, course, drink, bride, groom, florist, florist2, gift, photo, mc, audio, print]
      .filter(Boolean).map((it) => qi(it));

    const pack = {
      kind: "ceremos-template-pack", version: 1,
      name: `【自動生成】ブライダル${String(i + 1).padStart(2, "0")} ${ceremony.name.replace(/（.*）/, "")}×${(course?.name ?? "コース").replace(/コース料理|「|」/g, "")}`,
      category: "bridal",
      description: `カタログ品目から自動生成：${ceremony.name}・${venue?.name ?? ""}・${course?.name ?? ""}`,
      wizard: {
        styles: [style],
        guestMin: Math.max(10, guestBase - 25), guestMax: guestBase + 30,
        budgetManMin: 80 + i * 5, budgetManMax: 200 + i * 10,
      },
      quote: { items: quoteItems },
      menu: course ? { items: [{ course: "コース料理", name: course.name, price: course.price, cost: 0 }] } : undefined,
      rundown: buildRundown("11:00", OPEN_SCENE_OF_STYLE(style), FLOW_BRIDAL),
      seating: { perTable: 8 },
    };
    packs.push(pack);
  }

  // ===== 宴会7パターン（ディナーショー・式典を含む） =====
  const banquetVenues = venueMain; // 宴会にも同じ会場プールを使う（式典ホール等含む）
  const BANQUET_RECIPES = [
    { label: "スタンダード宴会", styleTag: "party", flow: FLOW_BANQUET, venueKw: null },
    { label: "グランドホール宴会", styleTag: "party", flow: FLOW_BANQUET, venueKw: "グランド" },
    { label: "ビュッフェ宴会", styleTag: "party", flow: FLOW_BANQUET, venueKw: null },
    { label: "二部制宴会", styleTag: "party", flow: FLOW_BANQUET, venueKw: "二部制" },
    { label: "式典（セレモニー）", styleTag: "ceremony", flow: FLOW_BANQUET, venueKw: "式典" },
    { label: "ディナーショー", styleTag: "dinnershow", flow: FLOW_DINNERSHOW, venueKw: "ショー" },
    { label: "少人数パーティ", styleTag: "small", flow: FLOW_BANQUET, venueKw: "会食" },
  ];
  BANQUET_RECIPES.forEach((r, i) => {
    const venue = (r.venueKw && banquetVenues.find((v) => v.name.includes(r.venueKw))) || pick(banquetVenues, i);
    const course = pick(by("catering").filter((c) => isCourse(c.name) || /ブッフェ|軽食|ディナー/.test(c.name)), i + 2);
    const drink = pick(drinks, i);
    const florist = pick(florists, i + 3);
    const mc = pick(mcs, 1) ?? pick(mcs, 0);
    const audio = pick(audios, i);
    const print = pick(prints, i + 1);

    const quoteItems = [venue, course, drink, florist, mc, audio, print].filter(Boolean).map((it) => qi(it));
    const guestBase = 30 + i * 10;
    const pack = {
      kind: "ceremos-template-pack", version: 1,
      name: `【自動生成】宴会${String(i + 1).padStart(2, "0")} ${r.label}`,
      category: "banquet",
      description: `カタログ品目から自動生成：${venue?.name ?? ""}・${course?.name ?? ""}（${r.label}）`,
      wizard: {
        styles: [r.styleTag],
        guestMin: Math.max(10, guestBase - 15), guestMax: guestBase + 40,
        budgetManMin: 30 + i * 5, budgetManMax: 100 + i * 10,
      },
      quote: { items: quoteItems },
      menu: course ? { items: [{ course: "コース料理", name: course.name, price: course.price, cost: 0 }] } : undefined,
      rundown: buildRundown("18:00", null, r.flow),
      seating: { perTable: 10 },
    };
    packs.push(pack);
  });

  for (const pack of packs) {
    const exists = await prisma.template.findFirst({ where: { type: "pack", name: pack.name } });
    if (exists) { skipped++; continue; }
    if (!pack.quote.items.length) { skipped++; continue; }
    await prisma.template.create({ data: { type: "pack", name: pack.name, bodyJson: JSON.stringify(pack) } });
    created++;
    console.log(`＋ ${pack.name}（品目${pack.quote.items.length}・進行${pack.rundown.items.length}演目）`);
  }
  console.log(`\n完了：新規${created}件・スキップ${skipped}件（既存 or 品目不足）`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
