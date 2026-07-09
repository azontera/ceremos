import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { caseScopeWhere } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { effectiveEnd, overlaps, fmtHM } from "@/lib/case-time";
import { DayVenueChart } from "@/components/day-venue-chart";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  wedding: "挙式", meeting: "打合せ", fitting: "試着",
  delivery: "納品", arrival: "搬入", staff: "スタッフ",
};

export default async function CalendarPage({ searchParams }: { searchParams: { ym?: string; d?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");

  const today = new Date();
  // カレンダー下の会場バーチャート対象日（?d= 指定がなければ今日）
  const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const chartISO = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d ?? "") ? searchParams.d! : isoOf(today);
  const chartDay = new Date(`${chartISO}T00:00:00`);
  const chartPrev = new Date(chartDay); chartPrev.setDate(chartPrev.getDate() - 1);
  const chartNext = new Date(chartDay); chartNext.setDate(chartNext.getDate() + 1);
  const [y, m] = (searchParams.ym ?? `${today.getFullYear()}-${today.getMonth() + 1}`)
    .split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);

  const scope = await caseScopeWhere(s);
  const caseIds = (await prisma.case.findMany({ where: scope, select: { id: true } })).map((c) => c.id);

  const [events, weddings] = await Promise.all([
    prisma.calendarEvent.findMany({
      // 翌月1日のイベントが今月のグリッドに混入するバグを修正（lte→lt）
      where: { caseId: { in: caseIds }, startsAt: { gte: first, lt: new Date(y, m, 1) } },
      include: { case: { select: { groomName: true, brideName: true } }, venue: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.case.findMany({
      where: { ...scope, weddingDate: { gte: first, lt: new Date(y, m, 1) } },
      include: { banquetVenue: true },
    }),
  ]);

  // バンケット重複チェック：同一会場×時間帯の重なり
  const conflictIds = new Set<string>();
  for (let i = 0; i < weddings.length; i++) {
    for (let j = i + 1; j < weddings.length; j++) {
      const a = weddings[i], b = weddings[j];
      if (!a.banquetVenueId || a.banquetVenueId !== b.banquetVenueId) continue;
      if (overlaps(
        a.weddingDate, effectiveEnd(a.weddingDate, a.endTime),
        b.weddingDate, effectiveEnd(b.weddingDate, b.endTime),
      )) { conflictIds.add(a.id); conflictIds.add(b.id); }
    }
  }
  const conflicts = weddings.filter((w) => conflictIds.has(w.id));

  type Ev = { day: number; label: string; cls: string; time: string };
  const byDay = new Map<number, Ev[]>();
  const push = (day: number, ev: Ev) => byDay.set(day, [...(byDay.get(day) ?? []), ev]);

  for (const w of weddings) {
    const conflict = conflictIds.has(w.id);
    const wname = w.brideName === "―"
      ? w.groomName.slice(0, 10)
      : `${w.groomName.split(" ")[0]}家 挙式`;
    push(w.weddingDate.getDate(), {
      day: w.weddingDate.getDate(),
      label: `${conflict ? "⚠ " : ""}${w.status === "tentative" ? "【仮】" : ""}${fmtHM(w.weddingDate)} ${wname}`,
      cls: conflict ? "e-conflict" : "e-wedding",
      time: "",
    });
  }
  for (const e of events) {
    if (e.type === "wedding") continue; // 挙式は cases 起点で表示済み
    push(e.startsAt.getDate(), {
      day: e.startsAt.getDate(),
      label: `${e.startsAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} ${e.title}`,
      cls: `e-${e.type}`,
      time: "",
    });
  }

  // 月グリッド（月曜始まり）
  const lead = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: last.getDate() }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = m === 1 ? `${y - 1}-12` : `${y}-${m - 1}`;
  const next = m === 12 ? `${y + 1}-1` : `${y}-${m + 1}`;
  const isThisMonth = y === today.getFullYear() && m === today.getMonth() + 1;

  return (
    <>
      <div className="section-h">
        <h2>{y}年 {m}月</h2>
        <Link className="btn sm" href={`/calendar?ym=${prev}`}>← 前月</Link>
        <Link className="btn sm" href={`/calendar?ym=${next}`}>翌月 →</Link>
        <div style={{ flex: 1 }} />
        <span className="pill accent">開催（挙式・宴会・イベント）</span>
        <span className="pill blue">打合せ</span>
        <span className="pill amber">試着</span>
        <span className="pill green">搬入・納品</span>
      </div>

      {conflicts.length > 0 && (
        <div className="form-err" style={{ marginBottom: 12 }}>
          ⚠ バンケット重複：同一会場で時間帯の重なる予定があります（{Array.from(new Set(conflicts.map((w) => `${w.weddingDate.getDate()}日 ${w.banquetVenue?.name} ${fmtHM(w.weddingDate)}〜`))).join("、")}）
        </div>
      )}

      <div className="cal">
        <div className="cal-grid">
          {["月", "火", "水", "木", "金", "土", "日"].map((d) => <div className="dow" key={d}>{d}</div>)}
          {cells.map((day, i) => (
            <div key={i} className={`cal-cell ${day === null ? "dim" : ""} ${day !== null && isThisMonth && day === today.getDate() ? "today" : ""}`}>
              {day !== null && (
                <Link
                  href={`/day/${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`}
                  style={{ display: "block", color: "inherit", textDecoration: "none", minHeight: "100%" }}
                  title="クリックで日別ビューへ"
                >
                  <div className="dnum">{day}</div>
                  {(byDay.get(day) ?? []).map((ev, j) => (
                    <span key={j} className={`cal-ev ${ev.cls}`} title={ev.label}>{ev.label}</span>
                  ))}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 10 }}>
        ※ 種別：{Object.values(TYPE_LABEL).join("・")}。重複がある日は赤く表示されます。日付をクリックすると日別ビューが開きます。
      </p>

      {/* 会場使用バーチャート（1日分）：チャペル・宴会場・ガーデン等の被りを視覚確認 */}
      <div className="section-h" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>
          🏛 会場の使用状況　{chartDay.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}
        </h2>
        <Link className="btn sm" href={`/calendar?ym=${y}-${m}&d=${isoOf(chartPrev)}`}>← 前日</Link>
        <Link className="btn sm" href={`/calendar?ym=${y}-${m}&d=${isoOf(chartNext)}`}>翌日 →</Link>
        {chartISO !== isoOf(today) && (
          <Link className="btn sm" href={`/calendar?ym=${y}-${m}`}>今日</Link>
        )}
        <div style={{ flex: 1 }} />
        <Link className="btn sm" href={`/day/${chartISO}`}>⤢ 日別ビューで拡大</Link>
      </div>
      <DayVenueChart dateISO={chartISO} />
    </>
  );
}
