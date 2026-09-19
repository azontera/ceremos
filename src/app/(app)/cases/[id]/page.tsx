import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can, canAccessCase } from "@/lib/rbac";
import { getCaseDetail } from "@/lib/queries";
import { computeProgress, daysUntil, ddayLabel } from "@/lib/progress";
import { typeMeta } from "@/lib/case-types";
import { getMasterOptions } from "@/lib/masters";
import { SURVEY_ALL } from "@/lib/survey";
import { isQuoteConfirmed } from "@/lib/quote-status";

const SURVEY_LABEL: Record<string, string> = Object.fromEntries(
  SURVEY_ALL.map((sv) => [sv.key, sv.q.replace(/^\d+\.\s*/, "")]),
);
import { ChatPanel } from "@/components/chat-panel";
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
import { AfterPanel } from "@/components/after-panel";
import { DayVenueChart } from "@/components/day-venue-chart";
import { LostCaseButton } from "@/components/lost-case-button";
import { isBridal, t as term } from "@/lib/terms";
import { resolveCoupleSide } from "@/lib/couple-side";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// ============================================================================
// 案件画面のタブ構成は【固定】（2026-09-19 確定）。変更する場合はユーザーの明示承認が必要。
//   スタッフ 5タブ: 📌案件 ／ 💰お金 ／ 🪑席次 ／ 📋進行 ／ 💬連絡
//   お客様   4タブ: 💰お見積り ／ 🪑席次 ／ 📋当日の流れ ／ 💬連絡
// 各タブ内のセクションには id（アンカー）があり、?tab=xxx#anchor で直接ジャンプできる。
// ============================================================================
const STAFF_TABS = [
  { key: "info", label: "📌 案件" },
  { key: "money", label: "💰 お金" },
  { key: "seating", label: "🪑 席次" },
  { key: "rundown", label: "📋 進行" },
  { key: "chat", label: "💬 連絡" },
];
const COUPLE_TABS = [
  { key: "money", label: "💰 お見積り" },
  { key: "seating", label: "🪑 席次" },
  { key: "rundown", label: "📋 当日の流れ" },
  { key: "chat", label: "💬 連絡" },
];
// 旧タブ名との互換（過去リンク・通知・ブックマークを壊さない）。
// 旧タブ名 → 新タブ ＋ アンカー。旧名で来たら新URLへリダイレクトして該当セクションへスクロールする。
const TAB_ALIAS: Record<string, { tab: string; anchor?: string }> = {
  quotes: { tab: "money", anchor: "quotes" },
  catalog: { tab: "money", anchor: "catalog" },
  orders: { tab: "money", anchor: "orders" },
  meals: { tab: "money", anchor: "meals" },
  billing: { tab: "money", anchor: "billing" },
  songs: { tab: "rundown", anchor: "songs" },
  resources: { tab: "rundown", anchor: "resources" },
  meetings: { tab: "info", anchor: "meetings" },
  tasks: { tab: "info", anchor: "tasks" },
  hearing: { tab: "info", anchor: "survey" },
  survey: { tab: "info", anchor: "survey" },
  after: { tab: "info", anchor: "after" },
  steps: { tab: "info" },
  attachments: { tab: "chat", anchor: "attachments" },
};

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const d = (x: Date | string) =>
  new Date(x).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
const hm = (x: Date | string) => {
  const dt = new Date(x);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
};

// タブ内セクション見出し（統一スタイル：.section-h を再利用。id はアンカー）
function SectionHead({ id, title, sub, right, top }: { id: string; title: string; sub?: string; right?: React.ReactNode; top?: boolean }) {
  return (
    <div className="section-h" id={id} style={{ marginTop: top ? 0 : 28 }}>
      <h2>{title}</h2>
      {sub && <span style={{ fontSize: 11.5, color: "var(--text3)" }}>{sub}</span>}
      {right}
    </div>
  );
}

