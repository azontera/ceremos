"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const ORDER_STATUS: Record<string, { label: string; cls: string; next?: { to: string; label: string } }> = {
  pending: { label: "未確定", cls: "red", next: { to: "confirmed", label: "確定する" } },
  confirmed: { label: "確定", cls: "amber", next: { to: "delivered", label: "納品済にする" } },
  delivered: { label: "納品済", cls: "green" },
};

export type VendorOrder = {
  id: string; caseId: string; caseLabel: string; weddingDate: string;
  category: string; amount: number; status: string; note: string | null; dueAt: string | null;
};

export function VendorOrdersTable({ orders, canOperate }: { orders: VendorOrder[]; canOperate: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/v1/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? `操作に失敗しました（HTTP ${res.status}）`); return; }
    setErr(""); router.refresh();
  }

  const now = new Date();
  return (
    <>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>案件</th><th>品目</th><th>納期</th><th>金額</th><th>状態</th><th>操作</th></tr></thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={6} className="empty">発注はありません</td></tr>}
            {orders.map((o) => {
              const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: "gray" };
              const overdue = o.status === "pending" && o.dueAt && new Date(o.dueAt) < now;
              return (
                <tr key={o.id}>
                  <td>
                    <Link href={`/cases/${o.caseId}?tab=orders`} style={{ fontWeight: 700 }}>{o.caseLabel}</Link>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>
                      開催 {new Date(o.weddingDate).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })}
                    </div>
                  </td>
                  <td>{o.note ?? o.category}</td>
                  <td style={overdue ? { color: "var(--red)", fontWeight: 700 } : {}}>
                    {o.dueAt ? new Date(o.dueAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    {overdue ? "（超過）" : ""}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{yen(o.amount)}</td>
                  <td><span className={`pill ${st.cls}`}>{st.label}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canOperate && st.next && (
                      <button className="btn sm primary" onClick={() => setStatus(o.id, st.next!.to)}>{st.next.label}</button>
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

export type VendorQuoteItem = {
  id: string; caseId: string; caseLabel: string; quoteVersion: number; quoteStatus: string;
  name: string; qty: number; unitPrice: number;
};

// 自社紐付きの見積明細（draft / confirmed のみ編集可能）
export function VendorQuoteItems({ items }: { items: VendorQuoteItem[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(id: string, f: Record<string, FormDataEntryValue>) {
    setBusy(true);
    const res = await fetch(`/api/v1/quote-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.name, qty: Number(f.qty), unitPrice: Number(f.unitPrice) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error ?? `保存に失敗しました（HTTP ${res.status}）`);
    else { setErr(""); setEditId(null); router.refresh(); }
    setBusy(false);
  }

  return (
    <>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>案件</th><th>見積</th><th>品目</th><th>数量</th><th>単価</th><th>小計</th><th>操作</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={7} className="empty">編集可能な見積明細はありません（承認済の見積は編集できません）</td></tr>}
            {items.map((it) => (
              <tr key={it.id}>
                <td><Link href={`/cases/${it.caseId}?tab=quotes`} style={{ fontWeight: 700 }}>{it.caseLabel}</Link></td>
                <td><span className="pill gray">Ver.{it.quoteVersion}</span> <span className={`pill ${it.quoteStatus === "draft" ? "gray" : "amber"}`}>{it.quoteStatus === "draft" ? "下書き" : "確認済"}</span></td>
                {editId === it.id ? (
                  <td colSpan={4}>
                    <form style={{ display: "flex", gap: 6, alignItems: "center" }} onSubmit={(e) => {
                      e.preventDefault();
                      save(it.id, Object.fromEntries(new FormData(e.currentTarget).entries()));
                    }}>
                      <input className="form-input" style={{ padding: "4px 8px", flex: 1 }} name="name" defaultValue={it.name} required />
                      <input className="form-input" style={{ padding: "4px 8px", width: 70 }} type="number" name="qty" defaultValue={it.qty} min={0} />
                      <input className="form-input" style={{ padding: "4px 8px", width: 110 }} type="number" name="unitPrice" defaultValue={it.unitPrice} min={0} />
                      <button className="btn sm primary" disabled={busy}>{busy ? "…" : "保存"}</button>
                      <button type="button" className="btn sm" onClick={() => setEditId(null)}>×</button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td>{it.name}</td>
                    <td>{it.qty}</td>
                    <td>{yen(it.unitPrice)}</td>
                    <td style={{ whiteSpace: "nowrap" }}><b>{yen(it.qty * it.unitPrice)}</b></td>
                  </>
                )}
                <td style={{ whiteSpace: "nowrap" }}>
                  {editId !== it.id && <button className="btn sm" onClick={() => setEditId(it.id)}>編集</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8 }}>
        ※ 編集できるのは自社に紐付く明細で、見積が「下書き」「確認済」の間のみです。変更は監査ログに記録され、担当プランナーが確認できます。
      </p>
    </>
  );
}
