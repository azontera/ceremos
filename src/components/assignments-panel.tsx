"use client";
// リソース＝当日つかう「部屋・人・機材」の予約表
// ①なにを（プリセットをタップ or 自由入力）→ ②どこ・だれ → ③何時から何時まで → 追加
// 追加した内容は上のバーチャート（1日の式場の動き）とカレンダーに即反映され、
// 他の式との取り合い（同じ控室・同じスタッフの時間かぶり）は自動でブロックされる
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t as term, isBridal } from "@/lib/terms";

type Assignment = {
  id: string; kind: string; label: string;
  venueName: string | null; userName: string | null;
  startsAt: string; endsAt: string;
};
type Opt = { id: string; name: string };

const KINDS: Record<string, { label: string; cls: string; icon: string }> = {
  waiting: { label: "控室", cls: "blue", icon: "🚪" },
  kitchen: { label: "厨房", cls: "amber", icon: "🍳" },
  staff: { label: "スタッフ", cls: "green", icon: "👥" },
  equipment: { label: "設備・機材", cls: "gray", icon: "🔧" },
};

// よくあるリソース（タップで③まで自動入力）
const PRESETS: { icon: string; name: string; kind: string; label: string; start: string; end: string }[] = [
  { icon: "🚪", name: "新郎新婦 控室", kind: "waiting", label: "新郎新婦 控室", start: "09:00", end: "16:00" },
  { icon: "🚪", name: "親族控室", kind: "waiting", label: "親族控室", start: "10:00", end: "16:00" },
  { icon: "💄", name: "美容・着付", kind: "staff", label: "美容・着付", start: "08:30", end: "12:30" },
  { icon: "📷", name: "前撮り・スナップ", kind: "staff", label: "写真スタッフ", start: "09:30", end: "16:00" },
  { icon: "🍳", name: "厨房 仕込み", kind: "kitchen", label: "コース仕込み・提供", start: "08:00", end: "15:30" },
  { icon: "🔧", name: "プロジェクター", kind: "equipment", label: "プロジェクター・スクリーン", start: "10:00", end: "16:00" },
  { icon: "🔧", name: "音響機材", kind: "equipment", label: "音響機材一式", start: "09:00", end: "16:30" },
  { icon: "🚚", name: "装花 搬入", kind: "equipment", label: "装花 搬入・セット", start: "08:00", end: "10:30" },
];

