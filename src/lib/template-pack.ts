// テンプレート・パック（AIで生成する「一式テンプレ」）
// 1つのJSONに 見積・料理・進行台本・会場リソース（STAFF/設備）・ウィザード適合条件 をまとめる。
// 適用時は案件へ「コピー」される（適用後にテンプレを編集しても案件へは同期しない／逆も同じ）。
import { prisma } from "./db";
import { applyRundownTemplateToCase } from "./rundown";
import { effectiveEnd } from "./case-time";
import { scaleQuoteItems, expandStaffCount, numberedLabel } from "./pack-scaling";

// perGuest: 1名あたり品目（数値=1名あたりの数量係数。true=1。人数で qty が自動調整される）
export type PackQuoteItem = { name: string; category?: string; qty?: number; unitPrice?: number; perGuest?: number | boolean };
export type PackMenuItem = { course?: string; name: string; desc?: string; cost?: number; price?: number };
export type PackRundownItem = { time?: string; title: string; note?: string; mcScript?: string; durationMin?: number; roles?: string };
// perGuests: ゲスト◯名につきスタッフ1名（人数で行数が自動展開される。設備には通常不要）
export type PackResource = { label: string; startOffsetMin?: number; endOffsetMin?: number; perGuests?: number };

export type TemplatePack = {
  kind?: string; // "ceremos-template-pack"
  version?: number;
  name: string;
  category?: "bridal" | "banquet" | "other";
  description?: string;
  // ウィザードの適合条件（お客様/プランナーの回答とマッチング）
  wizard?: {
    styles?: string[];      // chapel / garden / night / wakon / small / casual / formal / party / ceremony / dinnershow
    guestMin?: number; guestMax?: number;
    budgetManMin?: number; budgetManMax?: number; // 万円
    timeSlots?: string[];   // day / evening / night
  };
  quote?: { items: PackQuoteItem[] };
  menu?: { items: PackMenuItem[] };
  rundown?: { startTime?: string; items: PackRundownItem[] };
  resources?: { staff?: PackResource[]; equipment?: PackResource[]; useRooms?: boolean };
  seating?: { perTable?: number };
};

export const PACK_STYLE_LABELS: [string, string][] = [
  ["chapel", "⛪ チャペル挙式"], ["garden", "🌿 ガーデン"], ["night", "🌙 ナイト"],
  ["wakon", "🎎 和婚・神前"], ["small", "👨‍👩‍👧 少人数・会食"], ["casual", "🎈 カジュアル"],
  ["formal", "🎩 フォーマル"], ["party", "🥂 宴会・パーティ"], ["ceremony", "🎖 式典"],
  ["dinnershow", "🎤 ディナーショー"],
];

/** JSON文字列 → TemplatePack（検証つき）。エラー時は error を返す */
export function parsePack(raw: string): { pack?: TemplatePack; error?: string } {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return { error: "JSONとして読み込めません（形式を確認してください）" }; }
  const p = obj as TemplatePack;
  if (!p || typeof p !== "object") return { error: "JSONオブジェクトではありません" };
  if (!p.name || typeof p.name !== "string") return { error: "name（テンプレ名）がありません" };
  const hasAny = (p.quote?.items?.length ?? 0) > 0 || (p.rundown?.items?.length ?? 0) > 0 || (p.menu?.items?.length ?? 0) > 0;
  if (!hasAny) return { error: "quote / menu / rundown のいずれも空です（最低1つは items を入れてください）" };
  for (const it of p.quote?.items ?? []) {
    if (!it.name) return { error: "quote.items に name の無い行があります" };
  }
  for (const it of p.rundown?.items ?? []) {
    if (!it.title) return { error: "rundown.items に title の無い行があります" };
  }
  for (const it of p.menu?.items ?? []) {
    if (!it.name) return { error: "menu.items に name の無い行があります" };
  }
  return { pack: p };
}

/** パックの内容サマリ（一覧カード表示用） */
export function packSummary(p: TemplatePack) {
  const quoteTotal = (p.quote?.items ?? []).reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0);
  return {
    quoteCount: p.quote?.items?.length ?? 0,
    quoteTotal,
    menuCount: p.menu?.items?.length ?? 0,
    rundownCount: p.rundown?.items?.length ?? 0,
    staffCount: p.resources?.staff?.length ?? 0,
    equipmentCount: p.resources?.equipment?.length ?? 0,
  };
}

