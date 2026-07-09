import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can, canAccessCase } from "@/lib/rbac";
import { getCaseDetail } from "@/lib/queries";
import { computeProgress, daysUntil, ddayLabel } from "@/lib/progress";
import { typeMeta } from "@/lib/case-types";
import { timeRangeLabel } from "@/lib/case-time";
import { getMasterOptions } from "@/lib/masters";
import { SURVEY_30 } from "@/lib/survey";

const SURVEY_LABEL: Record<string, string> = Object.fromEntries(
  SURVEY_30.map((sv) => [sv.key, sv.q.replace(/^\d+\.\s*/, "")]),
);
import { ChatDock } from "@/components/chat-dock";
import { MeetingForm } from "@/components/meeting-form";
import { TaskList } from "@/components/task-list";
import { QuotesPanel } from "@/components/quotes-panel";
import { CatalogPanel } from "@/components/catalog-panel";
import { OrdersPanel } from "@/components/orders-panel";
import { MealsPanel } from "@/components/meals-panel";
import { SongsPanel } from "@/components/songs-panel";
import { RundownEditor } from "@/components/rundown-editor";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { AssignmentsPanel } from "@/components/assignments-panel";
import { SeatingPanel } from "@/components/seating-panel";
import { BillingPanel } from "@/components/billing-panel";
import { CustomerAccountPanel } from "@/components/customer-account-panel";
import { CaseInfoCard } from "@/components/case-info-card";
import { DayVenueChart } from "@/components/day-venue-chart";
import { SalesStepNav } from "@/components/sales-step-nav";
import { LostCaseButton } from "@/components/lost-case-button";
import { StrategyPanel, type StrategyData } from "@/components/strategy-panel";
import { computeSalesSteps } from "@/lib/sales-steps";
import { isBridal } from "@/lib/terms";
import { resolveCoupleSide } from "@/lib/couple-side";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// タブ構成（1タブ=1業務。縦に全部並べるLP型は廃止・?tab= で切替）
// スタッフ: 案件（情報・ToDo・リソース）／打ち合わせ／みつもり（カタログ・発注・料理・請求）／席次／進行（楽曲）
const STAFF_TABS = [
  { key: "info", label: "📌 案件" },
  { key: "meetings", label: "📝 打ち合わせ" },
  { key: "quotes", label: "💰 みつもり" },
  { key: "seating", label: "🪑 席次" },
  { key: "rundown", label: "📋 進行" },
];
const COUPLE_TABS = [
  { key: "quotes", label: "💰 お見積り" },
  { key: "catalog", label: "👗 えらぶ" },
  { key: "seating", label: "🪑 席次" },
  { key: "rundown", label: "📋 当日の流れ" },
];
// 旧アンカー・旧タブ名との互換（スマホ下部ナビ・過去リンクを壊さない）
const TAB_ALIAS: Record<string, string> = {
  catalog: "quotes", orders: "quotes", meals: "quotes", billing: "quotes",
  resources: "info", songs: "rundown", after: "info",
};

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "未確定", cls: "red" },
  confirmed: { label: "確定", cls: "green" },
  delivered: { label: "納品済", cls: "green" },
};
const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "下書き", cls: "gray" },
  confirmed: { label: "お客様 確認済", cls: "amber" },
  approved: { label: "承認済", cls: "green" },
  archived: { label: "アーカイブ", cls: "gray" },
};

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const d = (x: Date | string) =>
  new Date(x).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
const hm = (x: Date | string) => {
  const dt = new Date(x);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
};

