"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Vendor = { id: string; name: string; category: string };
type Order = {
  id: string; category: string; amount: number; dueAt: string | null;
  status: string; note: string | null; vendorName: string | null;
};

const CATEGORIES: [string, string][] = [
  ["dress", "ドレス"], ["florist", "装花"], ["catering", "料理"], ["audio", "音響"],
  ["mc", "司会"], ["photo", "写真"], ["video", "映像"], ["gift", "引出物"],
  ["print", "印刷物"], ["beauty", "美容"],
];
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES);
const ST: Record<string, { label: string; cls: string; next?: { to: string; label: string } }> = {
  pending: { label: "未確定", cls: "red", next: { to: "confirmed", label: "確定する" } },
  confirmed: { label: "確定", cls: "green", next: { to: "delivered", label: "納品済にする" } },
  delivered: { label: "納品済", cls: "green" },
};
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function OrdersPanel({
  caseId, orders, vendors, canEdit,
}: { caseId: string; orders: Order[]; vendors: Vendor[]; canEdit: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const now = new Date();

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch(`/api/v1/cases/${caseId}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setAdding(false); router.refresh(); }
    else setErr(data.error ?? `追加に失敗しました（HTTP ${res.status}）`);
    setBusy(false);
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/v1/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) router.refresh();
    else setErr(data.error ?? `変更に失敗しました（HTTP ${res.status}）`);
  }

  return (
    <>
      <div className="section-h" style={{ margin: "0 0 14px" }}>
        {orders.some((o) => o.status === "pending") && <span className="pill red">要対応あり</span>}
        <div style={{ flex: 1 }} />
        <a className="btn" href={`/print/${caseId}/orders`} target="_blank">🖨 発注書</a>
        {canEdit && !adding && <button className="btn primary" onClick={() => setAdding(true)}>＋ 追加</button>}
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {adding && (
        <form className="card" style={{ padding: 20, marginBottom: 16 }} onSubmit={add}>
          <div className="grid cols-2">
            <div className="field"><label>品目名 *</label><input className="form-input" name="note" required placeholder="例：引出物" /></div>
            <div className="field"><label>カテゴリ *</label>
              <select className="form-input" name="category">
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field"><label>発注先</label>
              <select className="form-input" name="vendorId">
                <option value="">自社</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="field"><label>金額（税込）</label><input className="form-input" type="number" name="amount" defaultValue={0} /></div>
            <div className="field"><label>納期</label><input className="form-input" type="datetime-local" name="dueAt" /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={busy}>{busy ? "追加中…" : "追加"}</button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>キャンセル</button>
          </div>
        </form>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>品目</th><th>発注先</th><th>納期</th><th>金額</th><th>ステータス</th><th>操作</th></tr></thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={6} className="empty">発注はまだありません</td></tr>}
            {orders.map((o) => {
              const st = ST[o.status] ?? { label: o.status, cls: "gray" };
              const overdue = o.status === "pending" && o.dueAt && new Date(o.dueAt) < now;
              return (
                <tr key={o.id}>
                  <td><b>{o.note ?? CAT_LABEL[o.category] ?? o.category}</b></td>
                  <td>{o.vendorName ?? "自社"}</td>
                  <td>{o.dueAt ? new Date(o.dueAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td>{yen(o.amount)}</td>
                  <td><span className={`pill ${overdue ? "red" : st.cls}`}>{st.label}{overdue ? "・期限超過" : ""}</span></td>
                  <td>
                    {st.next && canEdit && (
                      <button className="btn sm" onClick={() => setStatus(o.id, st.next!.to)}>{st.next.label}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
