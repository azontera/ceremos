"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Item = { kind: string; label: string; sub: string; href: string };

// ヘッダーの通知ベル（30秒ポーリング）
export function NotificationsBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/me/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) { setCount(data.count ?? 0); setItems(data.items ?? []); }
      } catch { /* オフライン時は無視 */ }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // 外側クリックで閉じる
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button className="btn" style={{ position: "relative", padding: "8px 12px" }}
        title="通知" onClick={() => setOpen((o) => !o)}>
        🔔
        {count > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6, background: "var(--red, #c14b4b)", color: "#fff",
            borderRadius: 99, fontSize: 10, fontWeight: 800, minWidth: 18, height: 18,
            display: "grid", placeItems: "center", padding: "0 4px",
          }}>{count > 99 ? "99+" : count}</span>
        )}
      </button>
      {open && (
        <div className="card" style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", width: 360, maxWidth: "85vw",
          zIndex: 50, maxHeight: 480, overflowY: "auto", boxShadow: "var(--shadow-lg)",
        }}>
          <div className="card-h">通知{count > 0 && <span className="pill red">{count}</span>}</div>
          <div className="card-b" style={{ padding: items.length ? undefined : 0 }}>
            {items.length === 0 && <div className="empty" style={{ padding: 20 }}>新しい通知はありません 🎉</div>}
            {items.map((n, i) => (
              <Link key={i} href={n.href} className="list-row" onClick={() => setOpen(false)}>
                <div className="t">
                  <b style={{ fontSize: 12.5 }}>{n.label}</b>
                  <span>{n.sub}</span>
                </div>
                <span style={{ color: "var(--text3)" }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
