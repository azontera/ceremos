"use client";
// 失注の記録ボタン＋理由入力モーダル（理由必須・ステップは自動記録）
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOST_REASONS } from "@/lib/case-types";

export function LostCaseButton({ caseId, isLost, lostReason }: { caseId: string; isLost: boolean; lostReason?: string | null }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  if (isLost) {
    const label = LOST_REASONS.find(([v]) => v === lostReason)?.[1] ?? lostReason ?? "";
    return (
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <span className="pill red">失注{label ? `（${label}）` : ""}</span>
        <button className="btn sm" disabled={busy} onClick={async () => {
          if (!confirm("失注を取り消して商談中に戻しますか？")) return;
          setBusy(true);
          await fetch(`/api/v1/cases/${caseId}/lost`, { method: "DELETE" });
          setBusy(false);
          router.refresh();
        }}>失注を取り消す</button>
      </span>
    );
  }

  return (
    <>
      <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => setOpen(true)}>失注にする…</button>
      {open && (
        <div className="mnav-sheet" style={{ zIndex: 90 }} onClick={() => setOpen(false)}>
          <div className="mnav-sheet-body" style={{ maxWidth: 420, margin: "10vh auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>失注の記録</div>
            <p style={{ fontSize: 12, color: "var(--text2)", margin: "0 0 10px" }}>
              理由は成果ダッシュボードで集計され、どのステップで失注しやすいかの改善に使われます。
            </p>
            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              {LOST_REASONS.map(([v, label]) => (
                <button key={v} className={`btn ${reason === v ? "primary" : ""}`} style={{ padding: "10px 14px" }}
                  onClick={() => setReason(v)}>{label}</button>
              ))}
            </div>
            <textarea className="form-input" rows={2} placeholder="補足（任意）例：◯◯会場と比較して装花の自由度で負け"
              value={note} onChange={(e) => setNote(e.target.value)} />
            {err && <div className="form-err">{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setOpen(false)}>キャンセル</button>
              <button className="btn primary" disabled={!reason || busy} onClick={async () => {
                setBusy(true); setErr("");
                const r = await fetch(`/api/v1/cases/${caseId}/lost`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reason, note }),
                });
                setBusy(false);
                if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? "記録に失敗しました"); return; }
                setOpen(false);
                router.refresh();
              }}>失注として記録</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