export function AssignmentsPanel({
  caseId, assignments, waitingVenues, kitchenVenues, staffUsers, canEdit, weddingDate, caseType,
}: {
  caseId: string; assignments: Assignment[];
  waitingVenues: Opt[]; kitchenVenues: Opt[]; staffUsers: Opt[];
  canEdit: boolean; weddingDate: string; caseType?: string;
}) {
  const router = useRouter();
  // 宴会・式典モード：既定リソース名の「新郎新婦」を「主催者」に（新規入力の初期値のみ。既存データは不変）
  const bridal = isBridal(caseType);
  const presets = bridal ? PRESETS : PRESETS.map((p) =>
    p.name === "新郎新婦 控室" ? { ...p, name: `${term("couple", caseType)} 控室`, label: `${term("couple", caseType)} 控室` } : p
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // ①なにを ②どこ・だれ ③いつ（フォームは常に見える・プリセットで自動入力）
  const [kind, setKind] = useState("waiting");
  const [label, setLabel] = useState("");
  const [venueId, setVenueId] = useState("");
  const [userId, setUserId] = useState("");
  const [startT, setStartT] = useState("09:00");
  const [endT, setEndT] = useState("16:00");

  const day = weddingDate.slice(0, 10);
  const fmt = (x: string) =>
    new Date(x).toLocaleString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  function applyPreset(p: (typeof PRESETS)[number]) {
    setKind(p.kind);
    setLabel(p.label);
    setStartT(p.start);
    setEndT(p.end);
    if (p.kind === "waiting") setVenueId(waitingVenues[0]?.id ?? "");
    if (p.kind === "kitchen") setVenueId(kitchenVenues[0]?.id ?? "");
    if (p.kind === "staff") setUserId(staffUsers[0]?.id ?? "");
  }

  async function add() {
    setBusy(true); setErr("");
    const body: Record<string, string> = {
      kind,
      label: label.trim() || KINDS[kind].label,
      startsAt: `${day}T${startT}`,
      endsAt: `${day}T${endT}`,
    };
    if (kind === "waiting" || kind === "kitchen") body.venueId = venueId;
    if (kind === "staff" && userId) body.userId = userId;
    const res = await fetch(`/api/v1/cases/${caseId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setLabel(""); router.refresh(); }
    else setErr(data.error ?? `追加に失敗しました（HTTP ${res.status}）`);
    setBusy(false);
  }

  async function del(id: string) {
    await fetch(`/api/v1/cases/${caseId}/assignments?aid=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <p style={{ fontSize: 12, color: "var(--text3)", margin: "0 0 12px", lineHeight: 1.9 }}>
        💡 リソース＝当日つかう<b>部屋（控室・厨房）・人（スタッフ）・機材</b>の予約表です。
        追加すると上の<b>「1日の式場の動き」バーチャート</b>とカレンダーに即反映され、
        <b>他の式との取り合い（同じ控室・同じスタッフの時間かぶり）は自動でブロック</b>されます。
      </p>

      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {canEdit && (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          {/* ①なにを：よくあるリソースをタップ */}
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>① なにを使う？（タップで自動入力）</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {presets.map((p) => (
              <button type="button" key={p.name} className={`pill ${label === p.label ? "accent" : "gray"}`}
                style={{ cursor: "pointer", border: "none", fontSize: 12, padding: "6px 12px" }}
                onClick={() => applyPreset(p)}>
                {p.icon} {p.name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select className="form-input" style={{ width: 130 }} value={kind}
              onChange={(e) => { setKind(e.target.value); setVenueId(""); setUserId(""); }}>
              {Object.entries(KINDS).map(([v, k]) => <option key={v} value={v}>{k.icon} {k.label}</option>)}
            </select>
            <input className="form-input" style={{ flex: 1, minWidth: 160 }} value={label}
              placeholder={bridal ? "名称（例：プロジェクター／新婦控室として）" : "名称（例：プロジェクター／控室として）"}
              onChange={(e) => setLabel(e.target.value)} />
          </div>

          {/* ②どこ・だれ */}
          <div style={{ fontSize: 12.5, fontWeight: 700, margin: "12px 0 6px" }}>② どこ・だれ？</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {kind === "waiting" && (
              <select className="form-input" style={{ minWidth: 170 }} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                <option value="">（部屋の指定なし）</option>
                {waitingVenues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
            {kind === "kitchen" && (
              <select className="form-input" style={{ minWidth: 170 }} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                <option value="">（厨房の指定なし）</option>
                {kitchenVenues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
            {kind === "staff" && (
              <select className="form-input" style={{ minWidth: 170 }} value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">（担当者は後で決める）</option>
                {staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            {kind === "equipment" && <span style={{ fontSize: 12, color: "var(--text3)" }}>機材は場所の指定不要（名称だけでOK）</span>}
          </div>

          {/* ③いつ */}
          <div style={{ fontSize: 12.5, fontWeight: 700, margin: "12px 0 6px" }}>③ 何時から何時まで？（{day}）</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input className="form-input" type="time" value={startT} onChange={(e) => setStartT(e.target.value)} />
            <span>〜</span>
            <input className="form-input" type="time" value={endT} onChange={(e) => setEndT(e.target.value)} />
            <button className="btn primary" disabled={busy} onClick={add}>
              {busy ? "追加中…" : "＋ 追加（バーチャートに反映）"}
            </button>
          </div>
        </div>
      )}

      {/* 登録済みリソース */}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>種別</th><th>名称</th><th>割当先</th><th>時間帯</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {assignments.length === 0 && <tr><td colSpan={5} className="empty">リソースはまだありません（上のプリセットからワンタップで追加できます）</td></tr>}
            {assignments.map((a) => {
              const k = KINDS[a.kind] ?? { label: a.kind, cls: "gray", icon: "📦" };
              return (
                <tr key={a.id}>
                  <td><span className={`pill ${k.cls}`}>{k.icon} {k.label}</span></td>
                  <td><b>{a.label}</b></td>
                  <td>{a.venueName ?? a.userName ?? "—"}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(a.startsAt)} 〜 {fmt(a.endsAt)}</td>
                  {canEdit && <td><button className="btn sm" onClick={() => del(a.id)}>削除</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
