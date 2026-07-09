"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; group: string; value: string; label: string; sortOrder: number; isActive: boolean };

export function MastersAdmin({
  groups, options,
}: { groups: [string, string][]; options: Option[] }) {
  const router = useRouter();
  const [tab, setTab] = useState(groups[0]?.[0] ?? "case_type");
  const [err, setErr] = useState("");
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

  const list = options.filter((o) => o.group === tab).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <div className="tabs">
        {groups.map(([g, label]) => (
          <a key={g} className={tab === g ? "active" : ""} style={{ cursor: "pointer" }} onClick={() => setTab(g)}>
            {label}
          </a>
        ))}
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      <form className="card" style={{ padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = Object.fromEntries(new FormData(form).entries());
          if (await call("/api/v1/admin/masters", "POST", { ...f, group: tab })) form.reset();
        }}>
        <input className="form-input" style={{ flex: 1, minWidth: 160 }} name="label" placeholder="表示名（例：来賓／音響部 など）" required />
        <input className="form-input" style={{ width: 170 }} name="value" placeholder="内部値（英数字・空欄で自動）" pattern="[a-zA-Z0-9_-]*" />
        <button className="btn primary">＋ 追加</button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th style={{ width: 60 }}>順</th><th>表示名</th><th>内部値</th><th>状態</th><th>操作</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={5} className="empty">選択肢がありません（既定値が使用されます）</td></tr>}
            {list.map((o, i) => (
              <tr key={o.id} style={{ opacity: o.isActive ? 1 : 0.5 }}>
                <td>
                  <button className="btn sm" disabled={i === 0}
                    onClick={() => { const p = list[i - 1]; call(`/api/v1/admin/masters/${o.id}`, "PATCH", { sortOrder: p.sortOrder }); call(`/api/v1/admin/masters/${p.id}`, "PATCH", { sortOrder: o.sortOrder }); }}>↑</button>
                </td>
                <td>
                  {editId === o.id ? (
                    <form style={{ display: "flex", gap: 6 }} onSubmit={(e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(new FormData(e.currentTarget).entries());
                      call(`/api/v1/admin/masters/${o.id}`, "PATCH", { label: f.label }).then((ok) => ok && setEditId(null));
                    }}>
                      <input className="form-input" style={{ padding: "4px 8px" }} name="label" defaultValue={o.label} required />
                      <button className="btn sm primary">保存</button>
                      <button type="button" className="btn sm" onClick={() => setEditId(null)}>×</button>
                    </form>
                  ) : <b>{o.label}</b>}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{o.value}</td>
                <td><span className={`pill ${o.isActive ? "green" : "gray"}`}>{o.isActive ? "有効" : "無効"}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {editId !== o.id && <button className="btn sm" onClick={() => setEditId(o.id)}>名称変更</button>}{" "}
                  <button className="btn sm" onClick={() => call(`/api/v1/admin/masters/${o.id}`, "PATCH", { isActive: !o.isActive })}>
                    {o.isActive ? "無効化" : "有効化"}
                  </button>{" "}
                  <button className="btn sm" onClick={() => {
                    if (confirm(`「${o.label}」を削除しますか？（過去データの表示は内部値のまま残ります）`)) call(`/api/v1/admin/masters/${o.id}`, "DELETE");
                  }}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8 }}>
        ※ 案件種別・間柄・部門の選択肢は各画面のプルダウンに反映されます。消すのは簡単なので多めに登録しておくのがおすすめです。無効化すると新規選択できなくなりますが、過去データはそのまま表示されます。
      </p>
    </>
  );
}
