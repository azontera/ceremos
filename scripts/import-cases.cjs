// 実データ移行スクリプト（W8）— CSVから案件を一括登録
// 使い方:
//   node scripts/import-cases.cjs data/cases.csv --dry-run   ← 確認のみ
//   node scripts/import-cases.cjs data/cases.csv             ← 実行
//
// CSV形式（1行目はヘッダー、docs/import-sample.csv 参照）:
//   新郎氏名,新婦氏名,挙式日(YYYY-MM-DD),開始時刻(HH:MM),終了時刻(HH:MM),披露宴会場名,招待人数,メール,電話,担当プランナーのメール
// ※ 旧形式（4列目が部 1-3）も自動判別して取り込み可能（第1部=11:30〜15:30 / 第2部=15:30〜19:30 / 第3部=18:00〜22:00）
/* eslint-disable */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function parseCsv(text) {
  return text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(",").map((c) => c.trim()));
}

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!file || !fs.existsSync(file)) {
    console.error("CSVファイルを指定してください。例: node scripts/import-cases.cjs data/cases.csv --dry-run");
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(file, "utf-8")).slice(1); // ヘッダーを除く
  const venues = await prisma.venue.findMany();
  const users = await prisma.user.findMany();

  const SLOT_TIMES = { 1: ["11:30", "15:30"], 2: ["15:30", "19:30"], 3: ["18:00", "22:00"] };
  const isHM = (s) => /^\d{1,2}:\d{2}$/.test(s || "");

  let okCount = 0, ngCount = 0;
  for (const [i, r] of rows.entries()) {
    let [groom, bride, date, col4, col5, ...rest] = r;
    const line = i + 2;
    const errs = [];

    // 新形式（開始,終了）／旧形式（部 1-3）を自動判別
    let startHM, endHM, venueName, guests, email, phone, plannerEmail;
    if (isHM(col4)) {
      startHM = col4;
      endHM = isHM(col5) ? col5 : null;
      [venueName, guests, email, phone, plannerEmail] = rest;
    } else {
      const slotN = Number(col4 || 1);
      if (![1, 2, 3].includes(slotN)) errs.push(`開始時刻または部が不正（${col4}）`);
      [startHM, endHM] = SLOT_TIMES[slotN] ?? SLOT_TIMES[1];
      [venueName, guests, email, phone, plannerEmail] = [col5, ...rest];
    }

    if (!groom || !bride) errs.push("氏名が空");
    const weddingDate = new Date(`${date}T${(startHM || "11:30").padStart(5, "0")}:00`);
    if (isNaN(weddingDate.getTime())) errs.push(`挙式日が不正（${date}）`);
    let endTime = null;
    if (endHM && !isNaN(weddingDate.getTime())) {
      endTime = new Date(`${date}T${endHM.padStart(5, "0")}:00`);
      if (endTime <= weddingDate) endTime.setDate(endTime.getDate() + 1);
    }
    const effEnd = endTime ?? new Date(weddingDate.getTime() + 4 * 3600000);
    const venue = venues.find((v) => v.name === venueName);
    if (venueName && !venue) errs.push(`会場が見つからない（${venueName}）`);
    const planner = users.find((u) => u.email === (plannerEmail || "").toLowerCase());
    if (plannerEmail && !planner) errs.push(`プランナーが見つからない（${plannerEmail}）`);

    // 重複チェック：同一会場×時間帯の重なり
    if (venue && !errs.length) {
      const dayStart = new Date(weddingDate); dayStart.setHours(0, 0, 0, 0);
      const sameVenue = await prisma.case.findMany({
        where: {
          banquetVenueId: venue.id,
          weddingDate: { gte: new Date(dayStart.getTime() - 86400000), lt: new Date(dayStart.getTime() + 2 * 86400000) },
        },
      });
      const conflict = sameVenue.find((w) => {
        const wEnd = w.endTime && w.endTime > w.weddingDate ? w.endTime : new Date(w.weddingDate.getTime() + 4 * 3600000);
        return weddingDate < wEnd && effEnd > w.weddingDate;
      });
      if (conflict) errs.push(`バンケット重複（${venueName} に ${conflict.groomName} 様の予定と時間帯が重複）`);
    }

    if (errs.length) {
      ngCount++;
      console.log(`✗ ${line}行目: ${groom} & ${bride} — ${errs.join(" / ")}`);
      continue;
    }
    okCount++;
    console.log(`✓ ${line}行目: ${groom} & ${bride}（${date} ${startHM}〜${endHM ?? "＋4時間"} ${venueName || "会場未定"}）${dryRun ? "[dry-run]" : ""}`);

    if (!dryRun) {
      await prisma.case.create({
        data: {
          groomName: groom, brideName: bride,
          weddingDate, endTime,
          banquetVenueId: venue?.id ?? null,
          guestCount: Number(guests || 0),
          email: email || null, phone: phone || null,
          status: "contracted",
          plannerId: planner?.id ?? null,
          members: planner ? { create: { userId: planner.id, roleInCase: "planner" } } : undefined,
          rundownItems: {
            create: [
              { time: "11:30", title: "挙式（チャペル）", sortOrder: 1, roles: "mc,audio,photo" },
              { time: "12:30", title: "新郎新婦 入場", sortOrder: 2, roles: "mc,audio,photo" },
              { time: "12:33", title: "ウェルカムスピーチ・乾杯", sortOrder: 3, roles: "mc,catering" },
              { time: "13:05", title: "ケーキ入刀", sortOrder: 4, roles: "mc,audio,photo" },
              { time: "14:50", title: "新婦の手紙・花束贈呈", sortOrder: 5, roles: "mc,audio" },
              { time: "15:20", title: "送賓", sortOrder: 6, roles: "service,audio" },
            ],
          },
        },
      });
    }
  }
  console.log(`\n${dryRun ? "【dry-run】" : ""}取込 ${okCount}件 / スキップ ${ngCount}件`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
