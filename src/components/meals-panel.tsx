"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Req = { id: string; guestLabel: string; type: string; detail: string };
type MenuItem = { id: string; course: string; name: string; desc: string | null; cost: number; price: number };
const TYPES: Record<string, { label: string; cls: string }> = {
  allergy: { label: "アレルギー", cls: "red" },
  religion: { label: "宗教対応", cls: "amber" },
  kids: { label: "お子様", cls: "blue" },
  dislike: { label: "苦手食材", cls: "gray" },
};

// コースの並び順（お品書き印刷もこの順）
export const COURSES = ["コース料理", "乾杯酒", "アミューズ", "前菜", "スープ", "魚料理", "お口直し", "肉料理", "デザート", "ドリンク", "パン・飲物", "その他"];

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function MealsPanel({
  caseId, reqs, canEdit, menuItems = [],
}: { caseId: string; reqs: Req[]; canEdit: boolean; menuItems?: MenuItem[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries());
    const res = await fetch(`/api/v1/cases/${caseId}/meal-requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { form.reset(); router.refresh(); }
    else setErr(data.error ?? `追加に失敗しました（HTTP ${res.status}）`);
    setBusy(false);
  }

  async function del(id: string) {
    await fetch(`/api/v1/cases/${caseId}/meal-requirements?reqId=${id}`, { method: "DELETE" });
    router.refresh();
  }

  // ===== コースメニュー（原価・売値） =====
  async function menuOp(body: Record<string, unknown>) {
    setErr("");
    const res = await fetch(`/api/v1/cases/${caseId}/menu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? "メニューの操作に失敗しました"); return false; }
    router.refresh();
    return true;
  }

  async function addMenu(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries());
    if (await menuOp({ op: "add", ...f })) form.reset();
  }

  // ===== 料理プラン＝カタログ（見積・カタログページと同じCatalogItemデータ）から選ぶ =====
  // カタログの「料理・飲物」品目（コース/ドリンク/その他）が唯一のデータベース。
  // カタログの価格＝見積・カタログページの価格と常に同一（別データを持たないため同期ズレが起きない）
  // 適用は「クリアして上書き」：既存メニューを全削除してからプラン内容で作成
  const isCourse = (n: string) => /コース|ビュッフェ|会席|懐石/.test(n);
  const isDrink = (n: string) => /ドリンク|飲み放題|乾杯酒?|シャンパン(?!.*ケーキ)/.test(n);
  type MealPlan = { id: string; kind: string; name: string; desc: string; items: { course: string; name: string; desc?: string; cost: number; price: number }[] };
  const [plans, setPlans] = useState<MealPlan[] | null>(null);
  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/v1/catalog?category=catering").then((r) => r.json()).then((d) => {
      type CatItem = { id: string; name: string; desc: string | null; price: number; vendorName: string | null };
      const list: MealPlan[] = (d.items ?? []).map((i: CatItem) => ({
        id: i.id, name: i.name, desc: i.vendorName ? `${i.vendorName}` : "",
        kind: isCourse(i.name) ? "course" : isDrink(i.name) ? "drink" : "other",
        items: [{ course: isCourse(i.name) ? "コース料理" : isDrink(i.name) ? "ドリンク" : "その他", name: i.name, desc: i.desc ?? undefined, cost: 0, price: i.price }],
      }));
      setPlans(list);
    }).catch(() => setPlans([]));
  }, [canEdit]);
  const PLAN_KINDS: [string, string][] = [["course", "🍽 お料理コース"], ["drink", "🥂 お飲み物"], ["other", "🗂 その他"]];
  const [tplId, setTplId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [tplBusy, setTplBusy] = useState(false);
  const tpl = tplId ? (plans ?? []).find((p) => p.id === tplId) : undefined;

  function pickTemplate(id: string) {
    const t = (plans ?? []).find((p) => p.id === id);
    setTplId(id);
    setChecked(new Set(t ? t.items.map((_, i) => i) : []));
  }
  function toggleItem(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }
  async function applyTemplate() {
    if (!tpl) return;
    const items = tpl.items.filter((_, i) => checked.has(i));
    if (items.length === 0) return;
    if (menuItems.length > 0 && !confirm(`現在のメニュー（${menuItems.length}品）をすべて削除して、「${tpl.name}」で上書きします。よろしいですか？`)) return;
    setTplBusy(true);
    const ok = await menuOp({ op: "replaceItems", items, planName: tpl.name });
    setTplBusy(false);
    if (ok) { setTplId(null); setChecked(new Set()); }
  }

  const counts = Object.keys(TYPES).map((t) => ({ t, n: reqs.filter((r) => r.type === t).length }));
  const courseOrder = (c: string) => { const i = COURSES.indexOf(c); return i === -1 ? 99 : i; };
  const sortedMenu = [...menuItems].sort((a, b) => courseOrder(a.course) - courseOrder(b.course));
  const totalCost = menuItems.reduce((s, m) => s + m.cost, 0);
  const totalPrice = menuItems.reduce((s, m) => s + m.price, 0);
  const rate = totalPrice > 0 ? Math.round((totalCost / totalPrice) * 100) : 0;

  return (
    <>
      <div className="section-h" style={{ margin: "0 0 14px" }}>
        {counts.filter((c) => c.n > 0).map((c) => (
          <span key={c.t} className={`pill ${TYPES[c.t].cls}`}>{TYPES[c.t].label} {c.n}名</span>
        ))}
        <div style={{ flex: 1 }} />
        <a className="btn" href={`/print/${caseId}/menu`} target="_blank">🖨 お品書き（メニュー表）</a>
        <a className="btn" href={`/print/${caseId}/meal`} target="_blank">🖨 提供表</a>
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* ===== 🍽 料理プラン（テンプレ一式の料理データ＝見積・カタログと同じ1つのデータベース） ===== */}
      {canEdit && (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>🍽 料理プランから選ぶ<span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>（カタログ＝見積・カタログページと同じ価格データ）</span></div>
          <div style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 10 }}>
            プランを選ぶと<b>現在のメニューをクリアして上書き</b>します（確認あり）。適用後は下の表で品名・価格を自由に編集・追加・削除できます。
          </div>
          {plans === null && <div style={{ fontSize: 12, color: "var(--text3)" }}>プランを読み込み中…</div>}
          {plans !== null && plans.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              料理プランはまだありません。管理→カタログ管理で「料理・飲物」品目を登録すると、ここに表示されます。
            </div>
          )}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {PLAN_KINDS.map(([kind, label]) => {
              const group = (plans ?? []).filter((t) => t.kind === kind);
              if (group.length === 0) return null;
              return (
              <div key={kind} style={{ minWidth: 220 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", marginBottom: 6 }}>{label}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {group.map((t) => {
                    const per = t.items.reduce((s, i) => s + i.price, 0);
                    return (
                      <button type="button" key={t.id} className={`pill ${tplId === t.id ? "accent" : "gray"}`}
                        style={{ cursor: "pointer", border: "none", fontSize: 12, padding: "6px 12px" }}
                        title={`${t.desc}（1名あたり ${yen(per)}）`}
                        onClick={() => pickTemplate(t.id)}>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>

          {tpl && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                <b>{tpl.name}</b>　<span style={{ color: "var(--text3)", fontSize: 11.5 }}>{tpl.desc}</span>
                　<span className="pill gray" style={{ fontSize: 11 }}>1名あたり {yen(tpl.items.filter((_, i) => checked.has(i)).reduce((s, it) => s + it.price, 0))}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 4, marginBottom: 10 }}>
                {tpl.items.map((it, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={checked.has(i)} onChange={() => toggleItem(i)} />
                    <span className="pill gray" style={{ fontSize: 10.5, padding: "2px 8px" }}>{it.course}</span>
                    <span style={{ flex: 1 }}>{it.name}</span>
                    <span style={{ color: "var(--text3)" }}>{yen(it.price)}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" disabled={tplBusy || checked.size === 0} onClick={applyTemplate}>
                  {tplBusy ? "適用中…" : menuItems.length > 0 ? `このプランで上書き（${checked.size}品）` : `このプランを適用（${checked.size}品）`}
                </button>
                <button type="button" className="btn" onClick={() => { setTplId(null); setChecked(new Set()); }}>キャンセル</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== コースメニュー（前菜〜デザート）：原価・売値 ===== */}
      <div className="card" style={{ overflowX: "auto", marginBottom: 14 }}>
        <div className="card-h">
          🍽 コースメニュー
          <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text3)", marginLeft: 10 }}>
            原価計 <b>{yen(totalCost)}</b>　売値計 <b>{yen(totalPrice)}</b>　原価率 <b style={{ color: rate > 40 ? "var(--red)" : "var(--green)" }}>{rate}%</b>（1名あたり）
          </span>
        </div>
        <table className="tbl">
          <thead><tr><th style={{ width: 110 }}>コース</th><th>品名</th><th>説明（お品書きに印刷）</th><th style={{ width: 90 }}>原価</th><th style={{ width: 90 }}>売値</th><th style={{ width: 70 }}>粗利</th>{canEdit && <th style={{ width: 60 }} />}</tr></thead>
          <tbody>
            {sortedMenu.length === 0 && <tr><td colSpan={7} className="empty">メニューはまだ登録されていません（下のフォームから追加）</td></tr>}
            {sortedMenu.map((m) => (
              <tr key={m.id}>
                <td>
                  {canEdit ? (
                    <select className="form-input" style={{ padding: "4px 6px", fontSize: 12 }} defaultValue={m.course}
                      onChange={(e) => menuOp({ op: "update", itemId: m.id, course: e.target.value })}>
                      {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : <span className="pill gray">{m.course}</span>}
                </td>
                <td>
                  <input className="form-input" style={{ width: "100%", padding: "4px 8px", fontWeight: 700 }} defaultValue={m.name} disabled={!canEdit}
                    onBlur={(e) => { if (e.target.value !== m.name && e.target.value.trim()) menuOp({ op: "update", itemId: m.id, name: e.target.value }); }} />
                </td>
                <td>
                  <input className="form-input" style={{ width: "100%", padding: "4px 8px", fontSize: 12 }} defaultValue={m.desc ?? ""} disabled={!canEdit}
                    placeholder="例：真鯛のポワレ 季節野菜を添えて"
                    onBlur={(e) => { if (e.target.value !== (m.desc ?? "")) menuOp({ op: "update", itemId: m.id, desc: e.target.value }); }} />
                </td>
                <td>
                  <input className="form-input" type="number" min={0} style={{ width: 80, padding: "4px 6px", textAlign: "right" }} defaultValue={m.cost} disabled={!canEdit}
                    onBlur={(e) => { if (Number(e.target.value) !== m.cost) menuOp({ op: "update", itemId: m.id, cost: e.target.value }); }} />
                </td>
                <td>
                  <input className="form-input" type="number" min={0} style={{ width: 80, padding: "4px 6px", textAlign: "right" }} defaultValue={m.price} disabled={!canEdit}
                    onBlur={(e) => { if (Number(e.target.value) !== m.price) menuOp({ op: "update", itemId: m.id, price: e.target.value }); }} />
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: m.price - m.cost < 0 ? "var(--red)" : undefined }}>
                  {yen(m.price - m.cost)}
                </td>
                {canEdit && (
                  <td><button className="btn sm" onClick={() => { if (confirm(`「${m.name}」を削除しますか？`)) menuOp({ op: "delete", itemId: m.id }); }}>削除</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <form style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border)" }} onSubmit={addMenu}>
            <select className="form-input" style={{ width: 120 }} name="course" defaultValue="前菜">
              {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="form-input" style={{ flex: 1.2, minWidth: 140 }} name="name" placeholder="品名（例：オマール海老のビスク）" required />
            <input className="form-input" style={{ flex: 1.4, minWidth: 160 }} name="desc" placeholder="説明（お品書きに印刷・任意）" />
            <input className="form-input" type="number" min={0} style={{ width: 90 }} name="cost" placeholder="原価" />
            <input className="form-input" type="number" min={0} style={{ width: 90 }} name="price" placeholder="売値" />
            <button className="btn primary">＋ 追加</button>
          </form>
        )}
      </div>

      {/* ===== 配慮事項（アレルギー等） ===== */}
      <div className="card" style={{ overflowX: "auto" }}>
        <div className="card-h">⚠ 配慮事項</div>
        <table className="tbl">
          <thead><tr><th>ゲスト</th><th>区分</th><th>内容</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan={4} className="empty">配慮事項はまだ登録されていません</td></tr>}
            {reqs.map((r) => (
              <tr key={r.id}>
                <td><b>{r.guestLabel}</b></td>
                <td><span className={`pill ${TYPES[r.type]?.cls ?? "gray"}`}>{TYPES[r.type]?.label ?? r.type}</span></td>
                <td>{r.detail}</td>
                {canEdit && <td><button className="btn sm" onClick={() => del(r.id)}>削除</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form className="card" style={{ padding: 16, marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} onSubmit={add}>
          <input className="form-input" style={{ width: 160 }} name="guestLabel" placeholder="ゲスト（例：新婦友人 A様）" required />
          <select className="form-input" style={{ width: 130 }} name="type">
            {Object.entries(TYPES).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
          </select>
          <input className="form-input" style={{ flex: 1, minWidth: 180 }} name="detail" placeholder="内容（例：甲殻類 — 帆立→鯛に変更）" required />
          <button className="btn primary" disabled={busy}>追加</button>
        </form>
      )}
    </>
  );
}
