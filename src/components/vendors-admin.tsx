"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Vendor = { id: string; name: string; category: string; orderCount: number };
const CATEGORIES: [string, string][] = [
  ["dress", "ドレス"], ["florist", "装花"], ["catering", "料理"], ["audio", "音響"],
  ["mc", "司会"], ["photo", "写真"], ["video", "映像"], ["gift", "引出物"],
  ["print", "印刷"], ["beauty", "美容"],
];
const catLabel = (c: string) => CATEGORIES.find(([v]) => v === c)?.[1] ?? c;

export function VendorsAdmin({ vendors }: { vendors: Vendor[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

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
    if (await call("/api/v1/admin/vendors", "POST", f)) form.reset();
    setBusy(false);
  }

  return (
    <>
      <div className="section-h" style={{ marginTop: 30 }}>
        <h2>業者マスタ（発注先）</h2>
        <span className="pill gray">{vendors.length}社</span>
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      <form className="card" style={{ padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} onSubmit={add}>
        <input className="form-input" style={{ flex: 1, minWidth: 180 }} name="name" placeholder="業者名（例：フローラ武蔵野）" required />
        <select className="form-input" style={{ width: 120 }} name="category">
          {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn primary" disabled={busy}>＋ 追加</button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>業者名</th><th>カテゴリ</th><th>発注実績</th><th>操作</th></tr></thead>
          <tbody>
            {vendors.length === 0 && <tr><td colSpan={5} className="empty">業者が登録されていません</td></tr>}
            {vendors.map((v) => (
              <tr key={v.id}>
                {editId === v.id ? (
                  <td colSpan={2}>
                    <form style={{ display: "flex", gap: 6 }} onSubmit={(e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(new FormData(e.currentTarget).entries());
                      call(`/api/v1/admin/vendors/${v.id}`, "PATCH", f).then((ok) => ok && setEditId(null));
                    }}>
                      <input className="form-input" style={{ padding: "4px 8px" }} name="name" defaultValue={v.name} required />
                      <select className="form-input" style={{ padding: "4px 8px", width: 100 }} name="category" defaultValue={v.category}>
                        {CATEGORIES.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                      </select>
                      <button className="btn sm primary">保存</button>
                      <button type="button" className="btn sm" onClick={() => setEditId(null)}>×</button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td><b>{v.name}</b></td>
                    <td><span className="pill blue">{catLabel(v.category)}</span></td>
                  </>
                )}
                <td>{v.orderCount}件</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link className="btn sm" href={`/print/vendor/${v.id}`} target="_blank">🖨 発注書</Link>{" "}
                  {editId !== v.id && <button className="btn sm" onClick={() => setEditId(v.id)}>編集</button>}{" "}
                  <button className="btn sm" onClick={() => {
                    if (confirm(`「${v.name}」を削除しますか？`)) call(`/api/v1/admin/vendors/${v.id}`, "DELETE");
                  }}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8 }}>
        ここで追加した業者は、発注の「発注先」やカタログ管理で選べるようになります。発注がある業者は削除できません。
      </p>
    </>
  );
}