export default async function CaseDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { tab?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canAccessCase(s, params.id))) redirect("/cases");

  const isStaff = s.role !== "couple";
  const tabDefs = isStaff ? STAFF_TABS : COUPLE_TABS;
  const rawTab = searchParams.tab ?? "";
  // 旧タブ名は新タブ＋アンカーへリダイレクト（お客様の info はホーム＝お見積りへ）
  const alias = TAB_ALIAS[rawTab];
  if (alias) {
    const target = tabDefs.some((t2) => t2.key === alias.tab) ? alias.tab : tabDefs[0].key;
    redirect(`/cases/${params.id}?tab=${target}${alias.anchor && target === alias.tab ? `#${alias.anchor}` : ""}`);
  }
  const tab = tabDefs.some((t2) => t2.key === rawTab) ? rawTab : tabDefs[0].key;

  const c = await getCaseDetail(params.id);
  if (!c) notFound();

  const ddays = daysUntil(c.weddingDate);
  const dd = ddayLabel(ddays);
  const meta = typeMeta(c.caseType);
  const venueName = c.banquetVenue?.name ?? c.venueFree ?? "会場未定";
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
  const showLive = isStaff && ddays >= 0 && ddays <= 1;
  const canEditCase = can(s.role, "cases", "edit");

  // タブごとに必要なデータだけ取得する
  const [
    vendors, quoteCategories, relationOptions,
    paymentPlans, invoices, caseAtts,
    infoVenues, infoPlanners, infoCaseTypes,
    customerMembers, meetingAtts, songAtts, menuItems,
  ] = await Promise.all([
    isStaff && tab === "money" ? prisma.vendor.findMany() : Promise.resolve([]),
    getMasterOptions("quote_category"),
    getMasterOptions("relation").then((rows) => rows.map(([, l]) => l)),
    tab === "money" ? prisma.paymentPlan.findMany({ where: { caseId: c.id }, orderBy: { sortOrder: "asc" } }) : Promise.resolve([]),
    tab === "money" ? prisma.invoice.findMany({ where: { caseId: c.id }, orderBy: { issuedAt: "desc" } }) : Promise.resolve([]),
    tab === "chat" ? prisma.attachment.findMany({ where: { parentType: "case", parentId: c.id } }) : Promise.resolve([]),
    canEditCase && tab === "info" ? prisma.venue.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    canEditCase && tab === "info"
      ? prisma.user.findMany({ where: { role: { in: ["admin", "manager", "planner"] }, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    canEditCase && tab === "info" ? getMasterOptions("case_type") : Promise.resolve([]),
    isStaff && tab === "info" ? prisma.caseMember.findMany({
      where: { caseId: c.id, user: { role: "couple" } },
      include: { user: { select: { id: true, name: true, email: true, phone: true, address: true, profileJson: true } } },
    }) : Promise.resolve([]),
    isStaff && tab === "info" ? prisma.attachment.findMany({ where: { parentType: "meeting", parentId: { in: c.meetings.map((m) => m.id) } } }) : Promise.resolve([]),
    tab === "rundown" ? prisma.attachment.findMany({
      where: { parentType: "song", parentId: { in: c.rundownItems.map((r) => r.songId).filter(Boolean) as string[] } },
    }) : Promise.resolve([]),
    isStaff && tab === "money" ? prisma.menuItem.findMany({ where: { caseId: c.id }, orderBy: { sortOrder: "asc" } }) : Promise.resolve([]),
  ]);
  // 連絡タブの未読バッジ
  const unreadChatCount = await prisma.chatMessage.count({
    where: { caseId: c.id, NOT: { senderId: s.userId }, reads: { none: { userId: s.userId } } },
  });
  const customerSurveys = customerMembers.map((m) => {
    let p: { furigana?: string; survey?: Record<string, string>; birthDate?: string; gender?: string; hasChildren?: string } = {};
    try { p = JSON.parse(m.user.profileJson ?? "{}"); } catch { /* ignore */ }
    const answers = Object.entries(p.survey ?? {}).filter(([, v]) => v?.trim());
    return { name: m.user.name, furigana: p.furigana, answers, basics: p };
  }).filter((x) => x.answers.length > 0 || x.basics.birthDate);

  const STAFF_ROLES = ["admin", "manager", "planner", "chef", "audio", "mc", "service", "dress", "photo"];
  const [assignments, resourceVenues, staffUsers] = isStaff && tab === "rundown"
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
  const followups = isStaff && tab === "info"
    ? await prisma.followUp.findMany({
        where: { caseId: c.id },
        include: { staff: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // チェックリストの各項目から飛ぶ先（タブ＋アンカー）
  const jump: Record<string, string> = {
    "見積確定": "money#quotes", "発注確定": "money#orders",
    "楽曲決定": "rundown#songs", "席次確定": "seating", "進行表作成": "rundown",
  };

  // お客様の席次担当（分担入力。判定不能なら両方編集可）
  let mySeatingSide: "groom" | "bride" | null = null;
  if (s.role === "couple" && isBridal(c.caseType)) {
    const [meUser, myMember] = await Promise.all([
      prisma.user.findUnique({ where: { id: s.userId }, select: { name: true, profileJson: true } }),
      prisma.caseMember.findFirst({ where: { caseId: c.id, userId: s.userId }, select: { roleInCase: true } }),
    ]);
    if (meUser) mySeatingSide = resolveCoupleSide(meUser, c, myMember?.roleInCase);
  }

  const dateISO = `${c.weddingDate.getFullYear()}-${String(c.weddingDate.getMonth() + 1).padStart(2, "0")}-${String(c.weddingDate.getDate()).padStart(2, "0")}`;
  const coupleLabel = c.brideName === "―" ? c.groomName : `${c.groomName} & ${c.brideName}`;

  return (
    <>
      <div className="section-h" style={{ marginBottom: 4 }}>
        <Link href="/cases" className="btn sm">← 一覧</Link>
      </div>

      {/* タブバー：名前・日取・会場・進捗だけ（お客様のスマホはタブ部分が下部ナビと重複するため非表示） */}
      <div className="tabs-bar">
        <div className={s.role === "couple" ? "tabs pc-only" : "tabs"}>
          {tabDefs.map((t2) => (
            <Link key={t2.key} href={`/cases/${c.id}?tab=${t2.key}`} className={tab === t2.key ? "active" : ""}>
              {t2.label}
              {t2.key === "chat" && unreadChatCount > 0 && <span className="tab-badge" />}
            </Link>
          ))}
        </div>
        <div className="tabs-meta">
          <b className="tabs-meta-name">{coupleLabel}</b>
          {c.caseType !== "wedding" && <span className="pill blue">{meta.emoji} {meta.label}</span>}
          {c.status === "tentative" && <span className="pill violet">仮予約</span>}
          {c.status === "lost" && <span className="pill gray">失注</span>}
          <span className={`dday ${dd.cls}`}>{dd.text}</span>
          <span className="tabs-meta-date">{d(c.weddingDate)}　{venueName}</span>
          {ddays >= 0 && (
            <span className="cc-progress tabs-meta-progress">
              <span className="progress"><span style={{ width: `${progress.percent}%` }} /></span>
              <span className="cc-pct">{progress.percent}%</span>
            </span>
          )}
          {showLive && <a className="btn sm primary" href={`/live/${c.id}`}>▶ 当日運営</a>}
        </div>
      </div>

      {/* ===================== 📌 案件（スタッフ） ===================== */}
      {isStaff && tab === "info" && (<>
        {/* 基本情報 ＋ お客様アカウント */}
        <SectionHead id="info" title="📌 基本情報" top />
        <div className="grid cols-2">
          <CaseInfoCard
            caseId={c.id}
            canEdit={canEditCase}
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
          />
          {["admin", "manager", "planner"].includes(s.role) && (
            <div id="account">
              <CustomerAccountPanel
                caseId={c.id}
                bridal={isBridal(c.caseType)}
                accounts={customerMembers.map((m) => ({
                  id: m.user.id, name: m.user.name, email: m.user.email,
                  phone: m.user.phone, address: m.user.address,
                }))}
              />
            </div>
          )}
        </div>

        {/* 打ち合わせ記録 */}
        <SectionHead id="meetings" title="📝 打ち合わせ記録"
          right={<span className="pill gray">{c.meetings.length}回実施{nextMeeting ? ` ・ 次回 ${d(nextMeeting)}` : ""}</span>} />
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
                {m.internalNote && (
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

        {/* タスク・チェックリスト ＋ ヒヤリング回答 */}
        <SectionHead id="tasks" title="✅ タスク・準備チェックリスト" />
        <div className="grid cols-2">
          <div className="card"><div className="card-h">準備チェックリスト<span className={`pill ${progress.percent === 100 ? "green" : "accent"}`}>{progress.percent}%</span></div><div className="card-b">
            <a href="#meetings" className="list-row" style={{ cursor: "pointer" }}>
              <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{c.meetings.length > 0 ? "✅" : "⬜"}</span>
              <div className="t">
                <b style={c.meetings.length > 0 ? { color: "var(--text3)" } : {}}>打ち合わせ開始</b>
                <span>{c.meetings.length}回実施</span>
              </div>
              <span style={{ color: "var(--text3)", fontSize: 12 }}>→</span>
            </a>
            {progress.milestones.filter((m) => m.label !== "打ち合わせ開始").map((m) => (
              <Link key={m.label} href={`/cases/${c.id}?tab=${jump[m.label] ?? "money"}`} className="list-row" style={{ cursor: "pointer" }}>
                <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{m.done ? "✅" : "⬜"}</span>
                <div className="t">
                  <b style={m.done ? { color: "var(--text3)" } : {}}>{m.label}</b>
                  <span>{m.hint}</span>
                </div>
                <span style={{ color: "var(--text3)", fontSize: 12 }}>→</span>
              </Link>
            ))}
          </div></div>
          <div className="card"><div className="card-h">📌 タスク・宿題</div><div className="card-b">
            <TaskList
              caseId={c.id}
              tasks={c.tasks.map((tk) => ({
                id: tk.id, title: tk.title, status: tk.status,
                dueAt: tk.dueAt ? tk.dueAt.toISOString() : null,
              }))}
            />
          </div></div>
        </div>

        {/* ヒヤリング回答（閲覧のみ・長ければ折りたたみ） */}
        <SectionHead id="survey" title="📝 ヒヤリング回答" sub="お客様がログイン後に「ヒヤリング」から回答した内容（閲覧のみ）" />
        <div className="card"><div className="card-b">
          {customerSurveys.length === 0 && <div className="empty">まだ回答がありません（お客様アカウント発行後、お客様が「📝 ヒヤリング」から回答します）</div>}
          {customerSurveys.map((cs, i) => (
            <details key={i} open={cs.answers.length <= 6} style={{ marginBottom: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>
                {cs.name} 様{cs.furigana ? <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)" }}>（{cs.furigana}）</span> : null}
                <span className="pill gray" style={{ marginLeft: 8 }}>{cs.answers.length}項目</span>
              </summary>
              {(cs.basics.birthDate || cs.basics.gender || cs.basics.hasChildren) && (
                <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 4 }}>
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
            </details>
          ))}
        </div></div>

        {/* アフター（社内向け：アフター連絡・引き継ぎ・クレーム記録。ダッシュボードの未対応クレームはここへ） */}
        <SectionHead id="after" title="📮 アフター" sub="アフター連絡・引き継ぎ・クレームの記録（お客様には表示されません）" />
        <AfterPanel
          caseId={c.id}
          canEdit={can(s.role, "meetings", "edit") || canEditCase}
          followups={followups.map((f) => ({
            id: f.id, type: f.type, body: f.body, status: f.status,
            staffName: f.staff?.name ?? null, createdAt: f.createdAt.toISOString(),
          }))}
        />

        {/* 失注（最下部・控えめ） */}
        {canEditCase && (
          <div id="lost" style={{ marginTop: 32, paddingTop: 14, borderTop: "1px dashed var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--text3)" }}>この案件が成約に至らなかった場合：</span>
            <LostCaseButton caseId={c.id} isLost={c.status === "lost"} lostReason={c.lostReason} />
          </div>
        )}
      </>)}

      {/* ===================== 💰 お金（スタッフ）／お見積り（お客様） ===================== */}
      {tab === "money" && (<>
        <SectionHead id="quotes" title={isStaff ? "💰 見積" : "💰 お見積り"} top />
        {/* お客様向け：支払いスケジュールと入金状況（閲覧専用） */}
        {!isStaff && (paymentPlans.length > 0 || invoices.length > 0) && (
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
                ご不明な点は💬連絡タブからお気軽にご相談ください。
              </p>
            </div>
          </div>
        )}
        <QuotesPanel
          caseId={c.id}
          guestCount={c.guestCount}
          canEdit={can(s.role, "quotes", "edit")}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
          categories={quoteCategories}
          quotes={c.quotes.map((q) => ({
            id: q.id, version: q.version, status: q.status, total: q.total,
            note: q.note, createdAt: q.createdAt.toISOString(),
            items: q.items.map((i) => ({ id: i.id, name: i.name, category: i.category, qty: i.qty, unitPrice: i.unitPrice, vendorId: i.vendorId })),
          }))}
        />

        {/* カタログ：スタッフは見積へ追加、お客様は「えらぶ」（希望として見積に反映・確定はプランナー） */}
        <SectionHead id="catalog" title={isStaff ? "🛍 カタログ" : "👗 えらぶ（カタログ）"}
          sub={isStaff ? "カタログから選んで見積に追加" : "気になるものを選ぶとお見積りに反映されます（確定はプランナーが行います）"} />
        <CatalogPanel caseId={c.id} isCouple={!isStaff} categories={quoteCategories} caseType={c.caseType}
          canAdd={isStaff ? can(s.role, "quotes", "edit") : true} />

        {isStaff && (<>
          <SectionHead id="orders" title="📦 発注" />
          <OrdersPanel
            caseId={c.id}
            canEdit={can(s.role, "orders", "edit")}
            vendors={vendors.map((v) => ({ id: v.id, name: v.name, category: v.category }))}
            orders={c.orders.map((o) => ({
              id: o.id, category: o.category, amount: o.amount, status: o.status,
              note: o.note, dueAt: o.dueAt ? o.dueAt.toISOString() : null,
              vendorName: o.vendor?.name ?? null,
            }))}
          />

          <SectionHead id="meals" title="🍽 料理・アレルギー" />
          <MealsPanel
            caseId={c.id}
            caseType={c.caseType}
            canEdit={can(s.role, "meals", "edit") || canEditCase}
            reqs={c.mealReqs.map((m) => ({ id: m.id, guestLabel: m.guestLabel, type: m.type, detail: m.detail }))}
            menuItems={menuItems}
          />

          <SectionHead id="billing" title="💴 請求・入金" />
          <BillingPanel
            caseId={c.id}
            canEdit={can(s.role, "quotes", "edit")}
            approvedTotal={c.quotes.find((q) => isQuoteConfirmed(q.status))?.total ?? null}
            plans={paymentPlans.map((p) => ({ id: p.id, label: p.label, amount: p.amount, dueAt: p.dueAt ? p.dueAt.toISOString() : null }))}
            invoices={invoices.map((i) => ({
              id: i.id, number: i.number, issuedAt: i.issuedAt.toISOString(),
              dueAt: i.dueAt ? i.dueAt.toISOString() : null, amount: i.amount,
              status: i.status, paidAt: i.paidAt ? i.paidAt.toISOString() : null, note: i.note,
            }))}
            customerName={c.brideName !== "―" ? `${c.groomName}・${c.brideName} 様` : `${c.groomName} 様`}
          />
        </>)}
      </>)}

      {/* ===================== 🪑 席次（プレビュー。編集は /cases/[id]/seating） ===================== */}
      {tab === "seating" && (<>
        <SectionHead id="seating" title="🪑 席次表" top />
        <SeatingPanel caseId={c.id} canEdit={can(s.role, "seating", "edit")} canHall={canEditCase} guestCount={c.guestCount} relations={relationOptions}
          lockSide={mySeatingSide} caseType={c.caseType} previewOnly editHref={`/cases/${c.id}/seating`} />
      </>)}

      {/* ===================== 📋 進行（進行表＋MC台本 → 選曲 → 控室・厨房・スタッフ割当） ===================== */}
      {tab === "rundown" && (<>
        <SectionHead id="rundown" title={isStaff ? "📋 進行表・MC台本" : "📋 当日の流れ"} top
          right={<>
            <span style={{ flex: 1 }} />
            <a href="#songs" className="btn sm">🎵 選曲へ</a>
            {isStaff && <a href="#resources" className="btn sm">🏛 控室・スタッフへ</a>}
            {showLive && <a className="btn sm primary" href={`/live/${c.id}`}>▶ 当日運営</a>}
          </>} />
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

        <SectionHead id="songs" title="🎵 選曲" sub="シーンごとの楽曲（進行表の各行と連動）" />
        <SongsPanel
          caseId={c.id}
          caseType={c.caseType}
          canEdit={can(s.role, "songs", "edit")}
          isStaff={isStaff}
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

        {isStaff && (<>
          <SectionHead id="resources" title="🏛 控室・厨房・スタッフ割当" sub="施設・設備・スタッフ・お客様の進行を1本の時間軸で確認" />
          <DayVenueChart dateISO={dateISO} />
          <div style={{ height: 14 }} />
          <AssignmentsPanel
            caseId={c.id}
            caseType={c.caseType}
            canEdit={canEditCase}
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
        </>)}
      </>)}

      {/* ===================== 💬 連絡（チャット＋添付ファイル） ===================== */}
      {tab === "chat" && (<>
        <SectionHead id="chat" title="💬 連絡" sub={isStaff ? `${term("coupleSama", c.caseType)}・スタッフ共通のチャット` : "プランナーへのご相談・ご連絡"} top />
        <ChatPanel caseId={c.id} meId={s.userId} height="min(70vh, 640px)" />
        <SectionHead id="attachments" title="📎 添付ファイル" sub="この案件で共有する書類・画像" />
        <div className="card"><div className="card-b">
          <AttachmentsPanel caseId={c.id} parentType="case" canEdit={isStaff}
            attachments={caseAtts.map((a) => ({ id: a.id, fileName: a.fileName, mime: a.mime }))} />
        </div></div>
      </>)}
    </>
  );
}
