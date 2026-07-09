import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { LogoutButton } from "./logout-button";
import { TopbarTitle } from "./topbar-title";
import { NotificationsBell } from "@/components/notifications-bell";
import { MobileNav } from "@/components/mobile-nav";
import { A2hsBanner } from "@/components/a2hs-banner";
import { getBranding } from "@/lib/settings";
import { APP_VERSION, BUILD_AT } from "@/lib/version";
import { DEMO_MODE, getNow, graceRemainingMs } from "@/lib/clock";
import { DemoBar } from "@/components/demo-bar";

const NAV = [
  { href: "/dashboard", label: "ダッシュボード", icon: "▦" },
  { href: "/cases", label: "案件", icon: "👥" },
  { href: "/calendar", label: "カレンダー", icon: "📅" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  // 承認猶予（10時間）：未承認のセルフ登録（お客様・業者）は登録から10時間まで仮利用できる。
  // 期限が切れたらログイン画面へ（データは消えない。プランナーの承認で再開／否認＝削除）
  const me = await prisma.user.findUnique({
    where: { id: s.userId },
    select: { approved: true, isActive: true, createdAt: true },
  });
  if (!me || !me.isActive) redirect("/login");
  let graceHoursLeft: number | null = null;
  if (!me.approved) {
    const remain = graceRemainingMs(me.createdAt, await getNow());
    if (remain <= 0) redirect("/login?grace=expired");
    graceHoursLeft = Math.max(1, Math.ceil(remain / 3600000));
  }
  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
  // 承認待ち件数（プランナー以上のナビにバッジ表示）
  const pendingCount = ["admin", "manager", "planner"].includes(s.role)
    ? await prisma.user.count({ where: { approved: false, isActive: true } })
    : 0;
  // お客様の下部ナビはアプリ風（自分の案件へ直接ジャンプ）。直近の案件IDを渡す
  const coupleCase = s.role === "couple"
    ? await prisma.caseMember.findFirst({
        where: { userId: s.userId },
        include: { case: { select: { id: true, weddingDate: true } } },
        orderBy: { case: { weddingDate: "asc" } },
      })
    : null;
  const branding = await getBranding(); // 左上ロゴ＝設定マスタの式場ロゴ

  const isCouple = s.role === "couple";

  return (
    // お客様はエレガントテーマ（ログイン画面と同じ世界観）で統一
    <div className={isCouple ? "app couple-app" : "app"}>
      <nav className="sidebar">
        <div className="logo" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name || "式場ロゴ"}
              style={{ maxWidth: 190, maxHeight: 52, objectFit: "contain" }} />
          ) : (
            <div style={{ letterSpacing: ".14em", color: "var(--accent-text)", fontWeight: 700 }}>
              {branding.name || "CEREMOS"}
            </div>
          )}
        </div>
        <div className="navlabel">メイン</div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="nav-item">
            <span aria-hidden>{n.icon}</span>{n.label}
          </Link>
        ))}
        {s.vendorId && (
          <Link href={`/vendors/${s.vendorId}`} className="nav-item">🏪 自社ページ</Link>
        )}
        {["admin", "manager", "planner"].includes(s.role) && (
          <Link href="/approvals" className="nav-item">
            ✅ 承認待ち
            {pendingCount > 0 && (
              <span className="pill amber" style={{ marginLeft: 6 }}>{pendingCount}</span>
            )}
          </Link>
        )}
        {s.role === "couple" && (
          <Link href="/survey" className="nav-item">📝 ヒヤリング</Link>
        )}
        {["admin", "manager", "planner"].includes(s.role) && (
          <>
            <div className="navlabel">マスタ・管理</div>
            <Link href="/customers" className="nav-item">💐 顧客マスタ</Link>
            <Link href="/admin/catalog" className="nav-item">🛍 カタログ管理</Link>
            <Link href="/admin/templates" className="nav-item">📄 テンプレート</Link>
            {s.role === "admin" && (
              <>
                <Link href="/admin/users" className="nav-item">👤 ユーザー・権限</Link>
                <Link href="/admin/masters" className="nav-item">🗂 選択肢マスタ</Link>
                <Link href="/admin/settings" className="nav-item">⚙️ 設定</Link>
                <Link href="/admin/audit" className="nav-item">🕐 操作履歴</Link>
              </>
            )}
          </>
        )}
        <div className="spacer" />
        <span style={{ fontSize: 10, color: "var(--text3)", padding: "2px 14px", letterSpacing: ".06em" }}>
          CEREMOS {APP_VERSION}｜更新 {BUILD_AT}
        </span>
        <Link href="/me/password" className="nav-item" style={{ fontSize: 12 }}>🔑 パスワード変更</Link>
        <div className="userchip">
          <div className="avatar">{s.name.charAt(0)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{s.name}</b>
            <span>{ROLES[s.role] ?? s.role}</span>
          </div>
        </div>
        <LogoutButton />
      </nav>
      <div className="main">
        {/* 🧪 検証モード：時間送り＋ワンクリックアカウント切替（本番=DEMO_MODEなしでは出ない） */}
        {DEMO_MODE && <DemoBar />}
        {/* 承認猶予中の案内（プランナー確認は後でもOK・残り時間を表示） */}
        {graceHoursLeft !== null && (
          <div style={{ background: "#f5efe6", borderBottom: "1px solid #c8a97e", color: "#7a6248", padding: "7px 16px", fontSize: 12.5 }}>
            ⏳ プランナーの確認待ちです。確認が完了するまで、あと約<b>{graceHoursLeft}時間</b>ご利用いただけます（確認後は制限なくご利用いただけます。ご登録の情報は消えません）
          </div>
        )}
        <header className="topbar">
          <div>
            <TopbarTitle couple={isCouple} />
            <div className="date">{today}</div>
          </div>
          <div className="grow" />
          <NotificationsBell />
        </header>
        <div className="content">
          {/* お客様がブラウザで開いているときだけ「アプリとして追加」を案内（追加後はURLバーが消える） */}
          {isCouple && <A2hsBanner />}
          {children}
        </div>
      </div>
      {/* スマホ用の下部ナビ（720px以下で表示）。お客様は自分の案件タブへ直行するアプリ風ナビ */}
      <MobileNav role={s.role} vendorId={s.vendorId ?? null} pendingCount={pendingCount}
        coupleCaseId={coupleCase?.case.id ?? null} />
    </div>
  );
}
