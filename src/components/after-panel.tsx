"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type FollowUp = {
  id: string; type: string; body: string; status: string;
  staffName: string | null; createdAt: string;
};

export const FOLLOWUP_TYPES: [string, string, string][] = [
  // [値, 表示名, pillクラス]
  ["contact", "アフター連絡", "blue"],
  ["handover", "引き継ぎ", "amber"],
  ["claim", "クレーム", "red"],
  ["other", "その他", "gray"],
];
const typeMeta = (t: string) => FOLLOWUP_TYPES.find(([v]) => v === t) ?? FOLLOWUP_TYPES[3];

export function AfterPanel({
  caseId, followups, canEdit,
}: { caseId: string; followups: FollowUp[]; canEdit: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? `操作に失敗しました（HTTP ${res.status}）`); return false; }
    setErr(""); router.refresh(); return true;
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries());
    if (await call(`/api/v1/cases/${caseId}/followups`, "POST", f)) form.reset();
    setBusy(false);
  }

  const openClaims = followups.filter((f) => f.type === "claim" && f.status === "open");
  const list = filter ? followups.filter((f) => f.type === filter) : followups;

  return (
    <>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}
      {openClaims.length > 0 && (
        <div className="form-err" style={{ marginBottom: 12 }}>
          ⚠ 未対応のクレームが {openClaims.length} 件あります
        </div>
      )}

      {canEdit && (
        <form className="card" style={{ padding: 16, marginBottom: 14 }} onSubmit={add}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <select className="form-input" name="type" style={{ width: 150 }}>
              {FOLLOWUP_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <textarea className="form-input" name="body" required rows={2} style={{ flex: 1, minWidth: 240 }}
              placeholder="例：お礼の連絡・写真データ送付済み／音響トラブルのお詫び（次回対応：入場曲の音量確認を徹底）など" />
            <button className="btn primary" disabled={busy}>{busy ? "追加中…" : "＋ 記録"}</button>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text3)", margin: "8px 0 0" }}>
            ※ この記録は社内向けです（お客様アカウントには表示されません）。クレームは「対応中」の間、ダッシュボードに警告表示されます。
          </p>
        </form>
      )}

      {/* 種別フィルタ */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button className={`pill ${!filter ? "accent" : "gray"}`} style={{ cursor: "pointer", border: "none" }} onClick={() => setFilter("")}>すべて {followups.length}</button>
        {FOLLOWUP_TYPES.map(([v, l]) => (
          <button key={v} className={`pill ${filter === v ? "accent" : "gray"}`} style={{ cursor: "pointer", border: "none" }} onClick={() => setFilter(v)}>
            {l} {followups.filter((f) => f.type === v).length}
          </button>
        ))}
      </div>

      <div className="grid" style={{ gap: 10 }}>
        {list.length === 0 && <div className="card"><div className="empty">記録はまだありません</div></div>}
        {list.map((f) => {
          const [, label, cls] = typeMeta(f.type);
          return (
            <div className="card" key={f.id} style={{ padding: "12px 16px", opacity: f.status === "done" ? 0.65 : 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={`pill ${cls}`}>{label}</span>
                <span className={`pill ${f.status === "open" ? "amber" : "green"}`}>{f.status === "open" ? "対応中" : "完了"}</span>
                <span style={{ fontSize: 11.5, color: "var(--text3)" }}>
                  {new Date(f.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {f.staffName ? `｜記録：${f.staffName}` : ""}
                </span>
                <div style={{ flex: 1 }} />
                {canEdit && (
                  <>
                    <button className="btn sm" onClick={() => call(`/api/v1/followups/${f.id}`, "PATCH", { status: f.status === "open" ? "done" : "open" })}>
                      {f.status === "open" ? "✓ 完了にする" : "対応中に戻す"}
                    </button>
                    <button className="btn sm" onClick={() => { if (confirm("この記録を削除しますか？")) call(`/api/v1/followups/${f.id}`, "DELETE"); }}>削除</button>
                  </>
                )}
              </div>
              <div style={{ fontSize: 13, marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{f.body}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
