import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { menuPresetForTemplate } from "@/lib/menu-presets";
import { effectiveEnd } from "@/lib/case-time";
import { applyRundownTemplateToCase } from "@/lib/rundown";

// POST: 新バージョン作成（items 付き）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "quotes", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const items: { name: string; category?: string; qty: number; unitPrice: number }[] =
    Array.isArray(b.items) ? b.items.filter((i: any) => i?.name?.trim()) : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "明細を1件以上入力してください" }, { status: 400 });
  }
  try {
    const last = await prisma.quote.findFirst({
      where: { caseId: params.id },
      orderBy: { version: "desc" },
    });
    const total = items.reduce((sum, i) => sum + Number(i.qty || 0) * Number(i.unitPrice || 0), 0);
    const q = await prisma.quote.create({
      data: {
        caseId: params.id,
        version: (last?.version ?? 0) + 1,
        status: "draft",
        total,
        note: b.note || null,
        createdBy: s.userId,
        items: {
          create: items.map((i: any) => ({
            name: i.name.trim(),
            category: i.category || "other",
            qty: Number(i.qty || 1),
            unitPrice: Number(i.unitPrice || 0),
            vendorId: i.vendorId || null, // 発注先（承認時に発注を自動作成）
          })),
        },
      },
      include: { items: true },
    });
    await audit(s.userId, "create", "quote", q.id, { version: q.version, total });

    // ===== テンプレ一式（pack）連動の自動セットアップ =====
    // 見積はすでに上で作成済みなので、料理・席次・リソース・進行表・手配リストをパック内容で作成
    const autoSetup: string[] = [];
    if (b.packId) {
      const { parsePack, applyPackToCase } = await import("@/lib/template-pack");
      const tpl = await prisma.template.findFirst({ where: { id: String(b.packId), type: "pack" } });
      if (tpl) {
        const { pack } = parsePack(tpl.bodyJson);
        if (pack) {
          const done = await applyPackToCase(params.id, pack, { createQuote: false, createdBy: s.userId });
          autoSetup.push(...done);
        }
      }
      return NextResponse.json({ quote: q, autoSetup }, { status: 201 });
    }

    // ===== （旧）見積テンプレ名キーワード連動の自動セットアップ =====
    // ①料理：グレードに合ったコースメニューを自動作成（既にメニューがあれば触らない）
    // ②席次：人数からおすすめレイアウト（円卓＋高砂）を自動配置（既に卓があれば触らない）
    if (b.templateName) {
      const preset = menuPresetForTemplate(String(b.templateName));
      const menuCount = await prisma.menuItem.count({ where: { caseId: params.id } });
      if (preset && menuCount === 0) {
        await prisma.menuItem.createMany({
          data: preset.map((m, i) => ({
            caseId: params.id, course: m.course, name: m.name, desc: m.desc ?? null,
            cost: m.cost, price: m.price, sortOrder: i + 1,
          })),
        });
        autoSetup.push(`料理タブにコースメニュー ${preset.length}品を作成（原価・売値入り）`);
      }
      const tableCount = await prisma.seatingTable.count({ where: { caseId: params.id } });
      if (tableCount === 0) {
        const c2 = await prisma.case.findUnique({ where: { id: params.id }, select: { guestCount: true } });
        const guests = Math.max(1, c2?.guestCount ?? 60);
        const tables = Math.max(1, Math.min(12, Math.ceil(guests / 8))); // 8名掛け基準
        await prisma.seatingTable.createMany({
          data: Array.from({ length: tables }, (_, i) => ({
            caseId: params.id,
            name: `卓${String.fromCharCode(65 + (i % 26))}`,
            capacity: 8,
            sortOrder: i + 1,
            posX: 130 + (i % 3) * 340,
            posY: 190 + Math.floor(i / 3) * 300,
          })),
        });
        await prisma.floorObject.create({
          data: { caseId: params.id, kind: "takasago", label: "高砂", posX: 480, posY: 24, width: 280, height: 90 },
        });
        autoSetup.push(`席次表に ${guests}名想定のレイアウトを作成（円卓${tables}卓×8名＋高砂）`);
      }
      // ③リソース：控室・厨房・機材の標準セットを挙式時間に合わせて自動登録（既にあれば触らない）
      const asgCount = await prisma.assignment.count({ where: { caseId: params.id } });
      if (asgCount === 0) {
        const c3 = await prisma.case.findUnique({ where: { id: params.id }, select: { weddingDate: true, endTime: true } });
        if (c3) {
          const start = c3.weddingDate;
          const end = effectiveEnd(c3.weddingDate, c3.endTime);
          const at = (base: Date, offsetMin: number) => new Date(base.getTime() + offsetMin * 60000);
          const waiting = await prisma.venue.findMany({ where: { type: "waiting" }, orderBy: { name: "asc" } });
          const kitchen = await prisma.venue.findFirst({ where: { type: "kitchen" } });
          const data: { kind: string; label: string; venueId?: string; startsAt: Date; endsAt: Date }[] = [];
          if (waiting[0]) data.push({ kind: "waiting", label: "新郎新婦 控室", venueId: waiting[0].id, startsAt: at(start, -150), endsAt: at(end, 30) });
          if (waiting[1]) data.push({ kind: "waiting", label: "親族控室", venueId: waiting[1].id, startsAt: at(start, -90), endsAt: end });
          if (kitchen) data.push({ kind: "kitchen", label: "コース仕込み・提供", venueId: kitchen.id, startsAt: at(start, -210), endsAt: at(end, -30) });
          // スタッフの動き（音響照明・キャプテン・司会・サービス）→ バーチャートの👥行に出る
          data.push({ kind: "staff", label: "キャプテン（現場統括）", startsAt: at(start, -120), endsAt: at(end, 60) });
          data.push({ kind: "staff", label: "音響・照明オペレーター", startsAt: at(start, -90), endsAt: at(end, 30) });
          data.push({ kind: "staff", label: "司会者", startsAt: at(start, -60), endsAt: end });
          data.push({ kind: "staff", label: "サービススタッフ（配膳）", startsAt: at(start, -60), endsAt: at(end, 30) });
          data.push({ kind: "equipment", label: "音響機材一式", startsAt: at(start, -90), endsAt: at(end, 30) });
          data.push({ kind: "equipment", label: "プロジェクター・スクリーン", startsAt: at(start, -60), endsAt: end });
          data.push({ kind: "equipment", label: "装花 搬入・セット", startsAt: at(start, -210), endsAt: at(start, -60) });
          // 備品：見積テンプレ名のキーワードに合わせて追加（ガーデン・ナイト・和婚・ディナーショー等）
          const qn0 = String(b.templateName);
          if (qn0.includes("ガーデン")) {
            data.push({ kind: "equipment", label: "ガーデン設営・屋外音響", startsAt: at(start, -180), endsAt: at(end, 60) });
            data.push({ kind: "equipment", label: "デザートビュッフェ台（ガーデン）", startsAt: at(start, -120), endsAt: end });
          }
          if (qn0.includes("ナイト")) {
            data.push({ kind: "equipment", label: "照明演出機材（ナイト）", startsAt: at(start, -120), endsAt: at(end, 30) });
          }
          if (qn0.includes("和婚") || qn0.includes("神前")) {
            data.push({ kind: "equipment", label: "和装小物・番傘・毛氈", startsAt: at(start, -120), endsAt: end });
          }
          if (qn0.includes("ディナーショー") || qn0.includes("式典")) {
            data.push({ kind: "equipment", label: "ステージ照明・追加音響", startsAt: at(start, -180), endsAt: at(end, 60) });
          }
          await prisma.assignment.createMany({
            data: data.map((d) => ({ caseId: params.id, ...d })),
          });
          autoSetup.push(`リソースに標準セット${data.length}件を登録（控室・厨房・キャプテン・音響照明・司会・機材）`);
        }
      }
      // ④進行表：未編集（台本なし・曲もすべて未定）なら、選択 or 見積テンプレ名から推定したテンプレで自動作成
      const rd = await prisma.rundownItem.findMany({ where: { caseId: params.id }, include: { song: true } });
      const untouched = rd.length === 0 || rd.every((r) => !r.mcScript && (!r.song || r.song.title === "（曲未定）"));
      if (untouched) {
        // 見積テンプレ名 → 進行表テンプレの自動推定（見積画面で明示選択があればそちら優先）
        const qn = String(b.templateName);
        const mark = qn.includes("ガーデン") ? "②"
          : qn.includes("人前") ? "③"
          : qn.includes("ナイト") ? "⑤"
          : qn.includes("少人数") || qn.includes("会食") ? "⑥"
          : qn.includes("和婚") || qn.includes("神前") ? "⑦"
          : qn.includes("二部") ? "⑧"
          : qn.includes("1.5") ? "⑨"
          : qn.includes("宴会") || qn.includes("パーティ") || qn.includes("式典") || qn.includes("ディナーショー") ? "⑪"
          : "①";
        const tpl = (b.rundownTemplateId
            ? await prisma.template.findFirst({ where: { id: String(b.rundownTemplateId), type: "rundown" } })
            : null)
          ?? await prisma.template.findFirst({ where: { type: "rundown", isSystem: true, name: { startsWith: mark } } })
          ?? await prisma.template.findFirst({ where: { type: "rundown", isSystem: true } });
        if (tpl) {
          let tItems: { time: string; title: string; note?: string; roles?: string; durationMin?: number; mcScript?: string }[] = [];
          try { tItems = JSON.parse(tpl.bodyJson ?? "{}").items ?? []; } catch { /* ignore */ }
          if (tItems.length > 0) {
            const c4 = await prisma.case.findUnique({ where: { id: params.id }, select: { groomName: true, brideName: true } });
            await applyRundownTemplateToCase(params.id, tItems, c4?.groomName ?? "新郎", c4?.brideName ?? "新婦");
            autoSetup.push(`進行表を「${tpl.name}」で作成（司会台本・タイミング入り）`);
          }
        }
      }
      // ⑤手配リスト：見積の部門から外部手配（発注）を自動作成（既に発注があれば触らない）
      // 発注先が未定でも「未確定」の発注行＝手配リストとして案件に載せ、抜け漏れを防ぐ
      const orderCount = await prisma.order.count({ where: { caseId: params.id } });
      if (orderCount === 0) {
        const ARRANGE_CATS = ["catering", "florist", "dress", "beauty", "photo", "video", "mc", "audio", "print", "gift"];
        const CAT_LABEL: Record<string, string> = {
          dress: "ドレス", florist: "装花", catering: "料理", audio: "音響",
          mc: "司会", photo: "写真", video: "映像", gift: "引出物", print: "印刷物", beauty: "美容",
        };
        const c5 = await prisma.case.findUnique({ where: { id: params.id }, select: { weddingDate: true } });
        const vendorList = await prisma.vendor.findMany({ select: { id: true, category: true } });
        const soleVendorOfCat = (cat: string) => {
          const vs = vendorList.filter((v) => v.category === cat);
          return vs.length === 1 ? vs[0].id : null;
        };
        const byCat = new Map<string, { amount: number; vendorId: string | null }>();
        for (const it of items) {
          const cat = it.category || "other";
          if (!ARRANGE_CATS.includes(cat)) continue;
          const cur = byCat.get(cat) ?? { amount: 0, vendorId: null };
          cur.amount += Number(it.qty || 0) * Number(it.unitPrice || 0);
          const vId = (it as { vendorId?: string | null }).vendorId;
          if (vId) cur.vendorId = vId;
          byCat.set(cat, cur);
        }
        if (byCat.size > 0) {
          const dueAt = c5 ? new Date(c5.weddingDate.getTime() - 14 * 86400000) : null;
          await prisma.order.createMany({
            data: [...byCat.entries()].map(([cat, v]) => ({
              caseId: params.id,
              category: cat,
              amount: v.amount,
              vendorId: v.vendorId ?? soleVendorOfCat(cat),
              dueAt,
              status: "pending",
              note: CAT_LABEL[cat] ?? cat, // 品目名はシンプルに（出所の注記は付けない）
            })),
          });
          autoSetup.push(`手配リスト（発注タブ）に${byCat.size}部門を作成（納期＝開催14日前・未確定）`);
        }
      }
    }
    return NextResponse.json({ quote: q, autoSetup }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `サーバーエラー：${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
