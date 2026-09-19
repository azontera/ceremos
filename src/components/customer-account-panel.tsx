"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// 案件概要から、お客様アカウントの作成（ログインID＋パスワードの発行）と連絡先・パスワードの変更を行う
export type CustomerAccount = {
  id: string; name: string; email: string; phone: string | null; address: string | null;
};

export function CustomerAccountPanel({ caseId, accounts, bridal = true }: { caseId: string; accounts: CustomerAccount[]; bridal?: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  // 新規アカウント作成（または既存の顧客アカウントをこの案件に紐付け）
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries());
    setBusy(true); setErr(""); setOk("");
    const res = await fetch(`/api/v1/cases/${caseId}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? `作成に失敗しました（HTTP ${res.status}）`); return; }
    setOk(data.created
      ? `${f.name} 様のログインアカウントを作成しました。メールアドレスとパスワードをお客様へお伝えください`
      : `既存のお客様アカウント（${f.email}）をこの案件に紐付けました`);
    setAdding(false); form.reset(); router.refresh();
  }

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

  return (
    <div className="card"><div className="card-h">👤 お客様アカウント<span className="pill gray">{accounts.length}名</span>
      <div style={{ flex: 1 }} />
      {!adding && <button className="btn sm primary" onClick={() => { setAdding(true); setErr(""); setOk(""); }}>＋ アカウント発行</button>}
    </div><div className="card-b">
      {err && <div className="form-err" style={{ marginBottom: 8 }}>{err}</div>}
      {ok && (
        <div style={{ background: "#e8f3ea", border: "1px solid #3d8a5f", color: "#2c6a48", borderRadius: 8, padding: "6px 10px", fontSize: 12, marginBottom: 8 }}>
          ✅ {ok}
        </div>
      )}
      {adding && (
        <form style={{ display: "grid", gap: 6, marginBottom: 10, padding: "10px 12px", background: "var(--surface2)", borderRadius: 8 }} onSubmit={create}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>お客様のログインアカウントを発行</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input className="form-input" style={{ flex: 1, minWidth: 130, padding: "5px 8px" }} name="name" placeholder="お名前" required />
            <input className="form-input" style={{ flex: 1.4, minWidth: 170, padding: "5px 8px" }} type="email" name="email" placeholder="メールアドレス（ログインID）" required />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input className="form-input" style={{ flex: 1, minWidth: 150, padding: "5px 8px" }} name="password" placeholder="初期パスワード（8文字以上・英字＋数字）" required minLength={8} autoComplete="new-password" />
            <input className="form-input" style={{ flex: 1, minWidth: 120, padding: "5px 8px" }} name="phone" placeholder="電話番号（任意）" />
            {bridal && (
              <select className="form-input" style={{ padding: "5px 8px", width: 110 }} name="side" defaultValue="">
                <option value="">担当：未指定</option>
                <option value="groom">新郎側</option>
                <option value="bride">新婦側</option>
              </select>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="btn sm primary" disabled={busy}>{busy ? "作成中…" : "発行する"}</button>
            <button type="button" className="btn sm" onClick={() => setAdding(false)}>キャンセル</button>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>※ 同じメールのお客様が既にいる場合は、その方をこの案件に紐付けます</span>
          </div>
        </form>
      )}
      {accounts.length === 0 && !adding && (
        <div className="empty" style={{ padding: 10 }}>お客様のログインアカウントはまだありません。「＋ アカウント発行」からメールアドレスとパスワードを発行してお渡しください。</div>
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
        ※ メールアドレスを変更するとログインIDも変わります。お客様はログイン後に「📝 ヒヤリング」へ回答できます。
      </p>
    </div></div>
  );
}
