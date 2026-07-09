"use client";
// 🧭 初期セットアップウィザード：①式場情報 → ②ロゴ・待機画像 → ③会場・設備マスタ → ④完了
// 途中スキップOK・何度でも起動できる（サイドバー「セットアップ」から）
import { useState } from "react";
import { useRouter } from "next/navigation";

type Venue = { id: string; name: string; type: string; capacity: number };
const VENUE_TYPES: [string, string, string][] = [
  ["banquet", "🏛", "宴会場（披露宴・パーティ会場。ガーデンもここでOK）"],
  ["chapel", "⛪", "チャペル・挙式スペース"],
  ["waiting", "🚪", "控室（新郎新婦・親族）"],
  ["kitchen", "🍳", "厨房"],
];
const TYPE_LABEL: Record<string, string> = { banquet: "宴会場", chapel: "チャペル", waiting: "控室", kitchen: "厨房", external: "外部" };

const STEPS = ["式場情報", "ロゴ・映像", "会場・設備", "完了"];

export function SetupWizard({
  initial, venues: initialVenues,
}: {
  initial: { venueName: string; venueInfo: string; bankInfo: string; logoUrl: string; hasScreenImage: boolean };
  venues: Venue[];
}) {
  const router = useRouter(); // 完了画面の遷移に使用
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // ①式場情報
  const [venueName, setVenueName] = useState(initial.venueName);
  const [venueInfo, setVenueInfo] = useState(initial.venueInfo);
  const [bankInfo, setBankInfo] = useState(initial.bankInfo);
  // ②ロゴ・待機画像
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [hasScreen, setHasScreen] = useState(initial.hasScreenImage);
  // ③会場
  const [venues, setVenues] = useState<Venue[]>(initialVenues);
  const [newType, setNewType] = useState("banquet");
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState("80");

  async function saveInfo(next = true) {
    setBusy(true); setErr("");
    const res = await fetch("/api/v1/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue_name: venueName, venue_info: venueInfo, bank_info: bankInfo }),
    });
    setBusy(false);
    if (!res.ok) { setErr("保存に失敗しました"); return; }
    if (next) setStep(1);
  }

  async function upload(kind: "logo" | "screen-image", file: File) {
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v1/admin/settings/${kind}`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "アップロードに失敗しました"); return; }
    if (kind === "logo") setLogoUrl(`${data.url}?t=${Date.now()}`);
    else setHasScreen(true);
  }

  async function addVenue() {
    if (!newName.trim()) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/v1/admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, type: newType, capacity: Number(newCap) || 0 }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "追加に失敗しました"); return; }
    setVenues((vs) => [...vs, data.venue]);
    setNewName("");
  }

  async function delVenue(id: string) {
    if (!confirm("この会場を削除しますか？")) return;
    const res = await fetch(`/api/v1/admin/venues/${id}`, { method: "DELETE" });
    if (res.ok) setVenues((vs) => vs.filter((v) => v.id !== id));
    else setErr("削除できません（使用中の会場の可能性があります）");
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="section-h">
        <h2>🧭 初期セットアップ</h2>
        <span style={{ fontSize: 12, color: "var(--text3)" }}>いつでもやり直せます（サイドバー「セットアップ」から）</span>
      </div>

      {/* ステップ表示 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {STEPS.map((label, i) => (
          <button key={label} type="button" onClick={() => setStep(i)}
            className={`pill ${i === step ? "accent" : i < step ? "green" : "gray"}`}
            style={{ cursor: "pointer", border: "none", fontSize: 12.5, padding: "6px 14px" }}>
            {i < step ? "✓" : `${i + 1}.`} {label}
          </button>
        ))}
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* ① 式場情報 */}
      {step === 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div className="card-h" style={{ padding: 0, marginBottom: 12, border: "none" }}>① 式場の基本情報（帳票・画面に印字されます）</div>
          <div className="field">
            <label>式場名 *</label>
            <input className="form-input" value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="例：THE GRAND ÉCLAT" />
          </div>
          <div className="field">
            <label>発行元情報（住所・電話。見積書・請求書に印字）</label>
            <textarea className="form-input" rows={2} value={venueInfo} onChange={(e) => setVenueInfo(e.target.value)}
              placeholder={"例：〒509-0000 岐阜県可児市○○ 1-2-3\nTEL 0574-00-0000"} />
          </div>
          <div className="field">
            <label>振込先（請求書に印字）</label>
            <textarea className="form-input" rows={2} value={bankInfo} onChange={(e) => setBankInfo(e.target.value)}
              placeholder="例：○○銀行 ○○支店 普通 1234567 カ）○○" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={busy} onClick={() => saveInfo(true)}>保存して次へ →</button>
            <button className="btn" onClick={() => setStep(1)}>スキップ</button>
          </div>
        </div>
      )}

      {/* ② ロゴ・待機画像 */}
      {step === 1 && (
        <div className="card" style={{ padding: 20 }}>
          <div className="card-h" style={{ padding: 0, marginBottom: 12, border: "none" }}>② ロゴと映像の待機画像</div>
          <div className="field">
            <label>式場ロゴ（サイドバー・全帳票のヘッダーに表示。PNG/JPG/WebP/SVG）</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "#fff", minWidth: 180, textAlign: "center" }}>
                {logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logoUrl} alt="ロゴ" style={{ maxHeight: 54, maxWidth: 240 }} />
                  : <span style={{ fontSize: 12, color: "var(--text3)" }}>未設定</span>}
              </div>
              <label className="btn sm" style={{ cursor: "pointer" }}>
                {busy ? "処理中…" : "⬆ ロゴをアップロード"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("logo", f); e.target.value = ""; }} />
              </label>
            </div>
          </div>
          <div className="field">
            <label>映像ウィンドウの待機画像（再生プレイヤーで曲を流していない間に投影。任意）</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "#000", minWidth: 180, minHeight: 50, display: "grid", placeItems: "center" }}>
                {hasScreen
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/api/v1/branding/screen-image?t=${Date.now()}`} alt="待機画像" style={{ maxHeight: 70, maxWidth: 240 }} />
                  : <span style={{ fontSize: 12, color: "#888" }}>未設定（真っ黒）</span>}
              </div>
              <label className="btn sm" style={{ cursor: "pointer" }}>
                ⬆ 待機画像をアップロード
                <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("screen-image", f); e.target.value = ""; }} />
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setStep(0)}>← 戻る</button>
            <button className="btn primary" onClick={() => setStep(2)}>次へ →</button>
          </div>
        </div>
      )}

      {/* ③ 会場・設備マスタ */}
      {step === 2 && (
        <div className="card" style={{ padding: 20 }}>
          <div className="card-h" style={{ padding: 0, marginBottom: 6, border: "none" }}>③ 会場・設備マスタ</div>
          <p style={{ fontSize: 12, color: "var(--text3)", margin: "0 0 12px", lineHeight: 1.9 }}>
            ここで登録した会場が、案件の会場選択・重複チェック・「1日の式場の動き」バーチャートの行になります。
            控室・厨房も登録しておくと、見積テンプレ適用時のリソース自動セットに使われます。
          </p>
          {VENUE_TYPES.map(([type, icon, desc]) => {
            const list = venues.filter((v) => v.type === type);
            return (
              <div key={type} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>{icon} {desc}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {list.length === 0 && <span style={{ fontSize: 12, color: "var(--text3)" }}>未登録</span>}
                  {list.map((v) => (
                    <span key={v.id} className="pill gray" style={{ fontSize: 12 }}>
                      {v.name}{v.capacity > 0 ? `（${v.capacity}名）` : ""}
                      <a style={{ marginLeft: 6, cursor: "pointer", color: "var(--red)" }} onClick={() => delVenue(v.id)}>×</a>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
            <select className="form-input" style={{ width: 130 }} value={newType} onChange={(e) => setNewType(e.target.value)}>
              {VENUE_TYPES.map(([v, icon]) => <option key={v} value={v}>{icon} {TYPE_LABEL[v]}</option>)}
            </select>
            <input className="form-input" style={{ flex: 1, minWidth: 160 }} value={newName}
              placeholder="名称（例：披露宴会場B／ガーデン／新婦控室）"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVenue(); } }} />
            <input className="form-input" type="number" style={{ width: 90 }} value={newCap} title="収容人数（控室・厨房は0でOK）"
              onChange={(e) => setNewCap(e.target.value)} />
            <button className="btn primary" disabled={busy || !newName.trim()} onClick={addVenue}>＋ 追加</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn" onClick={() => setStep(1)}>← 戻る</button>
            <button className="btn primary" onClick={() => setStep(3)}>次へ →</button>
          </div>
        </div>
      )}

      {/* ④ 完了 */}
      {step === 3 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <h3 style={{ margin: "8px 0 4px" }}>セットアップ完了！</h3>
          <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 2 }}>
            式場名 <b>{venueName || "（未設定）"}</b>　｜　会場 <b>{venues.length}件</b>　｜　ロゴ {logoUrl ? "✅" : "—"}　｜　待機画像 {hasScreen ? "✅" : "—"}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text3)", lineHeight: 2 }}>
            あとは新規案件を作って、見積テンプレを適用するだけで<br />
            料理・席次・リソース・進行表まで自動でセットアップされます。
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
            <button className="btn primary" onClick={() => { router.push("/cases/new"); }}>🆕 新規案件を作成</button>
            <button className="btn" onClick={() => { router.push("/dashboard"); }}>ダッシュボードへ</button>
          </div>
        </div>
      )}
    </div>
  );
}
