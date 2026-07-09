import Link from "next/link";
import { getSession } from "@/lib/auth";
import { caseScopeWhere } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { effectiveEnd, overlaps, fmtHM } from "@/lib/case-time";
import { typeMeta, caseLabel } from "@/lib/case-types";

// 会場（チャペル・宴会場・ガーデン等）×時間の使用状況バーチャート（1日分）
// 日別ビューとカレンダー下部の両方で使用。他の式との被りを視覚的に確認できる

const BAR: Record<string, { bg: string; bd: string }> = {
  case_wedding: { bg: "linear-gradient(135deg,#e9b8c4,#d99aa8)", bd: "#a4586b" },
  case_party: { bg: "linear-gradient(135deg,#f0c987,#e0b060)", bd: "#b07a2a" },
  case_ceremony: { bg: "linear-gradient(135deg,#9db8dd,#7d9cc8)", bd: "#4a6fa5" },
  case_event: { bg: "linear-gradient(135deg,#a9d3b6,#84bd97)", bd: "#3d8a5f" },
  meeting: { bg: "#dbe7f6", bd: "#4a6fa5" },
  fitting: { bg: "#f7ead0", bd: "#b07a2a" },
  delivery: { bg: "#d9eee0", bd: "#3d8a5f" },
  arrival: { bg: "#d9eee0", bd: "#3d8a5f" },
  staff: { bg: "#eceae6", bd: "#8b8680" },
  waiting: { bg: "#efe7f4", bd: "#7a5a96" },
  kitchen: { bg: "#f4e7e0", bd: "#a0603c" },
  equipment: { bg: "#eceae6", bd: "#8b8680" },
};
const VENUE_TYPE_LABEL: Record<string, string> = {
  banquet: "宴会場", chapel: "チャペル", waiting: "控室", kitchen: "厨房", external: "外部",
};
const VENUE_ORDER = ["banquet", "chapel", "waiting", "kitchen", "external"];

type Bar = {
  key: string; caseId: string | null; label: string; sub: string;
  start: Date; end: Date; color: { bg: string; bd: string }; conflict?: boolean; tentative?: boolean;
};

// 万一チャート内部でエラーが起きてもページ全体を落とさない（リソースタブ・カレンダー保護）
export async function DayVenueChart({ dateISO }: { dateISO: string }) {
  try {
    return await DayVenueChartInner({ dateISO });
  } catch (e) {
    console.error("DayVenueChart failed:", e);
    return (
      <div className="form-err">
        「1日の式場の動き」チャートを表示できませんでした（サーバーログ: DayVenueChart failed）。ページの他の機能は利用できます。
      </div>
    );
  }
}

