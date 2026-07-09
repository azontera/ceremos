"use client";
import { useState } from "react";
import { ChatPanel } from "./chat-panel";

// 案件チャットの常設ドック（どのタブからでも右下から開ける・時間軸に依存しないため）
export function ChatDock({
  caseId, meId, initialOpen = false,
}: { caseId: string; meId: string; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <>
      {/* 右下の常設ボタン */}
      <button
        className="chat-dock-btn"
        onClick={() => setOpen((o) => !o)}
        title="案件チャット（どのタブからでも開けます）"
        style={{
          position: "fixed", right: 22, bottom: 22, zIndex: 60,
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--accent)", color: "#fff", border: "none",
          fontSize: 22, cursor: "pointer", boxShadow: "var(--shadow-lg)",
        }}>
        {open ? "×" : "💬"}
      </button>

      {/* スライドオーバーパネル */}
      {open && (
        <div className="chat-dock-panel" style={{
          position: "fixed", right: 22, bottom: 88, zIndex: 60,
          width: 440, maxWidth: "calc(100vw - 44px)",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "14px 14px 0 0", padding: "10px 16px",
            fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8,
            boxShadow: "var(--shadow-lg)",
          }}>
            💬 案件チャット
            <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)" }}>お客様・業者・スタッフ共通</span>
            <div style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setOpen(false)}>閉じる</button>
          </div>
          <div style={{ boxShadow: "var(--shadow-lg)", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
            <ChatPanel caseId={caseId} meId={meId} height="min(60vh, 560px)" />
          </div>
        </div>
      )}
    </>
  );
}