/** 実名トークンの逆置換：案件の実データ（進行表など）を汎用テンプレへ戻す */
export function stripNameTokens(text: string | null | undefined, groom: string, bride: string): string | undefined {
  if (!text) return undefined;
  const gSei = groom.split(/[ 　]/)[0] || groom;
  const bSei = bride.split(/[ 　]/)[0] || bride;
  let out = text;
  if (groom) out = out.split(groom).join("{新郎}");
  if (bride && bride !== "―") out = out.split(bride).join("{新婦}");
  if (gSei) out = out.split(gSei).join("{新郎姓}");
  if (bSei && bSei !== "―") out = out.split(bSei).join("{新婦姓}");
  return out;
}

/** スタッフ・設備ラベルの末尾番号（①②③ / (1)(2)）を除去（テンプレ化時の重複展開防止） */
export function stripLabelNumber(label: string): string {
  return label.replace(/[①-⑮]$/, "").replace(/\(\d+\)$/, "").trim();
}

/**
 * 実際の案件（見積・料理・進行表・リソース・席次）から TemplatePack を組み立てる
 * 「カタログで組んだ見積もりをそのままテンプレの元にする」ための逆変換
 */
export async function buildPackFromCase(
  caseId: string,
  opts: { name: string; category?: "bridal" | "banquet" | "other"; description?: string },
): Promise<{ pack?: TemplatePack; error?: string }> {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      quotes: { include: { items: true }, orderBy: { version: "desc" } },
      rundownItems: { orderBy: { sortOrder: "asc" } },
      assignments: true,
      seatingTables: true,
    },
  });
  if (!c) return { error: "案件が見つかりません" };

  const quote = c.quotes.find((q) => q.status === "approved") ?? c.quotes.find((q) => q.status === "confirmed") ?? c.quotes[0];
  const menuItems = await prisma.menuItem.findMany({ where: { caseId }, orderBy: { sortOrder: "asc" } });
  if (!quote && menuItems.length === 0 && c.rundownItems.length === 0) {
    return { error: "この案件にはまだ見積・料理・進行表のデータがありません" };
  }
  const groom = c.groomName, bride = c.brideName;

  const quoteItems: PackQuoteItem[] = (quote?.items ?? []).map((i) => ({
    name: i.name, category: i.category, qty: i.qty, unitPrice: i.unitPrice,
  }));
  const menuPack: PackMenuItem[] = menuItems.map((m) => ({
    course: m.course, name: m.name, desc: m.desc ?? undefined, cost: m.cost, price: m.price,
  }));
  const rundownPack: PackRundownItem[] = c.rundownItems.map((r) => ({
    time: r.time,
    title: stripNameTokens(r.title, groom, bride) ?? r.title,
    note: stripNameTokens(r.note, groom, bride),
    mcScript: stripNameTokens(r.mcScript, groom, bride),
    durationMin: r.durationMin ?? undefined,
    roles: r.roles || undefined,
  }));

  const staffRows = c.assignments.filter((a) => a.kind === "staff");
  const equipRows = c.assignments.filter((a) => a.kind === "equipment");
  const start = c.weddingDate;
  const end = effectiveEnd(c.weddingDate, c.endTime);
  const offsetMin = (d: Date, base: Date) => Math.round((d.getTime() - base.getTime()) / 60000);
  // 同名（連番除去後）をまとめて1行に集約（人数展開の再現用にperGuestsは付けない＝そのままの人数で再現）
  const dedupeByLabel = (rows: typeof staffRows) => {
    const seen = new Map<string, PackResource>();
    for (const r of rows) {
      const label = stripLabelNumber(r.label);
      if (!seen.has(label)) {
        seen.set(label, { label, startOffsetMin: offsetMin(r.startsAt, start), endOffsetMin: offsetMin(r.endsAt, end) });
      }
    }
    return [...seen.values()];
  };

  const tables = c.seatingTables;
  const avgCap = tables.length > 0 ? Math.round(tables.reduce((s, t) => s + t.capacity, 0) / tables.length) : 8;

  const guests = Math.max(1, c.guestCount || 60);
  const budgetMan = quote ? Math.round(quote.total / 10000) : undefined;

  const pack: TemplatePack = {
    kind: "ceremos-template-pack",
    version: 1,
    name: opts.name,
    category: opts.category ?? "other",
    description: opts.description ?? `案件「${groom}${bride && bride !== "―" ? `・${bride}` : ""}」の実例から作成`,
    wizard: {
      guestMin: Math.max(1, Math.round(guests * 0.7)),
      guestMax: Math.round(guests * 1.4),
      ...(budgetMan ? { budgetManMin: Math.round(budgetMan * 0.75), budgetManMax: Math.round(budgetMan * 1.3) } : {}),
    },
    ...(quoteItems.length > 0 ? { quote: { items: quoteItems } } : {}),
    ...(menuPack.length > 0 ? { menu: { items: menuPack } } : {}),
    ...(rundownPack.length > 0 ? { rundown: { startTime: rundownPack[0]?.time, items: rundownPack } } : {}),
    resources: {
      staff: dedupeByLabel(staffRows),
      equipment: dedupeByLabel(equipRows),
    },
    seating: { perTable: Math.max(2, Math.min(12, avgCap)) },
  };
  return { pack };
}

