"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Plan = { id?: string; label: string; amount: number; dueAt: string | null };
type Invoice = {
  id: string; number: string; issuedAt: string; dueAt: string | null;
  amount: number; status: string; paidAt: string | null; note: string | null;
};

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "下書き", cls: "gray" },
  sent: { label: "請求済（入金待ち）", cls: "amber" },
  paid: { label: "入金済", cls: "green" },
};
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const d = (x: string | null) => (x ? new Date(x).toLocaleDateString("ja-JP") : "—");

export function BillingPanel({
  caseId, canEdit, plans: initialPlans, invoices, approvedTotal, customerName = "",
}: {
  caseId: string; canEdit: boolean;
  plans: Plan[]; invoices: Invoice[];
  approvedTotal: number | null; // 確定見積の合計（請求書作成の初期値）
  customerName?: string; // CSV・請求書印刷の取引先名
}) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingPlans, setEditingPlans] = useState(false);
  const [rows, setRows] = useState<Plan[]>([]);
  const [creating, setCreating] = useState(false);

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

  function startEditPlans() {
    setRows(initialPlans.length > 0
      ? initialPlans.map((p) => ({ ...p }))
      : [
          { label: "内金", amount: approvedTotal ? Math.round(approvedTotal * 0.1 / 10000) * 10000 : 100000, dueAt: null },
          { label: "残金（全額）", amount: 0, dueAt: null },
        ]);
    setEditingPlans(true);
  }
  const setRow = (i: number, patch: Partial<Plan>) =>
    setRows((arr) => arr.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function savePlans() {
    setBusy(true);
    if (await call(`/api/v1/cases/${caseId}/payment-plan`, "PUT", { plans: rows })) setEditingPlans(false);
    setBusy(false);
  }

  async function createInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (await call(`/api/v1/cases/${caseId}/invoices`, "POST", f)) setCreating(false);
    setBusy(false);
  }

  const unpaid = invoices.filter((i) => i.status === "sent");
  const planTotal = initialPlans.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* 支払予定 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          支払予定
          {approvedTotal !== null && <span className="pill gray">確定見積 {yen(approvedTotal)}</span>}
          {planTotal > 0 && <span className={`pill ${approvedTotal !== null && planTotal !== approvedTotal ? "amber" : "green"}`}>予定合計 {yen(planTotal)}</span>}
          <div style={{ flex: 1 }} />
          {canEdit && !editingPlans && <button className="btn sm" onClick={startEditPlans}>{initialPlans.length ? "編集" : "＋ 設定"}</button>}
        </div>
        <div className="card-b">
          {!editingPlans && initialPlans.length === 0 && <div className="empty">支払予定はまだ設定されていません（内金・半金・全額など複数行で設定できます）</div>}
          {!editingPlans && initialPlans.map((p, i) => (
            <div className="list-row" key={i}>
              <div className="t"><b>{p.label}</b><span>期日：{d(p.dueAt)}</span></div>
              <b>{yen(p.amount)}</b>
            </div>
          ))}
          {editingPlans && (
            <>
              <table className="tbl">
                <thead><tr><th>名目</th><th>金額</th><th>期日</th><th /></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td><input className="form-input" value={r.label} placeholder="内金／半金／全額" onChange={(e) => setRow(i, { label: e.target.value })} /></td>
                      <td><input className="form-input" type="number" style={{ width: 130 }} value={r.amount} onChange={(e) => setRow(i, { amount: Number(e.target.value) })} /></td>
                      <td><input className="form-input" type="date" value={r.dueAt ? r.dueAt.slice(0, 10) : ""} onChange={(e) => setRow(i, { dueAt: e.target.value || null })} /></td>
                      <td><button className="btn sm" onClick={() => setRows((a) => a.filter((_, k) => k !== i))}>削除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn sm" onClick={() => setRows((a) => [...a, { label: "", amount: 0, dueAt: null }])}>＋ 行を追加</button>
                <div style={{ flex: 1 }} />
                <button className="btn primary" onClick={savePlans} disabled={busy}>{busy ? "保存中…" : "保存"}</button>
                <button className="btn" onClick={() => setEditingPlans(false)}>キャンセル</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 請求書 */}
      <div className="section-h" style={{ margin: "0 0 12px" }}>
        <h2 style={{ fontSize: 16 }}>請求書</h2>
        {unpaid.length > 0 && <span className="pill red">未入金 {unpaid.length}件</span>}
        <div style={{ flex: 1 }} />
        {canEdit && !creating && <button className="btn primary" onClick={() => setCreating(true)}>＋ 請求書を発行</button>}
      </div>

      {creating && (
        <form className="card" style={{ padding: 16, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }} onSubmit={createInvoice}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>金額（税込）*</label>
            <input className="form-input" type="number" name="amount" required min={1} defaultValue={approvedTotal ?? ""} style={{ width: 150 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>支払期日</label>
            <input className="form-input" type="date" name="dueAt" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label>摘要</label>
            <input className="form-input" name="note" placeholder="例：ご婚礼費用 内金" />
          </div>
          {approvedTotal !== null && (
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
              title="請求書の印刷に見積の品目・数量・単価がそのまま載ります">
              <input type="checkbox" name="fromQuote" value="1" defaultChecked />
              見積の明細を転記
            </label>
          )}
          <button className="btn primary" disabled={busy}>{busy ? "発行中…" : "発行（下書き）"}</button>
          <button type="button" className="btn" onClick={() => setCreating(false)}>キャンセル</button>
        </form>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>請求番号</th><th>発行日</th><th>支払期日</th><th>金額</th><th>摘要</th><th>状態</th><th>操作</th></tr></thead>
          <tbody>
            {invoices.length === 0 && <tr><td colSpan={7} className="empty">請求書はまだありません</td></tr>}
            {invoices.map((inv) => {
              const st = INV_STATUS[inv.status] ?? { label: inv.status, cls: "gray" };
              const overdue = inv.status === "sent" && inv.dueAt && new Date(inv.dueAt) < new Date();
              return (
                <tr key={inv.id}>
                  <td><b>{inv.number}</b></td>
                  <td>{d(inv.issuedAt)}</td>
                  <td style={overdue ? { color: "var(--red)", fontWeight: 700 } : {}}>{d(inv.dueAt)}{overdue ? "（超過）" : ""}</td>
                  <td><b>{yen(inv.amount)}</b></td>
                  <td>{inv.note ?? "—"}</td>
                  <td>
                    <span className={`pill ${st.cls}`}>{st.label}</span>
                    {inv.status === "paid" && inv.paidAt && <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 6 }}>{d(inv.paidAt)}</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <a className="btn sm" href={`/print/${caseId}/invoice?inv=${inv.id}`} target="_blank">🖨 印刷</a>{" "}
                    {canEdit && inv.status === "draft" && (
                      <>
                        <button className="btn sm primary" onClick={() => call(`/api/v1/invoices/${inv.id}`, "PATCH", { status: "sent" })}>請求済にする</button>{" "}
                        <button className="btn sm" onClick={() => { if (confirm("下書きを削除しますか？")) call(`/api/v1/invoices/${inv.id}`, "DELETE"); }}>削除</button>
                      </>
                    )}
                    {canEdit && inv.status === "sent" && (
                      <button className="btn sm primary" onClick={() => call(`/api/v1/invoices/${inv.id}`, "PATCH", { status: "paid" })}>入金済にする</button>
                    )}
                    {canEdit && inv.status === "paid" && (
                      <button className="btn sm" onClick={() => call(`/api/v1/invoices/${inv.id}`, "PATCH", { status: "sent" })}>入金取消</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8 }}>
        ※ 「請求済（入金待ち）」の請求書はダッシュボードの未入金アラートに表示されます。振込先は管理画面「設定」で変更できます。
      </p>
    </>
  );
}
