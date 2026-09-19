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
import { isBridal } from "@/lib/terms";
import { resolveCoupleSide } from "@/lib/couple-side";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// タブ構成（1タブ=1業務。縦に全部並べるLP型は廃止・?tab= で切替）
// スタッフ: 案件（情報・ToDo・ヒヤリング・失注）／打ち合わせ／見積／席次／進行／選曲／リソース／チャット
const STAFF_TABS = [
  { key: "info", label: "📌 案件" },
  { key: "meetings", label: "📝 打ち合わせ" },
  { key: "quotes", label: "💰 見積" },
  { key: "seating", label: "🪑 席次" },
  { key: "rundown", label: "📋 進行" },
  { key: "songs", label: "🎵 選曲" },
  { key: "resources", label: "🏛 リソース" },
  { key: "chat", label: "💬 チャット" },
];
const COUPLE_TABS = [
  { key: "quotes", label: "💰 お見積り" },
  { key: "catalog", label: "👗 えらぶ" },
  { key: "seating", label: "🪑 席次" },
  { key: "rundown", label: "📋 当日の流れ" },
  { key: "songs", label: "🎵 選曲" },
  { key: "chat", label: "💬 チャット" },
];
// 旧アンカー・旧タブ名との互換（スマホ下部ナビ・過去リンクを壊さない）
// after（アフター記録）は 📌案件タブ末尾の #after セクション
const TAB_ALIAS: Record<string, string> = {
  catalog: "quotes", orders: "quotes", meals: "quotes", billing: "quotes",
  steps: "info", after: "info",
};

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "未確定", cls: "red" },
  confirmed: { label: "確定", cls: "green" },
  delivered: { label: "納品済", cls: "green" },
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
  const isStaff = s.role !== "couple";
  // 表示タブの解決（couple はカタログを独立タブに・スタッフはみつもりへ集約）
  const tabDefs = isStaff ? STAFF_TABS : COUPLE_TABS;
  const rawTab = searchParams.tab ?? "";
  const aliased = !isStaff && rawTab === "catalog" ? "catalog" : (TAB_ALIAS[rawTab] ?? rawTab);
  const tab = tabDefs.some((t) => t.key === aliased) ? aliased : (isStaff ? "info" : "quotes");

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
  // チャットタブの未読バッジ（新着があれば動きで気づけるように）
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
  const [assignments, resourceVenues, staffUsers, followups] = isStaff
    ? await Promise.all([
        prisma.assignment.findMany({
          where: { caseId: c.id },
          include: { venue: true, user: { select: { name: true } } },
          orderBy: { startsAt: "asc" },
        }),
        prisma.venue.findMany({ where: { type: { in: ["waiting", "kitchen"] } } }),
        prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, isActive: true }, select: { id: true, name: true } }),
        prisma.followUp.findMany({
          where: { caseId: c.id },
          include: { staff: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], [], [], []];

  const jump: Record<string, string> = {
    "見積確定": "quotes", "発注確定": "quotes",
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


  return (
    <>
      <div className="section-h" style={{ marginBottom: 4 }}>
        <Link href="/cases" className="btn sm">← 一覧</Link>
      </div>

      {/* タブバー：新郎新婦名・日取・進捗はここに集約（お客様のスマホはタブ部分のみ下部ナビと重複するため非表示） */}
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
          <b className="tabs-meta-name">{c.brideName === "―" ? c.groomName : `${c.groomName} & ${c.brideName}`}</b>
          {c.caseType !== "wedding" && <span className="pill blue">{meta.emoji} {meta.label}</span>}
          {c.status === "tentative" && <span className="pill violet">仮予約</span>}
          <span className={`dday ${dd.cls}`}>{dd.text}</span>
          <span className="pill gray">{c.guestCount}名</span>
          <span className="tabs-meta-date">{d(c.weddingDate)}</span>
          {ddays >= 0 && (
            <span className="cc-progress tabs-meta-progress">
              <span className="progress"><span style={{ width: `${progress.percent}%` }} /></span>
              <span className="cc-pct">{progress.percent}%</span>
            </span>
          )}
          {isStaff && ddays >= 0 && ddays <= 1 && <a className="btn sm primary" href={`/live/${c.id}`}>▶ 当日運営</a>}
        </div>
      </div>

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

      {/* ===== 📌 案件タブ（基本情報・ToDo・失注・ヒヤリング・アフター） ===== */}
      {isStaff && tab === "info" && (<>
      {can(s.role, "cases", "edit") && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <LostCaseButton caseId={c.id} isLost={c.status === "lost"} lostReason={c.lostReason} />
        </div>
      )}

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
      {/* お客様アカウント（発行・連絡先・パスワードの変更） */}
      {["admin", "manager", "planner"].includes(s.role) && (
        <CustomerAccountPanel
          caseId={c.id}
          bridal={isBridal(c.caseType)}
          accounts={customerMembers.map((m) => ({
            id: m.user.id, name: m.user.name, email: m.user.email,
            phone: m.user.phone, address: m.user.address,
          }))}
        />
      )}
      {/* お客様のヒヤリング回答（回答があるときのみ・スタッフ共有用） */}
      {isStaff && customerSurveys.length > 0 && (
        <div className="card"><div className="card-h">📝 お客様ヒヤリング<span className="pill blue">{customerSurveys.length}名分</span></div><div className="card-b">
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
            ※ お客様がログイン後に「📝 ヒヤリング」から回答・更新した内容が反映されます。
          </p>
        </div></div>
      )}
      </div>

      {/* 📮 アフター（社内向け：アフター連絡・引き継ぎ・クレーム記録。ダッシュボードの未対応クレームはここへ） */}
      <div className="section-h" id="after" style={{ marginTop: 24 }}><h2>📮 アフター</h2>
        <span style={{ fontSize: 11.5, color: "var(--text3)" }}>アフター連絡・引き継ぎ・クレームの記録（お客様には表示されません）</span>
      </div>
      <AfterPanel
        caseId={c.id}
        canEdit={can(s.role, "meetings", "edit") || can(s.role, "cases", "edit")}
        followups={followups.map((f) => ({
          id: f.id, type: f.type, body: f.body, status: f.status,
          staffName: f.staff?.name ?? null, createdAt: f.createdAt.toISOString(),
        }))}
      />
      </>)}

      {/* ===== 🏛 リソースタブ（施設・設備・スタッフの1日タイムライン） ===== */}
      {isStaff && tab === "resources" && (() => {
        const iso = `${c.weddingDate.getFullYear()}-${String(c.weddingDate.getMonth() + 1).padStart(2, "0")}-${String(c.weddingDate.getDate()).padStart(2, "0")}`;
        return (
          <>
            <div className="section-h" style={{ marginBottom: 8 }}>
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

      {/* ===== 💬 チャットタブ ===== */}
      {tab === "chat" && (
        <>
          <div className="section-h"><h2>💬 案件チャット</h2>
            <span style={{ fontSize: 11.5, color: "var(--text3)" }}>お客様・業者・スタッフ共通</span>
          </div>
          <ChatPanel caseId={c.id} meId={s.userId} height="min(70vh, 640px)" />
        </>
      )}

      {/* ===== 💰 見積タブ（見積・カタログ・発注・料理・請求） ===== */}
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
              ご不明な点は💬チャットタブからお気軽にご相談ください。
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
            vendors={vendors.map((v) => ({ id: v.id, name: v.name, category: v.category }))}
            orders={c.orders.map((o) => ({
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
            approvedTotal={c.quotes.find((q) => isQuoteConfirmed(q.status))?.total ?? null}
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

      {/* ===== 🪑 席次タブ（プレビューのみ。編集は専用ページ /cases/[id]/seating で行う） ===== */}
      {tab === "seating" && (<>
      <div className="section-h" id="seating"><h2>🪑 席次表</h2></div>
      <SeatingPanel caseId={c.id} canEdit={can(s.role, "seating", "edit")} canHall={can(s.role, "cases", "edit")} guestCount={c.guestCount} relations={relationOptions}
        lockSide={mySeatingSide} caseType={c.caseType} previewOnly editHref={`/cases/${c.id}/seating`} />
      </>)}

      {/* ===== 📋 進行タブ ===== */}
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
      </>)}

      {/* ===== 🎵 選曲タブ ===== */}
      {tab === "songs" && (<>
      <div className="section-h" id="songs"><h2>🎵 選曲</h2></div>
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
    </>
  );
}
