"use client";
// 🛍 カタログ品目の管理（式場品目・業者ごとの品目のCRUD＋画像アップロード）
// スタッフ（プランナー以上）が管理画面（カタログ管理・設定）で利用
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type VendorCatalogItem = {
  id: string; category: string; name: string; desc: string | null; price: number;
  isActive: boolean; imageId: string | null;
};

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function VendorCatalog({
  vendorId, items, categories, title = "🛍 自社カタログ（お客様の見積に載る商品）",
}: {
  vendorId: string | null; // null=式場（自社）品目
  items: VendorCatalogItem[];
  categories: [string, string][];
  title?: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const catLabel = (c: string) => categories.find(([v]) => v === c)?.[1] ?? "その他";

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
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
    const ok = await call("/api/v1/catalog", "POST", {
      name: f.name, category: f.category, price: Number(f.price) || 0, desc: f.desc || undefined,
      vendorId: vendorId ?? undefined,
    });
    if (ok) form.reset();
    setBusy(false);
  }

  // このカタログ（表示中の品目）をまとめて全削除（写真も一緒に消える）
  async function deleteAll() {
    if (items.length === 0) return;
    if (!confirm(`「${title.replace(/^[^ 　]+ /, "")}」の${items.length}品目をすべて削除しますか？\nこの操作は元に戻せません（写真も削除されます）。`)) return;
    setBusy(true);
    await call("/api/v1/catalog", "POST", { bulkDelete: true, ids: items.map((i) => i.id) });
    setBusy(false);
  }

  async function uploadImage(itemId: string, file: File) {
    setErr("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v1/catalog/${itemId}/image`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? "画像のアップロードに失敗しました"); return; }
    router.refresh();
  }

  return (
    <>
      <div className="section-h" style={{ margin: "20px 0 10px", alignItems: "center", gap: 8 }}>
        <h2 style={{ fontSize: 16 }}>{title}</h2>
        <span className="pill gray">{items.length}品目</span>
        <div style={{ flex: 1 }} />
        {items.length > 0 && (
          <button className="btn sm" style={{ color: "var(--red)" }} disabled={busy} onClick={deleteAll}
            title="このカタログの品目をすべて削除します（写真も削除されます）">🗑 すべて削除</button>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", margin: "0 0 10px" }}>
        ここに登録した商品は、お客様・プランナーの「カタログ」タブに表示され、選ぶだけで見積（定価）に反映されます。
        価格は<b>定価</b>を入力してください（値引きはプランナーが見積上で行います）。出店は1カテゴリ最大3店舗です。
      </p>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      <form className="card" style={{ padding: 14, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} onSubmit={add}>
        <select className="form-input" style={{ width: 130 }} name="category" defaultValue={categories[0]?.[0] ?? "other"}>
          {categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="form-input" style={{ flex: 2, minWidth: 160 }} name="name" placeholder="品目名（例：Aライン ドレス「クレール」）" required />
        <input className="form-input" style={{ width: 120 }} name="price" type="number" min={0} placeholder="定価（円）" required />
        <input className="form-input" style={{ flex: 3, minWidth: 200 }} name="desc" placeholder="説明（任意。素材・サイズ・含まれる内容など）" />
        <button className="btn primary" disabled={busy}>＋ 追加</button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 620 }}>
          <thead><tr><th style={{ width: 70 }}>写真</th><th style={{ width: 110 }}>カテゴリ</th><th>品目</th><th style={{ width: 110 }}>定価</th><th style={{ width: 80 }}>公開</th><th style={{ width: 210 }}>操作</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="empty">品目がまだありません。上のフォームから追加してください</td></tr>}
            {items.map((i) => (
              <tr key={i.id} style={i.isActive ? {} : { opacity: 0.55 }}>
                <td>
                  {i.imageId
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`/api/v1/attachments/${i.imageId}`} alt="" title="クリックで拡大"
                        onClick={() => window.open(`/api/v1/attachments/${i.imageId}`, "_blank")}
                        style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 6, cursor: "zoom-in" }} />
                    : <span style={{ fontSize: 18 }}>🛍</span>}
                </td>
                {editId === i.id ? (
                  <td colSpan={3}>
                    <form style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onSubmit={(e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(new FormData(e.currentTarget).entries());
                      call(`/api/v1/catalog/${i.id}`, "PATCH", {
                        name: f.name, category: f.category, price: Number(f.price) || 0, desc: f.desc ?? "",
                      }).then((ok) => ok && setEditId(null));
                    }}>
                      <select className="form-input" style={{ padding: "4px 8px", width: 110 }} name="category" defaultValue={i.category}>
                        {categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <input className="form-input" style={{ padding: "4px 8px", flex: 1, minWidth: 140 }} name="name" defaultValue={i.name} required />
                      <input className="form-input" style={{ padding: "4px 8px", width: 100 }} name="price" type="number" min={0} defaultValue={i.price} required />
                      <input className="form-input" style={{ padding: "4px 8px", flex: 2, minWidth: 160 }} name="desc" defaultValue={i.desc ?? ""} placeholder="説明" />
                      <button className="btn sm primary">保存</button>
                      <button type="button" className="btn sm" onClick={() => setEditId(null)}>×</button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td><span className="pill blue">{catLabel(i.category)}</span></td>
                    <td><b>{i.name}</b>{i.desc && <div style={{ fontSize: 11, color: "var(--text3)" }}>{i.desc}</div>}</td>
                    <td><b>{yen(i.price)}</b></td>
                  </>
                )}
                <td>
                  <button className="btn sm" title={i.isActive ? "カタログから一時的に非表示にします" : "カタログに表示します"}
                    onClick={() => call(`/api/v1/catalog/${i.id}`, "PATCH", { isActive: !i.isActive })}>
                    {i.isActive ? "公開中" : "非公開"}
                  </button>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <input ref={(el) => { fileRefs.current[i.id] = el; }} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(i.id, f); e.target.value = ""; }} />
                  <button className="btn sm" onClick={() => fileRefs.current[i.id]?.click()}>📷 写真</button>{" "}
                  {editId !== i.id && <button className="btn sm" onClick={() => setEditId(i.id)}>編集</button>}{" "}
                  <button className="btn sm" onClick={() => {
                    if (confirm(`「${i.name}」を削除しますか？`)) call(`/api/v1/catalog/${i.id}`, "DELETE");
                  }}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
