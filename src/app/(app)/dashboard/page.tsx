import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDashboard } from "@/lib/queries";
import { daysUntil, ddayLabel, computeProgress } from "@/lib/progress";
import { timeRangeLabel } from "@/lib/case-time";
import { typeMeta, caseLabel } from "@/lib/case-types";
import { cleanupExpiredSongMedia } from "@/lib/cleanup";
import { resolveCoupleSide } from "@/lib/couple-side";
import { t as term, isBridal } from "@/lib/terms";

// お客様専用ホーム：概要・楽曲・席次表・チャット・ヒヤリングへの入り口
async function CustomerHome({ userId, name }: { userId: string; name: string }) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, profileJson: true } });
  const memberships = await prisma.caseMember.findMany({
    where: { userId, user: { role: "couple" } },
    include: {
      case: {
        include: {
          banquetVenue: true,
          planner: { select: { name: true } },
          meetings: { orderBy: { heldAt: "desc" }, take: 5 },
          quotes: { select: { id: true, status: true } },
          tasks: { where: { status: { not: "done" } }, orderBy: { dueAt: "asc" } },
          guests: { select: { side: true, tableId: true, seatObjectId: true } },
          orders: { select: { status: true } },
          songs: { select: { id: true, title: true } },
          rundownItems: { select: { id: true } },
        },
      },
    },
  });
  const cases = memberships.map((m) => ({ ...m.case, roleInCase: m.roleInCase }))
    .sort((a, b) => a.weddingDate.getTime() - b.weddingDate.getTime());
  // ヒヤリング回答済みか（profileJson.survey）
  let surveyDone = false;
  try { surveyDone = Object.values(JSON.parse(me?.profileJson ?? "{}").survey ?? {}).some((v) => String(v ?? "").trim()); } catch { /* ignore */ }

  return (
    <>
      <div className="section-h"><h2>ようこそ、{name} 様</h2></div>
      {cases.length === 0 && (
        <div className="card" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 2 }}>
            ご登録ありがとうございます。担当プランナーがご準備を進めています。<br />
            お時間のあるときに <Link href="/survey">📝 ヒヤリングシート</Link> のご回答にご協力ください。
          </p>
        </div>
      )}
      {cases.map((c) => {
        const dd = ddayLabel(daysUntil(c.weddingDate));
        const meta = typeMeta(c.caseType);
        const nextMeeting = c.meetings.map((m) => m.nextAt).filter((x): x is Date => !!x && x > new Date())
          .sort((a, b) => a.getTime() - b.getTime())[0];
        // ---- タスクフィード（スマホの「今やること」カード）----
        const bridal = isBridal(c.caseType);
        const mySide = bridal && me ? resolveCoupleSide(me, c, c.roleInCase) : null;
        const progress = computeProgress({
          meetingsCount: c.meetings.length, quotes: c.quotes, orders: c.orders,
          songsCount: c.songs.length, guests: c.guests, rundownCount: c.rundownItems.length,
        });
        const sideLabel = mySide ? term(mySide === "groom" ? "groomSide" : "brideSide", c.caseType) : null;
        const myGuests = mySide ? c.guests.filter((g) => g.side === mySide).length : c.guests.length;
        const latestQuote = c.quotes[c.quotes.length - 1];
        type Feed = { icon: string; title: string; desc: string; href: string; urgent?: boolean };
        const feed: Feed[] = [
          ...(!surveyDone ? [{
            icon: "📝", title: "ヒヤリングに答える（1〜2分）", desc: "ご希望・お好みなど、プランづくりに必要なことを教えてください",
            href: "/survey", urgent: true,
          }] : []),
          ...c.tasks.map((tk) => ({
            icon: "📌", title: tk.title,
            desc: tk.dueAt ? `期限：${tk.dueAt.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })}` : "プランナーからの宿題です",
            href: `/cases/${c.id}`,
            urgent: !!tk.dueAt && tk.dueAt < new Date(Date.now() + 3 * 86400000),
          })),
          ...(latestQuote?.status === "draft" ? [{
            icon: "💰", title: "お見積りのご確認", desc: "新しいお見積りが届いています",
            href: `/cases/${c.id}?tab=quotes`,
          }] : []),
          ...(myGuests === 0 ? [{
            icon: "🪑", title: sideLabel ? `${sideLabel}ゲストのご入力（あなたの担当）` : `${term("guests", c.caseType)}のご入力`,
            desc: bridal ? "おふたりで分担してゲストを登録しましょう" : "参加者リストを登録しましょう",
            href: `/cases/${c.id}?tab=seating`,
          }] : []),
          ...(c.songs.filter((sg) => sg.title && sg.title !== "（曲未定）").length < 5 && c.rundownItems.length > 0 ? [{
            icon: "🎵", title: "楽曲をえらぶ", desc: "おすすめから視聴して決められます",
            href: `/cases/${c.id}?tab=songs`,
          }] : []),
        ];
        return (
          <div className="card" key={c.id} style={{ padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div className={`dday-big ${dd.cls}`}>
                {daysUntil(c.weddingDate) > 0 ? <><small>{meta.day}まで</small>あと{daysUntil(c.weddingDate)}日</>
                  : daysUntil(c.weddingDate) === 0 ? <>本日<small>{meta.day}当日</small></> : <>終了<small>ありがとうございました</small></>}
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{meta.emoji} {caseLabel(c)}</div>
                <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4 }}>
                  {c.weddingDate.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
                  　{timeRangeLabel(c.weddingDate, c.endTime)}　｜　{c.banquetVenue?.name ?? c.venueFree ?? "会場調整中"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
                  担当プランナー：{c.planner?.name ?? "調整中"}
                  {nextMeeting && <>　｜　次回お打ち合わせ：{nextMeeting.toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</>}
                </div>
              </div>
            </div>
            {/* 準備完了度（触るほど進む実感を出すゲージ） */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{term("prep", c.caseType)}</span>
              <div className="progress" style={{ flex: 1 }}><span style={{ width: `${progress.percent}%` }} /></div>
              <b style={{ fontSize: 14, color: "var(--accent-text)" }}>{progress.percent}%</b>
            </div>

            {/* 今やることフィード */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", letterSpacing: ".08em", marginBottom: 6 }}>今やること</div>
              {feed.length === 0 ? (
                <div className="empty" style={{ padding: 12 }}>🎉 いま対応いただくことはありません。準備は順調です！</div>
              ) : feed.slice(0, 5).map((f, i) => (
                <Link key={i} href={f.href} className="list-row" style={{ textDecoration: "none" }}>
                  <span style={{ fontSize: 20 }}>{f.icon}</span>
                  <div className="t">
                    <b>{f.title}</b>
                    <span>{f.desc}</span>
                  </div>
                  {f.urgent && <span className="pill red">お早めに</span>}
                  <span style={{ color: "var(--text3)" }}>→</span>
                </Link>
              ))}
            </div>

            {/* やることメニュー（PCのみ。スマホは下部ナビ＋☰メニューに集約し、重複導線を出さない） */}
            <div className="pc-only" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 16 }}>
              {([
                [`/cases/${c.id}`, "🏠", "概要", "準備の進み具合を見る"],
                [`/cases/${c.id}?tab=quotes`, "💰", "お見積り・支払い", "金額とお支払い予定の確認"],
                [`/cases/${c.id}?tab=rundown`, "📋", "当日の流れ", "進行スケジュールの確認"],
                [`/cases/${c.id}?tab=songs`, "🎵", "楽曲をえらぶ", "おすすめから視聴して決定"],
                [`/cases/${c.id}?tab=seating`, "🪑", "席次表・ゲスト", "ゲスト登録と席の編集"],
                [`/cases/${c.id}?tab=chat`, "💬", "チャット", "プランナーに相談・連絡"],
                ["/survey", "📝", "ヒヤリング", "ご希望を教えてください"],
              ] as [string, string, string, string][]).map(([href, icon, label, desc]) => (
                <Link key={label} href={href} className="card" style={{ padding: "14px 12px", textAlign: "center", textDecoration: "none" }}>
                  <div style={{ fontSize: 26 }}>{icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>{label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 2 }}>{desc}</div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

export const dynamic = "force-dynamic";

const EVENT_PILL: Record<string, { label: string; cls: string }> = {
  meeting: { label: "打ち合わせ", cls: "blue" },
  wedding: { label: "本番", cls: "accent" },
  fitting: { label: "試着", cls: "amber" },
  delivery: { label: "納品", cls: "green" },
  arrival: { label: "搬入", cls: "green" },
  staff: { label: "スタッフ", cls: "gray" },
};

export default async function DashboardPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "couple") return <CustomerHome userId={s.userId} name={s.name} />; // お客様専用ホーム
  // 式終了後の本番楽曲データ自動削除（1日1回・失敗してもページは表示）
  cleanupExpiredSongMedia().catch((e) => console.error("cleanupExpiredSongMedia failed:", e));
  const d = await getDashboard(s);
  // 初期セットアップ未完了の案内（管理者・会場マスタが空のとき）
  const needSetup = s.role === "admin" ? (await prisma.venue.count()) === 0 : false;
  const now = new Date();
  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

  return (
    <>
      {/* 初期セットアップ案内（会場マスタが空の管理者に表示） */}
      {needSetup && (
        <Link href="/admin/settings" className="card" style={{ display: "block", padding: "14px 20px", marginBottom: 16, border: "1.5px solid var(--accent)", textDecoration: "none", color: "inherit" }}>
          <b>⚙️ はじめに「設定」で式場マスタを登録しましょう</b>
          <span style={{ fontSize: 12.5, color: "var(--text3)", marginLeft: 10 }}>
            式場情報・ロゴ・会場/設備（宴会場・チャペル・控室・厨房）をまとめて登録できます →
          </span>
        </Link>
      )}
      {/* 未対応クレーム */}
      {d.openClaims.length > 0 && (
        <div className="card" style={{ marginBottom: 16, border: "1.5px solid var(--red, #c14b4b)" }}>
          <div className="card-h">🚨 未対応のクレーム<span className="pill red">{d.openClaims.length}件</span></div>
          <div className="card-b">
            {d.openClaims.map((f) => (
              <Link className="list-row" key={f.id} href={`/cases/${f.caseId}?tab=after`}>
                <span className="dot" style={{ background: "var(--red)" }} />
                <div className="t">
                  <b>{f.caseLabel}</b>
                  <span>{f.body.slice(0, 60)}{f.body.length > 60 ? "…" : ""}</span>
                </div>
                <span style={{ color: "var(--text3)" }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 未入金アラート */}
      {d.unpaidInvoices.length > 0 && (
        <div className="card" style={{ marginBottom: 16, border: "1.5px solid var(--red, #c14b4b)" }}>
          <div className="card-h">💴 未入金アラート<span className="pill red">{d.unpaidInvoices.length}件・計 {yen(d.unpaidInvoices.reduce((s2, i) => s2 + i.amount, 0))}</span></div>
          <div className="card-b">
            {d.unpaidInvoices.map((i) => (
              <Link className="list-row" key={i.id} href={`/cases/${i.caseId}?tab=billing`}>
                <span className="dot" style={{ background: i.overdue ? "var(--red)" : "var(--amber)" }} />
                <div className="t">
                  <b>{i.caseLabel}　{i.number}</b>
                  <span>{i.dueAt ? `支払期日：${new Date(i.dueAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}${i.overdue ? "（超過）" : ""}` : "期日未設定"}</span>
                </div>
                <b style={{ color: i.overdue ? "var(--red)" : undefined }}>{yen(i.amount)}</b>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="grid cols-4">
        <div className="card kpi">
          <div className="k-label">本日の開催</div>
          <div className="k-val">{d.todayWeddings.length}<span style={{ fontSize: 14, color: "var(--text3)" }}> 件</span></div>
          <div className="k-sub">{d.todayWeddings.map((w) => w.banquetVenue?.name).filter(Boolean).join("・") || "—"}</div>
        </div>
        <div className="card kpi">
          <div className="k-label">今週の開催</div>
          <div className="k-val">{d.weekWeddings}<span style={{ fontSize: 14, color: "var(--text3)" }}> 件</span></div>
          <div className="k-sub">今日から7日間</div>
        </div>
        <div className="card kpi">
          <div className="k-label">未処理タスク</div>
          <div className="k-val" style={{ color: d.openTasks.length ? "var(--red)" : undefined }}>{d.openTasks.length}</div>
          <div className="k-sub">
            期限超過 {d.openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now).length}件
          </div>
        </div>
        <div className="card kpi">
          <div className="k-label">見積承認待ち</div>
          <div className="k-val" style={{ color: d.pendingQuotes ? "var(--amber)" : undefined }}>{d.pendingQuotes}</div>
          <div className="k-sub">最終承認は支配人</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h">今日の予定</div>
          <div className="card-b">
            {d.todayEvents.length === 0 && <div className="empty">本日の予定はありません</div>}
            {d.todayEvents.map((e) => {
              const p = EVENT_PILL[e.type] ?? { label: e.type, cls: "gray" };
              const inner = (
                <>
                  <span className="time-tag">
                    {new Date(e.startsAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="t">
                    <b>{e.title}</b>
                    <span>{e.case ? `${e.case.groomName} & ${e.case.brideName}` : ""}</span>
                  </div>
                  <span className={`pill ${p.cls}`}>{p.label}</span>
                </>
              );
              return e.case
                ? <Link className="list-row" key={e.id} href={`/cases/${e.case.id}`}>{inner}</Link>
                : <div className="list-row" key={e.id}>{inner}</div>;
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-h">今週の開催<span className="pill accent">{d.weekList.length}件</span></div>
          <div className="card-b">
            {d.weekList.length === 0 && <div className="empty">今週の開催はありません</div>}
            {d.weekList.map((w) => {
              const dd = ddayLabel(daysUntil(new Date(w.weddingDate)));
              return (
                <Link className="list-row" key={w.id} href={`/cases/${w.id}`}>
                  <span className={`dday ${dd.cls}`}>{dd.text}</span>
                  <div className="t">
                    <b>{w.brideName === "―" ? w.groomName : `${w.groomName} & ${w.brideName}`}</b>
                    <span>
                      {new Date(w.weddingDate).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })}
                      　{w.banquetVenue?.name ?? w.venueFree ?? "会場未定"}・{timeRangeLabel(new Date(w.weddingDate), w.endTime)}・{w.guestCount}名
                    </span>
                  </div>
                  <span style={{ color: "var(--text3)" }}>→</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h">やることリスト</div>
          <div className="card-b">
            {/* 承認待ちのお客様（最優先タスクとして表示） */}
            {d.pendingApprovals.map((u) => (
              <Link className="list-row" key={u.id} href="/approvals">
                <span className="dot" style={{ background: "var(--amber)" }} />
                <div className="t">
                  <b>👤 {u.name} 様の登録を承認する</b>
                  <span>{new Date(u.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })} 登録・案件への紐付けもここから</span>
                </div>
                <span className="pill amber">承認待ち</span>
              </Link>
            ))}
            {d.openTasks.length === 0 && d.pendingApprovals.length === 0 && <div className="empty">未処理タスクはありません</div>}
            {d.openTasks.map((t) => {
              const overdue = t.dueAt && new Date(t.dueAt) < now;
              const inner = (
                <>
                  <span className="dot" style={{ background: overdue ? "var(--red)" : "var(--amber)" }} />
                  <div className="t">
                    <b>{t.title}</b>
                    <span>
                      {t.dueAt ? `期限：${new Date(t.dueAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}${overdue ? "（超過）" : ""}` : "期限なし"}
                      {t.case ? ` ｜ ${t.case.groomName} & ${t.case.brideName}` : ""}
                    </span>
                  </div>
                </>
              );
              return t.case
                ? <Link className="list-row" key={t.id} href={`/cases/${t.case.id}`}>{inner}</Link>
                : <div className="list-row" key={t.id}>{inner}</div>;
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-h">新着チャット</div>
          <div className="card-b">
            {d.recentMessages.length === 0 && <div className="empty">メッセージはありません</div>}
            {d.recentMessages.map((m) => (
              <Link href={`/cases/${m.caseId}?tab=chat`} className="list-row" key={m.id}>
                <div className="avatar" style={{ background: "var(--accent)" }}>{m.sender.charAt(0)}</div>
                <div className="t">
                  <b>{m.sender}（{m.caseLabel}）</b>
                  <span>{m.body}</span>
                </div>
                <span className={`pill ${m.unread ? "accent" : "gray"}`}>{m.unread ? "未読" : "既読"}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h">発注状況<Link className="more" href="/cases">案件一覧 →</Link></div>
          <div className="card-b">
            {d.orderSummary.length === 0 && <div className="empty">発注はありません</div>}
            {d.orderSummary.map((o) => (
              <Link className="list-row" key={o.caseId} href={`/cases/${o.caseId}?tab=orders`}>
                <div className="t">
                  <b>{o.label}</b>
                  <span>{o.done}/{o.total} 確定</span>
                </div>
                <span className={`pill ${o.overdue ? "red" : o.done === o.total ? "green" : "amber"}`}>
                  {o.overdue ? "要対応" : o.done === o.total ? "完了" : "進行中"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
