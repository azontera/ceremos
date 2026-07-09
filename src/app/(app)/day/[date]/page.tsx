import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DayVenueChart } from "@/components/day-venue-chart";

export const dynamic = "force-dynamic";

// 日別ビュー：会場×時間の使用状況バーチャート（1日分）
export default async function DayPage({ params }: { params: { date: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) notFound();
  const dayStart = new Date(`${params.date}T00:00:00`);
  if (isNaN(dayStart.getTime())) notFound();

  const dateLabel = dayStart.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const prevD = new Date(dayStart); prevD.setDate(prevD.getDate() - 1);
  const nextD = new Date(dayStart); nextD.setDate(nextD.getDate() + 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <>
      <div className="section-h">
        <Link className="btn sm" href={`/calendar?ym=${dayStart.getFullYear()}-${dayStart.getMonth() + 1}`}>← 月カレンダー</Link>
        <h2>{dateLabel}</h2>
        <Link className="btn sm" href={`/day/${iso(prevD)}`}>← 前日</Link>
        <Link className="btn sm" href={`/day/${iso(nextD)}`}>翌日 →</Link>
        <div style={{ flex: 1 }} />
        <span className="pill accent">開催</span>
        <span className="pill blue">打合せ</span>
        <span className="pill amber">試着</span>
        <span className="pill green">搬入・納品</span>
        <span className="pill gray">リソース割当</span>
      </div>
      <DayVenueChart dateISO={params.date} />
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 10 }}>
        ※ 縦軸=会場（宴会場・チャペル・控室・厨房）、横軸=時間。バーをクリックすると案件へ移動します。点線枠は仮予約、赤枠は時間帯の重複です。
      </p>
    </>
  );
}
