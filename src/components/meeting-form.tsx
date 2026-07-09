"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function MeetingForm({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  // ローカル時刻で datetime-local の初期値を作る
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/cases/${caseId}/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(f.entries())),
    });
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? `保存に失敗しました（HTTP ${res.status}）`);
    }
    setBusy(false);
  }

  const [agenda, setAgenda] = useState("");

  async function openWithTemplate() {
    setOpen(true);
    // 打ち合わせテンプレートの議題を雛形として挿入
    try {
      const res = await fetch("/api/v1/templates?type=meeting");
      if (res.ok) {
        const { templates } = await res.json();
        const body = JSON.parse(templates?.[0]?.bodyJson ?? "{}");
        if (Array.isArray(body.agenda) && body.agenda.length > 0) {
          setAgenda(body.agenda.map((a: string) => `■ ${a}：`).join("\n"));
        }
      }
    } catch { /* テンプレなしでも続行 */ }
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openWithTemplate}>
        ＋ 記録を追加
      </button>
    );
  }
  return (
    <form className="card" style={{ padding: 20, marginBottom: 14, width: "100%" }} onSubmit={submit}>
      <div className="grid cols-2">
        <div className="field">
          <label>日時 *</label>
          <input className="form-input" type="datetime-local" name="heldAt" required
            defaultValue={nowLocal} />
        </div>
        <div className="field">
          <label>次回予定（任意・カレンダーにも登録）</label>
          <input className="form-input" type="datetime-local" name="nextAt" />
        </div>
      </div>
      <div className="field">
        <label>議事録（標準テンプレートの議題を自動挿入）</label>
        <textarea className="form-input" name="minutes" rows={8} placeholder="打ち合わせの内容"
          value={agenda} onChange={(e) => setAgenda(e.target.value)} />
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label>決定事項</label>
          <textarea className="form-input" name="decisions" rows={2} />
        </div>
        <div className="field">
          <label>宿題</label>
          <textarea className="form-input" name="homework" rows={2} />
        </div>
      </div>
      <div className="field">
        <label>🔒 プランナー専用メモ（お客様には表示されません）</label>
        <textarea className="form-input" name="internalNote" rows={2} placeholder="社内共有用（クレーム懸念・値引き交渉・スタッフ間の申し送りなど）" />
      </div>
      {err && <div className="form-err">{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" disabled={busy}>{busy ? "保存中…" : "保存"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>キャンセル</button>
      </div>
    </form>
  );
}
