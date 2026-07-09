"use client";
// 案件詳細ページの各セクション（見積・カタログ等）を「要約＋ボタン」で表示し、押すとモーダルで全体を開く
import { useEffect, useRef, useState, type ReactNode } from "react";

export function openSection(id: string) {
  window.dispatchEvent(new CustomEvent("open-section", { detail: id }));
}

export function OpenSectionButton({
  id, className = "btn", style, children,
}: { id: string; className?: string; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <button type="button" className={className} style={style} onClick={() => openSection(id)}>
      {children}
    </button>
  );
}

export function SectionModal({
  id, icon, title, summary, badge, children,
}: {
  id: string; icon: string; title: string; summary?: ReactNode; badge?: ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent<string>).detail === id) setOpen(true);
    }
    window.addEventListener("open-section", handler as EventListener);
    return () => window.removeEventListener("open-section", handler as EventListener);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  function onMouseEnter() {
    hoverTimer.current = setTimeout(() => setHover(true), 250);
  }
  function onMouseLeave() {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setHover(false);
  }

  return (
    <>
      <div
        className="card section-summary-card"
        id={id}
        role="button"
        tabIndex={0}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
      >
        <div className="ss-head">
          <span className="ss-icon">{icon}</span>
          <div className="ss-title">{title}</div>
          {badge}
        </div>
        {summary && <div className="ss-hint">{summary}</div>}
        {hover && !open && (
          <div className="ss-preview-pop">
            <div className="ss-preview-inner">{children}</div>
          </div>
        )}
      </div>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{icon} {title}</h2>
              <button type="button" className="btn sm" onClick={() => setOpen(false)}>✕ 閉じる</button>
            </div>
            <div className="modal-body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
