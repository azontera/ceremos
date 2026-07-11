"use client";
// グローバルサイドバーの折りたたみ（中央の作業エリアを広く使いたいというリクエスト対応）
// アイコンのみの縮小表示に切り替え、状態はブラウザに保存して次回訪問でも維持する。
// デフォルトは自動で縮小（初回訪問時も含む）。ユーザーが手動で広げた場合はその選択を記憶する。
import { useEffect, useState } from "react";

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => { setCollapsed(localStorage.getItem("sidebarCollapsed") !== "0"); }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
  };
  // 幅はJSの状態から直接インラインで指定する（CSSクラスだけだとflex-basis:autoの解決順序に依存し、
  // 環境によっては縮小が効かないことがあったため、確実に効く方式に固定）
  const w = collapsed ? 60 : 232;
  return (
    <nav className={`sidebar${collapsed ? " collapsed" : ""}`} style={{ width: w, minWidth: w, flexBasis: w, flexGrow: 0, flexShrink: 0 }}>
      <button className="sidebar-toggle" onClick={toggle} title={collapsed ? "メニューを広げる" : "メニューを縮小"}>
        {collapsed ? "»" : "«"}
      </button>
      {children}
    </nav>
  );
}
