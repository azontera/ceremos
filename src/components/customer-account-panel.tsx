"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// 案件概要から、紐付いたお客様アカウントの連絡先・パスワードを変更する
export type CustomerAccount = {
  id: string; name: string; email: string; phone: string | null; address: string | null;
};

export function CustomerAccountPanel({ accounts }: { accounts: CustomerAccount[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(id: string, body: unknown, successMsg: string) {
    setBusy(true); setErr(""); setOk("");
    const res = await fetch(`/api/v1/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? `変更に失敗しました（HTTP ${res.status}）`); return false; }
    setOk(successMsg); router.refresh(); return true;
  }

  if (accounts.length === 0) return null;

  return (
    <div className="card"><div className="card-h">👤 お客様アカウント<span className="pill gray">{accounts.length}名</span></div><div className="card-b">
      {err && <div className="form-err" style={{ marginBottom: 8 }}>{err}</div>}
      {ok && (
        <div style={{ background: "#e8f3ea", border: "1px solid #3d8a5f", color: "#2c6a48", borderRadius: 8, padding: "6px 10px", fontSize: 12, marginBottom: 8 }}>
          ✅ {ok}
        </div>
      )}
      {accounts.map((a) => (
        <div key={a.id} style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
          {editId === a.id ? (
            <form style={{ display: "grid", gap: 6 }} onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget).entries());
              if (await call(a.id, f, `${a.name} 様の情報を更新しました`)) setEditId(null);
            }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input className="form-input" style={{ flex: 1, minWidth: 130, padding: "5px 8px" }} name="name" defaultValue={a.name} placeholder="お名前" required />
                <input className="form-input" style={{ flex: 1.4, minWidth: 170, padding: "5px 8px" }} type="email" name="email" defaultValue={a.email} placeholder="メールアドレス" required />
                <input className="form-input" style={{ flex: 1, minWidth: 120, padding: "5px 8px" }} name="phone" defaultValue={a.phone ?? ""} placeholder="電話番号" />
              </div>
              <input className="form-input" style={{ padding: "5px 8px" }} name="address" defaultValue={a.address ?? ""} placeholder="ご住所" />
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn sm primary" disabled={busy}>{busy ? "保存中…" : "保存"}</button>
                <button type="button" className="btn sm" onClick={() => setEditId(null)}>キャンセル</button>
              </div>
            </form>
          ) : (
            <div className="list-row" style={{ border: "none", padding: 0 }}>
              <div className="t">
                <b>{a.name} 様</b>
                <span>{a.email}{a.phone ? ` ／ ${a.phone}` : ""}{a.address ? ` ／ ${a.address}` : ""}</span>
              </div>
              <button className="btn sm" onClick={() => { setEditId(a.id); setErr(""); setOk(""); }}>✏️ 変更</button>
              <button className="btn sm" onClick={() => {
                const pw = prompt(`${a.name} 様の新しいパスワード（8文字以上・英字と数字）`);
                if (pw) call(a.id, { password: pw }, `${a.name} 様のパスワードを再設定しました（お客様へお伝えください）`);
              }}>🔑 PW再設定</button>
            </div>
          )}
        </div>
      ))}
      <p style={{ fontSize: 11, color: "var(--text3)", margin: "8px 0 0" }}>
        ※ メールアドレスを変更するとログインIDも変わります。Googleログインをお使いの場合は新しいメールのGoogleアカウントでログインしていただきます。
      </p>
    </div></div>
  );
}
