import React from "react";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessCase } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PrintButton } from "./print-button";
import { timeRangeLabel } from "@/lib/case-time";
import { getSetting, getBranding } from "@/lib/settings";
import { PrintBrand } from "@/components/print-brand";

export const dynamic = "force-dynamic";

const DOCS: Record<string, string> = {
  quote: "御見積書",
  quote_a3: "御見積一覧",
  invoice: "御請求書",
  rundown: "進行台本", // 司会・音響・全スタッフ共通の1本
  kouban: "香盤表（役割別タイムテーブル）",
  meal: "料理提供表",
  menu: "お品書き",
  orders: "発注一覧",
  seating: "席次表",
  guests: "ご出席者リスト（受付・クローク用）",
};

function sceneForTitle(title: string): string | null {
  if (title.includes("再入場")) return "reentry";
  if (title.includes("入場")) return "entrance";
  if (title.includes("乾杯")) return "toast";
  if (title.includes("ケーキ")) return "cake";
  if (title.includes("中座")) return "leave";
  if (title.includes("手紙") || title.includes("花束")) return "bouquet";
  if (title.includes("送賓") || title.includes("お見送り")) return "farewell";
  return null;
}
const SCENES: Record<string, string> = {
  entrance: "入場", toast: "乾杯", cake: "ケーキ入刀", leave: "中座",
  reentry: "再入場", bouquet: "花束・手紙", farewell: "送賓",
};
const MEAL_TYPES: Record<string, string> = {
  allergy: "アレルギー", religion: "宗教対応", kids: "お子様", dislike: "苦手食材",
};
const ROLE_TAG: Record<string, string> = {
  mc: "司会", audio: "音響", catering: "料理", service: "サービス", photo: "カメラ",
};
const ORDER_CAT_LABEL: Record<string, string> = {
  dress: "ドレス", florist: "装花", catering: "料理", audio: "音響",
  mc: "司会", photo: "写真", video: "映像", gift: "引出物", print: "印刷物", beauty: "美容",
};
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// ブラウザ印刷のヘッダー・PDF保存時のファイル名に使われるタイトル（例：御見積書_山本 拓也様）
export async function generateMetadata({ params }: { params: { id: string; doc: string } }) {
  const c = await prisma.case.findUnique({ where: { id: params.id }, select: { groomName: true } });
  const title = DOCS[params.doc] ?? "帳票";
  return { title: c ? `${title}_${c.groomName}様` : title };
}

