"use client";
// ===== 検証用バー（DEMO_MODE=1 のときだけレイアウトから描画される）=====
// 時間を進める（承認猶予10時間の検証用）＋ワンクリックでアカウント切替
// 本番では .env に DEMO_MODE を設定しないため表示されない
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function DemoBar() {
  const router = useRouter();
  const [now, setNow] = useState<string>("");
  const [offsetMs, setOffsetMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<{ key: string; label: string; userId?: string; role?: string; vendorCategory?: string }[]>([]);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      const d = await fetch("/api/v1/demo/time").then((r) => r.json());
      if (d.enabled) { setNow(d.now); setOffsetMs(d.offsetMs); }
    } catch { /* ignore */ }
  }
  useEffect(() => {
    load();
    fetch("/api/v1/auth/demo-login").then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? [])).catch(() => {});
  }, []);

  async function advance(addHours: number, reset = false) {
    setBusy(true);
    const d = await fetch("/api/v1/demo/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reset ? { reset: true } : { addHours }),
    }).then((r) => r.json()).catch(() => null);
    if (d?.ok) { setNow(d.now); setOffsetMs(d.offsetMs); router.refresh(); }
    setBusy(false);
  }

  async function switchTo(a: { userId?: string; role?: string; vendorCategory?: string }) {
    setBusy(true);
    const res = await fetch("/api/v1/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a),
    });
    setBusy(false);
    if (res.ok) { window.location.href = "/dashboard"; }
  }

  const offH = Math.round(offsetMs / 3600000 * 10) / 10;
  return (
    <div style={{
      background: "#3b2f4d", color: "#f4edff", fontSize: 11.5, padding: "5px 12px",
      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
    }}>
      <b>🧪 検証モード</b>
      <span>仮想時刻：{now ? new Date(now).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}{offH !== 0 && <b>（+{offH}時間）</b>}</span>
      {[1, 5, 10, 24].map((h) => (
        <button key={h} className="btn sm" style={{ padding: "1px 8px", fontSize: 11 }} disabled={busy} onClick={() => advance(h)}>
          +{h === 24 ? "1日" : `${h}時間`}
        </button>
      ))}
      <button className="btn sm" style={{ padding: "1px 8px", fontSize: 11 }} disabled={busy || offsetMs === 0} onClick={() => advance(0, true)}>リセット</button>
      <span style={{ flex: 1 }} />
      <button className="btn sm" style={{ padding: "1px 8px", fontSize: 11 }} onClick={() => setOpen((o) => !o)}>
        👤 アカウント切替 {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ flexBasis: "100%", display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 0" }}>
          {accounts.map((a) => (
            <button key={a.key} className="btn sm" style={{ padding: "2px 8px", fontSize: 11 }} disabled={busy} onClick={() => switchTo(a)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
