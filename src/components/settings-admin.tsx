"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type VenueRow = { id: string; name: string; type: string; capacity: number; widthM?: number | null; depthM?: number | null };
const VENUE_TYPES: [string, string, string][] = [
  ["banquet", "🏛", "宴会場（披露宴・パーティ。ガーデンもここでOK）"],
  ["chapel", "⛪", "チャペル・挙式スペース"],
  ["waiting", "🚪", "控室（新郎新婦・親族）"],
  ["kitchen", "🍳", "厨房"],
];

export function SettingsAdmin({
  settings, venues: initialVenues = [],
}: { settings: Record<string, string>; venues?: VenueRow[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bankInfo, setBankInfo] = useState(settings.bank_info ?? "");
  const [venueName, setVenueName] = useState(settings.venue_name ?? "");
  const [venueInfo, setVenueInfo] = useState(settings.venue_info ?? "");
  const [logoUrl, setLogoUrl] = useState(settings.venue_logo ?? "");
  const [logoBusy, setLogoBusy] = useState(false);
  const [screenImg, setScreenImg] = useState(!!settings.screen_image_key);
  const [screenBusy, setScreenBusy] = useState(false);
  // 会場・設備マスタ（式場マスタ）
  const [venues, setVenues] = useState<VenueRow[]>(initialVenues);
  const [newType, setNewType] = useState("banquet");
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState("80");
  const [newW, setNewW] = useState(""); // 間口m（任意）
  const [newD, setNewD] = useState(""); // 奥行m（任意）

  async function addVenue() {
    if (!newName.trim()) return;
    setErr("");
    const res = await fetch("/api/v1/admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, type: newType, capacity: Number(newCap) || 0, widthM: newW, depthM: newD }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? "会場の追加に失敗しました"); return; }
    setVenues((vs) => [...vs, data.venue]);
    setNewName("");
    router.refresh();
  }
  async function delVenue(id: string) {
    if (!confirm("この会場を削除しますか？")) return;
    const res = await fetch(`/api/v1/admin/venues/${id}`, { method: "DELETE" });
    if (res.ok) { setVenues((vs) => vs.filter((v) => v.id !== id)); router.refresh(); }
    else setErr("削除できません（案件で使用中の会場の可能性があります）");
  }

  // 映像ウィンドウの待機画像（再生していない間に投影される）
  async function uploadScreenImage(file: File) {
    setScreenBusy(true); setErr("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/v1/admin/settings/screen-image", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setScreenImg(true); router.refresh(); }
    else setErr(data.error ?? `アップロードに失敗しました（HTTP ${res.status}）`);
    setScreenBusy(false);
  }
  async function resetScreenImage() {
    setScreenBusy(true); setErr("");
    const res = await fetch("/api/v1/admin/settings/screen-image", { method: "DELETE" });
    if (res.ok) { setScreenImg(false); router.refresh(); }
    else setErr("削除に失敗しました");
    setScreenBusy(false);
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true); setErr("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/v1/admin/settings/logo", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setLogoUrl(`${data.url}?t=${Date.now()}`); router.refresh(); }
    else setErr(data.error ?? `アップロードに失敗しました（HTTP ${res.status}）`);
    setLogoBusy(false);
  }

  async function resetLogo() {
    setLogoBusy(true); setErr("");
    const res = await fetch("/api/v1/admin/settings/logo", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setLogoUrl(data.url); router.refresh(); }
    else setErr(data.error ?? "リセットに失敗しました");
    setLogoBusy(false);
  }

  async function save() {
    setBusy(true); setErr(""); setSaved(false);
    const res = await fetch("/api/v1/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bank_info: bankInfo,
        venue_name: venueName,
        venue_info: venueInfo,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setSaved(true); router.refresh(); }
    else setErr(data.error ?? `保存に失敗しました（HTTP ${res.status}）`);
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}
      {saved && (
        <div style={{ background: "#e8f3ea", border: "1px solid #3d8a5f", color: "#2c6a48", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
          ✅ 保存しました
        </div>
      )}

      {/* 式場ブランド（帳票のヘッダー・発行元） */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">式場ブランド（見積書・請求書・発注書・台本などに印字）</div>
        <div className="card-b">
          <div className="field">
            <label>ロゴ画像（PNG / JPG / WebP / SVG・5MBまで）</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "#fff", minWidth: 180, textAlign: "center" }}>
                {logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logoUrl} alt="式場ロゴ" style={{ maxHeight: 54, maxWidth: 240 }} />
                  : <span style={{ fontSize: 12, color: "var(--text3)" }}>未設定（ソフト名「CEREMOS」を表示）</span>}
              </div>
              <label className="btn sm" style={{ cursor: "pointer" }}>
                {logoBusy ? "処理中…" : "⬆ ロゴを差し替え"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
              </label>
              <button className="btn sm" onClick={resetLogo} disabled={logoBusy} title="ロゴを外してソフト名「CEREMOS」の表示に戻します">初期表示（CEREMOS）に戻す</button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text3)", margin: "6px 0 0", lineHeight: 1.9 }}>
              ※ .ai / .psd はアップロードできません。PNG等に書き出してから登録してください。<br />
              <b>おすすめサイズ：</b>横長ロゴ＝<b>比率3:1〜4:1・幅900px以上</b>（例 1200×300px）／正方形ロゴ＝<b>400×400px以上</b>。
              <b>背景透過のPNG</b>推奨・2MB以下。見積書などの帳票ヘッダー・画面左上・お客様ログイン画面に表示されます。
            </p>
          </div>
          <div className="field">
            <label>式場名（ロゴの代替テキスト・発行元名）</label>
            <input className="form-input" value={venueName} onChange={(e) => setVenueName(e.target.value)}
              placeholder="例：THE GRAND ÉCLAT" />
          </div>
          <div className="field">
            <label>発行元情報（住所・電話など。請求書の発行元欄に印字）</label>
            <textarea className="form-input" rows={2} value={venueInfo} onChange={(e) => setVenueInfo(e.target.value)}
              placeholder={"例：〒509-0000 岐阜県可児市○○ 1-2-3\nTEL 0574-00-0000"} />
          </div>
        </div>
      </div>

      {/* 会場・設備マスタ（式場マスタ） */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">会場・設備マスタ（式場マスタ）</div>
        <div className="card-b">
          <p style={{ fontSize: 11.5, color: "var(--text3)", margin: "0 0 10px", lineHeight: 1.8 }}>
            ここで登録した会場が、案件の会場選択・重複チェック・「1日の式場の動き」バーチャートの行になります。
            控室・厨房は見積テンプレ適用時のリソース自動セットにも使われます。
          </p>
          {VENUE_TYPES.map(([type, icon, desc]) => {
            const list = venues.filter((v) => v.type === type);
            return (
              <div key={type} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{icon} {desc}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {list.length === 0 && <span style={{ fontSize: 12, color: "var(--text3)" }}>未登録</span>}
                  {list.map((v) => (
                    <span key={v.id} className="pill gray" style={{ fontSize: 12 }}>
                      {v.name}{v.capacity > 0 ? `（${v.capacity}名）` : ""}
                      {v.widthM && v.depthM ? <span style={{ color: "var(--green, #3d8a5f)" }}>　📐{v.widthM}×{v.depthM}m</span> : ""}
                      <a style={{ marginLeft: 6, cursor: "pointer", color: "var(--red)" }} title="削除" onClick={() => delVenue(v.id)}>×</a>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
            <select className="form-input" style={{ width: 130 }} value={newType} onChange={(e) => setNewType(e.target.value)}>
              {VENUE_TYPES.map(([v, icon]) => <option key={v} value={v}>{icon} {v === "banquet" ? "宴会場" : v === "chapel" ? "チャペル" : v === "waiting" ? "控室" : "厨房"}</option>)}
            </select>
            <input className="form-input" style={{ flex: 1, minWidth: 150 }} value={newName}
              placeholder="名称（例：披露宴会場B／ガーデン／新婦控室）"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVenue(); } }} />
            <input className="form-input" type="number" style={{ width: 86 }} value={newCap} title="収容人数（控室・厨房は0でOK）"
              onChange={(e) => setNewCap(e.target.value)} />
            <span style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, color: "var(--text3)" }} title="会場の実寸（任意）。入れると席次表キャンバスが実寸比になります">
              📐
              <input className="form-input" type="number" step="0.5" min={3} style={{ width: 66, padding: "6px" }} value={newW}
                placeholder="間口m" onChange={(e) => setNewW(e.target.value)} />
              ×
              <input className="form-input" type="number" step="0.5" min={3} style={{ width: 66, padding: "6px" }} value={newD}
                placeholder="奥行m" onChange={(e) => setNewD(e.target.value)} />
            </span>
            <button className="btn primary sm" disabled={!newName.trim()} onClick={addVenue}>＋ 追加</button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text3)", margin: "6px 0 0" }}>
            📐 サイズ（m）を入れた宴会場は、席次表のキャンバスが<b>実寸比（1m＝80px・円卓Ø2m）</b>で表示されます。
          </p>
        </div>
      </div>

      {/* 映像ウィンドウの待機画像 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">映像ウィンドウの待機画像（再生プレイヤー）</div>
        <div className="card-b">
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "#000", minWidth: 180, minHeight: 60, display: "grid", placeItems: "center" }}>
              {screenImg
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/v1/branding/screen-image?t=${Date.now()}`} alt="待機画像" style={{ maxHeight: 80, maxWidth: 240 }} />
                : <span style={{ fontSize: 12, color: "#888" }}>未設定（待機中は真っ黒）</span>}
            </div>
            <label className="btn sm" style={{ cursor: "pointer" }}>
              {screenBusy ? "処理中…" : "⬆ 画像をアップロード"}
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadScreenImage(f); e.target.value = ""; }} />
            </label>
            {screenImg && <button className="btn sm" onClick={resetScreenImage} disabled={screenBusy}>削除（真っ黒に戻す）</button>}
          </div>
          <p style={{ fontSize: 11, color: "var(--text3)", margin: "6px 0 0" }}>
            曲を再生していない間、映像ウィンドウ（プロジェクター）にこの画像が投影されます（例：おふたりのロゴ・ウェルカムボード画像）。PNG/JPG/WebP・10MBまで。
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">顧客セルフ登録（専用QRコード）</div>
        <div className="card-b">
          <div className="field">
            <label>お客様の登録導線</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=1&data=${encodeURIComponent(
                  (typeof window !== "undefined" ? window.location.origin : "") + "/login")}`}
                alt="お客様入口QR" width={120} height={120}
                style={{ border: "1px solid var(--border)", borderRadius: 8 }} />
              <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
                お客様の入口は<b>この常設QR → /login</b>（メールアドレス＋パスワードで登録・ログイン）。<br />
                ご登録後はプランナーの<b>承認</b>で全機能が使えます。その場で即利用は新規案件画面の<b>24時間QR</b>を。<br />
                <a className="btn sm" href="/print/signup-qr" target="_blank" style={{ marginTop: 4 }}>🖨 QRポスターを印刷（A4）</a>
                <span style={{ color: "var(--text3)", marginLeft: 8 }}>店頭・打ち合わせ席・パンフレットに</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--text3)" }}>
            ご登録後は、すべて<b>プランナーの承認</b>で全機能が使えるようになります（メール確認は行いません）。
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">請求書</div>
        <div className="card-b">
          <div className="field">
            <label>振込先（請求書に印字）</label>
            <textarea className="form-input" rows={2} value={bankInfo} onChange={(e) => setBankInfo(e.target.value)}
              placeholder="例：○○銀行 ○○支店 普通 1234567 カ）セレモス" />
          </div>
        </div>
      </div>

      <button className="btn primary" onClick={save} disabled={busy}>{busy ? "保存中…" : "保存"}</button>
    </div>
  );
}
