"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string; name: string; email: string; role: string; isActive: boolean; vendorName: string | null;
  group?: "staff" | "vendor" | "customer";
  customerType?: string | null; // 顧客種別（紐付き案件の種別から自動判定）
};
const ROLES: [string, string][] = [
  ["admin", "管理者"], ["manager", "支配人"], ["planner", "プランナー"], ["chef", "料理長"],
  ["audio", "音響"], ["mc", "司会"], ["dress", "ドレス"], ["florist", "装花"],
  ["photo", "写真・映像"], ["print", "印刷会社"], ["gift", "引出物会社"],
  ["service", "サービス"], ["couple", "顧客（新郎新婦・宴会）"],
];
const label = (r: string) => ROLES.find(([v]) => v === r)?.[1] ?? r;

export function UsersAdmin({
  users, vendors, meId,
}: {
  users: User[]; vendors: { id: string; name: string }[]; meId: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? `操作に失敗しました（HTTP ${res.status}）`); return false; }
    setErr(""); router.refresh(); return true;
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (await call("/api/v1/admin/users", "POST", f)) setAdding(false);
    setBusy(false);
  }

  return (
    <>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* 承認待ちは「✅ 承認待ち」ページ（PendingApprovals）へ移設 */}

      <div style={{ marginBottom: 14 }}>
        {!adding && <button className="btn primary" onClick={() => setAdding(true)}>＋ 追加</button>}
      </div>

      {adding && (
        <form className="card" style={{ padding: 20, marginBottom: 16 }} onSubmit={add}>
          <div className="grid cols-2">
            <div className="field"><label>氏名 *</label><input className="form-input" name="name" required /></div>
            <div className="field"><label>メール *</label><input className="form-input" type="email" name="email" required /></div>
            <div className="field"><label>ロール *</label>
              <select className="form-input" name="role" defaultValue="planner">
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field"><label>所属業者（業者ロールの場合）</label>
              <select className="form-input" name="vendorId">
                <option value="">なし（自社スタッフ・新郎新婦）</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="field"><label>初期パスワード *（8文字以上）</label>
              <input className="form-input" name="password" required minLength={8} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={busy}>{busy ? "作成中…" : "作成"}</button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>キャンセル</button>
          </div>
        </form>
      )}

      {/* 区分ごとにグループ表示：社員／外注（顧客は独立した「顧客マスタ」ページへ） */}
      {([
        ["staff", "👥 社員（自社スタッフ）"],
        ["vendor", "🏪 外注（業者・提携）"],
      ] as const).map(([g, gLabel]) => {
        const list = users.filter((u) => (u.group ?? "staff") === g);
        if (list.length === 0) return null;
        return (
          <div key={g} style={{ marginBottom: 22 }}>
            <div className="section-h" style={{ margin: "0 0 8px" }}>
              <h2 style={{ fontSize: 14.5 }}>{gLabel}</h2>
              <span className="pill gray">{list.length}名</span>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>氏名</th><th>メール</th><th>ロール</th>
                    <th>所属</th>
                    <th>状態</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.5 }}>
                      <td><b>{u.name}</b>{u.id === meId && <span className="pill gray" style={{ marginLeft: 6 }}>自分</span>}</td>
                      <td>{u.email}</td>
                      <td>
                        {u.id === meId ? label(u.role) : (
                          <select className="form-input" style={{ padding: "4px 8px", width: 130 }} defaultValue={u.role}
                            onChange={(e) => call(`/api/v1/admin/users/${u.id}`, "PATCH", { role: e.target.value })}>
                            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        )}
                      </td>
                      <td>{u.vendorName ?? "—"}</td>
                      <td><span className={`pill ${u.isActive ? "green" : "gray"}`}>{u.isActive ? "有効" : "無効"}</span></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {u.id !== meId && (
                          <>
                            <button className="btn sm" onClick={() => call(`/api/v1/admin/users/${u.id}`, "PATCH", { isActive: !u.isActive })}>
                              {u.isActive ? "無効化" : "有効化"}
                            </button>{" "}
                            <button className="btn sm" onClick={() => {
                              const p = prompt(`${u.name} の新しいパスワード（8文字以上）`);
                              if (p) call(`/api/v1/admin/users/${u.id}`, "PATCH", { password: p });
                            }}>PW再設定</button>{" "}
                            <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => {
                              if (confirm(`${u.name} を削除しますか？（元に戻せません。履歴を残す場合は「無効化」を推奨）`)) {
                                call(`/api/v1/admin/users/${u.id}`, "DELETE");
                              }
                            }}>削除</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: -8, marginBottom: 14 }}>
        ※ 顧客の種別（ブライダル／宴会／その他）は紐付いた案件の種別から自動判定されます。「未紐付け」の顧客は承認時または案件詳細から案件に紐付けてください。
      </p>
    </>
  );
}
