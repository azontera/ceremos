"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MyPasswordPage() {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(""); setOk(false);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (f.newPassword !== f.newPassword2) {
      setErr("新しいパスワード（確認）が一致しません"); setBusy(false); return;
    }
    const res = await fetch("/api/v1/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: f.currentPassword, newPassword: f.newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setOk(true); (e.target as HTMLFormElement).reset?.(); }
    else setErr(data.error ?? `変更に失敗しました（HTTP ${res.status}）`);
    setBusy(false);
  }

  return (
    <>
      <div className="section-h"><h2>🔑 パスワード変更</h2></div>
      <form className="card" style={{ padding: 24, maxWidth: 440 }} onSubmit={submit}>
        <div className="field">
          <label>現在のパスワード *</label>
          <input className="form-input" type="password" name="currentPassword" required autoComplete="current-password" />
        </div>
        <div className="field">
          <label>新しいパスワード *（8文字以上・英字と数字を含む）</label>
          <input className="form-input" type="password" name="newPassword" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="field">
          <label>新しいパスワード（確認） *</label>
          <input className="form-input" type="password" name="newPassword2" required minLength={8} autoComplete="new-password" />
        </div>
        {err && <div className="form-err">{err}</div>}
        {ok && (
          <div style={{ background: "#e8f3ea", border: "1px solid #3d8a5f", color: "#2c6a48", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
            ✅ パスワードを変更しました
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn primary" disabled={busy}>{busy ? "変更中…" : "変更する"}</button>
          <button type="button" className="btn" onClick={() => router.back()}>戻る</button>
        </div>
      </form>
    </>
  );
}
