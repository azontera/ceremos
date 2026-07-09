"use client";
// 席次かんたん入力（スマホ最適化）
// ゲストのお名前を入力しながら、その場で卓・席番号を指定して入れ込めるリスト型UI。
// レイアウト（円卓の配置図）はPC向けの席次表キャンバスと自動で同期する（同じAPIを使用）。
import { useCallback, useEffect, useState } from "react";

type Table = { id: string; name: string; capacity: number; sortOrder: number };
type Guest = { id: string; name: string; title: string | null; side: string; relation: string; tableId: string | null; seatNo: number | null; seatObjectId: string | null; allergy?: string | null };

const DEFAULT_RELATIONS = ["親族", "主賓", "上司", "同僚", "友人", "恩師", "その他"];

export function MobileSeating({
  caseId, canEdit, relations, lockSide,
}: { caseId: string; canEdit: boolean; relations?: string[]; lockSide?: "groom" | "bride" | null }) {
  const RELATIONS = relations && relations.length > 0 ? relations : DEFAULT_RELATIONS;
  const [tables, setTables] = useState<Table[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // クイック入力フォーム（卓・側・間柄は連続入力のため保持し、名前だけクリア）
  const [name, setName] = useState("");
  const [side, setSide] = useState<"groom" | "bride">(lockSide ?? "groom");
  // 担当分担（お客様は自分の側のゲストだけ編集できる。相手側は閲覧のみ）
  const canTouch = (g: Guest) => canEdit && (!lockSide || g.side === lockSide);
  const [relation, setRelation] = useState("友人");
  const [tableId, setTableId] = useState("");   // ""=未割当
  const [seatNo, setSeatNo] = useState("");     // ""=自動
  const [editingGuest, setEditingGuest] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/cases/${caseId}/seating`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setTables(data.tables ?? []);
    setGuests(data.guests ?? []);
    setLoaded(true);
  }, [caseId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 7000); // 共同編集の反映
    return () => clearInterval(t);
  }, [load]);

  async function op(body: Record<string, unknown>) {
    setErr("");
    const res = await fetch(`/api/v1/cases/${caseId}/seating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error ?? `操作に失敗しました（HTTP ${res.status}）`);
    await load();
    return res.ok;
  }

  const tableGuests = (tid: string) =>
    guests.filter((g) => g.tableId === tid).sort((a, b) => (a.seatNo ?? 99) - (b.seatNo ?? 99));
  const unassigned = guests.filter((g) => !g.tableId && !g.seatObjectId);
  const curTable = tables.find((t) => t.id === tableId);
  // 選択中の卓の空き席番号
  const freeSeats = (t: Table | undefined) => {
    if (!t) return [];
    const taken = new Set(tableGuests(t.id).map((g) => g.seatNo).filter((n) => n !== null));
    return Array.from({ length: t.capacity }, (_, i) => i + 1).filter((n) => !taken.has(n));
  };

  async function add() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await op({
      op: "addGuest",
      name, side, relation,
      tableId: tableId || null,
      seatNo: seatNo || null,
    });
    if (ok) {
      setName("");
      // 卓が満席になったら席番号だけリセット
      setSeatNo("");
    }
    setBusy(false);
  }

  if (!loaded) return <div className="card"><div className="empty">読み込み中…</div></div>;

  return (
    <div style={{ maxWidth: 560 }}>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* クイック入力：名前を打ちながら卓・席をその場で指定 */}
      {canEdit && (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>ゲストを追加（卓・席をその場で指定）</div>
          <input className="form-input" style={{ width: "100%", fontSize: 16, padding: "10px 12px" }}
            placeholder="お名前（例：山田 太郎）" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {lockSide ? (
              <span className={`pill ${lockSide === "groom" ? "blue" : "accent"}`} style={{ padding: "7px 14px" }}>
                {lockSide === "groom" ? "🤵 新郎側（あなたの担当）" : "👰 新婦側（あなたの担当）"}
              </span>
            ) : (<>
            <button type="button" className={`pill ${side === "groom" ? "blue" : "gray"}`} style={{ cursor: "pointer", border: "none", padding: "7px 14px" }}
              onClick={() => setSide("groom")}>🤵 新郎側</button>
            <button type="button" className={`pill ${side === "bride" ? "accent" : "gray"}`} style={{ cursor: "pointer", border: "none", padding: "7px 14px" }}
              onClick={() => setSide("bride")}>👰 新婦側</button>
            </>)}
            <select className="form-input" style={{ padding: "7px 10px", flex: 1, minWidth: 90 }} value={relation}
              onChange={(e) => setRelation(e.target.value)}>
              {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <select className="form-input" style={{ padding: "8px 10px", flex: 2 }} value={tableId}
              onChange={(e) => { setTableId(e.target.value); setSeatNo(""); }}>
              <option value="">卓：あとで決める</option>
              {tables.map((t) => {
                const used = tableGuests(t.id).length;
                return (
                  <option key={t.id} value={t.id} disabled={used >= t.capacity}>
                    {t.name}（{used}/{t.capacity}名{used >= t.capacity ? "・満席" : ""}）
                  </option>
                );
              })}
            </select>
            <select className="form-input" style={{ padding: "8px 10px", flex: 1 }} value={seatNo}
              disabled={!tableId} onChange={(e) => setSeatNo(e.target.value)}>
              <option value="">席：自動</option>
              {freeSeats(curTable).map((n) => <option key={n} value={n}>{n}番</option>)}
            </select>
            <button className="btn primary" style={{ padding: "8px 18px" }} onClick={add} disabled={busy || !name.trim()}>追加</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              💡 卓・側・間柄は次の入力に引き継がれます。同じ卓のゲストを続けて登録できます
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => op({ op: "addTable" })}>＋ 卓を追加</button>
          </div>
        </div>
      )}

      {/* 卓ごとの一覧 */}
      {tables.map((t) => {
        const gs = tableGuests(t.id);
        return (
          <div className="card" key={t.id} style={{ marginBottom: 10 }}>
            <div className="card-h" style={{ padding: "10px 14px" }}>
              🪑 {t.name}
              <span className={`pill ${gs.length >= t.capacity ? "amber" : "gray"}`}>{gs.length}/{t.capacity}名</span>
            </div>
            <div className="card-b" style={{ padding: "6px 14px 10px" }}>
              {gs.length === 0 && <div className="empty" style={{ padding: 8 }}>まだゲストがいません</div>}
              {gs.map((g) => (
                <GuestRow key={g.id} g={g} tables={tables} canEdit={canTouch(g)}
                  editing={editingGuest === g.id}
                  onEdit={() => setEditingGuest(editingGuest === g.id ? null : g.id)}
                  onMove={(tid) => { setEditingGuest(null); op({ op: "updateGuest", guestId: g.id, tableId: tid }); }}
                  onDelete={() => { if (confirm(`${g.name} 様を削除しますか？`)) { setEditingGuest(null); op({ op: "deleteGuest", guestId: g.id }); } }}
                  onAllergy={() => {
                    const a = prompt("アレルギー・食事配慮を入力（空欄で削除）", g.allergy ?? "");
                    if (a !== null) op({ op: "updateGuest", guestId: g.id, allergy: a });
                  }} />
              ))}
            </div>
          </div>
        );
      })}

      {/* 未割当 */}
      {unassigned.length > 0 && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-h" style={{ padding: "10px 14px" }}>📥 卓が未定のゲスト<span className="pill amber">{unassigned.length}名</span></div>
          <div className="card-b" style={{ padding: "6px 14px 10px" }}>
            {unassigned.map((g) => (
              <GuestRow key={g.id} g={g} tables={tables} canEdit={canTouch(g)}
                editing={editingGuest === g.id}
                onEdit={() => setEditingGuest(editingGuest === g.id ? null : g.id)}
                onMove={(tid) => { setEditingGuest(null); op({ op: "updateGuest", guestId: g.id, tableId: tid }); }}
                onDelete={() => { if (confirm(`${g.name} 様を削除しますか？`)) { setEditingGuest(null); op({ op: "deleteGuest", guestId: g.id }); } }}
                onAllergy={() => {
                  const a = prompt("アレルギー・食事配慮を入力（空欄で削除）", g.allergy ?? "");
                  if (a !== null) op({ op: "updateGuest", guestId: g.id, allergy: a });
                }} />
            ))}
          </div>
        </div>
      )}

      {tables.length === 0 && unassigned.length === 0 && (
        <div className="card"><div className="empty">まだ卓がありません。「＋ 卓を追加」から始めてください</div></div>
      )}
    </div>
  );
}