async function DayVenueChartInner({ dateISO }: { dateISO: string }) {
  const s = await getSession();
  if (!s) return null;
  const dayStart = new Date(`${dateISO}T00:00:00`);
  if (isNaN(dayStart.getTime())) return null;
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

  const scope = await caseScopeWhere(s);
  const [venues, cases, events, assignments] = await Promise.all([
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
    prisma.case.findMany({
      where: { ...scope, weddingDate: { gte: new Date(dayStart.getTime() - 86400000), lt: dayEnd } },
      include: { banquetVenue: true, chapelVenue: true },
    }),
    prisma.calendarEvent.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd } },
      include: { case: { select: { id: true, groomName: true, brideName: true } } },
    }),
    prisma.assignment.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd } }, // 会場未設定の設備・スタッフも表示
      include: { case: { select: { id: true, groomName: true, brideName: true } } },
    }),
  ]);

  const scopedCaseIds = new Set(cases.map((c) => c.id));
  const dayCases = cases.filter((c) => {
    const end = effectiveEnd(c.weddingDate, c.endTime);
    return overlaps(c.weddingDate, end, dayStart, dayEnd);
  });

  const rows = new Map<string, Bar[]>();
  const pushBar = (venueId: string | null, bar: Bar) =>
    rows.set(venueId ?? "__other__", [...(rows.get(venueId ?? "__other__") ?? []), bar]);

  for (const c of dayCases) {
    const end = effectiveEnd(c.weddingDate, c.endTime);
    const meta = typeMeta(c.caseType);
    pushBar(c.banquetVenueId ?? null, {
      key: `case-${c.id}`, caseId: c.id,
      label: `${meta.emoji} ${caseLabel(c)}`,
      sub: `${fmtHM(c.weddingDate)}〜${fmtHM(end)}`,
      start: c.weddingDate, end,
      color: BAR[`case_${meta.value}`] ?? BAR.case_wedding,
      tentative: c.status === "tentative",
    });
  }
  for (const a of assignments) {
    if (!scopedCaseIds.has(a.caseId) && s.role !== "admin" && s.role !== "manager") continue;
    // 会場未設定のリソースは種類別の行（スタッフ／設備・機材など）へ
    if (!a.venueId) {
      pushBar(`__kind_${a.kind}__`, {
        key: `asg-${a.id}`, caseId: a.caseId,
        label: a.label,
        sub: `${fmtHM(a.startsAt)}〜${fmtHM(a.endsAt)}${a.case ? `｜${a.case.groomName.split(" ")[0]}家` : ""}`,
        start: a.startsAt, end: a.endsAt,
        color: BAR[a.kind] ?? BAR.equipment,
      });
      continue;
    }
    pushBar(a.venueId, {
      key: `asg-${a.id}`, caseId: a.caseId,
      label: a.label,
      sub: `${fmtHM(a.startsAt)}〜${fmtHM(a.endsAt)}${a.case ? `｜${a.case.groomName.split(" ")[0]}家` : ""}`,
      start: a.startsAt, end: a.endsAt,
      color: BAR[a.kind] ?? BAR.equipment,
    });
  }
  for (const e of events) {
    if (e.type === "wedding") continue;
    if (e.caseId && !scopedCaseIds.has(e.caseId) && s.role !== "admin" && s.role !== "manager") continue;
    pushBar(e.venueId, {
      key: `ev-${e.id}`, caseId: e.caseId,
      label: e.title,
      sub: `${fmtHM(e.startsAt)}〜${fmtHM(e.endsAt)}`,
      start: e.startsAt, end: e.endsAt,
      color: BAR[e.type] ?? BAR.staff,
    });
  }

  for (const bars of rows.values()) {
    for (let i = 0; i < bars.length; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        if (bars[i].key.startsWith("case-") && bars[j].key.startsWith("case-") &&
            overlaps(bars[i].start, bars[i].end, bars[j].start, bars[j].end)) {
          bars[i].conflict = bars[j].conflict = true;
        }
      }
    }
  }

  // 🎬 お客様の動き：各案件の進行表を1行のバー列にして表示（挙式→乾杯→ケーキ…の流れが見える）
  const rundownItems = dayCases.length > 0
    ? await prisma.rundownItem.findMany({
        where: { caseId: { in: dayCases.map((c) => c.id) } },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const hm = (t: string) => { const m = t.match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  for (const c of dayCases) {
    const its = rundownItems.filter((r) => r.caseId === c.id);
    for (const r of its) {
      const startMin = hm(r.time);
      if (startMin === null) continue;
      const st = new Date(dayStart.getTime() + startMin * 60000);
      const en = new Date(st.getTime() + (r.durationMin ?? 10) * 60000);
      pushBar(`__run_${c.id}__`, {
        key: `run-${r.id}`, caseId: c.id,
        label: r.title,
        sub: `${r.time}〜（${r.durationMin ?? 10}分）`,
        start: st, end: en,
        color: { bg: "#f6f1ec", bd: "#b8a596" },
      });
    }
  }


  let minH = 8, maxH = 22;
  for (const bars of rows.values()) {
    for (const b of bars) {
      const sH = Math.max(0, Math.floor((Math.max(b.start.getTime(), dayStart.getTime()) - dayStart.getTime()) / 3600000));
      const eH = Math.min(24, Math.ceil((Math.min(b.end.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 3600000));
      if (sH < minH) minH = sH;
      if (eH > maxH) maxH = eH;
    }
  }
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);
  const HOUR_W = 110;
  const chartW = (maxH - minH) * HOUR_W;
  const xOf = (t: Date) => {
    const clamped = Math.min(Math.max(t.getTime(), dayStart.getTime()), dayEnd.getTime());
    return ((clamped - dayStart.getTime()) / 3600000 - minH) * HOUR_W;
  };

  const orderedVenues = [...venues].sort(
    (a, b) => VENUE_ORDER.indexOf(a.type) - VENUE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name, "ja"));
  const rowDefs: { id: string; name: string; typeLabel: string; bars: Bar[] }[] = orderedVenues
    .filter((v) => v.type !== "external" || (rows.get(v.id)?.length ?? 0) > 0)
    .map((v) => ({ id: v.id, name: v.name, typeLabel: VENUE_TYPE_LABEL[v.type] ?? v.type, bars: rows.get(v.id) ?? [] }));
  // お客様の動き（進行表）
  for (const c of dayCases) {
    const bars = rows.get(`__run_${c.id}__`) ?? [];
    if (bars.length > 0) {
      rowDefs.push({ id: `__run_${c.id}__`, name: `🎬 ${caseLabel(c)} の動き`, typeLabel: "お客様・進行", bars });
    }
  }
  // 設備・スタッフ（会場未設定のリソース）
  const KIND_LABEL: Record<string, string> = { staff: "👥 スタッフ", equipment: "🔧 設備・機材", waiting: "🚪 控室", kitchen: "🍳 厨房", delivery: "🚚 納品・搬入", arrival: "🚚 納品・搬入" };
  for (const [rid, bars] of rows.entries()) {
    if (!rid.startsWith("__kind_")) continue;
    const kind = rid.slice(7, -2);
    rowDefs.push({ id: rid, name: KIND_LABEL[kind] ?? `📦 ${kind}`, typeLabel: "設備・スタッフ", bars });
  }
  if ((rows.get("__other__")?.length ?? 0) > 0) {
    rowDefs.push({ id: "__other__", name: "その他（会場未設定）", typeLabel: "—", bars: rows.get("__other__")! });
  }
  const anyConflict = [...rows.values()].some((bars) => bars.some((b) => b.conflict));

  return (
    <>
      {anyConflict && (
        <div className="form-err" style={{ marginBottom: 12 }}>
          ⚠ 同一会場で時間帯の重なる開催があります（赤枠のバー）
        </div>
      )}
      <div className="card" style={{ overflowX: "auto", padding: 0 }}>
        <div style={{ minWidth: 190 + chartW + 20, padding: "14px 10px 18px" }}>
          <div style={{ display: "flex" }}>
            <div style={{ width: 180, flexShrink: 0 }} />
            <div style={{ position: "relative", width: chartW, height: 22 }}>
              {hours.map((h) => (
                <div key={h} style={{ position: "absolute", left: (h - minH) * HOUR_W - 14, width: 28, textAlign: "center", fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>
                  {h}:00
                </div>
              ))}
            </div>
          </div>
          {rowDefs.map((row) => (
            <div key={row.id} style={{ display: "flex", alignItems: "stretch", borderTop: "1px solid var(--border)" }}>
              <div style={{ width: 180, flexShrink: 0, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <b style={{ fontSize: 13 }}>{row.name}</b>
                <span style={{ fontSize: 10.5, color: "var(--text3)" }}>{row.typeLabel}{row.bars.length > 0 ? `・${row.bars.length}件` : "・空き"}</span>
              </div>
              <div style={{ position: "relative", width: chartW, minHeight: 52 }}>
                {hours.slice(0, -1).map((h) => (
                  <div key={h} style={{ position: "absolute", left: (h - minH) * HOUR_W, top: 0, bottom: 0, borderLeft: "1px dashed var(--border)" }} />
                ))}
                {(() => {
                  // 「お客様の動き」行は演目が短時間で数多く並ぶため、狭いバーでも読めるよう縦書きにする
                  const isFlowRow = row.id.startsWith("__run_");
                  const lanes: Date[] = [];
                  const placed = row.bars
                    .sort((a, b) => a.start.getTime() - b.start.getTime())
                    .map((b) => {
                      let lane = lanes.findIndex((endAt) => endAt <= b.start);
                      if (lane === -1) { lane = lanes.length; lanes.push(b.end); }
                      else lanes[lane] = b.end;
                      return { ...b, lane };
                    });
                  const laneH = isFlowRow ? 110 : 42;
                  return (
                    <div style={{ height: Math.max(1, lanes.length) * laneH + 10 }}>
                      {placed.map((b) => {
                        const left = xOf(b.start);
                        const width = Math.max(26, xOf(b.end) - left);
                        const fromPrev = b.start < dayStart;
                        const toNext = b.end > dayEnd;
                        // 横書きだと狭いバーは数文字しか見えず読めない（文字化けのように見える）ため、
                        // 「お客様の動き」行は常に縦書きにする（幅が狭くても演目名を最後まで読める）
                        const showSub = !isFlowRow && width >= 100;
                        const showLabel = isFlowRow || width >= 40;
                        const titleAttr = `${b.label} ${b.sub}${fromPrev ? "（前日から継続）" : ""}${toNext ? "（翌日へ継続）" : ""}`;
                        const inner = (
                          <div style={{
                            position: "absolute", left, width, top: 6 + b.lane * laneH, height: laneH - 8,
                            background: b.color.bg, border: `1.6px ${b.tentative ? "dashed" : "solid"} ${b.conflict ? "var(--red, #c14b4b)" : b.color.bd}`,
                            boxShadow: b.conflict ? "0 0 0 2px rgba(193,75,75,.25)" : "var(--shadow)",
                            borderRadius: 8,
                            borderTopLeftRadius: fromPrev ? 0 : 8, borderBottomLeftRadius: fromPrev ? 0 : 8,
                            borderTopRightRadius: toNext ? 0 : 8, borderBottomRightRadius: toNext ? 0 : 8,
                            padding: showLabel ? (isFlowRow ? "8px 2px" : "3px 8px") : 0,
                            overflow: "hidden",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, color: "#3a2f2b", cursor: b.caseId ? "pointer" : "default",
                          }} title={titleAttr}>
                            {isFlowRow ? (
                              showLabel && (
                                <b style={{
                                  writingMode: "vertical-rl", textOrientation: "upright",
                                  overflow: "hidden", textOverflow: "ellipsis", maxHeight: "100%",
                                  letterSpacing: "0.02em", fontSize: 12,
                                }}>
                                  {b.conflict ? "⚠" : ""}{b.tentative ? "仮" : ""}{b.label}
                                </b>
                              )
                            ) : showLabel ? (
                              <div style={{ width: "100%" }}>
                                <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {b.conflict ? "⚠ " : ""}{b.tentative ? "【仮】" : ""}{fromPrev ? "◀ " : ""}{b.label}{toNext ? " ▶" : ""}
                                </b>
                                {showSub && (
                                  <span style={{ fontSize: 10, opacity: 0.75, whiteSpace: "nowrap" }}>
                                    {fromPrev ? "前日から｜" : ""}{b.sub}{toNext ? "｜翌日へ" : ""}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span aria-hidden style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, lineHeight: 1 }}>
                                {b.conflict ? "⚠" : "…"}
                              </span>
                            )}
                          </div>
                        );
                        return b.caseId
                          ? <Link key={b.key} href={`/cases/${b.caseId}`} style={{ color: "inherit" }}>{inner}</Link>
                          : <div key={b.key}>{inner}</div>;
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
          {rowDefs.length === 0 && <div className="empty" style={{ padding: 30 }}>会場マスタが未登録です</div>}
        </div>
      </div>
    </>
  );
}