export type WizardAnswers = { style?: string; guests?: number; budgetMan?: number; timeSlot?: string };

/** ウィザード回答とのマッチ度（高いほど適合）＋理由 */
export function scorePack(p: TemplatePack, a: WizardAnswers): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const w = p.wizard ?? {};
  if (a.style && w.styles?.length) {
    if (w.styles.includes(a.style)) { score += 5; reasons.push("ご希望のスタイルに対応"); }
    else score -= 2;
  }
  if (a.guests) {
    const min = w.guestMin ?? 0, max = w.guestMax ?? 9999;
    if (a.guests >= min && a.guests <= max) { score += 3; reasons.push(`${a.guests}名規模に対応`); }
    else score -= Math.min(3, Math.ceil(Math.abs(a.guests - (a.guests < min ? min : max)) / 20));
  }
  if (a.budgetMan) {
    const min = w.budgetManMin ?? 0, max = w.budgetManMax ?? 99999;
    if (a.budgetMan >= min && a.budgetMan <= max) { score += 3; reasons.push("ご予算帯に対応"); }
    else score -= 1;
  }
  if (a.timeSlot && w.timeSlots?.length) {
    if (w.timeSlots.includes(a.timeSlot)) { score += 2; reasons.push("ご希望の時間帯に対応"); }
  }
  return { score, reasons };
}

/** DBの type="pack" テンプレを全件パースして返す */
export async function loadPacks(): Promise<{ id: string; pack: TemplatePack }[]> {
  const rows = await prisma.template.findMany({ where: { type: "pack" }, orderBy: { name: "asc" } });
  const out: { id: string; pack: TemplatePack }[] = [];
  for (const r of rows) {
    const { pack } = parsePack(r.bodyJson);
    if (pack) out.push({ id: r.id, pack: { ...pack, name: pack.name || r.name } });
  }
  return out;
}

/**
 * パックを案件へ適用（すべてコピー。適用後の編集はテンプレと同期しない）
 * - 見積：新バージョン（draft）を作成（quote.items があるとき）
 * - 料理：メニューが空のときのみ作成
 * - 席次：卓が無いときのみ人数から自動配置
 * - リソース：割当が無いときのみ、控室/厨房＋パックのSTAFF・設備（無ければ標準セット）
 * - 進行表：未編集（台本なし・全曲未定）のときのみ置換
 * - 手配リスト：発注が無いときのみ、見積部門から作成
 */
