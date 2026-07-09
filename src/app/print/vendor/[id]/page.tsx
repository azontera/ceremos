import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { caseLabel } from "@/lib/case-types";
import { timeRangeLabel } from "@/lib/case-time";
import { PrintButton } from "../../[id]/[doc]/print-button";
import { PrintBrand } from "@/components/print-brand";
import { getBranding } from "@/lib/settings";

export const dynamic = "force-dynamic";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// 業者宛 発注書の一括印刷（案件ごとに1枚・改ページ）
export default async function VendorPrintPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const isOwn = s.vendorId === params.id;
  const isStaff = ["admin", "manager", "planner"].includes(s.role);
  if (!isOwn && !isStaff) redirect("/dashboard");

  const vendor = await prisma.vendor.findUnique({ where: { id: params.id } });
  if (!vendor) notFound();
  const branding = await getBranding();

  const orders = await prisma.order.findMany({
    where: { vendorId: vendor.id, status: { not: "delivered" } },
    include: { case: { include: { banquetVenue: true, planner: { select: { name: true } } } } },
    orderBy: { dueAt: "asc" },
  });

  // 案件ごとにグループ化
  const byCase = new Map<string, typeof orders>();
  for (const o of orders) byCase.set(o.caseId, [...(byCase.get(o.caseId) ?? []), o]);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px", background: "#fff", color: "#1c1a18" }}>
      <style>{`
        @media print { .no-print { display: none } body { background: #fff } }
        .order-sheet { page-break-after: always }
        .order-sheet:last-child { page-break-after: auto }
        .ptbl { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 14px }
        .ptbl th { text-align: left; border-bottom: 2px solid #1c1a18; padding: 6px 8px; font-size: 11px }
        .ptbl td { border-bottom: 1px solid #ddd; padding: 7px 8px; vertical-align: top }
      `}</style>

      <div className="no-print" style={{ marginBottom: 20, display: "flex", gap: 8 }}>
        <PrintButton />
        <a href={`/vendors/${vendor.id}`} style={{ fontSize: 13, alignSelf: "center" }}>← 業者ページに戻る</a>
      </div>

      {byCase.size === 0 && <p>納品待ちの発注はありません。</p>}

      {[...byCase.values()].map((group) => {
        const c = group[0].case;
        const total = group.reduce((s2, o) => s2 + o.amount, 0);
        return (
          <div className="order-sheet" key={c.id}>
            <div style={{ borderBottom: "3px solid #b06a5e", paddingBottom: 12, marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <h1 style={{ fontSize: 22, margin: "6px 0 4px" }}>発注書</h1>
                <PrintBrand logoUrl={branding.logoUrl} name={branding.name} />
              </div>
              <div style={{ fontSize: 13 }}>
                <b>{vendor.name} 御中</b>　｜　案件：{caseLabel(c)}　｜
                {c.weddingDate.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
                {" "}{timeRangeLabel(c.weddingDate, c.endTime)}　｜
                {c.banquetVenue?.name ?? c.venueFree ?? "会場未定"}　｜　担当：{c.planner?.name ?? "—"}
              </div>
            </div>
            <table className="ptbl">
              <thead><tr><th>品目</th><th>納期</th><th style={{ textAlign: "right" }}>金額</th><th>状態</th></tr></thead>
              <tbody>
                {group.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.note ?? o.category}</td>
                    <td>{o.dueAt ? o.dueAt.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{yen(o.amount)}</td>
                    <td>{o.status === "pending" ? "未確定" : "確定"}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ textAlign: "right", fontWeight: 700, borderTop: "2px solid #1c1a18" }}>合計（税込）</td>
                  <td style={{ textAlign: "right", fontWeight: 700, borderTop: "2px solid #1c1a18" }}>{yen(total)}</td>
                  <td style={{ borderTop: "2px solid #1c1a18" }} />
                </tr>
              </tbody>
            </table>
            <p style={{ marginTop: 20, fontSize: 10.5, color: "#999" }}>
              発行：{new Date().toLocaleDateString("ja-JP")}　{branding.name || "CEREMOS"}（CEREMOS — Ceremony & Event Platform）
            </p>
          </div>
        );
      })}
    </div>
  );
}
