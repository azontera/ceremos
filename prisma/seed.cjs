// CEREMOS 評価用デモデータ（20案件・実運用相当）
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { buildTemplates } = require("./templates.cjs");
const prisma = new PrismaClient();

const day = (offset, h = 0, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};
const hm = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

async function main() {
  const hash = await bcrypt.hash("wedding2026", 10);

  // ================= 会場・業者 =================
  // 初期マスタ：披露宴会場A/B/C・ガーデン・チャペル・控室A/B・厨房（多め・不要なら管理画面で削除）
  const chapel = await prisma.venue.create({ data: { name: "チャペル", type: "chapel", capacity: 120 } });
  const hallA = await prisma.venue.create({ data: { name: "披露宴会場A", type: "banquet", capacity: 120 } });
  const hallB = await prisma.venue.create({ data: { name: "披露宴会場B", type: "banquet", capacity: 90 } });
  await prisma.venue.create({ data: { name: "披露宴会場C", type: "banquet", capacity: 60 } });
  await prisma.venue.create({ data: { name: "ガーデン", type: "banquet", capacity: 80 } });
  const waitA = await prisma.venue.create({ data: { name: "控室A（新郎新婦）", type: "waiting", capacity: 8 } });
  const waitB = await prisma.venue.create({ data: { name: "控室B（親族）", type: "waiting", capacity: 20 } });
  const kitchen = await prisma.venue.create({ data: { name: "厨房", type: "kitchen", capacity: 0 } });

  // 選択肢マスタ（案件種別・間柄・部門）
  const { DEFAULT_MASTERS } = require("./masters.cjs");
  await prisma.masterOption.createMany({ data: DEFAULT_MASTERS });

  const florist = await prisma.vendor.create({ data: { name: "フローラ武蔵野", category: "florist" } });
  const gift = await prisma.vendor.create({ data: { name: "ギフト住吉", category: "gift" } });
  const print = await prisma.vendor.create({ data: { name: "アルバ堂", category: "print" } });
  const photo = await prisma.vendor.create({ data: { name: "スタジオ・ルーチェ", category: "photo" } });
  const dress = await prisma.vendor.create({ data: { name: "ドレスサロン美翔", category: "dress" } });
  const beauty = await prisma.vendor.create({ data: { name: "ビューティ青葉", category: "beauty" } });

  // ================= ユーザー =================
  const u = (name, email, role, vendorId) =>
    prisma.user.create({ data: { name, email, role, vendorId, passwordHash: hash } });

  const admin = await u("式場 管理者", "admin@example.com", "admin");
  const manager = await u("大野 誠一", "manager@example.com", "manager");
  const tera = await u("寺沢 真彦", "tera@azon.jp", "admin"); // 最高権限者（担当プランナーも兼務）
  const mori = await u("森 彩香", "mori@example.com", "planner");
  const chef = await u("石井 康隆", "chef@example.com", "chef");
  const hasegawa = await u("長谷川 亮太", "audio@example.com", "audio");
  const okada = await u("岡田 千尋", "mc@example.com", "mc");
  const service1 = await u("佐野 未来", "service@example.com", "service");
  const floristUser = await u("フローラ武蔵野 担当", "florist@example.com", "florist", florist.id);
  const giftUser = await u("ギフト住吉 担当", "gift@example.com", "gift", gift.id);
  const groomRen = await u("高橋 蓮", "ren.t@example.com", "couple");
  const brideMisaki = await u("佐藤 美咲", "misaki.s@example.com", "couple");
  const groomIto = await u("伊藤 大輝", "ito@example.com", "couple");

  // ================= 生成用プール =================
  const ADDR = [
    "東京都武蔵野市吉祥寺本町2-4-12", "東京都三鷹市下連雀3-8-5", "東京都杉並区荻窪5-12-3",
    "東京都調布市布田1-9-8", "東京都小金井市本町4-2-16", "東京都西東京市田無町6-3-7",
  ];
  const SCENES = ["entrance", "toast", "cake", "leave", "reentry", "bouquet", "farewell"];
  const SONGS = {
    entrance: [["Marry You", "Bruno Mars", 90, "サビ頭から。扉オープンと同時にサビ"], ["Can't Stop the Feeling!", "Justin Timberlake", 85, "イントロからテンポよく"], ["愛をこめて花束を", "Superfly", 95, "Aメロから使用"]],
    toast: [["Sugar", "Maroon 5", 30, "発声と同時に頭から、30秒でフェード"], ["ハピネス", "AI", 30, "サビから"], ["Paradise Has No Border", "東京スカパラダイスオーケストラ", 40, "イントロから"]],
    cake: [["I Was Born To Love You", "Queen", 60, "入刀の瞬間にサビ"], ["君って", "西野カナ", 60, "サビから"], ["Sweets Parade", "―", 45, "軽快に"]],
    leave: [["やさしさで溢れるように", "JUJU", null, "祖母エスコートのアナウンス後"], ["ハナミズキ", "一青窈", null, "しっとりと"], ["糸", "中島みゆき", null, "Aメロから"]],
    reentry: [["Viva La Vida", "Coldplay", null, "照明演出と同期。要リハ"], ["Beautiful Day", "U2", null, "扉オープンでサビ"], ["前前前世", "RADWIMPS", null, "キャンドル点灯と同時"]],
    bouquet: [["365日", "Mr.Children", null, "手紙朗読はBGM -10dB"], ["家族になろうよ", "福山雅治", null, "朗読前奏から"], ["ありがとう", "いきものがかり", null, "花束贈呈でサビ"]],
    farewell: [["One Love", "嵐", null, "ループ再生"], ["Wherever you are", "ONE OK ROCK", null, "ループ再生"], ["ハッピーソングメドレー", "―", null, "最終ゲスト退出でフェード"]],
  };
  const MEALS = [
    ["新婦友人", "allergy", "甲殻類 — 帆立を鯛に変更"], ["新郎親族", "allergy", "卵（加熱済も不可）"],
    ["新婦親族", "allergy", "そば"], ["新郎友人", "allergy", "乳製品 — ソース変更で対応"],
    ["新婦友人", "allergy", "小麦 — グルテンフリー対応"], ["主賓", "dislike", "生魚が苦手 — 加熱調理に変更"],
    ["新郎友人", "religion", "ベジタリアン対応"], ["新婦親族", "religion", "アルコール・豚肉不使用"],
    ["お子様", "kids", "お子様プレート"], ["お子様", "kids", "低アレルゲンプレート"],
  ];
  const MEETING_SETS = [
    { minutes: "初回打ち合わせ。おふたりの希望（アットホーム・ナチュラル系）をヒアリング。おおまかな進行と予算感を共有。", decisions: "挙式スタイル：人前式／会場装飾はナチュラル系", homework: "招待リストの作成（次回まで）" },
    { minutes: "招待人数と会場レイアウトを確定。ペーパーアイテムのデザイン方向性を決定。ドレス試着の日程を調整。", decisions: "招待人数確定／レイアウト：長テーブル形式", homework: "衣装の最終候補を3着に絞る" },
    { minutes: "料理コースを試食のうえ決定。アレルギー対応の方針を確認。装花のメインカラーを決定。", decisions: "コース確定／装花：シャンパンベージュ", homework: "アレルギーのあるゲストの最終確認" },
    { minutes: "進行・演出の確認。各シーンの楽曲を選定。両親への手紙のタイミングを花束贈呈直前に変更。", decisions: "入場曲確定／手紙→花束の順に変更", homework: "残りの楽曲の最終決定" },
    { minutes: "最終打ち合わせ。席次表の最終確認、当日のタイムライン・持ち込み品・支払いスケジュールを確認。", decisions: "席次確定／最終見積承認へ", homework: "当日の持ち込み品リストの提出" },
  ];
  const quoteItems = (g) => [
    { name: "挙式料（人前式）", category: "ceremony", qty: 1, unitPrice: 150000 },
    { name: "披露宴会場費", category: "venue", qty: 1, unitPrice: 200000 },
    { name: `コース料理 × ${g}名`, category: "catering", qty: g, unitPrice: 19000 },
    { name: `フリードリンク × ${g}名`, category: "catering", qty: g, unitPrice: 3500 },
    { name: "ウェディングケーキ", category: "catering", qty: 1, unitPrice: 60000 },
    { name: "会場装花（メイン＋ゲスト卓）", category: "florist", qty: 1, unitPrice: 240000 },
    { name: "ブーケ・ブートニア", category: "florist", qty: 1, unitPrice: 45000 },
    { name: "写真撮影（スナップ・データ渡し）", category: "photo", qty: 1, unitPrice: 180000 },
    { name: "記録映像", category: "video", qty: 1, unitPrice: 120000 },
    { name: "司会", category: "mc", qty: 1, unitPrice: 88000 },
    { name: "音響・照明オペレート", category: "audio", qty: 1, unitPrice: 70000 },
    { name: `ペーパーアイテム × ${g}名`, category: "print", qty: g, unitPrice: 800 },
    { name: `引出物 × ${Math.round(g / 2)}世帯`, category: "gift", qty: Math.round(g / 2), unitPrice: 5500 },
    { name: "美容着付・ヘアメイク", category: "beauty", qty: 1, unitPrice: 120000 },
  ];
  const sumItems = (items) => items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  // 進行表（部により開始時刻をシフト）
  // [開始オフセット分, 演目, 備考, 担当, 所要分（時刻自動計算に使用）]
  const RUNDOWN_BASE = [
    [0, "挙式（チャペル）", "人前式・25分", "mc,audio,photo", 30],
    [30, "ゲスト移動・ウェルカムドリンク", "ホワイエ", "service", 30],
    [60, "新郎新婦 入場", "扉オープンでスポット", "mc,audio,photo", 3],
    [63, "ウェルカムスピーチ・乾杯", "発声後アミューズ提供開始", "mc,catering", 32],
    [95, "ケーキ入刀・ファーストバイト", "フォトラウンド", "mc,audio,photo", 40],
    [135, "新婦中座", "魚料理提供後", "mc,audio", 20],
    [155, "再入場・テーブルフォト", "肉料理一斉サーブ", "audio,catering,service", 45],
    [200, "新婦の手紙・花束贈呈", "BGM -10dB・照明 暖色", "mc,audio", 20],
    [220, "結びの挨拶・退場", "新郎謝辞 → 両家代表謝辞", "mc", 10],
    [230, "送賓（プチギフト）", "ホワイエ", "service,audio", 20],
  ];
  const SLOT_START = { 1: [11, 30], 2: [15, 30], 3: [18, 0] };
  const rundownFor = (slot) => {
    const [sh, sm] = SLOT_START[slot] ?? [11, 30];
    return RUNDOWN_BASE.map(([off, title, note, roles, dur], i) => {
      const t = sh * 60 + sm + off;
      return { time: hm(Math.floor(t / 60), t % 60), title, note, roles, durationMin: dur, sortOrder: i + 1 };
    });
  };

  // ================= 案件生成 =================
  let seq = 0;
  async function makeCase(cfg) {
    const i = seq++;
    const [sh, sm] = SLOT_START[cfg.slot] ?? [11, 30];
    const isPast = cfg.d < 0;
    const isToday = cfg.d === 0;
    const near = cfg.d >= 0 && cfg.d <= 30;

    const c = await prisma.case.create({
      data: {
        groomName: cfg.g, brideName: cfg.b,
        address: ADDR[i % ADDR.length],
        phone: `090-${String(3100 + i * 7).padStart(4, "0")}-${String(2200 + i * 13).padStart(4, "0")}`,
        email: cfg.email ?? `${cfg.g.split(" ")[0].toLowerCase()}${i}@example.com`,
        weddingDate: day(cfg.d, sh, sm), endTime: day(cfg.d, sh + 4, sm), slot: cfg.slot,
        chapelVenueId: chapel.id, banquetVenueId: cfg.venue.id,
        guestCount: cfg.guests,
        status: cfg.status, plannerId: cfg.planner.id,
        contractJson: JSON.stringify({
          signedAt: day(cfg.d - 180).toISOString().slice(0, 10),
          course: cfg.guests > 85 ? "グランメゾン" : cfg.guests > 65 ? "プレミエ" : "スタンダード",
          plan: "オールインクルーシブプラン",
        }),
      },
    });

    // メンバー（担当プランナー・支配人＋近い案件は現場スタッフも）
    const members = new Set([cfg.planner.id, manager.id]);
    if (near || isPast) [chef, hasegawa, okada, service1].forEach((x) => members.add(x.id));
    (cfg.members ?? []).forEach((x) => members.add(x.id));
    await prisma.caseMember.createMany({ data: [...members].map((userId) => ({ caseId: c.id, userId })) });

    // 進行表
    await prisma.rundownItem.createMany({
      data: rundownFor(cfg.slot).map((r) => ({ caseId: c.id, ...r, status: isPast ? "done" : "todo" })),
    });

    // 打ち合わせ履歴（進み具合に応じた回数）
    const mtgCount = cfg.mtgs ?? (isPast ? 5 : near ? 4 : cfg.d <= 80 ? 2 : 1);
    for (let k = 0; k < mtgCount; k++) {
      const set = MEETING_SETS[k];
      const heldAt = isPast
        ? day(cfg.d - (mtgCount - k) * 21, 10)
        : day(-((mtgCount - 1 - k) * 21) - (i % 5), 10 + (i % 3) * 2);
      const isLast = k === mtgCount - 1;
      const nextAt = !isPast && isLast && cfg.d > 10 ? day(14 - (i % 4), 10) : null;
      await prisma.meeting.create({
        data: { caseId: c.id, heldAt, staffId: cfg.planner.id, minutes: set.minutes, decisions: set.decisions, homework: set.homework, nextAt },
      });
      if (nextAt) {
        await prisma.calendarEvent.create({
          data: { caseId: c.id, type: "meeting", title: `${cfg.g.split(" ")[0]}様・${cfg.b.split(" ")[0]}様 打ち合わせ（第${mtgCount + 1}回）`, startsAt: nextAt, endsAt: new Date(nextAt.getTime() + 2 * 3600000) },
        });
      }
    }

    // 見積
    const items = quoteItems(cfg.guests);
    const total = sumItems(items);
    if (isPast || isToday || cfg.quote === "approved") {
      await prisma.quote.create({
        data: { caseId: c.id, version: 1, status: "approved", total, note: "最終確定版", createdBy: cfg.planner.id, items: { create: items } },
      });
    } else if (near || cfg.quote === "confirmed") {
      await prisma.quote.create({ data: { caseId: c.id, version: 1, status: "archived", total: total - 77000, note: "初回見積", createdBy: cfg.planner.id } });
      await prisma.quote.create({
        data: { caseId: c.id, version: 2, status: "confirmed", total, note: "演出照明追加・人数確定", createdBy: cfg.planner.id, items: { create: items } },
      });
    } else if (cfg.quote === "draft" || cfg.d <= 80) {
      await prisma.quote.create({
        data: { caseId: c.id, version: 1, status: "draft", total, note: "初回見積（提示前）", createdBy: cfg.planner.id, items: { create: items } },
      });
    }

    // 発注
    const orderDefs = [
      { vendorId: florist.id, category: "florist", amount: 285000, note: "装花（メイン＋ゲスト卓＋ブーケ）", lead: 0 },
      { vendorId: gift.id, category: "gift", amount: Math.round(cfg.guests / 2) * 5500, note: "引出物", lead: -1 },
      { vendorId: print.id, category: "print", amount: cfg.guests * 800 + 30000, note: "印刷物（席次表・メニュー表）", lead: -2 },
      { vendorId: photo.id, category: "photo", amount: 300000, note: "写真・映像", lead: 0 },
      { vendorId: dress.id, category: "dress", amount: 350000, note: "ドレス・タキシードレンタル", lead: -3 },
      { vendorId: beauty.id, category: "beauty", amount: 120000, note: "美容着付・ヘアメイク", lead: 0 },
      { vendorId: null, category: "catering", amount: cfg.guests * 22500, note: "料理・飲物（自社厨房）", lead: 0 },
      { vendorId: null, category: "mc", amount: 88000, note: "司会（提携・岡田）", lead: 0 },
    ];
    const orderCount = isPast || near ? orderDefs.length : cfg.d <= 80 ? 4 : 0;
    if (orderCount > 0) {
      await prisma.order.createMany({
        data: orderDefs.slice(0, orderCount).map((o, k) => ({
          caseId: c.id, vendorId: o.vendorId, category: o.category, amount: o.amount, note: o.note,
          dueAt: day(cfg.d + o.lead, 10),
          status: isPast ? "delivered"
            : isToday ? (k < orderDefs.length - 1 ? "delivered" : "confirmed")
            : near ? (k === 1 && cfg.d < 10 ? "pending" : "confirmed") // 直近案件は引出物が未確定＝要対応
            : k < 2 ? "confirmed" : "pending",
        })),
      });
    }

    // 楽曲（近い案件・過去案件はフル、中期は一部）— 進行表の行に紐付け（進行表がマスター）
    const songScenes = isPast || near ? SCENES : cfg.d <= 80 ? SCENES.slice(0, 3) : [];
    if (songScenes.length > 0) {
      await prisma.song.createMany({
        data: songScenes
          .filter((sc) => !(cfg.skipCakeSong && sc === "cake"))
          .map((sc, k) => {
            const [title, artist, sec, memo] = SONGS[sc][(i + k) % 3];
            return { caseId: c.id, scene: sc, title, artist, durationSec: sec, memo };
          }),
      });
      // シーン → 進行表の演目タイトル対応で songId をリンク
      const SCENE_TO_TITLE = {
        entrance: "新郎新婦 入場", toast: "ウェルカムスピーチ・乾杯", cake: "ケーキ入刀・ファーストバイト",
        leave: "新婦中座", reentry: "再入場・テーブルフォト", bouquet: "新婦の手紙・花束贈呈", farewell: "送賓（プチギフト）",
      };
      const [caseSongs, caseItems] = await Promise.all([
        prisma.song.findMany({ where: { caseId: c.id } }),
        prisma.rundownItem.findMany({ where: { caseId: c.id } }),
      ]);
      for (const sg of caseSongs) {
        const t = SCENE_TO_TITLE[sg.scene];
        const item = t ? caseItems.find((r) => r.title === t) : null;
        if (item) await prisma.rundownItem.update({ where: { id: item.id }, data: { songId: sg.id } });
      }
    }

    // 料理配慮
    const mealCount = isPast || near ? 3 + (i % 3) : cfg.d <= 80 ? 1 + (i % 2) : 0;
    if (mealCount > 0) {
      await prisma.mealRequirement.createMany({
        data: Array.from({ length: mealCount }, (_, k) => {
          const [who, type, detail] = MEALS[(i * 3 + k) % MEALS.length];
          return { caseId: c.id, guestLabel: `${who} ${String.fromCharCode(65 + k)}様`, type, detail };
        }),
      });
    }

    // 挙式のカレンダー登録
    await prisma.calendarEvent.create({
      data: {
        caseId: c.id, venueId: cfg.venue.id, type: "wedding",
        title: `${cfg.g.split(" ")[0]}家・${cfg.b.split(" ")[0]}家 挙式${isPast ? "（終了）" : ""}`,
        startsAt: day(cfg.d, sh, sm), endsAt: day(cfg.d, sh + 4, sm),
      },
    });

    return c;
  }

  // ================= 20案件 =================
  // 過去（完了）6件
  await makeCase({ g: "木村 亮", b: "斎藤 結菜", d: -7, slot: 1, venue: hallA, guests: 76, planner: tera, status: "done" });
  await makeCase({ g: "林 大和", b: "山崎 心美", d: -14, slot: 2, venue: hallB, guests: 58, planner: mori, status: "done" });
  await makeCase({ g: "池田 翔", b: "森 七海", d: -21, slot: 2, venue: hallA, guests: 88, planner: tera, status: "done" });
  await makeCase({ g: "橋本 悠", b: "阿部 美月", d: -35, slot: 1, venue: hallB, guests: 64, planner: tera, status: "done" });
  await makeCase({ g: "山下 蒼", b: "岡田 莉子", d: -49, slot: 3, venue: hallA, guests: 95, planner: mori, status: "done" });
  await makeCase({ g: "後藤 湊", b: "長谷川 芽生", d: -63, slot: 2, venue: hallB, guests: 70, planner: tera, status: "done" });

  // 本日2件
  const caseYamamoto = await makeCase({ g: "山本 拓也", b: "中村 早紀", d: 0, slot: 1, venue: hallA, guests: 68, planner: tera, status: "final_prep" });
  const caseTanaka = await makeCase({ g: "田中 慎吾", b: "松本 玲奈", d: 0, slot: 3, venue: hallB, guests: 55, planner: mori, status: "final_prep", members: [tera] });

  // 直近〜今後 12件
  const caseIto = await makeCase({ g: "伊藤 大輝", b: "渡辺 結衣", d: 2, slot: 2, venue: hallB, guests: 82, planner: tera, status: "final_prep", email: "ito@example.com", members: [floristUser, giftUser, groomIto] });
  const caseNakajima = await makeCase({ g: "中島 健太", b: "藤井 里奈", d: 9, slot: 1, venue: hallA, guests: 78, planner: tera, status: "planning" });
  await makeCase({ g: "原田 大樹", b: "石川 美優", d: 16, slot: 2, venue: hallA, guests: 92, planner: tera, status: "planning" });
  await makeCase({ g: "清水 航", b: "森田 彩花", d: 17, slot: 2, venue: hallB, guests: 60, planner: tera, status: "planning" });
  await makeCase({ g: "村上 陽向", b: "近藤 澪", d: 23, slot: 1, venue: hallB, guests: 66, planner: tera, status: "planning" });
  await makeCase({ g: "遠藤 樹", b: "青木 陽葵", d: 30, slot: 1, venue: hallA, guests: 82, planner: mori, status: "quoting", quote: "confirmed" });
  await makeCase({ g: "藤本 玲", b: "岡本 実咲", d: 45, slot: 1, venue: hallB, guests: 72, planner: mori, status: "quoting", quote: "draft" });
  await makeCase({ g: "三浦 颯", b: "藤田 美桜", d: 58, slot: 2, venue: hallA, guests: 90, planner: tera, status: "quoting", quote: "draft" });
  const caseTakahashi = await makeCase({
    g: "高橋 蓮", b: "佐藤 美咲", d: 72, slot: 1, venue: hallA, guests: 74, planner: tera,
    status: "planning", email: "ren.t@example.com", quote: "confirmed", mtgs: 4,
    skipCakeSong: true, members: [groomRen, brideMisaki],
  });
  await makeCase({ g: "小林 悠人", b: "加藤 芽依", d: 114, slot: 2, venue: hallA, guests: 96, planner: mori, status: "contracted" });
  await makeCase({ g: "吉田 拓海", b: "山口 咲良", d: 129, slot: 1, venue: hallB, guests: 58, planner: tera, status: "contracted" });
  await makeCase({ g: "佐々木 陸", b: "井上 陽菜", d: 170, slot: 3, venue: hallA, guests: 110, planner: mori, status: "contracted" });

  // ================= 本日の追加予定・リソース割当 =================
  await prisma.calendarEvent.createMany({
    data: [
      { caseId: caseTakahashi.id, type: "meeting", title: "高橋様・佐藤様 打ち合わせ（第4回）", startsAt: day(0, 10), endsAt: day(0, 12) },
      { caseId: caseIto.id, venueId: hallB.id, type: "arrival", title: "装花搬入立ち会い（フローラ武蔵野）", startsAt: day(0, 14), endsAt: day(0, 15) },
      { caseId: caseYamamoto.id, type: "delivery", title: "山本家 引出物・ペーパーアイテム納品", startsAt: day(0, 9, 30), endsAt: day(0, 10) },
      { caseId: caseNakajima.id, type: "fitting", title: "中島様 ドレス試着（最終）", startsAt: day(0, 16), endsAt: day(0, 17, 30) },
      { caseId: caseIto.id, type: "delivery", title: "伊藤家 引出物・印刷物 納品", startsAt: day(1, 10), endsAt: day(1, 11) },
    ],
  });
  await prisma.assignment.createMany({
    data: [
      { caseId: caseYamamoto.id, kind: "waiting", venueId: waitA.id, label: "控室A（新郎新婦）", startsAt: day(0, 9), endsAt: day(0, 16) },
      { caseId: caseYamamoto.id, kind: "waiting", venueId: waitB.id, label: "控室B（両家親族）", startsAt: day(0, 10), endsAt: day(0, 16) },
      { caseId: caseYamamoto.id, kind: "kitchen", venueId: kitchen.id, label: "厨房（第1部）", startsAt: day(0, 9), endsAt: day(0, 15, 30) },
      { caseId: caseYamamoto.id, kind: "staff", userId: chef.id, label: "料理長", startsAt: day(0, 8), endsAt: day(0, 16) },
      { caseId: caseYamamoto.id, kind: "staff", userId: hasegawa.id, label: "音響オペレーター", startsAt: day(0, 10), endsAt: day(0, 16) },
      { caseId: caseYamamoto.id, kind: "staff", userId: service1.id, label: "サービスリーダー", startsAt: day(0, 9), endsAt: day(0, 16, 30) },
      { caseId: caseYamamoto.id, kind: "equipment", label: "プロジェクター＋スクリーン", startsAt: day(0, 11), endsAt: day(0, 15, 30) },
      { caseId: caseTanaka.id, kind: "waiting", venueId: waitA.id, label: "控室A（新郎新婦）", startsAt: day(0, 16, 30), endsAt: day(0, 21) },
      { caseId: caseTanaka.id, kind: "kitchen", venueId: kitchen.id, label: "厨房（第3部）", startsAt: day(0, 16), endsAt: day(0, 20, 30) },
    ],
  });

  // ================= タスク =================
  await prisma.task.createMany({
    data: [
      { caseId: caseIto.id, title: "引出物 発注確定（ギフト住吉）", dueAt: day(-1, 12), assigneeId: tera.id },
      { caseId: caseIto.id, title: "席次表 最終データ入稿（アルバ堂）", dueAt: day(1, 17), assigneeId: tera.id },
      { caseId: caseIto.id, title: "進行表を音響・司会へ共有", dueAt: day(1, 12), assigneeId: tera.id },
      { caseId: caseYamamoto.id, title: "本日 最終打合せ 9:00（全担当）", dueAt: day(0, 9), assigneeId: tera.id },
      { caseId: caseTanaka.id, title: "乾杯挨拶者の氏名読み確認（司会へ共有）", dueAt: day(0, 14), assigneeId: tera.id },
      { caseId: caseTakahashi.id, title: "見積 Ver.2 の承認依頼（支配人へ）", dueAt: day(-1, 18), assigneeId: tera.id },
      { caseId: caseTakahashi.id, title: "ケーキ入刀曲の最終決定（新郎新婦）", dueAt: day(7, 23), assigneeId: groomRen.id },
      { caseId: caseNakajima.id, title: "印刷物 発注確定（アルバ堂）", dueAt: day(2, 17), assigneeId: tera.id },
      { caseId: caseNakajima.id, title: "アレルギー最終確認を料理長へ共有", dueAt: day(3, 12), assigneeId: tera.id },
    ],
  });

  // ================= チャット =================
  const msg = (caseId, senderId, body, minAgo, threadParentId = null) =>
    prisma.chatMessage.create({
      data: { caseId, senderId, body, threadParentId, createdAt: new Date(Date.now() - minAgo * 60000) },
    });

  // 高橋家（打ち合わせ中・スレッド＆リアクションあり）
  const t1 = await msg(caseTakahashi.id, groomRen.id, "入場曲、昨日の候補の2曲目でお願いします！2人ともあの曲が一番しっくりきました 🎵", 60 * 13);
  await msg(caseTakahashi.id, brideMisaki.id, "ケーキ入刀のときの曲も、次の打ち合わせで相談させてください。", 60 * 12.8);
  const t3 = await msg(caseTakahashi.id, tera.id, "承知しました！入場曲は楽曲リストに登録しておきますね。ケーキ入刀曲は次回打ち合わせでご相談しましょう。", 60 * 12, t1.id);
  const t4 = await msg(caseTakahashi.id, hasegawa.id, "確認しました。音源手配しておきます。使用時間はサビ頭から約90秒で調整予定です。", 60 * 2, t1.id);
  await prisma.chatRead.createMany({
    data: [
      { messageId: t1.id, userId: tera.id }, { messageId: t1.id, userId: hasegawa.id },
      { messageId: t3.id, userId: groomRen.id }, { messageId: t3.id, userId: brideMisaki.id },
    ],
  });
  await prisma.chatReaction.createMany({
    data: [
      { messageId: t1.id, userId: tera.id, emoji: "🎉" },
      { messageId: t1.id, userId: hasegawa.id, emoji: "👍" },
      { messageId: t4.id, userId: tera.id, emoji: "🙏" },
    ],
  });

  // 伊藤家（2日後・直前）
  const i1 = await msg(caseIto.id, okada.id, "土曜の台本確認しました。乾杯挨拶の伊藤様のお名前、読みは「ひろかず」で合っていますか？", 45);
  await msg(caseIto.id, floristUser.id, "メインテーブル装花の最終イメージ画像をお送りします。ご確認ください。", 100);
  await msg(caseIto.id, groomIto.id, "当日はよろしくお願いします！両家とも楽しみにしています。", 60 * 5);
  await prisma.chatRead.create({ data: { messageId: i1.id, userId: tera.id } });

  // 本日の2件
  await msg(caseYamamoto.id, chef.id, "本日の山本家、アレルギー対応の最終確認完了です。対応卓には専用ピックを用意しました。", 30);
  await msg(caseTanaka.id, hasegawa.id, "田中家の送賓曲、音源の準備できました。第3部は18時音出しでスタンバイします。", 140);

  // ================= 席次表（高橋家＝新郎新婦と共同編集中の想定） =================
  const mkTable = (caseId, name, sortOrder, capacity, posX, posY) =>
    prisma.seatingTable.create({ data: { caseId, name, sortOrder, capacity, posX, posY } });
  // 会場オブジェクト（高砂・ステージ・司会台）
  await prisma.floorObject.createMany({
    data: [
      { caseId: caseTakahashi.id, kind: "takasago", label: "高砂", posX: 480, posY: 20, width: 280, height: 90 },
      { caseId: caseTakahashi.id, kind: "stage", label: "ステージ", posX: 990, posY: 290, width: 220, height: 150 },
      { caseId: caseTakahashi.id, kind: "mc", label: "司会台", posX: 30, posY: 300, width: 110, height: 80 },
      { caseId: caseTakahashi.id, kind: "custom", label: "ケーキ台", posX: 60, posY: 560, width: 130, height: 90 },
    ],
  });
  const takuA = await mkTable(caseTakahashi.id, "卓A（主賓・上司）", 1, 6, 140, 110);
  const takuB = await mkTable(caseTakahashi.id, "卓B（新郎友人）", 2, 8, 470, 110);
  const takuC = await mkTable(caseTakahashi.id, "卓C（新婦友人）", 3, 8, 800, 110);
  const takuD = await mkTable(caseTakahashi.id, "卓D（両家親族）", 4, 10, 470, 420);
  const seatGuests = [
    ["山田 昌宏", "groom", "主賓", takuA.id], ["西村 香織", "bride", "主賓", takuA.id],
    ["石田 剛", "groom", "上司", takuA.id],
    ["小川 悠斗", "groom", "友人", takuB.id], ["三上 良平", "groom", "友人", takuB.id],
    ["杉本 直樹", "groom", "友人", takuB.id], ["平野 健", "groom", "同僚", takuB.id],
    ["安藤 美穂", "bride", "友人", takuC.id], ["大塚 里奈", "bride", "友人", takuC.id],
    ["柴田 千夏", "bride", "同僚", takuC.id],
    ["高橋 修", "groom", "親族", takuD.id], ["高橋 恵子", "groom", "親族", takuD.id],
    ["佐藤 敏行", "bride", "親族", takuD.id], ["佐藤 由紀", "bride", "親族", takuD.id],
    // 未割当（共同編集の続きがある状態）
    ["内田 拓実", "groom", "友人", null], ["福田 早織", "bride", "恩師", null],
  ];
  await prisma.guest.createMany({
    data: seatGuests.map(([name, side, relation, tableId], k) => ({
      caseId: caseTakahashi.id, name, side, relation, tableId, sortOrder: k,
    })),
  });

  // ================= アフター記録（完了案件のデモ） =================
  const doneCases = await prisma.case.findMany({ where: { status: "done" }, take: 3, orderBy: { weddingDate: "desc" } });
  if (doneCases[0]) {
    await prisma.followUp.createMany({
      data: [
        { caseId: doneCases[0].id, type: "contact", body: "お礼のご連絡＋スナップ写真データの納品完了。1ヶ月後にアルバム仕上がり予定の旨をご案内。", status: "done", staffId: tera.id },
        { caseId: doneCases[0].id, type: "claim", body: "披露宴中盤で空調が効きすぎて寒かったとのご指摘。→ 当日運営チェックリストに「開宴30分後の空調確認」を追加予定。", status: "open", staffId: tera.id },
        { caseId: doneCases[0].id, type: "handover", body: "1周年記念ディナーのご案内対象。来年5月に販促メールを送付すること（担当：プランナー）。", status: "open", staffId: tera.id },
      ],
    });
  }
  if (doneCases[1]) {
    await prisma.followUp.createMany({
      data: [
        { caseId: doneCases[1].id, type: "contact", body: "ご両家へお礼状送付済み。", status: "done", staffId: mori.id },
        { caseId: doneCases[1].id, type: "other", body: "お忘れ物（カメラの充電器）をご返送。受領のご連絡あり。", status: "done", staffId: mori.id },
      ],
    });
  }

  // ================= テンプレート（7種・実用内容） =================
  await prisma.template.createMany({ data: buildTemplates() });

  const caseCount = await prisma.case.count();
  console.log(`Seed 完了 🎉  案件 ${caseCount}件（完了6・本日2・進行中${caseCount - 8}）／テンプレート7種`);
  console.log("ログイン: tera@azon.jp / wedding2026（他アカウントも同一パスワード）");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
