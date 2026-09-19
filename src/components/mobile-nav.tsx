"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type MobileNavProps = { role: string; pendingCount: number; coupleCaseId?: string | null };

// スマホ用の下部ナビゲーション（720px以下で表示）
// サイドバーが隠れるスマホでも、親指だけで主要画面を行き来できるようにする
// お客様（couple）は自分の案件のタブへ直行する「アプリ風」ナビに切り替える
// ※ useSearchParams を使うため Suspense でラップ（ビルド時のプリレンダー要件）
export function MobileNav(props: MobileNavProps) {
  return (
    <Suspense fallback={null}>
      <MobileNavInner {...props} />
    </Suspense>
  );
}

function MobileNavInner({ role, pendingCount, coupleCaseId }: MobileNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const isStaff3 = ["admin", "manager", "planner"].includes(role);

  const item = (href: string, icon: string, label: string, badge?: number, exactTab?: string | null) => {
    // exactTab指定時は「案件ページ＋そのタブ」のときだけアクティブ（お客様ナビ用）
    const curTab = searchParams.get("tab");
    const active = exactTab !== undefined
      ? pathname.startsWith("/cases/") && (exactTab === null ? !curTab : curTab === exactTab)
      : pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
    return (
      <Link key={href} href={href} className={`mnav-item ${active ? "active" : ""}`} onClick={() => setMenuOpen(false)}>
        <span className="mnav-icon">
          {icon}
          {badge ? <span className="mnav-badge">{badge}</span> : null}
        </span>
        {label}
      </Link>
    );
  };

  // メニューシートに出す残りのリンク
  const menuLinks: [string, string][] = [
    ...(role === "couple" && coupleCaseId ? [
      [`/cases/${coupleCaseId}?tab=quotes`, "💰 お見積り・お支払い"],
      [`/cases/${coupleCaseId}?tab=rundown`, "📋 当日の流れ"],
      [`/cases/${coupleCaseId}?tab=songs`, "🎵 楽曲をえらぶ"],
      [`/cases/${coupleCaseId}?tab=chat`, "💬 プランナーに相談"],
    ] as [string, string][] : []),
    ...(isStaff3 ? [
      ["/customers", "💐 顧客マスタ"],
      ["/admin/catalog", "🛍 カタログ管理"],
      ["/admin/templates", "📄 テンプレート"],
    ] as [string, string][] : []),
    ...(role === "admin" ? [
      ["/admin/users", "👤 ユーザー・権限"],
      ["/admin/masters", "🗂 選択肢マスタ"],
      ["/admin/settings", "⚙️ 設定"],
      ["/admin/audit", "🕐 操作履歴"],
    ] as [string, string][] : []),
    ...(role === "couple" && !coupleCaseId ? [["/survey", "📝 ヒヤリング"]] as [string, string][] : []),
    ["/me/password", "🔑 パスワード変更"],
  ];

  return (
    <>
      {/* メニューシート */}
      {menuOpen && (
        <div className="mnav-sheet" onClick={() => setMenuOpen(false)}>
          <div className="mnav-sheet-body" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>メニュー</div>
            {menuLinks.map(([href, label]) => (
              <Link key={href} href={href} className="mnav-sheet-link" onClick={() => setMenuOpen(false)}>
                {label}
              </Link>
            ))}
            <button className="mnav-sheet-link" style={{ color: "var(--red)" }}
              onClick={async () => {
                await fetch("/api/v1/auth/logout", { method: "POST" });
                setMenuOpen(false);
                router.push("/login");
                router.refresh();
              }}>
              ↩ ログアウト
            </button>
            <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
              onClick={() => setMenuOpen(false)}>閉じる</button>
          </div>
        </div>
      )}

      {/* 下部タブバー */}
      <nav className="mobile-nav">
        {role === "couple" && coupleCaseId ? (
          <>
            {/* お客様：ホーム／準備／えらぶ／ヒヤリング＋メニュー */}
            {item("/dashboard", "🏠", "ホーム")}
            {item(`/cases/${coupleCaseId}?tab=seating`, "📋", "準備", undefined, "seating")}
            {item(`/cases/${coupleCaseId}?tab=catalog`, "👗", "えらぶ", undefined, "catalog")}
            {item("/survey", "📝", "ヒヤリング")}
          </>
        ) : (
          <>
            {item("/dashboard", "▦", "ホーム")}
            {item("/cases", "👥", "案件")}
            {item("/calendar", "📅", "カレンダー")}
            {isStaff3 && item("/approvals", "✅", "承認", pendingCount || undefined)}
            {role === "couple" && item("/survey", "📝", "ヒヤリング")}
          </>
        )}
        <button className={`mnav-item ${menuOpen ? "active" : ""}`} onClick={() => setMenuOpen((o) => !o)}>
          <span className="mnav-icon">☰</span>
          メニュー
        </button>
      </nav>
    </>
  );
}
