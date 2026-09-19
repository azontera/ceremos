// 成果ダッシュボード（リニューアル仕様書 2.5・P5）
// プランナー個人別の成約率・平均単価と、失注理由の可視化。
// データは案件・見積・失注記録から集計（スタッフのみ閲覧可）。
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LOST_REASONS } from "@/lib/case-types";

export const dynamic = "force-dynamic";

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

export default async function ReportsPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "couple") redirect("/dashboard");

  const cases = await prisma.case.findMany({
    include: {
      planner: { select: { id: true, name: true } },
      quotes: { select: { status: true, total: true }, orderBy: { version: "desc" } },
    },
  });

  const won = (c: (typeof cases)[number]) =>
    c.quotes.some((q) => q.status === "approved") || ["planning", "final_prep", "done"].includes(c.status);
  const approvedTotal = (c: (typeof cases)[number]) => c.quotes.find((q) => q.status === "approved")?.total ?? null;

  // プランナー別集計
  const byPlanner = new Map<string, { name: string; total: number; won: number; lost: number; sales: number[] }>();
  for (const c of cases) {
    const key = c.planner?.id ?? "none";
    const row = byPlanner.get(key) ?? { name: c.planner?.name ?? "担当未設定", total: 0, won: 0, lost: 0, sales: [] };
    row.total++;
    if (c.status === "lost") row.lost++;
    else if (won(c)) { row.won++; const t = approvedTotal(c); if (t) row.sales.push(t); }
    byPlanner.set(key, row);
  }
  const planners = [...byPlanner.values()].sort((a, b) => b.won - a.won);

  // 失注理由別
  const lostCases = cases.filter((c) => c.status === "lost");
  const reasonCount = new Map<string, number>();
  for (const c of lostCases) {
    if (c.lostReason) reasonCount.set(c.lostReason, (reasonCount.get(c.lostReason) ?? 0) + 1);
  }
  const reasonLabels = new Map(LOST_REASONS);

  const totalWon = planners.reduce((a, p) => a + p.won, 0);
  const totalLost = planners.reduce((a, p) => a + p.lost, 0);
  const allSales = planners.flatMap((p) => p.sales);
  const closedAll = totalWon + totalLost;

  const bar = (n: number, max: number) => (
    <div className="progress" style={{ width: 160, display: "inline-block", verticalAlign: "middle" }}>
      <span style={{ width: `${max ? Math.round((n / max) * 100) : 0}%` }} />
    </div>
  );

  return (
    <>
      <div className="section-h"><h2>📊 成果ダッシュボード</h2>
        <span style={{ fontSize: 11.5, color: "var(--text3)" }}>成約率・単価・失注ボトルネックから「売れる行動」を確認する</span>
      </div>

      <div className="grid cols-4">
        <div className="card kpi"><div className="k-label">成約</div><div className="k-val">{totalWon}<span style={{ fontSize: 14, color: "var(--text3)" }}> 件</span></div><div className="k-sub">見積承認ベース</div></div>
        <div className="card kpi"><div className="k-label">失注</div><div className="k-val" style={{ color: totalLost ? "var(--red)" : undefined }}>{totalLost}<span style={{ fontSize: 14, color: "var(--text3)" }}> 件</span></div><div className="k-sub">理由の記録あり {lostCases.filter((c) => c.lostReason).length}件</div></div>
        <div className="card kpi"><div className="k-label">成約率</div><div className="k-val">{closedAll ? Math.round((totalWon / closedAll) * 100) : "—"}<span style={{ fontSize: 14, color: "var(--text3)" }}> %</span></div><div className="k-sub">成約 ÷（成約＋失注）</div></div>
        <div className="card kpi"><div className="k-label">平均単価</div><div className="k-val" style={{ fontSize: 20 }}>{allSales.length ? yen(allSales.reduce((a, b) => a + b, 0) / allSales.length) : "—"}</div><div className="k-sub">承認見積の平均</div></div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h">👤 プランナー別成績</div>
          <div className="card-b tbl-scroll">
            <table className="tbl">
              <thead><tr><th>プランナー</th><th>担当</th><th>成約</th><th>失注</th><th>成約率</th><th>平均単価</th></tr></thead>
              <tbody>
                {planners.map((p, i) => {
                  const closed = p.won + p.lost;
                  return (
                    <tr key={i}>
                      <td><b>{p.name}</b></td>
                      <td>{p.total}件</td>
                      <td>{p.won}件</td>
                      <td style={{ color: p.lost ? "var(--red)" : undefined }}>{p.lost}件</td>
                      <td><b>{closed ? `${Math.round((p.won / closed) * 100)}%` : "—"}</b></td>
                      <td>{p.sales.length ? yen(p.sales.reduce((a, b) => a + b, 0) / p.sales.length) : "—"}</td>
                    </tr>
                  );
                })}
                {planners.length === 0 && <tr><td colSpan={6}><div className="empty">案件がまだありません</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-h">💔 失注理由</div>
            <div className="card-b">
              {lostCases.length === 0 && <div className="empty">失注の記録はありません</div>}
              {[...reasonCount.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                <div className="list-row" key={r}>
                  <div className="t"><b>{reasonLabels.get(r) ?? r}</b></div>
                  {bar(n, lostCases.length)}
                  <b style={{ marginLeft: 8 }}>{n}件</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
