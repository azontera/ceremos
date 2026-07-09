"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Venue = { id: string; name: string; type: string; capacity: number; useCount: number; widthM: number | null; depthM: number | null };
const TYPE_LABEL: Record<string, string> = {
  banquet: "宴会場", chapel: "チャペル", waiting: "控室", kitchen: "厨房", external: "外部会場",
};

export function VenuesAdmin({ venues }: { venues: Venue[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const banquetCount = venues.filter((v) => v.type === "banquet").length;

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

  return (
    <>
      <div className="section-h" style={{ marginTop: 30 }}>
        <h2>会場マスタ</h2>
        <span className="pill gray">宴会場 {banquetCount}/6</span>
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      <form className="card" style={{ padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = Object.fromEntries(new FormData(form).entries());
          if (await call("/api/v1/admin/venues", "POST", f)) form.reset();
        }}>
        <input className="form-input" style={{ flex: 1, minWidth: 160 }} name="name" placeholder="会場名（例：披露宴会場C／ガーデンテラス）" required />
        <select className="form-input" style={{ width: 110 }} name="type">
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="form-input" style={{ width: 90 }} name="capacity" type="number" min={0} placeholder="定員" />
        <input className="form-input" style={{ width: 90 }} name="widthM" type="number" min={3} max={60} step={0.1} placeholder="間口(m)" />
        <input className="form-input" style={{ width: 90 }} name="depthM" type="number" min={3} max={60} step={0.1} placeholder="奥行(m)" />
        <button className="btn primary">＋ 追加</button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>会場名</th><th>種別</th><th>定員</th><th>サイズ（席次表用）</th><th>使用実績</th><th>操作</th></tr></thead>
          <tbody>
            {venues.map((v) => (
              <tr key={v.id}>
                {editId === v.id ? (
                  <td colSpan={4}>
                    <form style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} onSubmit={(e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(new FormData(e.currentTarget).entries());
                      call(`/api/v1/admin/venues/${v.id}`, "PATCH", f).then((ok) => ok && setEditId(null));
                    }}>
                      <input className="form-input" style={{ padding: "4px 8px" }} name="name" defaultValue={v.name} required />
                      <input className="form-input" style={{ padding: "4px 8px", width: 80 }} name="capacity" type="number" defaultValue={v.capacity} />
                      <input className="form-input" style={{ padding: "4px 8px", width: 80 }} name="widthM" type="number" min={3} max={60} step={0.1} defaultValue={v.widthM ?? ""} placeholder="間口(m)" />
                      <span style={{ fontSize: 12, color: "var(--text3)" }}>×</span>
                      <input className="form-input" style={{ padding: "4px 8px", width: 80 }} name="depthM" type="number" min={3} max={60} step={0.1} defaultValue={v.depthM ?? ""} placeholder="奥行(m)" />
                      <button className="btn sm primary">保存</button>
                      <button type="button" className="btn sm" onClick={() => setEditId(null)}>×</button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td><b>{v.name}</b></td>
                    <td><span className="pill blue">{TYPE_LABEL[v.type] ?? v.type}</span></td>
                    <td>{v.capacity ? `${v.capacity}名` : "—"}</td>
                    <td>{v.widthM && v.depthM ? `${v.widthM}m × ${v.depthM}m` : <span style={{ color: "var(--text3)" }}>未設定</span>}</td>
                  </>
                )}
                <td>{v.useCount}件</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {editId !== v.id && <button className="btn sm" onClick={() => setEditId(v.id)}>名称変更</button>}{" "}
                  <button className="btn sm" onClick={() => {
                    if (confirm(`「${v.name}」を削除しますか？`)) call(`/api/v1/admin/venues/${v.id}`, "DELETE");
                  }}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8 }}>
        宴会場は最大6会場まで。案件作成時に自由入力した会場は「外部会場」として自動登録され、次回から選択できます。使用中の会場は削除できません。
        サイズ（間口×奥行、m）を登録すると、その会場を使う案件の<b>席次表キャンバスが実寸比</b>で表示されます。
      </p>
    </>
  );
}
