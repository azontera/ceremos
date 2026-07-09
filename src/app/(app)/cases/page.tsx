import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can, caseScopeWhere } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { computeProgress, daysUntil, ddayLabel } from "@/lib/progress";
import { typeMeta } from "@/lib/case-types";
import { timeRangeLabel } from "@/lib/case-time";
import { CaseDeleteButton } from "@/components/case-delete-button";

export const dynamic = "force-dynamic";

/** 日付らしき検索語（2026-07-20 / 7/20 / 7月20日）→ その日1日分の範囲 */
function parseDateQuery(q: string): { from: Date; to: Date } | null {
  if (!q) return null;
  let y: number | null = null, m: number | null = null, d: number | null = null;
  let mt = q.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = q.match(/^(\d{1,2})[/月](\d{1,2})日?$/))) { m = +mt[1]; d = +mt[2]; }
  if (m === null || d === null) return null;
  const now = new Date();
  const from = new Date(y ?? now.getFullYear(), m - 1, d);
  if (isNaN(from.getTime())) return null;
  // 年省略で過去日になる場合は翌年とみなす
  if (y === null && from < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 180)) from.setFullYear(from.getFullYear() + 1);
  const to = new Date(from); to.setDate(to.getDate() + 1);
  return { from, to };
}

const STATUS: Record<string, { label: string; cls: string }> = {
  tentative: { label: "仮予約", cls: "violet" },
  contracted: { label: "契約済", cls: "gray" },
  planning: { label: "打ち合わせ中", cls: "amber" },
  quoting: { label: "見積作成中", cls: "blue" },
  final_prep: { label: "直前準備", cls: "red" },
  done: { label: "完了", cls: "green" },
};

export default async function CasesPage({
  searchParams,
}: { searchParams: { q?: string; view?: string; type?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const q = searchParams.q ?? "";
  const view = searchParams.view ?? "active";
  const typeFilter = searchParams.type ?? "";
  const scope = await caseScopeWhere(s);

  // 検索：氏名・電話・メール・会場名（マスタ/自由記載）・開催日（YYYY-MM-DD / MM/DD / M月D日）
  const dateQ = parseDateQuery(q);
  const cases = await prisma.case.findMany({
    where: {
      ...scope,
      ...(dateQ
        ? { weddingDate: { gte: dateQ.from, lt: dateQ.to } }
        : q
        ? {
            OR: [
              { groomName: { contains: q } }, { brideName: { contains: q } },
              { phone: { contains: q } }, { email: { contains: q } },
              { venueFree: { contains: q } },
              { banquetVenue: { name: { contains: q } } },
            ],
          }
        : {}),
    },
    include: {
      planner: { select: { name: true } },
      banquetVenue: true,
      quotes: { select: { status: true } },
      orders: { select: { status: true } },
      guests: { select: { tableId: true, seatObjectId: true } },
      _count: { select: { meetings: true, songs: true, rundownItems: true } },
    },
  });

  const enriched = cases.map((c) => ({
    c,
    d: daysUntil(c.weddingDate),
    progress: computeProgress({
      meetingsCount: c._count.meetings,
      quotes: c.quotes,
      orders: c.orders,
      songsCount: c._count.songs,
      guests: c.guests,
      rundownCount: c._count.rundownItems,
    }),
  }));

  const filtered = enriched
    .filter((e) => (view === "done" ? e.d < 0 : view === "active" ? e.d >= 0 : true))
    .filter((e) => !typeFilter || typeMeta(e.c.caseType).value === typeFilter)
    .sort((a, b) => (view === "done" ? b.d - a.d : a.d - b.d));

  const counts = {
    active: enriched.filter((e) => e.d >= 0).length,
    done: enriched.filter((e) => e.d < 0).length,
    all: enriched.length,
  };

  return (
    <>
      <div className="section-h">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {([["active", `今後の開催 ${counts.active}`], ["done", `完了 ${counts.done}`], ["all", `すべて ${counts.all}`]] as const).map(([v, l]) => (
            <Link key={v} href={`/cases?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={view === v ? "active" : ""}>{l}</Link>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <form action="/cases" style={{ display: "flex", gap: 8 }}>
          <input type="hidden" name="view" value={view} />
          <input className="form-input" style={{ width: 230 }} name="q" placeholder="氏名・電話・メール・会場・日付" defaultValue={q}
            title="例：高橋／090-1234／@example.com／披露宴会場A／7/20・2026-07-20" />
          <button className="btn">検索</button>
        </form>
        {can(s.role, "cases", "edit") && (
          <Link href="/cases/new" className="btn primary">＋ 新規案件</Link>
        )}
      </div>

      {/* 種別フィルタ（ブライダル以外の予定もここで確認） */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <Link href={`/cases?view=${view}`} className={`pill ${!typeFilter ? "accent" : "gray"}`}>すべて</Link>
        {(["wedding", "party", "ceremony", "event"] as const).map((t) => {
          const m = typeMeta(t);
          const n = enriched.filter((e) => typeMeta(e.c.caseType).value === t && (view === "done" ? e.d < 0 : view === "active" ? e.d >= 0 : true)).length;
          return (
            <Link key={t} href={`/cases?view=${view}&type=${t}`}
              className={`pill ${typeFilter === t ? "accent" : "gray"}`}>
              {m.emoji} {m.label} {n}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="card"><div className="empty">該当する案件がありません</div></div>
      )}

      <div className="case-grid">
        {filtered.map(({ c, d, progress }) => {
          const st = STATUS[c.status] ?? { label: c.status, cls: "gray" };
          const dd = ddayLabel(d);
          return (
            <Link key={c.id} href={`/cases/${c.id}`} className="card case-card">
              <div className="cc-top">
                <div>
                  <div className="cc-names">
                    {c.caseType !== "wedding" && <span style={{ marginRight: 4 }}>{typeMeta(c.caseType).emoji}</span>}
                    {c.brideName === "―" ? c.groomName : `${c.groomName} & ${c.brideName}`}
                  </div>
                  <div className="cc-date">
                    {c.weddingDate.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
                    　{c.banquetVenue?.name ?? c.venueFree ?? "会場未定"}・{timeRangeLabel(c.weddingDate, c.endTime)}
                  </div>
                </div>
                <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span className={`dday ${dd.cls}`}>{dd.text}</span>
                  {/* 🗑 完全削除（支配人以上のみ・テストデータの掃除用） */}
                  {["admin", "manager"].includes(s.role) && (
                    <CaseDeleteButton caseId={c.id}
                      label={c.brideName === "―" ? c.groomName : `${c.groomName} & ${c.brideName}`} />
                  )}
                </span>
              </div>
              <div className="cc-meta">
                <span className="pill gray">{c.guestCount}名</span>
                <span className={`pill ${st.cls}`}>{st.label}</span>
                <span style={{ fontSize: 11.5, color: "var(--text3)" }}>担当：{c.planner?.name ?? "—"}</span>
              </div>
              {d >= 0 ? (
                <div className="cc-progress">
                  <div className="progress"><span style={{ width: `${progress.percent}%` }} /></div>
                  <span className="cc-pct">{progress.percent}%</span>
                </div>
              ) : (
                <div className="cc-progress"><span style={{ fontSize: 11.5, color: "var(--text3)" }}>お開き済み・記録保全</span></div>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