export default async function CaseDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { tab?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canAccessCase(s, params.id))) redirect("/cases");

  const c = await getCaseDetail(params.id);
  if (!c) notFound();
  // 旧リンク互換：?tab=chat はチャットドックを自動で開く
  const chatOpen = searchParams.tab === "chat";
  const isStaff = s.role !== "couple";
  // 表示タブの解決（couple はカタログを独立タブに・スタッフはみつもりへ集約）
  const tabDefs = isStaff ? STAFF_TABS : COUPLE_TABS;
  const rawTab = searchParams.tab && searchParams.tab !== "chat" ? searchParams.tab : "";
  const aliased = !isStaff && rawTab === "catalog" ? "catalog" : (TAB_ALIAS[rawTab] ?? rawTab);
  const tab = tabDefs.some((t) => t.key === aliased) ? aliased : (isStaff ? "info" : "quotes");

  const ddays = daysUntil(c.weddingDate);
  const dd = ddayLabel(ddays);
  const meta = typeMeta(c.caseType);
  const venueName = c.banquetVenue?.name ?? c.venueFree ?? "会場未定";
  const timeRange = timeRangeLabel(c.weddingDate, c.endTime);
  const progress = computeProgress({
    meetingsCount: c.meetings.length,
    quotes: c.quotes,
    orders: c.orders,
    songsCount: c.songs.length,
    guests: c.guests,
    rundownCount: c.rundownItems.length,
  });
  const nextMeeting = c.meetings
    .map((m) => m.nextAt)
    .filter((x): x is Date => !!x && x > new Date())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const orders = s.vendorId ? c.orders.filter((o) => o.vendorId === s.vendorId) : c.orders;

  // 案件カードは全セクションを常に表示するため、必要なデータはすべてここでまとめて取得する
  const [
    vendors, quoteCategories, relationOptions,
    paymentPlans, invoices, caseAtts,
    infoVenues, infoPlanners, infoCaseTypes,
    customerMembers, meetingAtts, songAtts, menuItems,
  ] = await Promise.all([
    isStaff ? prisma.vendor.findMany() : Promise.resolve([]),
    getMasterOptions("quote_category"),
    getMasterOptions("relation").then((rows) => rows.map(([, l]) => l)),
    prisma.paymentPlan.findMany({ where: { caseId: c.id }, orderBy: { sortOrder: "asc" } }),
    prisma.invoice.findMany({ where: { caseId: c.id }, orderBy: { issuedAt: "desc" } }),
    prisma.attachment.findMany({ where: { parentType: "case", parentId: c.id } }),
    can(s.role, "cases", "edit") ? prisma.venue.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    can(s.role, "cases", "edit")
      ? prisma.user.findMany({ where: { role: { in: ["admin", "manager", "planner"] }, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    can(s.role, "cases", "edit") ? getMasterOptions("case_type") : Promise.resolve([]),
    prisma.caseMember.findMany({
      where: { caseId: c.id, user: { role: "couple" } },
      include: { user: { select: { id: true, name: true, email: true, phone: true, address: true, profileJson: true } } },
    }),
    prisma.attachment.findMany({ where: { parentType: "meeting", parentId: { in: c.meetings.map((m) => m.id) } } }),
    prisma.attachment.findMany({
      where: { parentType: "song", parentId: { in: c.rundownItems.map((r) => r.songId).filter(Boolean) as string[] } },
    }),
    isStaff ? prisma.menuItem.findMany({ where: { caseId: c.id }, orderBy: { sortOrder: "asc" } }) : Promise.resolve([]),
  ]);
  const followUpsCount = isStaff ? await prisma.followUp.count({ where: { caseId: c.id } }) : 0;
  const customerSurveys = customerMembers.map((m) => {
    let p: { furigana?: string; survey?: Record<string, string>; birthDate?: string; gender?: string; hasChildren?: string } = {};
    try { p = JSON.parse(m.user.profileJson ?? "{}"); } catch { /* ignore */ }
    const answers = Object.entries(p.survey ?? {}).filter(([, v]) => v?.trim());
    return { name: m.user.name, furigana: p.furigana, answers, basics: p };
  }).filter((x) => x.answers.length > 0 || x.basics.birthDate);

  const STAFF_ROLES = ["admin", "manager", "planner", "chef", "audio", "mc", "service", "dress", "photo"];
  const [assignments, resourceVenues, staffUsers] = isStaff
    ? await Promise.all([
        prisma.assignment.findMany({
          where: { caseId: c.id },
          include: { venue: true, user: { select: { name: true } } },
          orderBy: { startsAt: "asc" },
        }),
        prisma.venue.findMany({ where: { type: { in: ["waiting", "kitchen"] } } }),
        prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, isActive: true }, select: { id: true, name: true } }),
      ])
    : [[], [], []];

  const jump: Record<string, string> = {
    "見積承認": "quotes", "発注確定": "quotes",
    "楽曲決定": "rundown", "席次確定": "seating", "進行表作成": "rundown",
  };

  // お客様の席次担当（新郎側/新婦側の分担入力。判定不能なら両方編集可）
  let mySeatingSide: "groom" | "bride" | null = null;
  if (s.role === "couple" && isBridal(c.caseType)) {
    const [meUser, myMember] = await Promise.all([
      prisma.user.findUnique({ where: { id: s.userId }, select: { name: true, profileJson: true } }),
      prisma.caseMember.findFirst({ where: { caseId: c.id, userId: s.userId }, select: { roleInCase: true } }),
    ]);
    if (meUser) mySeatingSide = resolveCoupleSide(meUser, c, myMember?.roleInCase);
  }

  // 商談ステップナビ＋顧客攻略パネル（コックピット両翼・スタッフのみ）
  let strategy: StrategyData | null = null;
  if (c.hearingJson) {
    try { strategy = (JSON.parse(c.hearingJson).results as StrategyData) ?? null; } catch { /* ignore */ }
  }
  const salesSteps = isStaff
    ? computeSalesSteps({
        caseType: c.caseType, status: c.status,
        hearingDone: !!c.hearingJson,
        surveyAnswered: customerSurveys.length > 0,
        meetingsCount: c.meetings.length,
        quotesCount: c.quotes.length,
        quoteApproved: c.quotes.some((q) => q.status === "approved"),
        progressPercent: progress.percent,
        daysUntil: ddays,
        invoicePaid: invoices.some((i) => i.status === "paid"),
        followUpsCount,
      })
    : null;

  return (
    <>
      <div className="section-h" style={{ marginBottom: 4 }}>
        <Link href="/cases" className="btn sm">← 一覧</Link>
      </div>
      <div className="section-h" style={{ flexWrap: "wrap", marginTop: 2 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.01em" }}>
          {c.brideName === "―" ? c.groomName : `${c.groomName} & ${c.brideName}`}
        </h1>
        {c.caseType !== "wedding" && <span className="pill blue">{meta.emoji} {meta.label}</span>}
        {c.status === "tentative" && <span className="pill violet">仮予約</span>}
        <span className={`dday ${dd.cls}`}>{dd.text}</span>
        <span className="pill gray">{c.guestCount}名</span>
        {isStaff && can(s.role, "cases", "edit") && (
          <span style={{ marginLeft: "auto" }}>
            <LostCaseButton caseId={c.id} isLost={c.status === "lost"} lostReason={c.lostReason} />
          </span>
        )}
      </div>

      {/* 案件コックピット：左=商談ステップナビ／中央=作業エリア／右=顧客攻略パネル（スタッフのみ3ペイン） */}
      <div className={isStaff ? "cockpit" : ""}>
      {isStaff && salesSteps && (
        <div className="cockpit-left">
          <SalesStepNav steps={salesSteps.steps} currentKey={salesSteps.currentKey} />
        </div>
      )}
      <div className={isStaff ? "cockpit-main" : ""}>

      {/* タブバー（1タブ=1業務。お客様のスマホは下部ナビがあるためPCのみ表示） */}
      <div className={s.role === "couple" ? "tabs pc-only" : "tabs"}>
        {tabDefs.map((t2) => (
          <Link key={t2.key} href={`/cases/${c.id}?tab=${t2.key}`} className={tab === t2.key ? "active" : ""}>{t2.label}</Link>
        ))}
      </div>

      {/* ヒーロー：カウントダウン・進捗・クイック操作 */}
      <div className="card" style={{ padding: "18px 22px", marginBottom: 16, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div className={`dday-big ${dd.cls}`}>
          {ddays > 0 ? <><small>{meta.day}まで</small>あと{ddays}日</> : ddays === 0 ? <>本日<small>{meta.day}当日</small></> : <>終了<small>実施済み</small></>}
        </div>
        <div style={{ flex: 1, minWidth: 230 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {d(c.weddingDate)} {timeRange}
            {c.caseType === "wedding" && c.chapelVenue ? `${c.chapelVenue.name} → ${venueName}` : venueName}
          </div>
          {ddays >= 0 && (
            <div className="cc-progress" style={{ maxWidth: 380 }}>
              <div className="progress"><span style={{ width: `${progress.percent}%` }} /></div>
              <span className="cc-pct">{progress.percent}%</span>
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>
            {nextMeeting
              ? <>次回打ち合わせ：{nextMeeting.toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</>
              : ddays >= 0 ? "次回打ち合わせ：未設定" : `実施日：${d(c.weddingDate)}`}
          </div>
        </div>
        {isStaff && (
          <div className="quick-actions">
            <Link className="btn" href={`/cases/${c.id}?tab=chat`}>💬 チャット</Link>
            <Link className="btn" href={`/cases/${c.id}?tab=meetings`}>📝 打ち合わせ</Link>
            <Link className="btn" href={`/cases/${c.id}?tab=rundown`}>📋 進行表</Link>
            {ddays >= 0 && ddays <= 1 && <a className="btn primary" href={`/live/${c.id}`}>▶ 当日運営</a>}
            <a className="btn" href={`/print/${c.id}/quote`} target="_blank">🖨 見積書</a>
          </div>
        )}
      </div>

      {/* 🔮 AIヒヤリング（診断型）ステータス */}
      {isStaff && (
        <div className="card" id="hearing" style={{ padding: "14px 18px", marginBottom: 16, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 13.5 }}>🔮 AIヒヤリング</b>
          {strategy ? (
            <>
              <span className="pill green">実施済み</span>
              <span style={{ fontSize: 12.5, color: "var(--text2)", flex: 1, minWidth: 200 }}>
                {strategy.typeCard?.title ?? ""} — 診断結果は右の顧客攻略パネルに表示中
              </span>
              <a className="btn sm" href={`/api/v1/cases/${c.id}/hearing/md`}>📄 AI生成依頼MD</a>
              <Link className="btn sm" href={`/cases/${c.id}/hearing`}>再ヒヤリング</Link>
            </>
          ) : (
            <>
              <span className="pill amber">未実施</span>
              <span style={{ fontSize: 12.5, color: "var(--text2)", flex: 1, minWidth: 200 }}>
                診断型ヒヤリングを実施すると、顧客攻略・テンプレ生成・アップセル提案が使えます
              </span>
              <Link className="btn primary sm" href={`/cases/${c.id}/hearing`}>ヒヤリングを開始 →</Link>
            </>
          )}
        </div>
      )}

      {/* ===== 📝 打ち合わせタブ ===== */}
      {isStaff && tab === "meetings" && (<>
      <div className="section-h"><h2>📝 打ち合わせ記録</h2>
        <span className="pill gray">{c.meetings.length}回実施{nextMeeting ? ` ・ 次回 ${d(nextMeeting)}` : ""}</span>
      </div>
        <div className="grid" style={{ gap: 14 }}>
          {can(s.role, "meetings", "edit") && (
            <div style={{ display: "flex" }}><MeetingForm caseId={c.id} /></div>
          )}
          {c.meetings.length === 0 && <div className="card"><div className="empty">打ち合わせ記録はまだありません</div></div>}
          {c.meetings.map((m, i) => (
            <div className="card" key={m.id}>
              <div className="card-h">
                <span className="pill blue">第{c.meetings.length - i}回</span>
                {d(m.heldAt)} ｜ 担当：{m.staff?.name ?? "—"}
              </div>
              <div className="card-b" style={{ fontSize: 13 }}>
                {m.minutes && <div className="field"><label>議事録</label><div className="val">{m.minutes}</div></div>}
                {m.decisions && <div className="field"><label>決定事項</label><div className="val">{m.decisions}</div></div>}
                {m.homework && <div className="field"><label>宿題</label><div className="val">{m.homework}</div></div>}
                {isStaff && m.internalNote && (
                  <div className="field">
                    <label>🔒 プランナー専用メモ</label>
                    <div className="val" style={{ background: "var(--surface2)", borderRadius: 8, padding: "8px 10px" }}>{m.internalNote}</div>
                  </div>
                )}
                <div className="field"><label>添付</label>
                  <AttachmentsPanel caseId={c.id} parentType="meeting" parentId={m.id} canEdit={isStaff}
                    attachments={meetingAtts.filter((a) => a.parentId === m.id).map((a) => ({ id: a.id, fileName: a.fileName, mime: a.mime }))} />
                </div>
                {m.nextAt && <span className="pill blue">次回：{d(m.nextAt)}</span>}
              </div>
            </div>
          ))}
        </div>
      </>)}

      {/* ===== 📌 案件タブ（基本情報・ToDo・アンケート・リソース） ===== */}
      {isStaff && tab === "info" && (<>
      <div className="grid cols-2">
      <CaseInfoCard
        caseId={c.id}
        canEdit={isStaff && can(s.role, "cases", "edit")}
        groomName={c.groomName} brideName={c.brideName} caseType={c.caseType}
        weddingDateISO={c.weddingDate.toISOString()}
        startTime={hm(c.weddingDate)}
        endTime={c.endTime ? hm(c.endTime) : ""}
        status={c.status}
        chapelVenueId={c.chapelVenueId} banquetVenueId={c.banquetVenueId} venueFree={c.venueFree}
        plannerId={c.plannerId} plannerName={c.planner?.name ?? null}
        guestCount={c.guestCount} email={c.email} phone={c.phone} address={c.address}
        venueDisplay={venueName}
        chapelDisplay={c.caseType === "wedding" ? c.chapelVenue?.name ?? null : null}
        venues={infoVenues}
        planners={infoPlanners}
        caseTypeOptions={infoCaseTypes}
        attachmentsSlot={
          <AttachmentsPanel caseId={c.id} parentType="case" canEdit={isStaff}
            attachments={caseAtts.map((a) => ({ id: a.id, fileName: a.fileName, mime: a.mime }))} />
        }
      />
      {/* 準備チェックリスト＋タスク・宿題を1枚に統合 */}
      <div className="card"><div className="card-h">✅ 準備チェックリスト・タスク<span className={`pill ${progress.percent === 100 ? "green" : "accent"}`}>{progress.percent}%</span></div><div className="card-b">
        <Link href={`/cases/${c.id}?tab=meetings`} className="list-row" style={{ cursor: "pointer" }}>
          <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{c.meetings.length > 0 ? "✅" : "⬜"}</span>
          <div className="t">
            <b style={c.meetings.length > 0 ? { color: "var(--text3)" } : {}}>打ち合わせ開始</b>
            <span>{c.meetings.length}回実施</span>
          </div>
          <span style={{ color: "var(--text3)", fontSize: 12 }}>→</span>
        </Link>
        {progress.milestones.filter((m) => m.label !== "打ち合わせ開始").map((m) => (
          <Link key={m.label} href={`/cases/${c.id}?tab=${jump[m.label] ?? "quotes"}`} className="list-row" style={{ cursor: "pointer" }}>
            <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{m.done ? "✅" : "⬜"}</span>
            <div className="t">
              <b style={m.done ? { color: "var(--text3)" } : {}}>{m.label}</b>
              <span>{m.hint}</span>
            </div>
            <span style={{ color: "var(--text3)", fontSize: 12 }}>→</span>
          </Link>
        ))}
        <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
        <TaskList
          caseId={c.id}
          tasks={c.tasks.map((t) => ({
            id: t.id, title: t.title, status: t.status,
            dueAt: t.dueAt ? t.dueAt.toISOString() : null,
          }))}
        />
      </div></div>
      {/* お客様アカウント（連絡先・パスワードの変更） */}
      {["admin", "manager", "planner"].includes(s.role) && (
        <CustomerAccountPanel
          accounts={customerMembers.map((m) => ({
            id: m.user.id, name: m.user.name, email: m.user.email,
            phone: m.user.phone, address: m.user.address,
          }))}
        />
      )}
      {/* お客様の事前アンケート（回答があるときのみ・スタッフ共有用） */}
      {isStaff && customerSurveys.length > 0 && (
        <div className="card"><div className="card-h">📝 お客様アンケート<span className="pill blue">{customerSurveys.length}名分</span></div><div className="card-b">
          {customerSurveys.map((cs, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 12.5 }}>{cs.name} 様{cs.furigana ? <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)" }}>（{cs.furigana}）</span> : null}</b>
              {(cs.basics.birthDate || cs.basics.gender || cs.basics.hasChildren) && (
                <div style={{ fontSize: 11.5, color: "var(--text3)" }}>
                  {cs.basics.birthDate ? `${cs.basics.birthDate}生` : ""}{cs.basics.gender ? `・${cs.basics.gender}` : ""}{cs.basics.hasChildren ? `・お子様${cs.basics.hasChildren}` : ""}
                </div>
              )}
              <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.9 }}>
                {cs.answers.map(([k, v]) => (
                  <div key={k}>
                    <span style={{ color: "var(--text3)" }}>{SURVEY_LABEL[k] ?? k}：</span>{v}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "var(--text3)", margin: 0 }}>
            ※ お客様がログイン後に「📝 事前アンケート」から回答・更新した内容が反映されます。
          </p>
        </div></div>
      )}
      </div>
      {(() => {
        // 🏛 リソース確認（案件タブ内）：施設・設備・スタッフ・お客様の進行を1日バーチャートで
        const iso = `${c.weddingDate.getFullYear()}-${String(c.weddingDate.getMonth() + 1).padStart(2, "0")}-${String(c.weddingDate.getDate()).padStart(2, "0")}`;
        return (
          <>
            <div className="section-h" id="resources" style={{ marginTop: 24, marginBottom: 8 }}>
              <h2>🏛 リソース確認</h2>
              <span style={{ fontSize: 11.5, color: "var(--text3)" }}>施設・設備・スタッフ・お客様の進行を1本の時間軸で確認</span>
            </div>
            <DayVenueChart dateISO={iso} />
            <div style={{ height: 14 }} />
            <AssignmentsPanel
              caseId={c.id}
              caseType={c.caseType}
              canEdit={can(s.role, "cases", "edit")}
              weddingDate={c.weddingDate.toISOString()}
              waitingVenues={resourceVenues.filter((v) => v.type === "waiting").map((v) => ({ id: v.id, name: v.name }))}
              kitchenVenues={resourceVenues.filter((v) => v.type === "kitchen").map((v) => ({ id: v.id, name: v.name }))}
              staffUsers={staffUsers}
              assignments={assignments.map((a) => ({
                id: a.id, kind: a.kind, label: a.label,
                venueName: a.venue?.name ?? null, userName: a.user?.name ?? null,
                startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(),
              }))}
            />
          </>
        );
      })()}
      </>)}

      {/* ===== 💰 みつもりタブ（見積・カタログ・発注・料理・請求） ===== */}
      {tab === "quotes" && (<>
      <div className="section-h" id="quotes"><h2>💰 見積</h2></div>
      {/* お客様向け：支払いスケジュールと入金状況（閲覧専用） */}
      {s.role === "couple" && (paymentPlans.length > 0 || invoices.length > 0) && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h">💴 お支払いスケジュール</div>
          <div className="card-b">
            {paymentPlans.map((p) => (
              <div className="list-row" key={p.id}>
                <div className="t">
                  <b>{p.label}</b>
                  <span>{p.dueAt ? `お支払期日：${d(p.dueAt)}` : "期日未定"}</span>
                </div>
                <b>{yen(p.amount)}</b>
              </div>
            ))}
            {invoices.map((i) => (
              <div className="list-row" key={i.id}>
                <div className="t">
                  <b>ご請求 {i.number}</b>
                  <span>{i.dueAt ? `お支払期日：${d(i.dueAt)}` : ""}</span>
                </div>
                <span className={`pill ${i.status === "paid" ? "green" : "amber"}`}>{i.status === "paid" ? "✅ お支払い済み" : "お支払い待ち"}</span>
                <b style={{ marginLeft: 8 }}>{yen(i.amount)}</b>
              </div>
            ))}
            <p style={{ fontSize: 11, color: "var(--text3)", margin: "8px 0 0" }}>
              ご不明な点は右下の💬チャットからお気軽にご相談ください。
            </p>
          </div>
        </div>
      )}
      <QuotesPanel
        caseId={c.id}
        caseType={c.caseType}
        guestCount={c.guestCount}
        canEdit={can(s.role, "quotes", "edit")}
        canApprove={["admin", "manager"].includes(s.role)}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        categories={quoteCategories}
        quotes={c.quotes.map((q) => ({
          id: q.id, version: q.version, status: q.status, total: q.total,
          note: q.note, createdAt: q.createdAt.toISOString(),
          items: q.items.map((i) => ({ id: i.id, name: i.name, category: i.category, qty: i.qty, unitPrice: i.unitPrice, vendorId: i.vendorId })),
        }))}
      />

      {/* 🛍 カタログ（スタッフ=みつもりタブ内）：カタログから選んで見積へ */}
      {isStaff && (
        <>
          <div className="section-h" id="catalog" style={{ marginTop: 24 }}><h2>🛍 カタログ</h2></div>
          <CatalogPanel caseId={c.id} isCouple={false} categories={quoteCategories} caseType={c.caseType}
            canAdd={can(s.role, "quotes", "edit")} />

          <div className="section-h" id="orders" style={{ marginTop: 24 }}><h2>📦 発注</h2></div>
          <OrdersPanel
            caseId={c.id}
            canEdit={can(s.role, "orders", "edit")}
            isVendor={!!s.vendorId}
            vendors={vendors.map((v) => ({ id: v.id, name: v.name, category: v.category }))}
            orders={orders.map((o) => ({
              id: o.id, category: o.category, amount: o.amount, status: o.status,
              note: o.note, dueAt: o.dueAt ? o.dueAt.toISOString() : null,
              vendorName: o.vendor?.name ?? null,
            }))}
          />

          <div className="section-h" id="meals" style={{ marginTop: 24 }}><h2>🍽 料理</h2></div>
          <MealsPanel
            caseId={c.id}
            caseType={c.caseType}
            canEdit={can(s.role, "meals", "edit") || can(s.role, "cases", "edit")}
            reqs={c.mealReqs.map((m) => ({ id: m.id, guestLabel: m.guestLabel, type: m.type, detail: m.detail }))}
            menuItems={menuItems}
          />

          <div className="section-h" id="billing" style={{ marginTop: 24 }}><h2>💴 請求・入金</h2></div>
          <BillingPanel
            caseId={c.id}
            canEdit={can(s.role, "quotes", "edit")}
            approvedTotal={c.quotes.find((q) => q.status === "approved")?.total ?? null}
            plans={paymentPlans.map((p) => ({ id: p.id, label: p.label, amount: p.amount, dueAt: p.dueAt ? p.dueAt.toISOString() : null }))}
            invoices={invoices.map((i) => ({
              id: i.id, number: i.number, issuedAt: i.issuedAt.toISOString(),
              dueAt: i.dueAt ? i.dueAt.toISOString() : null, amount: i.amount,
              status: i.status, paidAt: i.paidAt ? i.paidAt.toISOString() : null, note: i.note,
            }))}
            customerName={c.brideName !== "―" ? `${c.groomName}・${c.brideName} 様` : `${c.groomName} 様`}
          />
        </>
      )}
      </>)}

      {/* ===== 👗 えらぶタブ（お客様のみ・カタログ） ===== */}
      {!isStaff && tab === "catalog" && (<>
        <div className="section-h" id="catalog"><h2>👗 えらぶ（カタログ）</h2></div>
        <CatalogPanel caseId={c.id} isCouple categories={quoteCategories} caseType={c.caseType} canAdd />
      </>)}

      {/* ===== 🪑 席次タブ ===== */}
      {tab === "seating" && (<>
      <div className="section-h" id="seating"><h2>🪑 席次表</h2></div>
      <SeatingPanel caseId={c.id} canEdit={can(s.role, "seating", "edit")} canHall={can(s.role, "cases", "edit")} guestCount={c.guestCount} relations={relationOptions}
        lockSide={mySeatingSide} caseType={c.caseType} />
      </>)}

      {/* ===== 📋 進行タブ（進行表・楽曲） ===== */}
      {tab === "rundown" && (<>
      <div className="section-h" id="rundown"><h2>📋 進行表</h2></div>
      <RundownEditor
        caseId={c.id}
        caseType={c.caseType}
        canEdit={can(s.role, "rundown", "edit")}
        groomName={c.groomName}
        brideName={c.brideName}
        songs={c.songs.map((sg) => ({ scene: sg.scene, title: sg.title, artist: sg.artist }))}
        items={c.rundownItems.map((r) => ({
          id: r.id, time: r.time, title: r.title, note: r.note,
          mcScript: r.mcScript, durationMin: r.durationMin,
          roles: r.roles, status: r.status,
          songId: r.songId,
          song: r.song ? {
            title: r.song.title, artist: r.song.artist, durationSec: r.song.durationSec,
            memo: r.song.memo, url: r.song.url, cueTiming: r.song.cueTiming,
            videoOn: r.song.videoOn,
            mediaMime: songAtts.find((a) => a.parentId === r.songId)?.mime ?? null,
          } : null,
        }))}
      />

      <div className="section-h" id="songs" style={{ marginTop: 24 }}><h2>🎵 楽曲</h2></div>
      <SongsPanel
        caseId={c.id}
        caseType={c.caseType}
        canEdit={can(s.role, "songs", "edit")}
        isStaff={s.role !== "couple"}
        initial={c.rundownItems.map((r) => {
          // 進行表と同じ行データ（曲枠がまだ無い行も表示して、その場で作れる）
          const sg = r.song;
          const att = sg ? songAtts.find((a) => a.parentId === sg.id) : undefined;
          return {
            itemId: r.id, time: r.time, itemTitle: r.title, note: r.note,
            songId: sg?.id ?? null, scene: sg?.scene ?? "", title: sg?.title ?? "",
            artist: sg?.artist ?? null,
            durationSec: sg?.durationSec ?? null, startSec: sg?.startSec ?? null,
            volume: sg?.volume ?? 70, fadeInSec: sg?.fadeInSec ?? 0,
            fadeOutSec: sg?.fadeOutSec ?? 2, videoOn: sg?.videoOn ?? false,
            cueTiming: sg?.cueTiming ?? null,
            memo: sg?.memo ?? null, url: sg?.url ?? null,
            media: att ? { id: att.id, fileName: att.fileName, mime: att.mime } : null,
          };
        })}
      />

      </>)}

      </div>{/* /cockpit-main */}
      {isStaff && (
        <div className="cockpit-right">
          <StrategyPanel caseId={c.id} isBridalCase={isBridal(c.caseType)} strategy={strategy} />
        </div>
      )}
      </div>{/* /cockpit */}

      {/* チャットドック：右下に常設 */}
      <ChatDock caseId={c.id} meId={s.userId} initialOpen={chatOpen} />
    </>
  );
}
