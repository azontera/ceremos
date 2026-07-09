"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { scaleQuoteItems } from "@/lib/pack-scaling";

type Item = { id?: string; name: string; category: string; qty: number; unitPrice: number; vendorId?: string | null; perGuest?: number | boolean };
type Quote = {
  id: string; version: number; status: string; total: number; note: string | null;
  createdAt: string; items: Item[];
};

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "下書き", cls: "gray" },
  confirmed: { label: "新郎新婦 確認済", cls: "amber" },
  approved: { label: "承認済", cls: "green" },
  archived: { label: "アーカイブ", cls: "gray" },
};
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// 部門（カテゴリ）定義 — この順で表示
export const QUOTE_CATEGORIES: [string, string][] = [
  ["ceremony", "挙式"], ["venue", "会場"], ["catering", "料理・飲物"],
  ["florist", "装花"], ["dress", "衣装"], ["beauty", "美容"],
  ["photo", "写真"], ["video", "映像"], ["mc", "司会"], ["audio", "音響・照明"],
  ["print", "ペーパーアイテム"], ["gift", "引出物"], ["service", "サービス"],
  ["discount", "値引・特典"], ["other", "その他"],
];
export function QuotesPanel({
  caseId, quotes, canEdit, canApprove, vendors = [], categories, guestCount = 0,
}: {
  caseId: string; quotes: Quote[]; canEdit: boolean; canApprove: boolean;
  vendors?: { id: string; name: string }[];
  categories?: [string, string][]; // 部門マスタ（未指定は既定値）
  guestCount?: number; // 案件の予定人数（テンプレ選択時に「× ◯名」品目の数量を自動調整）
}) {
  const CATS = categories && categories.length > 0 ? categories : QUOTE_CATEGORIES;
  const catLabel = (c: string) => CATS.find(([v]) => v === c)?.[1] ?? "その他";
  const catOrder = (c: string) => {
    const i = CATS.findIndex(([v]) => v === c);
    return i === -1 ? 99 : i;
  };
  function groupByCat<T extends { category: string }>(items: T[]) {
    const map = new Map<string, T[]>();
    for (const it of [...items].sort((a, b) => catOrder(a.category) - catOrder(b.category))) {
      map.set(it.category, [...(map.get(it.category) ?? []), it]);
    }
    return [...map.entries()];
  }
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // 編集対象の見積ID（下書きをその場で編集する場合のみセット。null＝新規バージョン作成）
  const [editQuoteId, setEditQuoteId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  // 編集中の「元に戻す」履歴（保存前のローカル変更）
  const historyRef = useRef<Item[][]>([]);
  const lastPushRef = useRef(0);
  const [undoCount, setUndoCount] = useState(0);
  function mutateItems(fn: (arr: Item[]) => Item[]) {
    setItems((arr) => {
      // 連続タイピングは800msごとに1スナップショットへまとめる
      if (Date.now() - lastPushRef.current > 800) {
        historyRef.current = [...historyRef.current.slice(-29), arr.map((x) => ({ ...x }))];
        lastPushRef.current = Date.now();
        setUndoCount(historyRef.current.length);
      }
      return fn(arr);
    });
  }
  function undoItems() {
    const snap = historyRef.current.pop();
    setUndoCount(historyRef.current.length);
    if (snap) setItems(snap);
  }
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tplChoices, setTplChoices] = useState<{ id: string; name: string; items: Item[]; packId?: string; category?: string }[] | null>(null);
  // ウィザード：ステップ1で種別（ブライダル／宴会）を選び、ステップ2でプランを選ぶ
  const [wizCat, setWizCat] = useState<"" | "bridal" | "banquet" | "other">("");
  // 🎯 ヒヤリングシートの回答から推奨されるテンプレ（回答があるときのみ）
  const [rec, setRec] = useState<{ templateId: string; templateName: string; reasons: string[] } | null>(null);
  // 📥 この案件の内容をテンプレート一式として保存
  const [savingTpl, setSavingTpl] = useState(false);
  const [saveTplMsg, setSaveTplMsg] = useState("");
  async function saveAsTemplate() {
    const name = prompt("テンプレート名を入力してください（例：ガーデン挙式×ビュッフェ 60名プラン）");
    if (!name?.trim()) return;
    const category = (prompt("種別を入力（bridal=ブライダル／banquet=宴会／other=その他）", "bridal") ?? "other").trim();
    setSavingTpl(true); setSaveTplMsg("");
    const res = await fetch(`/api/v1/cases/${caseId}/save-as-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), category }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingTpl(false);
    setSaveTplMsg(res.ok ? `✅「${data.name}」としてテンプレートに保存しました（管理→テンプレートで確認できます）` : `⚠ ${data.error ?? "保存に失敗しました"}`);
  }

  const latest = quotes[0];
  const prev = quotes[1];

  // 適用したテンプレ名（保存時にサーバーへ渡し、料理・席次・リソース・進行表の自動生成に使う）
  const [tplName, setTplName] = useState("");
  // テンプレ一式（pack）を選んだ場合のID：保存時に料理・進行・リソースまでパック内容で自動生成
  const [packId, setPackId] = useState("");
  // 進行表テンプレ（見積のときに一緒に選ぶ。「自動」は見積テンプレ名から推定）
  const [rundownTpls, setRundownTpls] = useState<{ id: string; name: string }[]>([]);
  const [rundownTplId, setRundownTplId] = useState("");

  function startEdit(q: Quote) {
    setErr("");
    setEditQuoteId(q.id);
    setNote(q.note ?? "");
    setItems(q.items.map((i) => ({ ...i })));
    historyRef.current = []; setUndoCount(0);
    setEditing(true);
  }

  async function startNew() {
    setNote("");
    setErr("");
    setEditQuoteId(null);
    setTplName("");
    setPackId("");
    setRundownTplId("");
    setWizCat("");
    // 進行表テンプレ一覧（見積と同時に選べる）
    fetch("/api/v1/templates?type=rundown").then((r) => r.json()).then((d) => {
      setRundownTpls((d.templates ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
    }).catch(() => {});
    // 🎯 ヒヤリングシートからのおすすめプラン
    setRec(null);
    fetch(`/api/v1/cases/${caseId}/quote-recommendation`).then((r) => r.json()).then((d) => {
      if (d.recommendation) setRec(d.recommendation);
    }).catch(() => {});
    historyRef.current = []; setUndoCount(0);
    // 毎回テンプレートを選択可能（初回・2回目以降とも：前バージョン引き継ぎ／テンプレ／白紙）
    let parsed: { id: string; name: string; items: Item[]; packId?: string; category?: string }[] = [];
    // ① テンプレ一式（pack）：見積＋料理＋進行＋リソースまで自動セットアップされる
    try {
      const res = await fetch("/api/v1/templates?type=pack");
      if (res.ok) {
        const { templates } = await res.json();
        for (const t of templates ?? []) {
          try {
            const body = JSON.parse(t.bodyJson ?? "{}");
            const qi = body.quote?.items;
            if (!Array.isArray(qi) || qi.length === 0) continue;
            parsed.push({
              id: t.id, packId: t.id, name: t.name, category: body.category ?? "other",
              items: qi.map((i: Item) => ({
                name: i.name, category: i.category ?? "other",
                qty: Number(i.qty ?? 1), unitPrice: Number(i.unitPrice ?? 0),
                perGuest: i.perGuest, // 人数連動（選択時に案件人数で数量を自動調整）
              })),
            });
          } catch { /* skip */ }
        }
      }
    } catch { /* テンプレなしでも続行 */ }
    // ② 旧形式の見積テンプレ（残っていれば）
    try {
      const res = await fetch("/api/v1/templates?type=quote");
      if (res.ok) {
        const { templates } = await res.json();
        for (const t of templates ?? []) {
          try {
            const body = JSON.parse(t.bodyJson ?? "{}");
            if (!Array.isArray(body.items) || body.items.length === 0) continue;
            parsed.push({
              id: t.id, name: t.name,
              items: body.items.map((i: Item) => ({
                name: i.name, category: i.category ?? "other",
                qty: Number(i.qty ?? 1), unitPrice: Number(i.unitPrice ?? 0),
              })),
            });
          } catch { /* skip */ }
        }
      }
    } catch { /* テンプレなしでも続行 */ }
    if (latest || parsed.length > 0) { setTplChoices(parsed); return; }
    setItems([{ name: "", category: "other", qty: 1, unitPrice: 0 }]);
    setEditing(true);
  }
  function setItem(idx: number, patch: Partial<Item>) {
    mutateItems((arr) => arr.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }
  const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);

  async function save() {
    setBusy(true); setErr("");
    const res = editQuoteId
      ? await fetch(`/api/v1/quotes/${editQuoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: items.filter((i) => i.name.trim()), note }),
        })
      : await fetch(`/api/v1/cases/${caseId}/quotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: items.filter((i) => i.name.trim()), note, templateName: tplName, packId, rundownTemplateId: rundownTplId }),
        });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setEditing(false);
      setEditQuoteId(null);
      if (data.autoSetup?.length) {
        alert(`✨ テンプレに合わせて自動セットアップしました：\n・${data.autoSetup.join("\n・")}`);
      }
      router.refresh();
    }
    else setErr(data.error ?? `保存に失敗しました（HTTP ${res.status}）`);
    setBusy(false);
  }

  async function setStatus(quoteId: string, status: string) {
    setErr("");
    const res = await fetch(`/api/v1/quotes/${quoteId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) router.refresh();
    else setErr(data.error ?? `変更に失敗しました（HTTP ${res.status}）`);
  }

  // 差分（最新 vs 1つ前）
  const diff: { label: string; delta: number }[] = [];
  if (latest && prev) {
    const key = (i: Item) => i.name;
    const prevMap = new Map(prev.items.map((i) => [key(i), i.qty * i.unitPrice]));
    const curMap = new Map(latest.items.map((i) => [key(i), i.qty * i.unitPrice]));
    for (const [k, v] of curMap) {
      const pv = prevMap.get(k);
      if (pv === undefined) diff.push({ label: `${k}（追加）`, delta: v });
      else if (pv !== v) diff.push({ label: k, delta: v - pv });
    }
    for (const [k, pv] of prevMap) {
      if (!curMap.has(k)) diff.push({ label: `${k}（削除）`, delta: -pv });
    }
  }

  return (
    <>
      <div className="section-h" style={{ margin: "0 0 14px" }}>
        <span className="pill gray">{quotes.length} バージョン</span>
        <div style={{ flex: 1 }} />
        <a className="btn" href={`/print/${caseId}/quote`} target="_blank">🖨 見積書</a>
        <a className="btn" href={`/print/${caseId}/quote_a3`} target="_blank" title="部門ブロックを段組みで一覧（A3横）">🖨 A3横一覧</a>
        {canEdit && !editing && <button className="btn primary" onClick={startNew}>＋ 新規</button>}
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* 見積作成ウィザード：①種別 → ②プラン選択（テンプレを選ぶと料理・席次・リソース・進行表まで自動セットアップ） */}
      {tplChoices && (() => {
        const isBridal = (t: { name: string; category?: string }) => t.category === "bridal" || t.name.startsWith("ブライダル");
        const isBanquet = (t: { name: string; category?: string }) => t.category === "banquet" || t.name.startsWith("宴会");
        const bridal = tplChoices.filter(isBridal);
        const banquet = tplChoices.filter((t) => !isBridal(t) && isBanquet(t));
        const other = tplChoices.filter((t) => !isBridal(t) && !isBanquet(t));
        const list = wizCat === "bridal" ? bridal : wizCat === "banquet" ? banquet : other;
        // テンプレ名「ブライダル④（ガーデンウェディング・60名 約390万）」→ プラン名と内訳に分解
        const parseName = (n: string) => {
          const m = n.match(/^(ブライダル|宴会)([①-⑮]?)（(.+)）$/);
          if (!m) return { no: "", plan: n, spec: "" };
          const parts = m[3].split("・");
          const spec = parts.length > 1 ? parts.slice(-2).join("・") : "";
          const plan = parts.length > 2 ? parts.slice(0, -2).join("・") : parts[0];
          return { no: m[2], plan, spec };
        };
        return (
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            {wizCat === "" ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Ver.{(latest?.version ?? 0) + 1} を作成 — どのプランから始めますか？</div>
                <div style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 12 }}>
                  テンプレートを選ぶと、料理メニュー・席次レイアウト・リソース・進行表（司会台本・楽曲つき）まで自動でセットアップされます
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
                  {/* 🎯 ヒヤリングシートの回答から自動選択されたおすすめプラン */}
                  {rec && (() => {
                    const t = tplChoices.find((x) => x.id === rec.templateId);
                    if (!t) return null;
                    const { no, plan, spec } = parseName(t.name);
                    return (
                      <button className="card" style={{ padding: 16, textAlign: "left", cursor: "pointer", border: "2px solid var(--accent)", background: "var(--surface2)" }}
                        title={rec.reasons.join("／")}
                        onClick={() => { setItems(scaleQuoteItems(t.items.map((i) => ({ ...i })), guestCount)); setTplName(t.name); setPackId(t.packId ?? ""); setTplChoices(null); setEditing(true); }}>
                        <b style={{ fontSize: 14 }}>🎯 ヒヤリングからのおすすめ</b>
                        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 5 }}>{no && <span style={{ color: "var(--accent-text)", marginRight: 4 }}>{no}</span>}{plan}{spec ? `（${spec}）` : ""}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, lineHeight: 1.7 }}>
                          {rec.reasons.slice(0, 3).map((x, i) => <div key={i}>・{x}</div>)}
                          {rec.reasons.length === 0 && "お客様のヒヤリング回答に基づく推奨です"}
                        </div>
                      </button>
                    );
                  })()}
                  {latest && (
                    <button className="card" style={{ padding: 16, textAlign: "left", cursor: "pointer", border: "1.5px solid var(--accent)" }}
                      onClick={() => { setItems(latest.items.map((i) => ({ ...i }))); setTplChoices(null); setEditing(true); }}>
                      <b style={{ fontSize: 14 }}>📋 前バージョンを引き継ぐ</b>
                      <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 5 }}>
                        Ver.{latest.version} の明細（{latest.items.length}品目・{yen(latest.total)}）をコピーして編集
                      </div>
                    </button>
                  )}
                  {bridal.length > 0 && (
                    <button className="card" style={{ padding: 16, textAlign: "left", cursor: "pointer" }} onClick={() => setWizCat("bridal")}>
                      <b style={{ fontSize: 14 }}>💒 ブライダル</b>
                      <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 5 }}>
                        挙式＋披露宴のプラン {bridal.length}種（ガーデン・ナイト・和婚・少人数 など）
                      </div>
                    </button>
                  )}
                  {banquet.length > 0 && (
                    <button className="card" style={{ padding: 16, textAlign: "left", cursor: "pointer" }} onClick={() => setWizCat("banquet")}>
                      <b style={{ fontSize: 14 }}>🥂 宴会・イベント</b>
                      <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 5 }}>
                        宴会・式典・ディナーショーのプラン {banquet.length}種
                      </div>
                    </button>
                  )}
                  {other.length > 0 && (
                    <button className="card" style={{ padding: 16, textAlign: "left", cursor: "pointer" }} onClick={() => setWizCat("other")}>
                      <b style={{ fontSize: 14 }}>🗂 マイテンプレ・その他</b>
                      <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 5 }}>{other.length}種</div>
                    </button>
                  )}
                  <button className="card" style={{ padding: 16, textAlign: "left", cursor: "pointer" }}
                    onClick={() => { setItems([{ name: "", category: "other", qty: 1, unitPrice: 0 }]); setTplChoices(null); setEditing(true); }}>
                    <b style={{ fontSize: 14 }}>✏️ 白紙から作成</b>
                    <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 5 }}>テンプレートを使わず自由に作成</div>
                  </button>
                </div>
                <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setTplChoices(null)}>キャンセル</button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <button className="btn sm" onClick={() => setWizCat("")}>← 戻る</button>
                  <b>{wizCat === "bridal" ? "💒 ブライダルプランを選択" : wizCat === "banquet" ? "🥂 宴会・イベントプランを選択" : "🗂 テンプレートを選択"}</b>
                  <span style={{ fontSize: 11.5, color: "var(--text3)" }}>選んだ後に品目・数量・金額は自由に調整できます</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 10 }}>
                  {list.map((t) => {
                    const total = t.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
                    const { no, plan, spec } = parseName(t.name);
                    return (
                      <button key={t.id} className="card"
                        style={{ padding: 15, textAlign: "left", cursor: "pointer", ...(rec?.templateId === t.id ? { border: "2px solid var(--accent)" } : {}) }}
                        onClick={() => { setItems(scaleQuoteItems(t.items.map((i) => ({ ...i })), guestCount)); setTplName(t.name); setPackId(t.packId ?? ""); setTplChoices(null); setEditing(true); }}>
                        <b style={{ fontSize: 13.5 }}>{rec?.templateId === t.id && <span title={rec.reasons.join("／")}>🎯 </span>}{t.packId && <span title="テンプレ一式（料理・進行・リソースまで自動セットアップ）">📦 </span>}{no && <span style={{ color: "var(--accent-text)", marginRight: 4 }}>{no}</span>}{plan}</b>
                        <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {spec && <span className="pill gray" style={{ fontSize: 10.5 }}>{spec}</span>}
                          <span>{t.items.length}品目</span>
                          <b style={{ color: "var(--text2)" }}>{yen(total)}</b>
                        </div>
                      </button>
                    );
                  })}
                  {list.length === 0 && <div className="empty">この種別のテンプレートはありません</div>}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {editing && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            {editQuoteId
              ? `Ver.${quotes.find((q) => q.id === editQuoteId)?.version ?? ""} を編集（下書きのため、そのまま上書き保存されます）`
              : `Ver.${(latest?.version ?? 0) + 1} を作成（前バージョンの明細を引き継ぎ・部門ごとに編集）`}
          </div>
          {tplName && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: "8px 12px", background: "var(--surface2)", borderRadius: 10, fontSize: 12.5 }}>
              <span>✨ 保存時に自動セットアップ：料理・席次・リソース（設備/備品）・手配リスト＋</span>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 700 }}>
                📋 進行表テンプレ
                <select className="form-input" style={{ padding: "5px 8px", fontSize: 12, maxWidth: 280 }}
                  value={rundownTplId} onChange={(e) => setRundownTplId(e.target.value)}>
                  <option value="">自動（見積テンプレから推定）</option>
                  {rundownTpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <span style={{ color: "var(--text3)" }}>楽曲は全シーンONで作成されます</span>
            </div>
          )}
          <div className="tbl-scroll">
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead><tr><th style={{ width: 116 }}>部門</th><th style={{ width: "30%" }}>品目</th><th>数量</th><th>単価</th><th>小計</th><th style={{ width: 120 }}>発注先</th><th /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-input" style={{ padding: "6px 8px" }} value={it.category}
                      onChange={(e) => setItem(i, { category: e.target.value })}>
                      {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td><input className="form-input" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} /></td>
                  <td><input className="form-input" type="number" style={{ width: 70 }} value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} /></td>
                  <td><input className="form-input" type="number" style={{ width: 110 }} value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>{yen((it.qty || 0) * (it.unitPrice || 0))}</td>
                  <td>
                    <select className="form-input" style={{ padding: "6px 8px" }} value={it.vendorId ?? ""}
                      title="発注先を設定すると、見積承認時に発注書が自動作成されます"
                      onChange={(e) => setItem(i, { vendorId: e.target.value || null })}>
                      <option value="">自社</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </td>
                  <td><button className="btn sm" onClick={() => mutateItems((a) => a.filter((_, j) => j !== i))}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {/* 部門別小計（編集中のリアルタイム集計） */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {groupByCat(items.filter((i) => i.name.trim())).map(([cat, arr]) => (
              <span key={cat} className="pill gray">
                {catLabel(cat)}：{yen(arr.reduce((s, i) => s + (i.qty || 0) * (i.unitPrice || 0), 0))}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <button className="btn sm" onClick={() => mutateItems((a) => [...a, { name: "", category: "other", qty: 1, unitPrice: 0 }])}>＋ 行を追加</button>
            <button className="btn sm" onClick={undoItems} disabled={undoCount === 0}
              title="直前の明細変更を取り消します（保存前）">↩ 元に戻す{undoCount > 0 ? `（${undoCount}）` : ""}</button>
            <input className="form-input" style={{ flex: 1 }} placeholder="変更メモ（例：お子様料理2名追加）" value={note} onChange={(e) => setNote(e.target.value)} />
            <b style={{ whiteSpace: "nowrap" }}>合計 {yen(total)}</b>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? "保存中…" : "保存"}</button>
            <button className="btn" onClick={() => { setEditing(false); setEditQuoteId(null); }}>キャンセル</button>
          </div>
        </div>
      )}

      {saveTplMsg && <div className="card" style={{ padding: "8px 14px", marginBottom: 10, fontSize: 12.5 }}>{saveTplMsg}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>Ver</th><th>作成日</th><th>合計（税込）</th><th>変更メモ</th><th>ステータス</th><th>操作</th></tr></thead>
          <tbody>
            {quotes.length === 0 && <tr><td colSpan={6} className="empty">見積はまだありません</td></tr>}
            {quotes.map((q) => {
              const st = STATUS[q.status] ?? { label: q.status, cls: "gray" };
              return (
                <tr key={q.id}>
                  <td><b>Ver.{q.version}</b></td>
                  <td>{new Date(q.createdAt).toLocaleDateString("ja-JP")}</td>
                  <td><b>{yen(q.total)}</b></td>
                  <td>{q.note ?? "—"}</td>
                  <td><span className={`pill ${st.cls}`}>{st.label}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canEdit && q.status === "draft" && !editing && (
                      <button className="btn sm" onClick={() => startEdit(q)}>編集</button>
                    )}{" "}
                    {/* 確認済・承認済は履歴保護のため直接編集できない → この内容を引き継いだ新バージョンをすぐ編集できる */}
                    {canEdit && ["confirmed", "approved"].includes(q.status) && !editing && (
                      <button className="btn sm" title="この内容を引き継いで、新しいバージョン（下書き）として編集します"
                        onClick={() => {
                          setErr(""); setEditQuoteId(null); setNote("");
                          setItems(q.items.map((i) => ({ ...i })));
                          setTplName(""); setPackId(""); setRundownTplId("");
                          historyRef.current = []; setUndoCount(0);
                          setTplChoices(null); setEditing(true);
                        }}>✏ 編集（新Ver作成）</button>
                    )}{" "}
                    {canEdit && q.status === "draft" && (
                      <button className="btn sm" onClick={() => setStatus(q.id, "confirmed")}>確認済にする</button>
                    )}
                    {q.status === "confirmed" && (
                      canApprove
                        ? <button className="btn sm primary" onClick={() => setStatus(q.id, "approved")}>承認する</button>
                        : <span className="pill amber">支配人の承認待ち</span>
                    )}
                    {q.status === "approved" && canApprove && (
                      <button className="btn sm" title="承認を取り消して「新郎新婦確認済」に差し戻します"
                        onClick={() => { if (confirm(`Ver.${q.version} の承認を取り消しますか？`)) setStatus(q.id, "confirmed"); }}>承認を取り消す</button>
                    )}{" "}
                    {canEdit && ["confirmed", "approved"].includes(q.status) && q.id === latest?.id && (
                      <button className="btn sm" disabled={savingTpl} title="この案件の見積・料理・進行表・リソースをテンプレート一式として登録します"
                        onClick={saveAsTemplate}>{savingTpl ? "保存中…" : "📥 テンプレとして保存"}</button>
                    )}
                    {canEdit && q.status === "archived" && (
                      <button className="btn sm" onClick={() => setStatus(q.id, "draft")}>下書きに戻す</button>
                    )}{" "}
                    {canEdit && q.status !== "approved" && (
                      <button className="btn sm" onClick={async () => {
                        if (!confirm(`Ver.${q.version}（${yen(q.total)}）を削除しますか？この操作は取り消せません`)) return;
                        const res = await fetch(`/api/v1/quotes/${q.id}`, { method: "DELETE" });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok) router.refresh();
                        else setErr(data.error ?? `削除に失敗しました（HTTP ${res.status}）`);
                      }}>削除</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 最新版の部門別内訳 */}
      {latest && latest.items.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h">Ver.{latest.version} 部門別内訳<span className="pill gray">{yen(latest.total)}</span></div>
          <div className="card-b">
            {groupByCat(latest.items).map(([cat, arr]) => {
              const sub = arr.reduce((s, i) => s + i.qty * i.unitPrice, 0);
              return (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", padding: "4px 0", fontWeight: 700, fontSize: 12.5 }}>
                    <span style={{ color: "var(--accent-text)" }}>{catLabel(cat)}</span>
                    <span>{yen(sub)}</span>
                  </div>
                  {arr.map((i, k) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0 3px 12px", color: "var(--text2)" }}>
                      <span>{i.name}{i.qty > 1 ? `（${i.qty} × ${yen(i.unitPrice)}）` : ""}</span>
                      <span>{yen(i.qty * i.unitPrice)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {diff.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h">Ver.{prev!.version} → Ver.{latest!.version} 差分</div>
          <div className="card-b">
            {diff.map((d, i) => (
              <div className="list-row" key={i}>
                <div className="t"><b>{d.label}</b></div>
                <span style={{ fontWeight: 700, color: d.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                  {d.delta >= 0 ? "+" : "−"}{yen(Math.abs(d.delta))}
                </span>
              </div>
            ))}
            <div className="list-row">
              <div className="t"><b>合計差額</b></div>
              <b>{latest!.total >= prev!.total ? "+" : "−"}{yen(Math.abs(latest!.total - prev!.total))}</b>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