function GuestRow({
  g, tables, canEdit, editing, onEdit, onMove, onDelete, onAllergy,
}: {
  g: Guest; tables: Table[]; canEdit: boolean; editing: boolean;
  onEdit: () => void; onMove: (tableId: string | null) => void; onDelete: () => void; onAllergy: () => void;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "7px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`pill ${g.side === "bride" ? "accent" : "blue"}`} style={{ fontSize: 10.5 }}>
          {g.side === "bride" ? "新婦" : "新郎"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 13.5 }}>{g.name} 様</b>
          <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 6 }}>
            {g.relation}{g.seatNo ? `・${g.seatNo}番席` : ""}
          </span>
          {g.allergy && <div style={{ fontSize: 11, color: "var(--red, #c14b4b)", marginTop: 2 }}>⚠ {g.allergy}</div>}
        </div>
        {canEdit && <button className="btn sm" onClick={onAllergy}>⚠</button>}
        {canEdit && <button className="btn sm" onClick={onEdit}>{editing ? "閉じる" : "移動…"}</button>}
      </div>
      {editing && canEdit && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <select className="form-input" style={{ padding: "7px 10px", flex: 1, minWidth: 140 }}
            defaultValue={g.tableId ?? ""}
            onChange={(e) => onMove(e.target.value || null)}>
            <option value="">卓を未定に戻す</option>
            {tables.map((t) => <option key={t.id} value={t.id}>{t.name} へ移動</option>)}
          </select>
          <button className="btn sm" style={{ color: "var(--red, #c14b4b)" }} onClick={onDelete}>削除</button>
        </div>
      )}
    </div>
  );
}
