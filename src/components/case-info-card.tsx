"use client";
// 案件「基本情報」カード：通常は読み取り表示、編集ボタンで開催日・会場・担当・連絡先などを変更できる
import { useState } from "react";
import { useRouter } from "next/navigation";
import { mergeCaseTypes, typeMeta } from "@/lib/case-types";

type Venue = { id: string; name: string; type: string };
type Planner = { id: string; name: string };

export function CaseInfoCard({
  caseId, canEdit,
  groomName, brideName, caseType,
  weddingDateISO, startTime, endTime, status,
  chapelVenueId, banquetVenueId, venueFree,
  plannerId, plannerName,
  guestCount, email, phone, address,
  venueDisplay, chapelDisplay,
  venues, planners, caseTypeOptions,
  attachmentsSlot,
}: {
  caseId: string; canEdit: boolean;
  groomName: string; brideName: string; caseType: string;
  weddingDateISO: string; startTime: string; endTime: string; status: string;
  chapelVenueId: string | null; banquetVenueId: string | null; venueFree: string | null;
  plannerId: string | null; plannerName: string | null;
  guestCount: number; email: string | null; phone: string | null; address: string | null;
  venueDisplay: string; chapelDisplay: string | null;
  venues: Venue[]; planners: Planner[]; caseTypeOptions: [string, string][];
  attachmentsSlot?: React.ReactNode; // 省略時は添付欄を出さない（添付は💬連絡タブに集約）
}) {
  const router = useRouter();
  const caseTypes = mergeCaseTypes(caseTypeOptions);
  const meta = caseTypes.find((t) => t.value === caseType) ?? typeMeta(caseType);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const banquetVenues = venues.filter((v) => v.type === "banquet" || v.type === "external");
  const chapelVenues = venues.filter((v) => v.type === "chapel");

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const body: Record<string, string | number | null> = {
      caseType: f.caseType,
      groomName: f.groomName,
      brideName: f.brideName,
      weddingDate: f.weddingDate,
      startTime: f.startTime,
      endTime: f.endTime || null,
      status: f.status,
      plannerId: f.plannerId || null,
      banquetVenueId: f.venueMode !== "free" ? f.venueMode || null : null,
      venueFree: f.venueMode === "free" ? f.venueFree : "",
      chapelVenueId: f.chapelVenueId || null,
      guestCount: Number(f.guestCount || 0),
      email: f.email || null,
      phone: f.phone || null,
      address: f.address || null,
    };
    // weddingDate/startTime は合成してサーバー側で解釈できる形式にする
    if (body.weddingDate && f.startTime) {
      body.weddingDate = `${f.weddingDate}T${f.startTime}:00`;
    }
    const res = await fetch(`/api/v1/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setErr(data.error ?? `保存に失敗しました（HTTP ${res.status}）`);
    }
    setBusy(false);
  }

  if (!editing) {
    return (
      <div className="card">
        <div className="card-h">
          基本情報
          {canEdit && (
            <button type="button" className="btn sm" style={{ marginLeft: "auto" }} onClick={() => setEditing(true)}>
              ✏️ 編集
            </button>
          )}
        </div>
        <div className="card-b">
          <div className="field"><label>種別</label><div className="val">{meta.emoji} {meta.label}</div></div>
          <div className="field"><label>開催日</label><div className="val"><b>{new Date(weddingDateISO).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", weekday: "short" })} {startTime}〜{endTime || "（終了未定）"}</b></div></div>
          <div className="field"><label>会場</label><div className="val">{chapelDisplay ? `${chapelDisplay} → ${venueDisplay}` : venueDisplay}</div></div>
          <div className="field"><label>担当プランナー</label><div className="val">{plannerName ?? "—"}</div></div>
          <div className="field"><label>連絡先</label><div className="val">{email ?? "—"} ／ {phone ?? "—"}</div></div>
          <div className="field"><label>住所</label><div className="val">{address ?? "—"}</div></div>
          {attachmentsSlot && <div className="field"><label>添付資料</label>{attachmentsSlot}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-h">基本情報を編集</div>
      <form className="card-b" onSubmit={save}>
        <div className="field">
          <label>種別</label>
          <select className="form-input" name="caseType" defaultValue={caseType}>
            {caseTypes.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{caseType === "wedding" ? "新郎 氏名" : "名称"}</label>
          <input className="form-input" name="groomName" defaultValue={groomName} required />
        </div>
        {caseType === "wedding" && (
          <div className="field">
            <label>新婦 氏名</label>
            <input className="form-input" name="brideName" defaultValue={brideName === "―" ? "" : brideName} placeholder="未定なら空欄でOK" />
          </div>
        )}
        {caseType !== "wedding" && <input type="hidden" name="brideName" value="―" />}
        <div className="field">
          <label>開催日</label>
          <input className="form-input" type="date" name="weddingDate" defaultValue={weddingDateISO.slice(0, 10)} required />
        </div>
        <div className="field">
          <label>開始時刻</label>
          <input className="form-input" type="time" name="startTime" defaultValue={startTime} required />
        </div>
        <div className="field">
          <label>終了時刻</label>
          <input className="form-input" type="time" name="endTime" defaultValue={endTime} />
        </div>
        <div className="field">
          <label>予約ステータス</label>
          <select className="form-input" name="status" defaultValue={status}>
            <option value="contracted">本予約（契約済）</option>
            <option value="tentative">仮予約</option>
            <option value="planning">進行中</option>
            <option value="quoting">見積中</option>
            <option value="final_prep">最終準備</option>
            <option value="done">完了</option>
          </select>
        </div>
        <VenueField banquetVenues={banquetVenues} banquetVenueId={banquetVenueId} venueFree={venueFree} />
        {caseType === "wedding" && (
          <div className="field">
            <label>チャペル（挙式会場）</label>
            <select className="form-input" name="chapelVenueId" defaultValue={chapelVenueId ?? ""}>
              <option value="">（指定なし）</option>
              {chapelVenues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label>担当プランナー</label>
          <select className="form-input" name="plannerId" defaultValue={plannerId ?? ""}>
            <option value="">（未定）</option>
            {planners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>人数</label>
          <input className="form-input" type="number" name="guestCount" defaultValue={guestCount} min={0} />
        </div>
        <div className="field">
          <label>代表メール</label>
          <input className="form-input" type="email" name="email" defaultValue={email ?? ""} />
        </div>
        <div className="field">
          <label>代表電話</label>
          <input className="form-input" name="phone" defaultValue={phone ?? ""} />
        </div>
        <div className="field">
          <label>住所</label>
          <input className="form-input" name="address" defaultValue={address ?? ""} />
        </div>
        {err && <div className="form-err">{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn primary" disabled={busy}>{busy ? "保存中…" : "保存"}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => { setEditing(false); setErr(""); }}>キャンセル</button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 10 }}>
          会場・開催日を変更すると、同一会場で時間帯が重なる他の予約がないか自動でチェックされます。
        </p>
      </form>
    </div>
  );
}

function VenueField({
  banquetVenues, banquetVenueId, venueFree,
}: { banquetVenues: Venue[]; banquetVenueId: string | null; venueFree: string | null }) {
  const [mode, setMode] = useState<string>(banquetVenueId ?? (venueFree ? "free" : banquetVenues[0]?.id ?? "free"));
  return (
    <div className="field">
      <label>会場</label>
      <select className="form-input" name="venueMode" value={mode} onChange={(e) => setMode(e.target.value)}>
        {banquetVenues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        <option value="free">✏️ 自由入力（外部会場など）</option>
      </select>
      {mode === "free" && (
        <input className="form-input" style={{ marginTop: 6 }} name="venueFree" defaultValue={venueFree ?? ""}
          placeholder="会場名を入力（例：◯◯ホテル 鳳凰の間）" />
      )}
    </div>
  );
}