export async function applyPackToCase(
  caseId: string,
  pack: TemplatePack,
  opts: { createQuote?: boolean; createdBy?: string | null } = {},
): Promise<string[]> {
  const done: string[] = [];
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { guestCount: true, weddingDate: true, endTime: true, groomName: true, brideName: true },
  });
  if (!c) return done;

  const guests = Math.max(1, c.guestCount || 60);

  // ① 見積（新バージョン draft）— 人数連動：1名あたり品目（perGuest / 「× ◯名」表記）は qty を人数で自動調整
  let quoteVersion: number | null = null;
  const qItems = scaleQuoteItems((pack.quote?.items ?? []).filter((i) => i.name?.trim()), guests);
  if (opts.createQuote !== false && qItems.length > 0) {
    const last = await prisma.quote.findFirst({ where: { caseId }, orderBy: { version: "desc" } });
    const total = qItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0);
    const q = await prisma.quote.create({
      data: {
        caseId,
        version: (last?.version ?? 0) + 1,
        status: "draft",
        total,
        note: `テンプレ「${pack.name}」から作成`,
        createdBy: opts.createdBy ?? null,
        items: {
          create: qItems.map((i) => ({
            name: i.name.trim(),
            category: i.category || "other",
            qty: Number(i.qty) || 1,
            unitPrice: Number(i.unitPrice) || 0,
          })),
        },
      },
    });
    quoteVersion = q.version;
    done.push(`見積 Ver.${q.version}（下書き・${qItems.length}品目・${guests}名で数量調整）を作成`);
  }

  // ② 料理メニュー（クリアして上書き：テンプレの料理が常に正となる）
  const mItems = (pack.menu?.items ?? []).filter((i) => i.name?.trim());
  if (mItems.length > 0) {
    const [del] = await prisma.$transaction([
      prisma.menuItem.deleteMany({ where: { caseId } }),
      prisma.menuItem.createMany({
        data: mItems.map((m, i) => ({
          caseId, course: m.course || "前菜", name: m.name.trim(), desc: m.desc ?? null,
          cost: Number(m.cost) || 0, price: Number(m.price) || 0, sortOrder: i + 1,
        })),
      }),
    ]);
    done.push(del.count > 0
      ? `料理メニューを ${mItems.length}品で上書き（旧${del.count}品はクリア）`
      : `料理タブにコースメニュー ${mItems.length}品を作成`);
  }

  // ③ 席次（卓が無いときのみ）— 人数から卓数を自動計算
  if ((await prisma.seatingTable.count({ where: { caseId } })) === 0) {
    const per = Math.max(2, Math.min(12, pack.seating?.perTable ?? 8));
    const tables = Math.max(1, Math.min(12, Math.ceil(guests / per)));
    await prisma.seatingTable.createMany({
      data: Array.from({ length: tables }, (_, i) => ({
        caseId,
        name: `卓${String.fromCharCode(65 + (i % 26))}`,
        capacity: per,
        sortOrder: i + 1,
        posX: 130 + (i % 3) * 340,
        posY: 190 + Math.floor(i / 3) * 300,
      })),
    });
    await prisma.floorObject.create({
      data: { caseId, kind: "takasago", label: "高砂", posX: 480, posY: 24, width: 280, height: 90 },
    });
    done.push(`席次表に ${guests}名想定のレイアウトを作成（${per}名掛け×${tables}卓＋高砂）`);
  }

  // ④ リソース（割当が無いときのみ）：控室・厨房＋STAFF・設備
  if ((await prisma.assignment.count({ where: { caseId } })) === 0) {
    const start = c.weddingDate;
    const end = effectiveEnd(c.weddingDate, c.endTime);
    const at = (base: Date, offsetMin: number) => new Date(base.getTime() + offsetMin * 60000);
    const data: { kind: string; label: string; venueId?: string; startsAt: Date; endsAt: Date }[] = [];
    if (pack.resources?.useRooms !== false) {
      const waiting = await prisma.venue.findMany({ where: { type: "waiting" }, orderBy: { name: "asc" } });
      const kitchen = await prisma.venue.findFirst({ where: { type: "kitchen" } });
      if (waiting[0]) data.push({ kind: "waiting", label: "新郎新婦 控室", venueId: waiting[0].id, startsAt: at(start, -150), endsAt: at(end, 30) });
      if (waiting[1]) data.push({ kind: "waiting", label: "親族控室", venueId: waiting[1].id, startsAt: at(start, -90), endsAt: end });
      if (kitchen) data.push({ kind: "kitchen", label: "コース仕込み・提供", venueId: kitchen.id, startsAt: at(start, -210), endsAt: at(end, -30) });
    }
    const staff: PackResource[] = pack.resources?.staff?.length
      ? pack.resources.staff
      : [
          { label: "キャプテン（現場統括）", startOffsetMin: -120, endOffsetMin: 60 },
          { label: "音響・照明オペレーター", startOffsetMin: -90, endOffsetMin: 30 },
          { label: "司会者", startOffsetMin: -60, endOffsetMin: 0 },
          { label: "サービススタッフ（配膳）", startOffsetMin: -60, endOffsetMin: 30, perGuests: 20 }, // ゲスト20名につき1名
        ];
    for (const r of staff) {
      if (!r.label?.trim()) continue;
      // 人数連動：perGuests（ゲスト◯名につき1名）→ 必要人数分の行に展開（例: 60名÷20 → ①②③）
      const count = expandStaffCount(guests, r.perGuests);
      for (let i = 0; i < count; i++) {
        data.push({
          kind: "staff",
          label: numberedLabel(r.label.trim(), i, count),
          startsAt: at(start, r.startOffsetMin ?? -60),
          endsAt: at(end, r.endOffsetMin ?? 0),
        });
      }
    }
    const equipment = pack.resources?.equipment?.length
      ? pack.resources.equipment
      : [
          { label: "音響機材一式", startOffsetMin: -90, endOffsetMin: 30 },
          { label: "プロジェクター・スクリーン", startOffsetMin: -60, endOffsetMin: 0 },
        ];
    for (const r of equipment) {
      if (!r.label?.trim()) continue;
      data.push({ kind: "equipment", label: r.label.trim(), startsAt: at(start, r.startOffsetMin ?? -60), endsAt: at(end, r.endOffsetMin ?? 0) });
    }
    if (data.length > 0) {
      await prisma.assignment.createMany({ data: data.map((d) => ({ caseId, ...d })) });
      done.push(`リソースに${data.length}件を登録（控室・厨房・STAFF・設備）`);
    }
  }

  // ⑤ 進行表（未編集のときのみ置換）
  const rItems = (pack.rundown?.items ?? []).filter((i) => i.title?.trim());
  if (rItems.length > 0) {
    const rd = await prisma.rundownItem.findMany({ where: { caseId }, include: { song: true } });
    const untouched = rd.length === 0 || rd.every((r) => !r.mcScript && (!r.song || r.song.title === "（曲未定）"));
    if (untouched) {
      const startTime = pack.rundown?.startTime;
      await applyRundownTemplateToCase(
        caseId,
        rItems.map((i, idx) => ({
          time: i.time || startTime || "11:30",
          title: i.title, note: i.note, mcScript: i.mcScript,
          durationMin: i.durationMin, roles: i.roles,
          ...(idx === 0 && startTime ? { time: startTime } : {}),
        })),
        c.groomName ?? "新郎",
        c.brideName ?? "新婦",
      );
      done.push(`進行表を「${pack.name}」で作成（${rItems.length}演目・司会台本・曲枠つき）`);
    }
  }

  // ⑥ 手配リスト（発注が無いときのみ・見積部門から）
  if (qItems.length > 0 && (await prisma.order.count({ where: { caseId } })) === 0) {
    const ARRANGE_CATS = ["catering", "florist", "dress", "beauty", "photo", "video", "mc", "audio", "print", "gift"];
    const CAT_LABEL: Record<string, string> = {
      dress: "ドレス", florist: "装花", catering: "料理", audio: "音響",
      mc: "司会", photo: "写真", video: "映像", gift: "引出物", print: "印刷物", beauty: "美容",
    };
    const vendorList = await prisma.vendor.findMany({ select: { id: true, category: true } });
    const soleVendorOfCat = (cat: string) => {
      const vs = vendorList.filter((v) => v.category === cat);
      return vs.length === 1 ? vs[0].id : null;
    };
    const byCat = new Map<string, number>();
    for (const it of qItems) {
      const cat = it.category || "other";
      if (!ARRANGE_CATS.includes(cat)) continue;
      byCat.set(cat, (byCat.get(cat) ?? 0) + (Number(it.qty) || 1) * (Number(it.unitPrice) || 0));
    }
    if (byCat.size > 0) {
      const dueAt = new Date(c.weddingDate.getTime() - 14 * 86400000);
      await prisma.order.createMany({
        data: [...byCat.entries()].map(([cat, amount]) => ({
          caseId, category: cat, amount,
          vendorId: soleVendorOfCat(cat),
          dueAt, status: "pending",
          note: CAT_LABEL[cat] ?? cat, // 品目名はシンプルに（出所の注記は付けない）
        })),
      });
      done.push(`手配リスト（発注タブ）に${byCat.size}部門を作成（納期＝開催14日前・未確定）`);
    }
  }

  return done;
}
