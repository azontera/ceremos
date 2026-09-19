"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CASE_TYPES, mergeCaseTypes, typeMeta } from "@/lib/case-types";

export function NewCaseForm({
  venues, caseTypeOptions = [],
}: {
  venues: { id: string; name: string }[];
  caseTypeOptions?: [string, string][];
}) {
  const caseTypes = mergeCaseTypes(caseTypeOptions.length ? caseTypeOptions : CASE_TYPES.map((t) => [t.value, t.label]));
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [caseType, setCaseType] = useState("wedding");
  const [venueMode, setVenueMode] = useState<string>(venues[0]?.id ?? "free");
  const meta = caseTypes.find((t) => t.value === caseType) ?? typeMeta(caseType);
  // 📦 テンプレ一式（pack）：選ぶと作成時に見積(下書き)・料理・進行台本・席次・リソースまで自動作成
  type Pack = { id: string; name: string; category: string; description: string; summary: { quoteCount: number; quoteTotal: number; menuCount: number; rundownCount: number; staffCount: number; equipmentCount: number } };
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packId, setPackId] = useState("");
  useEffect(() => {
    fetch("/api/v1/template-packs").then((r) => r.json()).then((d) => setPacks(d.packs ?? [])).catch(() => {});
  }, []);
  const packMatchesType = (p: Pack) =>
    caseType === "wedding" ? p.category !== "banquet" : p.category !== "bridal";
  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (venueMode !== "free") { f.banquetVenueId = venueMode; f.venueFree = ""; }
    else f.banquetVenueId = "";
    const res = await fetch("/api/v1/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, caseType }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      // 📦 テンプレ一式を選んでいれば、作成直後に適用（見積下書き・料理・進行・席次・リソース）
      if (packId) {
        const ap = await fetch(`/api/v1/cases/${data.case.id}/apply-pack`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: packId }),
        });
        const ad = await ap.json().catch(() => ({}));
        if (ap.ok && ad.autoSetup?.length) {
          alert(`✨ テンプレ「${ad.name}」で自動セットアップしました：\n・${ad.autoSetup.join("\n・")}`);
        }
      }
      router.push(`/cases/${data.case.id}`);
      router.refresh();
    } else {
      setErr(data.error ?? `作成に失敗しました（HTTP ${res.status}）`);
      setBusy(false);
    }
  }

  return (
    <form style={{ maxWidth: 680 }} onSubmit={submit}>
      {/* 種別選択：控えめなセグメント形式 */}
      <div className="card" style={{ padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
          案件種別 <span style={{ fontWeight: 400, color: "var(--text3)" }}>— {meta.desc}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {caseTypes.map((t) => {
            const active = caseType === t.value;
            return (
              <button type="button" key={t.value} onClick={() => setCaseType(t.value)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  borderRadius: 10, padding: "9px 16px", cursor: "pointer",
                  background: active ? "var(--accent-soft)" : "var(--surface)",
                  border: active ? "1.6px solid var(--accent)" : "1.6px solid var(--border)",
                  color: active ? "var(--accent-text)" : "var(--text2)",
                  fontWeight: active ? 700 : 500, fontSize: 13,
                  transition: "all .12s",
                }}>
                <span aria-hidden style={{ fontSize: 15 }}>{t.emoji}</span>
                {t.label}
                {active && <span style={{ fontSize: 12 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 📦 テンプレ一式：選ぶと見積・料理・進行台本・席次・STAFFリソースまで一括セットアップ */}
      {packs.length > 0 && (
        <div className="card" style={{ padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
            📦 テンプレ一式 <span style={{ fontWeight: 400, color: "var(--text3)" }}>— 選ぶと作成と同時に 見積（下書き）・料理・進行台本・席次・STAFFリソース まで自動セットアップ（あとで自由に編集OK・テンプレとは同期しません）</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
            <button type="button" onClick={() => setPackId("")}
              className="card" style={{ padding: 12, textAlign: "left", cursor: "pointer", border: packId === "" ? "2px solid var(--accent)" : "1px solid var(--border)" }}>
              <b style={{ fontSize: 12.5 }}>選択しない</b>
              <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 3 }}>あとから💰お金タブの見積作成時にも選べます</div>
            </button>
            {packs.filter(packMatchesType).map((p) => (
              <button type="button" key={p.id} onClick={() => setPackId(packId === p.id ? "" : p.id)}
                className="card" style={{ padding: 12, textAlign: "left", cursor: "pointer", border: packId === p.id ? "2px solid var(--accent)" : "1px solid var(--border)" }}>
                <b style={{ fontSize: 12.5 }}>{packId === p.id ? "✓ " : ""}{p.name}</b>
                {p.description && <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 3 }}>{p.description}</div>}
                <div style={{ fontSize: 10.5, color: "var(--text2)", marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.summary.quoteCount > 0 && <span className="pill gray" style={{ fontSize: 10 }}>{yen(p.summary.quoteTotal)}</span>}
                  {p.summary.rundownCount > 0 && <span className="pill gray" style={{ fontSize: 10 }}>進行{p.summary.rundownCount}</span>}
                  {p.summary.menuCount > 0 && <span className="pill gray" style={{ fontSize: 10 }}>料理{p.summary.menuCount}品</span>}
                  {(p.summary.staffCount > 0 || p.summary.equipmentCount > 0) && <span className="pill gray" style={{ fontSize: 10 }}>STAFF{p.summary.staffCount}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 24 }}>
        <div className="grid cols-2">
          {caseType === "wedding" ? (
            <>
              <div className="field">
                <label>新郎 氏名 *</label>
                <input className="form-input" name="groomName" required placeholder="例：高橋 蓮" />
              </div>
              <div className="field">
                <label>新婦 氏名 <span style={{ fontWeight: 400, color: "var(--text3)" }}>（未定なら空欄OK）</span></label>
                <input className="form-input" name="brideName" placeholder="後から概要で入力できます" />
              </div>
            </>
          ) : (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>{meta.label}名 *</label>
              <input className="form-input" name="eventName" required
                placeholder={
                  caseType === "party" ? "例：株式会社◯◯ 創立30周年 祝賀会"
                  : caseType === "ceremony" ? "例：◯◯市 成人式典／表彰式"
                  : "例：クリスマスディナーショー／◯◯様 フォトウェディング"
                } />
            </div>
          )}
          <div className="field">
            <label>開催日 <span style={{ fontWeight: 400, color: "var(--text3)" }}>（未定なら空欄＝半年後の仮日程）</span></label>
            <input className="form-input" type="date" name="weddingDate" />
          </div>
          <div className="field">
            <label>開始時刻</label>
            <input className="form-input" type="time" name="startTime" defaultValue="11:30" />
          </div>
          <div className="field">
            <label>終了時刻</label>
            <input className="form-input" type="time" name="endTime" defaultValue="15:30" />
          </div>
          <div className="field">
            <label>予約ステータス</label>
            <select className="form-input" name="status" defaultValue="contracted">
              <option value="contracted">本予約（契約済）</option>
              <option value="tentative">仮予約</option>
            </select>
          </div>
          <div className="field">
            <label>会場 *</label>
            <select className="form-input" value={venueMode} onChange={(e) => setVenueMode(e.target.value)}>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              <option value="free">✏️ 自由入力（外部会場など）</option>
            </select>
            {venueMode === "free" && (
              <input className="form-input" style={{ marginTop: 6 }} name="venueFree" required
                placeholder="会場名を入力（例：◯◯ホテル 鳳凰の間）" />
            )}
          </div>
          <div className="field">
            <label>人数（予定）</label>
            <input className="form-input" type="number" name="guestCount" defaultValue={60} min={0} />
          </div>
          <div className="field">
            <label>代表メール</label>
            <input className="form-input" type="email" name="email" />
          </div>
          <div className="field">
            <label>代表電話</label>
            <input className="form-input" name="phone" placeholder="例：090-1234-5678" />
          </div>
        </div>
        {err && <div className="form-err">{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn primary" disabled={busy} style={{ padding: "10px 26px", fontSize: 14 }}>
            {busy ? "作成中…" : `${meta.emoji} 作成する`}
          </button>
          <button type="button" className="btn" onClick={() => history.back()}>キャンセル</button>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 14 }}>
          同一会場で時間帯が重なる予約は自動でブロックされます。自由入力の会場は「その他（外部会場）」として会場マスタに自動登録されます。
          テンプレ一式を選ばなかった場合、進行表・料理・席次・リソースは空のまま作成されます（あとから💰お金タブで見積を作るときにテンプレ一式を選ぶと同じ自動セットアップができます）。
        </p>
      </div>
    </form>
  );
}