export default async function PrintPage({
  params, searchParams,
}: { params: { id: string; doc: string }; searchParams: { inv?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canAccessCase(s, params.id))) redirect("/cases");
  if (!DOCS[params.doc]) notFound();

  const c = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      banquetVenue: true,
      chapelVenue: true,
      planner: { select: { name: true } },
      quotes: { orderBy: { version: "desc" }, include: { items: true } },
      orders: { include: { vendor: true } },
      mealReqs: true,
      songs: true,
      rundownItems: { orderBy: { sortOrder: "asc" }, include: { song: true } },
      paymentPlans: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!c) notFound();
  const invoice = params.doc === "invoice"
    ? (searchParams.inv
        ? await prisma.invoice.findUnique({ where: { id: searchParams.inv } })
        : await prisma.invoice.findFirst({ where: { caseId: c.id }, orderBy: { issuedAt: "desc" } }))
    : null;
  if (params.doc === "invoice" && (!invoice || invoice.caseId !== c.id)) notFound();
  const bankInfo = params.doc === "invoice" ? await getSetting("bank_info") : "";
  const branding = await getBranding(); // 式場ロゴ・発行元（全帳票共通）

  const doc = params.doc;
  const title = DOCS[doc];
  // 帳票テンプレートの運用メモを取得
  const TMPL_TYPE: Record<string, string> = {
    quote: "quote", rundown: "rundown", meal: "meal_sheet", orders: "order_sheet",
  };
  const tmpl = TMPL_TYPE[doc] ? await prisma.template.findFirst({ where: { type: TMPL_TYPE[doc] } }) : null;
  const menuItems = doc === "menu"
    ? await prisma.menuItem.findMany({ where: { caseId: c.id }, orderBy: { sortOrder: "asc" } })
    : [];
  const [seatTables, seatGuests, floorObjects] = doc === "seating" || doc === "guests"
    ? await Promise.all([
        prisma.seatingTable.findMany({ where: { caseId: c.id }, orderBy: { sortOrder: "asc" } }),
        prisma.guest.findMany({ where: { caseId: c.id }, orderBy: { createdAt: "asc" } }),
        prisma.floorObject.findMany({ where: { caseId: c.id } }),
      ])
    : [[], [], []];
  // 楽曲：行に紐付いた曲が最優先（旧データはシーン推定でフォールバック）
  const songByScene = new Map(c.songs.filter((sg) => sg.scene !== "rundown").map((sg) => [sg.scene, sg]));
  const songOf = (r: { title: string; song?: { title: string; artist: string | null; durationSec: number | null; memo: string | null; cueTiming?: string | null } | null }) => {
    // 曲未定は空白扱い（帳票には出さない）
    if (r.song) return r.song.title === "（曲未定）" ? null : r.song;
    const sc = sceneForTitle(r.title);
    const fb = sc ? songByScene.get(sc) ?? null : null;
    return fb && fb.title !== "（曲未定）" ? fb : null;
  };
  let tmplNotes: string[] = [];
  let tmplTerms = "";
  try {
    const body = JSON.parse(tmpl?.bodyJson ?? "{}");
    if (Array.isArray(body.notes)) tmplNotes = body.notes;
    if (typeof body.terms === "string") tmplTerms = body.terms;
  } catch { /* ignore */ }
  const dateStr = c.weddingDate.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const quote = c.quotes.find((q) => q.status !== "archived") ?? c.quotes[0];
  const rundownFor = (role: string) => c.rundownItems.filter((r) => r.roles.split(",").includes(role));

  const isA3 = doc === "quote_a3";
  const isLandscape = doc === "kouban";
  return (
    <div style={{ maxWidth: isA3 ? 1500 : isLandscape ? 1060 : 760, margin: "0 auto", padding: "36px 24px", background: "#fff", color: "#2a2523", fontFeatureSettings: '"palt"', lineHeight: 1.65 }}>
      {/* style は dangerouslySetInnerHTML で埋め込む（テキストノードだと引用符がエスケープされ Hydration エラーになるため） */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important }
          body { background: #fff }
          nav, header.topbar { display: none !important }
        }
        ${isA3 ? "@page { size: A3 landscape; margin: 10mm }" : isLandscape ? "@page { size: A4 landscape; margin: 10mm }" : "@page { size: A4 portrait; margin: 12mm }"}
        .doc-serif { font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif }
        .ptbl { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 16px }
        .ptbl thead th {
          text-align: left; padding: 5px 10px 7px; font-size: 10px; font-weight: 600;
          letter-spacing: .14em; color: #9a8078; border-bottom: 1.5px solid #2a2523;
        }
        .ptbl td { border-bottom: .5px solid #e8e2de; padding: 8px 10px; vertical-align: top }
        .ptbl tr:last-child td { border-bottom: none }
        .doc-meta { font-size: 12px; color: #6d635e; letter-spacing: .02em }
        .doc-meta b { color: #2a2523 }
      ` }} />

      <div className="no-print" style={{ marginBottom: 20, display: "flex", gap: 8 }}>
        <PrintButton />
        <a href={`/cases/${c.id}`} style={{ fontSize: 13, alignSelf: "center" }}>← 案件に戻る</a>
        <span style={{ fontSize: 11, color: "#999", alignSelf: "center" }}>※ きれいに印刷するには、印刷ダイアログの「ヘッダーとフッター」をオフに</span>
      </div>

      {/* ヘッダー：左に帳票名、右上にロゴ＋発行情報 */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <h1 className="doc-serif" style={{ fontSize: 27, margin: 0, letterSpacing: ".3em", fontWeight: 600 }}>{title}</h1>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PrintBrand logoUrl={branding.logoUrl} name={branding.name} />
          </div>
          <div style={{ fontSize: 11, color: "#6d635e", lineHeight: 1.9, whiteSpace: "nowrap", marginTop: 8 }}>
            発行日　{new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}<br />
            {branding.name || "CEREMOS"}
          </div>
        </div>
      </div>
      <div style={{ height: 3, background: "linear-gradient(to right, #b06a5e 120px, #e8ded9 120px)", margin: "10px 0 12px" }} />

      <div className="doc-meta">
        <b className="doc-serif" style={{ fontSize: 15, letterSpacing: ".06em" }}>
          {c.groomName} 様{c.brideName !== "―" ? ` ・ ${c.brideName} 様` : ""}
        </b>
        <div style={{ marginTop: 3 }}>
          {dateStr}　{timeRangeLabel(c.weddingDate, c.endTime)}　｜
          {c.chapelVenue?.name ? `${c.chapelVenue.name} → ` : ""}{c.banquetVenue?.name ?? c.venueFree ?? "会場未定"}
          　｜　ご招待 {c.guestCount}名　｜　担当 {c.planner?.name ?? "—"}
        </div>
        {c.paymentPlans.length > 0 && (
          <div style={{ fontSize: 11, marginTop: 3 }}>
            お支払予定　{c.paymentPlans.map((p) =>
              `${p.label} ${yen(p.amount)}${p.dueAt ? `（${new Date(p.dueAt).toLocaleDateString("ja-JP")}）` : ""}`).join("　／　")}
          </div>
        )}
      </div>

      {doc === "quote" && (
        !quote ? <p style={{ marginTop: 20 }}>見積がまだ作成されていません。</p> : (() => {
          const CAT: [string, string][] = [
            ["ceremony", "挙式"], ["venue", "会場"], ["catering", "料理・飲物"],
            ["florist", "装花"], ["dress", "衣装"], ["beauty", "美容"],
            ["photo", "写真"], ["video", "映像"], ["mc", "司会"], ["audio", "音響・照明"],
            ["print", "ペーパーアイテム"], ["gift", "引出物"], ["service", "サービス"], ["discount", "値引・特典"], ["other", "その他"],
          ];
          const order = (c: string) => { const i = CAT.findIndex(([v]) => v === c); return i === -1 ? 99 : i; };
          const label = (c: string) => CAT.find(([v]) => v === c)?.[1] ?? "その他";
          const groups = new Map<string, typeof quote.items>();
          for (const it of [...quote.items].sort((a, b) => order(a.category) - order(b.category))) {
            groups.set(it.category, [...(groups.get(it.category) ?? []), it]);
          }
          return (
            <>
              <p style={{ marginTop: 14, fontSize: 12 }}>Ver.{quote.version}（{new Date(quote.createdAt).toLocaleDateString("ja-JP")}作成）{quote.note ? `｜ ${quote.note}` : ""}</p>
              <table className="ptbl">
                <thead><tr><th>品目</th><th style={{ textAlign: "right" }}>数量</th><th style={{ textAlign: "right" }}>単価</th><th style={{ textAlign: "right" }}>金額</th></tr></thead>
                <tbody>
                  {[...groups.entries()].map(([cat, arr]) => {
                    const sub = arr.reduce((s, i) => s + i.qty * i.unitPrice, 0);
                    return (
                      <React.Fragment key={cat}>
                        <tr>
                          <td colSpan={4} style={{ background: "#faf3f1", fontWeight: 700, color: "#b06a5e", fontSize: 11.5 }}>
                            ■ {label(cat)}
                          </td>
                        </tr>
                        {arr.map((i) => (
                          <tr key={i.id}>
                            <td style={{ paddingLeft: 18 }}>{i.name}</td>
                            <td style={{ textAlign: "right" }}>{i.qty}</td>
                            <td style={{ textAlign: "right" }}>{yen(i.unitPrice)}</td>
                            <td style={{ textAlign: "right" }}>{yen(i.qty * i.unitPrice)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3} style={{ textAlign: "right", fontSize: 11, color: "#888" }}>{label(cat)} 小計</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{yen(sub)}</td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  <tr>
                    <td colSpan={3} style={{ textAlign: "right", fontWeight: 700, borderTop: "2px solid #1c1a18" }}>合計（税込）</td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontSize: 15, borderTop: "2px solid #1c1a18" }}>{yen(quote.total)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          );
        })()
      )}

      {doc === "invoice" && invoice && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 12.5 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, borderBottom: "1px solid #1c1a18", paddingBottom: 4, minWidth: 260 }}>
                {c.groomName} 様{c.brideName !== "―" ? ` ・ ${c.brideName} 様` : ""}
              </div>
              {c.address && <div style={{ marginTop: 6 }}>{c.address}</div>}
              <p style={{ marginTop: 14 }}>下記のとおりご請求申し上げます。</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>請求番号：<b>{invoice.number}</b></div>
              <div>発行日：{new Date(invoice.issuedAt).toLocaleDateString("ja-JP")}</div>
              {invoice.dueAt && <div>お支払期日：<b>{new Date(invoice.dueAt).toLocaleDateString("ja-JP")}</b></div>}
              {/* 発行元（式場ブランドマスタより） */}
              <div style={{ marginTop: 12, fontSize: 12 }}>
                <b style={{ fontSize: 13 }}>{branding.name || "CEREMOS"}</b>
                {branding.info && (
                  <div style={{ whiteSpace: "pre-wrap", color: "#555", fontSize: 10.5, lineHeight: 1.7 }}>{branding.info}</div>
                )}
              </div>
            </div>
          </div>

          <div style={{ margin: "18px 0", border: "2px solid #b06a5e", borderRadius: 8, padding: "14px 20px", display: "flex", alignItems: "center", gap: 20 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#b06a5e" }}>ご請求金額（税込）</span>
            <span style={{ fontSize: 28, fontWeight: 800 }}>{yen(invoice.amount)}</span>
            {invoice.status === "paid" && <span style={{ color: "#3d8a5f", fontWeight: 700 }}>✓ 入金確認済（{invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString("ja-JP") : ""}）</span>}
          </div>

          {(() => {
            // 見積から転記した明細（itemsJson）があれば部門ごとに表示
            let items: { name: string; category: string; qty: number; unitPrice: number }[] = [];
            try { items = JSON.parse(invoice.itemsJson ?? "[]"); } catch { /* ignore */ }
            if (items.length === 0) {
              return (
                <table className="ptbl">
                  <thead><tr><th>摘要</th><th style={{ textAlign: "right" }}>金額</th></tr></thead>
                  <tbody>
                    <tr>
                      <td>{invoice.note ?? `ご婚礼・ご宴会費用（${dateStr}）`}</td>
                      <td style={{ textAlign: "right" }}>{yen(invoice.amount)}</td>
                    </tr>
                    <tr>
                      <td style={{ textAlign: "right", fontWeight: 700, borderTop: "2px solid #1c1a18" }}>合計（税込）</td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontSize: 15, borderTop: "2px solid #1c1a18" }}>{yen(invoice.amount)}</td>
                    </tr>
                  </tbody>
                </table>
              );
            }
            const CAT: [string, string][] = [
              ["ceremony", "挙式"], ["venue", "会場"], ["catering", "料理・飲物"],
              ["florist", "装花"], ["dress", "衣装"], ["beauty", "美容"],
              ["photo", "写真"], ["video", "映像"], ["mc", "司会"], ["audio", "音響・照明"],
              ["print", "ペーパーアイテム"], ["gift", "引出物"], ["service", "サービス"], ["discount", "値引・特典"], ["other", "その他"],
            ];
            const order = (cc: string) => { const i = CAT.findIndex(([v]) => v === cc); return i === -1 ? 99 : i; };
            const label = (cc: string) => CAT.find(([v]) => v === cc)?.[1] ?? "その他";
            const groups = new Map<string, typeof items>();
            for (const it of [...items].sort((a, b) => order(a.category) - order(b.category))) {
              groups.set(it.category, [...(groups.get(it.category) ?? []), it]);
            }
            const itemsTotal = items.reduce((s2, i) => s2 + i.qty * i.unitPrice, 0);
            return (
              <table className="ptbl">
                <thead><tr><th>品目（見積より転記）</th><th style={{ textAlign: "right" }}>数量</th><th style={{ textAlign: "right" }}>単価</th><th style={{ textAlign: "right" }}>金額</th></tr></thead>
                <tbody>
                  {[...groups.entries()].map(([cat, arr]) => (
                    <React.Fragment key={cat}>
                      <tr><td colSpan={4} style={{ background: "#faf3f1", fontWeight: 700, color: "#b06a5e", fontSize: 11.5 }}>■ {label(cat)}</td></tr>
                      {arr.map((i, k) => (
                        <tr key={k}>
                          <td style={{ paddingLeft: 18 }}>{i.name}</td>
                          <td style={{ textAlign: "right" }}>{i.qty}</td>
                          <td style={{ textAlign: "right" }}>{yen(i.unitPrice)}</td>
                          <td style={{ textAlign: "right" }}>{yen(i.qty * i.unitPrice)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  {itemsTotal !== invoice.amount && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "right", fontSize: 11, color: "#888" }}>明細計 {yen(itemsTotal)}（今回ご請求分は下記）</td>
                      <td />
                    </tr>
                  )}
                  <tr>
                    <td colSpan={3} style={{ textAlign: "right", fontWeight: 700, borderTop: "2px solid #1c1a18" }}>
                      ご請求額（税込）{invoice.note ? `｜${invoice.note}` : ""}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontSize: 15, borderTop: "2px solid #1c1a18" }}>{yen(invoice.amount)}</td>
                  </tr>
                </tbody>
              </table>
            );
          })()}

          {c.paymentPlans.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, marginTop: 24 }}>お支払予定表</h2>
              <table className="ptbl">
                <thead><tr><th>名目</th><th>お支払期日</th><th style={{ textAlign: "right" }}>金額</th></tr></thead>
                <tbody>
                  {c.paymentPlans.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.label}</td>
                      <td>{p.dueAt ? new Date(p.dueAt).toLocaleDateString("ja-JP") : "—"}</td>
                      <td style={{ textAlign: "right" }}>{yen(p.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} style={{ textAlign: "right", fontWeight: 700 }}>予定合計</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{yen(c.paymentPlans.reduce((s2, p) => s2 + p.amount, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          <div style={{ marginTop: 24, border: "1.5px solid #1c1a18", borderRadius: 8, padding: "12px 18px", maxWidth: 430 }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>お振込先</div>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{bankInfo}</div>
            <div style={{ fontSize: 10.5, color: "#888", marginTop: 6 }}>※ 恐れ入りますが振込手数料はお客様にてご負担ください。</div>
          </div>
        </>
      )}

      {doc === "quote_a3" && (
        !quote ? <p style={{ marginTop: 20 }}>見積がまだ作成されていません。</p> : (() => {
          const CAT: [string, string][] = [
            ["ceremony", "挙式"], ["venue", "会場"], ["catering", "料理・飲物"],
            ["florist", "装花"], ["dress", "衣装"], ["beauty", "美容"],
            ["photo", "写真"], ["video", "映像"], ["mc", "司会"], ["audio", "音響・照明"],
            ["print", "ペーパーアイテム"], ["gift", "引出物"], ["service", "サービス"], ["discount", "値引・特典"], ["other", "その他"],
          ];
          const order = (cc: string) => { const i = CAT.findIndex(([v]) => v === cc); return i === -1 ? 99 : i; };
          const label = (cc: string) => CAT.find(([v]) => v === cc)?.[1] ?? "その他";
          const groups = new Map<string, typeof quote.items>();
          for (const it of [...quote.items].sort((a, b) => order(a.category) - order(b.category))) {
            groups.set(it.category, [...(groups.get(it.category) ?? []), it]);
          }
          return (
            <>
              <p style={{ marginTop: 12, fontSize: 12, color: "#6d635e" }}>
                Ver.{quote.version}（{new Date(quote.createdAt).toLocaleDateString("ja-JP")}作成）{quote.note ? `｜ ${quote.note}` : ""}
              </p>
              {/* 部門ブロックの段組み */}
              <div style={{ columnCount: 3, columnGap: 20, marginTop: 14 }}>
                {[...groups.entries()].map(([cat, arr]) => {
                  const sub = arr.reduce((s2, i) => s2 + i.qty * i.unitPrice, 0);
                  return (
                    <div key={cat} style={{ breakInside: "avoid", border: "1px solid #e8ded9", borderRadius: 12, marginBottom: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(42,37,35,.05)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#faf3f1", borderBottom: "1.6px solid #b06a5e" }}>
                        <b style={{ color: "#b06a5e", fontSize: 13, letterSpacing: ".02em" }}>■ {label(cat)}</b>
                        <b style={{ fontSize: 13 }}>{yen(sub)}</b>
                      </div>
                      <div style={{ padding: "8px 14px" }}>
                        {arr.map((i) => (
                          <div key={i.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: 2, gap: 8 }}>
                            <span>{i.name}{i.qty > 1 ? <span style={{ color: "#999" }}>（{i.qty} × {yen(i.unitPrice)}）</span> : ""}</span>
                            <span style={{ whiteSpace: "nowrap" }}>{yen(i.qty * i.unitPrice)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {/* 合計ブロック */}
                <div style={{ breakInside: "avoid", border: "2px solid #b06a5e", borderRadius: 12, padding: "16px 18px", background: "#faf3f1", boxShadow: "0 1px 4px rgba(42,37,35,.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b style={{ fontSize: 14, color: "#b06a5e" }}>合計（税込）</b>
                    <b style={{ fontSize: 20 }}>{yen(quote.total)}</b>
                  </div>
                  {c.paymentPlans.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11.5, borderTop: "1px solid #d9c9c2", paddingTop: 6 }}>
                      {c.paymentPlans.map((p) => (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", lineHeight: 1.9 }}>
                          <span>{p.label}{p.dueAt ? `（${new Date(p.dueAt).toLocaleDateString("ja-JP")}）` : ""}</span>
                          <span>{yen(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {quote.note && (
                <div style={{ marginTop: 20, border: "1px solid #e8ded9", borderRadius: 10, padding: "12px 16px", fontSize: 11.5, lineHeight: 1.9 }}>
                  <b style={{ fontSize: 11, color: "#b06a5e" }}>備考</b>
                  <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{quote.note}</div>
                </div>
              )}
            </>
          );
        })()
      )}

      {/* 香盤表：時刻×役割のマトリクス（A4横） */}
      {doc === "kouban" && (() => {
        const COLS: [string, string][] = [
          ["mc", "司会"], ["audio", "音響・照明"], ["catering", "料理・厨房"], ["service", "サービス"], ["photo", "写真・映像"],
        ];
        return (
          <>
            <p style={{ marginTop: 12, fontSize: 11.5, color: "#666" }}>
              ●＝出番あり。音響欄には使用楽曲、司会欄には台本の有無を表示。備考は演出・オペレーションの注意点です。
            </p>
            <table className="ptbl" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: 64 }}>時刻/所要</th>
                  <th style={{ width: 150 }}>演目</th>
                  {COLS.map(([, l]) => <th key={l} style={{ textAlign: "center" }}>{l}</th>)}
                  <th style={{ width: 170 }}>備考</th>
                </tr>
              </thead>
              <tbody>
                {c.rundownItems.map((r) => {
                  const song = songOf(r);
                  const roles = r.roles.split(",").filter(Boolean);
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700 }}>{r.time}<span style={{ fontWeight: 400, color: "#999", fontSize: 10 }}>（{r.durationMin ?? 10}分）</span></td>
                      <td style={{ fontWeight: 600 }}>{r.title}</td>
                      {COLS.map(([v]) => {
                        const on = roles.includes(v);
                        return (
                          <td key={v} style={{ textAlign: "center", background: on ? "#faf3f1" : undefined, fontSize: 11 }}>
                            {on ? (
                              v === "audio" && song ? <><b>●</b><div style={{ fontSize: 9.5, color: "#555" }}>♪{song.title}</div></>
                              : v === "mc" && r.mcScript ? <><b>●</b><div style={{ fontSize: 9.5, color: "#555" }}>台本あり</div></>
                              : <b>●</b>
                            ) : ""}
                          </td>
                        );
                      })}
                      <td style={{ fontSize: 10.5 }}>{r.note ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        );
      })()}

      {/* 全体台本：縦バーチャート形式（枠の縦の長さ＝所要時間。長い演目ほど余白も長い） */}
      {doc === "rundown" && (() => {
        const PX_PER_MIN = 14; // 約4時間の披露宴で4ページ程度
        const cell: React.CSSProperties = { border: "1px solid #555", padding: "8px 11px", verticalAlign: "top", fontSize: 11.5 };
        return (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ ...cell, width: 64, background: "#eef0ec", fontSize: 10.5, textAlign: "center", padding: "6px" }}>時刻・所要</th>
                <th style={{ ...cell, width: 150, background: "#eef0ec", fontSize: 10.5, textAlign: "center", padding: "6px" }}>演　目</th>
                <th style={{ ...cell, background: "#eef0ec", fontSize: 10.5, textAlign: "center", padding: "6px" }}>うごき・楽曲・音響・映像・照明</th>
                <th style={{ ...cell, width: 88, background: "#eef0ec", fontSize: 10.5, textAlign: "center", padding: "6px" }}>担　当</th>
              </tr>
            </thead>
            <tbody>
              {c.rundownItems.map((r) => {
                const song = songOf(r);
                const h = Math.max(46, (r.durationMin ?? 10) * PX_PER_MIN);
                return (
                  <tr key={r.id}>
                    <td style={{ ...cell, height: h, textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 12.5 }}>{r.time}</div>
                      <div style={{ fontSize: 9.5, color: "#888" }}>（{r.durationMin ?? 10}分）</div>
                    </td>
                    <td style={{ ...cell, fontWeight: 700, fontSize: 12.5 }}>{r.title}</td>
                    <td style={{ ...cell, lineHeight: 1.9 }}>
                      {r.note && <div>※ {r.note}</div>}
                      {song && (
                        <div style={{ marginTop: r.note ? 2 : 0 }}>
                          ♪ {song.title}{song.artist ? `／${song.artist}` : ""}
                          {song.durationSec ? `（${song.durationSec}秒）` : ""}{song.memo ? `　※${song.memo}` : ""}
                          {r.song?.cueTiming && <b>　⏱ {r.song.cueTiming}</b>}
                        </div>
                      )}
                      {r.mcScript && (
                        <div style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#555", marginTop: 3 }}>🎤 {r.mcScript}</div>
                      )}
                    </td>
                    <td style={{ ...cell, fontSize: 10.5 }}>
                      {r.roles.split(",").filter(Boolean).map((x) => ROLE_TAG[x] ?? x).join("・")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })()}

      {/* お品書き：ゲスト向けメニュー表（原価・売値は印刷しない） */}
      {doc === "menu" && (() => {
        const ORDER = ["コース料理", "乾杯酒", "アミューズ", "前菜", "スープ", "魚料理", "お口直し", "肉料理", "デザート", "ドリンク", "パン・飲物", "その他"];
        const order = (x: string) => { const i = ORDER.indexOf(x); return i === -1 ? 99 : i; };
        const groups = new Map<string, typeof menuItems>();
        for (const m of [...menuItems].sort((a, b) => order(a.course) - order(b.course))) {
          groups.set(m.course, [...(groups.get(m.course) ?? []), m]);
        }
        return menuItems.length === 0 ? (
          <p style={{ marginTop: 20 }}>メニューがまだ登録されていません（料理タブから追加できます）。</p>
        ) : (
          <div className="doc-serif" style={{ maxWidth: 480, margin: "26px auto 0", textAlign: "center" }}>
            <div style={{ fontSize: 11, letterSpacing: ".5em", color: "#9a8078", marginBottom: 6 }}>MENU</div>
            <div style={{ fontSize: 17, letterSpacing: ".24em", marginBottom: 20 }}>御 献 立</div>
            <div style={{ width: 60, height: 1, background: "#b06a5e", margin: "0 auto 26px" }} />
            {[...groups.entries()].map(([course, arr]) => (
              <div key={course} style={{ marginBottom: 24, breakInside: "avoid" }}>
                <div style={{ fontSize: 10.5, letterSpacing: ".4em", color: "#9a8078", marginBottom: 8 }}>{course}</div>
                {arr.map((m) => (
                  <div key={m.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 14.5, letterSpacing: ".08em", lineHeight: 1.7 }}>{m.name}</div>
                    {m.desc && <div style={{ fontSize: 10.5, color: "#8a7f78", letterSpacing: ".06em", marginTop: 1 }}>{m.desc}</div>}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ width: 60, height: 1, background: "#b06a5e", margin: "6px auto 14px" }} />
            <div style={{ fontSize: 10, letterSpacing: ".2em", color: "#9a8078" }}>
              {branding.name || ""}
            </div>
          </div>
        );
      })()}

      {doc === "meal" && (
        <>
          <h2 style={{ fontSize: 15, marginTop: 20 }}>配慮事項（{c.mealReqs.length}件）</h2>
          <table className="ptbl">
            <thead><tr><th>ゲスト</th><th>区分</th><th>内容</th></tr></thead>
            <tbody>
              {c.mealReqs.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.guestLabel}</td>
                  <td>{MEAL_TYPES[m.type] ?? m.type}</td>
                  <td>{m.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 style={{ fontSize: 15, marginTop: 26 }}>提供タイミング（進行表連動）</h2>
          <table className="ptbl">
            <thead><tr><th style={{ width: 60 }}>時刻</th><th>演目</th><th>備考</th></tr></thead>
            <tbody>
              {rundownFor("catering").map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700 }}>{r.time}</td>
                  <td style={{ fontWeight: 600 }}>{r.title}</td>
                  <td>{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {doc === "guests" && (
        <>
          <p style={{ marginTop: 14, fontSize: 12 }}>
            ご出席 {seatGuests.length}名（新郎側 {seatGuests.filter((g) => g.side === "groom").length}名・新婦側 {seatGuests.filter((g) => g.side === "bride").length}名）
            　※ 受付でチェック、クローク欄はお預かり札番号の記入にご利用ください
          </p>
          {(["groom", "bride"] as const).map((side) => (
            <div key={side}>
              <h2 style={{ fontSize: 14, marginTop: 18, color: side === "groom" ? "#4a6fa5" : "#a4586b" }}>
                {side === "groom" ? "■ 新郎側ゲスト" : "■ 新婦側ゲスト"}
              </h2>
              <table className="ptbl">
                <thead>
                  <tr>
                    <th style={{ width: 46 }}>受付✓</th><th>お名前</th><th style={{ width: 130 }}>肩書</th><th style={{ width: 70 }}>間柄</th>
                    <th style={{ width: 100 }}>卓</th><th style={{ width: 80 }}>クローク札</th><th style={{ width: 100 }}>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {seatGuests.filter((g) => g.side === side).map((g) => (
                    <tr key={g.id}>
                      <td style={{ textAlign: "center", fontSize: 14, color: "#ccc" }}>□</td>
                      <td style={{ fontWeight: 600 }}>{g.name} 様</td>
                      <td style={{ fontSize: 11 }}>{g.title ?? ""}</td>
                      <td>{g.relation}</td>
                      <td>{seatTables.find((t) => t.id === g.tableId)?.name ?? (g.seatObjectId ? "椅子席" : "未定")}</td>
                      <td></td>
                      <td style={{ fontSize: 11, color: g.allergy ? "#b0201c" : undefined, fontWeight: g.allergy ? 700 : undefined }}>
                        {g.allergy ? `⚠ ${g.allergy}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {doc === "orders" && (() => {
        // 業者ごとに1通の発注書（1ページ目=全体一覧、以降=業者別シート・改ページ）
        const byVendor = new Map<string, typeof c.orders>();
        for (const o of c.orders) {
          const key = o.vendor?.name ?? "自社（社内手配）";
          byVendor.set(key, [...(byVendor.get(key) ?? []), o]);
        }
        return (
          <>
            <p style={{ marginTop: 12, fontSize: 11.5, color: "#666" }}>
              1ページ目は全体一覧、2ページ目以降は<b>発注先ごとに1通</b>の発注書です（そのまま各社へ渡せます）。
            </p>
            <table className="ptbl">
              <thead><tr><th>品目</th><th>発注先</th><th>納期</th><th style={{ textAlign: "right" }}>金額</th><th>状態</th></tr></thead>
              <tbody>
                {c.orders.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.note ?? ORDER_CAT_LABEL[o.category] ?? o.category}</td>
                    <td>{o.vendor?.name ?? "自社"}</td>
                    <td>{o.dueAt ? new Date(o.dueAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</td>
                    <td style={{ textAlign: "right" }}>{yen(o.amount)}</td>
                    <td>{o.status === "pending" ? "未確定" : o.status === "confirmed" ? "確定" : "納品済"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {[...byVendor.entries()].map(([vendorName, group]) => (
              <div key={vendorName} style={{ breakBefore: "page" }}>
                <div style={{ borderBottom: "3px solid #b06a5e", paddingBottom: 12, marginBottom: 4, marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                    <h1 style={{ fontSize: 22, margin: "6px 0 4px" }}>発注書</h1>
                    <PrintBrand logoUrl={branding.logoUrl} name={branding.name} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{vendorName} 御中</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    案件：{c.groomName} 様{c.brideName !== "―" ? ` ・ ${c.brideName} 様` : ""}　｜　{dateStr} {timeRangeLabel(c.weddingDate, c.endTime)}　｜
                    {c.banquetVenue?.name ?? c.venueFree ?? "会場未定"}　｜　担当：{c.planner?.name ?? "—"}
                  </div>
                </div>
                <table className="ptbl">
                  <thead><tr><th>品目</th><th>納期</th><th style={{ textAlign: "right" }}>金額</th><th>状態</th></tr></thead>
                  <tbody>
                    {group.map((o) => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 600 }}>{o.note ?? ORDER_CAT_LABEL[o.category] ?? o.category}</td>
                        <td>{o.dueAt ? new Date(o.dueAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={{ textAlign: "right" }}>{yen(o.amount)}</td>
                        <td>{o.status === "pending" ? "未確定" : o.status === "confirmed" ? "確定" : "納品済"}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ textAlign: "right", fontWeight: 700, borderTop: "2px solid #1c1a18" }}>合計（税込）</td>
                      <td style={{ borderTop: "2px solid #1c1a18" }} />
                      <td style={{ textAlign: "right", fontWeight: 700, borderTop: "2px solid #1c1a18" }}>{yen(group.reduce((s2, o) => s2 + o.amount, 0))}</td>
                      <td style={{ borderTop: "2px solid #1c1a18" }} />
                    </tr>
                  </tbody>
                </table>
                <p style={{ marginTop: 16, fontSize: 10.5, color: "#999" }}>
                  発行：{new Date().toLocaleDateString("ja-JP")}　{branding.name || "CEREMOS"}（CEREMOS — Ceremony & Event Platform）
                </p>
              </div>
            ))}
          </>
        );
      })()}

      {doc === "seating" && (
        <>
          <p style={{ marginTop: 14, fontSize: 12 }}>
            ご出席 {seatGuests.length}名（新郎側 {seatGuests.filter((g) => g.side === "groom").length}名・新婦側 {seatGuests.filter((g) => g.side === "bride").length}名）
          </p>
          {/* 会場レイアウト図（画面の見た目のまま縮小印刷） */}
          {(() => {
            const hw = c.hallWidth || 1240, hh = c.hallHeight || 720;
            const scale = Math.min(700 / hw, 460 / hh);
            const OBJ_COLOR: Record<string, { bg: string; bd: string }> = {
              takasago: { bg: "#f7ecef", bd: "#a4586b" },
              stage: { bg: "#eaf0f8", bd: "#4a6fa5" },
              mc: { bg: "#faf1e0", bd: "#b07a2a" },
              longtable: { bg: "#e8f3ea", bd: "#3d8a5f" },
              chair: { bg: "#f4f2ef", bd: "#8b8680" },
              custom: { bg: "#f4f2ef", bd: "#999" },
            };
            return (
              <div style={{ position: "relative", width: hw * scale, height: hh * scale, border: "1.5px solid #b06a5e", borderRadius: 10, margin: "12px auto 4px", background: "#fffdfc" }}>
                {floorObjects.map((o) => {
                  const cc = OBJ_COLOR[o.kind] ?? OBJ_COLOR.custom;
                  const sitter = o.kind === "chair" ? seatGuests.find((g) => g.seatObjectId === o.id) : null;
                  const nameTag = (g: { side: string; name: string; allergy?: string | null }, style: React.CSSProperties) => (
                    <span style={{
                      position: "absolute", fontSize: 7.5, fontWeight: 600, background: g.allergy ? "#fdeceb" : "#fff",
                      border: `1px solid ${g.allergy ? "#b0201c" : g.side === "groom" ? "#4a6fa5" : "#a4586b"}`,
                      color: g.allergy ? "#b0201c" : g.side === "groom" ? "#4a6fa5" : "#8d4457",
                      borderRadius: 8, padding: "1px 4px", whiteSpace: "nowrap", ...style,
                    }} title={g.allergy ?? undefined}>{g.allergy ? "⚠" : ""}{g.name}</span>
                  );
                  // 長机：席番号どおりに配置（席次エディタと同じ。回転時は左右に配置）
                  const ltRot = o.kind === "longtable" && (o.rotation ?? 0) === 90;
                  const dispW = ltRot ? o.height : o.width;
                  const dispH = ltRot ? o.width : o.height;
                  let ltSeats: React.ReactNode = null;
                  if (o.kind === "longtable") {
                    const longEdge = ltRot ? dispH : dispW;
                    const perSideSlots = Math.min(3, Math.max(1, Math.round(longEdge / 56)));
                    const cap = Math.max(0, Math.min(6, o.capacity ?? 0));
                    const bottomN = Math.min(cap, perSideSlots);
                    const topN = Math.min(cap - bottomN, perSideSlots);
                    const seats = bottomN + topN;
                    const members = seatGuests.filter((g) => g.seatObjectId === o.id);
                    const bySeat = new Map<number, typeof members[number]>();
                    const rest: typeof members = [];
                    for (const g of members) {
                      if (g.seatNo !== null && g.seatNo >= 0 && g.seatNo < seats && !bySeat.has(g.seatNo)) bySeat.set(g.seatNo, g);
                      else rest.push(g);
                    }
                    const arr = Array.from({ length: seats }, (_, k) => bySeat.get(k));
                    for (let k = 0; k < seats && rest.length > 0; k++) if (!arr[k]) arr[k] = rest.shift();
                    ltSeats = arr.map((g, k) => {
                      if (!g) return null;
                      const isA = k < bottomN;
                      const col = isA ? k : k - bottomN;
                      const rowN = isA ? bottomN : topN;
                      if (!ltRot) {
                        return nameTag(g, {
                          left: `${((col + 0.5) / rowN) * 100}%`,
                          transform: "translateX(-50%)",
                          ...(isA ? { top: "100%", marginTop: 2 } : { bottom: "100%", marginBottom: 2 }),
                        });
                      }
                      return nameTag(g, {
                        top: `${((col + 0.5) / rowN) * 100}%`,
                        transform: "translateY(-50%)",
                        ...(isA ? { left: "100%", marginLeft: 2 } : { right: "100%", marginRight: 2 }),
                      });
                    });
                  }
                  return (
                    <div key={o.id} style={{
                      position: "absolute", left: o.posX * scale, top: o.posY * scale,
                      width: dispW * scale, height: dispH * scale,
                      background: cc.bg, border: `1.2px solid ${cc.bd}`,
                      borderRadius: o.kind === "chair" ? "50%" : 6,
                      display: "grid", placeItems: "center", fontSize: 8.5, fontWeight: 700, color: cc.bd,
                      overflow: "visible", whiteSpace: "nowrap",
                    }}>
                      {sitter
                        ? nameTag(sitter, { top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 2 })
                        : o.kind === "chair" ? "" : o.label}
                      {ltSeats}
                    </div>
                  );
                })}
                {seatTables.map((t, ti) => {
                  const px = t.posX >= 0 ? t.posX : 130 + (ti % 3) * 340;
                  const py = t.posY >= 0 ? t.posY : 150 + Math.floor(ti / 3) * 300;
                  const cx = (px + 125) * scale, cy = (py + 125) * scale;
                  const members = seatGuests.filter((g) => g.tableId === t.id);
                  const seats = Math.max(t.capacity, members.length);
                  // 席番号（画面と同じ配置）優先で並べる
                  const bySeat = new Map<number, (typeof members)[number]>();
                  const rest: typeof members = [];
                  for (const g of members) {
                    if (g.seatNo !== null && g.seatNo >= 0 && g.seatNo < seats && !bySeat.has(g.seatNo)) bySeat.set(g.seatNo, g);
                    else rest.push(g);
                  }
                  const placedMembers: { g: (typeof members)[number]; k: number }[] = [];
                  for (let k = 0; k < seats; k++) {
                    const g = bySeat.get(k) ?? rest.shift();
                    if (g && !placedMembers.some((x) => x.g.id === g.id)) placedMembers.push({ g, k });
                  }
                  // 円卓の直径（cm・卓ごとに可変）→ 半径px（1m=80px）。画面と同じ実寸比
                  const R = (((t as { sizeCm?: number }).sizeCm ?? 200) / 100) * 40 * scale, SR = R + 24 * scale;
                  return (
                    <div key={t.id}>
                      <div style={{
                        position: "absolute", left: cx - R, top: cy - R, width: R * 2, height: R * 2,
                        borderRadius: "50%", border: "1.5px solid #a4586b", background: "#fff",
                        display: "grid", placeItems: "center", textAlign: "center", fontSize: 8.5, fontWeight: 700, color: "#7a3f4e",
                      }}>{t.name}</div>
                      {placedMembers.map(({ g, k }) => {
                        const ang = (-90 + (360 / seats) * k) * (Math.PI / 180);
                        return (
                          <div key={g.id} style={{
                            position: "absolute", left: cx + Math.cos(ang) * SR, top: cy + Math.sin(ang) * SR,
                            transform: "translate(-50%,-50%)", fontSize: 7.5, fontWeight: 600,
                            background: g.allergy ? "#fdeceb" : "#fff", border: `1px solid ${g.allergy ? "#b0201c" : g.side === "groom" ? "#4a6fa5" : "#a4586b"}`,
                            color: g.allergy ? "#b0201c" : g.side === "groom" ? "#4a6fa5" : "#8d4457",
                            borderRadius: 8, padding: "1px 4px", whiteSpace: "nowrap", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis",
                          }} title={g.allergy ?? undefined}>{g.allergy ? "⚠" : ""}{g.name}</div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 10 }}>
            {seatTables.map((t) => (
              <div key={t.id} style={{ border: "1.5px solid #b06a5e", borderRadius: 10, padding: "10px 14px", breakInside: "avoid" }}>
                <div style={{ fontWeight: 700, fontSize: 13, borderBottom: "1px solid #ddd", paddingBottom: 4, marginBottom: 6 }}>
                  {t.name}
                </div>
                {seatGuests.filter((g) => g.tableId === t.id).map((g) => (
                  <div key={g.id} style={{ fontSize: 12, lineHeight: 1.9, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {g.allergy && <span style={{ color: "#b0201c" }}>⚠ </span>}{g.name} 様
                    </span>
                    <span style={{ color: "#888", textAlign: "right" }}>
                      {g.allergy ? <span style={{ color: "#b0201c", fontWeight: 700 }}>{g.allergy}<br /></span> : null}
                      {g.title ? <>{g.title}<br /></> : null}
                      {g.side === "groom" ? "新郎" : "新婦"}・{g.relation}
                    </span>
                  </div>
                ))}
                {seatGuests.filter((g) => g.tableId === t.id).length === 0 && (
                  <div style={{ fontSize: 11, color: "#aaa" }}>（未割当）</div>
                )}
              </div>
            ))}
          </div>
          {seatGuests.some((g) => g.seatObjectId) && (
            <div style={{ border: "1.5px solid #3d8a5f", borderRadius: 10, padding: "10px 14px", marginTop: 14, breakInside: "avoid" }}>
              <div style={{ fontWeight: 700, fontSize: 13, borderBottom: "1px solid #ddd", paddingBottom: 4, marginBottom: 6 }}>
                椅子席（長机など）
              </div>
              {seatGuests.filter((g) => g.seatObjectId).map((g) => (
                <div key={g.id} style={{ fontSize: 12, lineHeight: 1.9, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{g.allergy && <span style={{ color: "#b0201c" }}>⚠ </span>}{g.name} 様</span>
                  <span style={{ color: "#888" }}>
                    {g.allergy ? <span style={{ color: "#b0201c", fontWeight: 700 }}>{g.allergy}　</span> : null}
                    {g.side === "groom" ? "新郎" : "新婦"}・{g.relation}
                  </span>
                </div>
              ))}
            </div>
          )}
          {seatGuests.some((g) => !g.tableId && !g.seatObjectId) && (
            <p style={{ marginTop: 12, fontSize: 11, color: "#c14b4b" }}>
              ⚠ 未割当：{seatGuests.filter((g) => !g.tableId && !g.seatObjectId).map((g) => `${g.name}様`).join("、")}
            </p>
          )}
        </>
      )}

      {(tmplNotes.length > 0 || tmplTerms) && (
        <div style={{ marginTop: 26, border: "1px solid #ddd", borderRadius: 8, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>備考（標準テンプレートより）</div>
          {tmplNotes.map((n, i) => (
            <div key={i} style={{ fontSize: 11, lineHeight: 1.9 }}>・{n}</div>
          ))}
          {tmplTerms && <div style={{ fontSize: 11, lineHeight: 1.9 }}>{tmplTerms}</div>}
        </div>
      )}

      <p style={{ marginTop: 30, fontSize: 10.5, color: "#999" }}>
        発行：{new Date().toLocaleDateString("ja-JP")}　{branding.name || "CEREMOS"}（CEREMOS — Ceremony & Event Platform）
      </p>
    </div>
  );
}
