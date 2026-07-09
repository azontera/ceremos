"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileSeating } from "./mobile-seating";
import { t as term, isBridal } from "@/lib/terms";

type Table = { id: string; name: string; capacity: number; sizeCm?: number; sortOrder: number; posX: number; posY: number };
type Guest = { id: string; name: string; title: string | null; side: string; relation: string; tableId: string | null; seatNo: number | null; seatObjectId: string | null; allergy: string | null };
type FloorObj = { id: string; kind: string; label: string; posX: number; posY: number; width: number; height: number; capacity?: number; rotation?: number };

const DEFAULT_RELATIONS = ["親族", "主賓", "上司", "同僚", "友人", "恩師", "その他"];
const BOX = 250;      // 卓要素のサイズ
// 円卓の直径（cm）→ 描画px（1m=80px）。座席リングは卓の縁＋椅子ぶん24px外側
const tableDiscPx = (t: { sizeCm?: number }) => Math.round(((t.sizeCm ?? 200) / 100) * 80);
const tableSeatR = (t: { sizeCm?: number }) => tableDiscPx(t) / 2 + 24;
const TABLE_SIZES: [number, string][] = [
  [120, "Ø1.2m（〜4名）"], [150, "Ø1.5m（〜6名）"], [180, "Ø1.8m（〜8名）"],
  [200, "Ø2.0m（8名 標準）"], [220, "Ø2.2m（〜10名）"], [240, "Ø2.4m（〜10名）"], [300, "Ø3.0m（大卓）"],
];

export function SeatingPanel({
  caseId, canEdit: canEditProp, canHall, guestCount, relations, lockSide, caseType,
}: { caseId: string; canEdit: boolean; canHall: boolean; guestCount: number; relations?: string[]; lockSide?: "groom" | "bride" | null; caseType?: string }) {
  const RELATIONS = relations && relations.length > 0 ? relations : DEFAULT_RELATIONS;
  // 宴会・式典モードでは婚礼用語（新郎側/新婦側）を出さない（表示文字列のみ。side="groom"/"bride" のデータ値は不変）
  const bridal = isBridal(caseType);
  const sideLabel = (side: string) => (side === "bride" ? term("brideSide", caseType) : term("groomSide", caseType));
  const sideEmoji = (side: string) => (side === "bride" ? (bridal ? "👰" : "👤") : (bridal ? "🤵" : "🏢"));
  // ✏ 編集モード：「編集する」を押すまでレイアウトはロック（誤ドラッグ防止）。「抜ける」で閲覧に戻る
  // 以降の canEdit はすべて「編集権限あり かつ 編集モード中」を意味する
  const [editMode, setEditMode] = useState(false);
  const canEdit = canEditProp && editMode;
  const [tables, setTables] = useState<Table[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [objects, setObjects] = useState<FloorObj[]>([]);
  const [hall, setHall] = useState({ w: 1240, h: 720 });
  const [hallMeters, setHallMeters] = useState<{ w: number; h: number } | null>(null); // 会場マスタの実寸（m）
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [addingAt, setAddingAt] = useState<{ tableId?: string; chairId?: string; seatNo?: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false); // ドラッグ直後の誤クリック防止
  const [hallEdit, setHallEdit] = useState(false);
  const [livePos, setLivePos] = useState<Record<string, { x: number; y: number }>>({});
  const [liveSize, setLiveSize] = useState<Record<string, { w: number; h: number }>>({});
  const movingRef = useRef<boolean>(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 🔍 ズーム（1m=80pxの実寸キャンバスを縮小・拡大して表示。ドラッグ座標はzoomで補正）
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const setZoomClamped = (z: number) => setZoom(Math.min(2, Math.max(0.25, Math.round(z * 100) / 100)));
  // 全体フィット：幅・高さ両方が収まる倍率（rAFでレイアウト確定後に計測）
  const fitZoom = useCallback(() => {
    requestAnimationFrame(() => {
      const cw = wrapRef.current?.clientWidth ?? 0;
      const ah = Math.max(320, Math.round(window.innerHeight * 0.72));
      if (cw > 2) {
        const z = Math.min((cw - 2) / hall.w, (ah - 2) / hall.h, 1);
        setZoom(Math.max(0.25, Math.floor(z * 100) / 100));
      }
    });
  }, [hall.w, hall.h]);
  // 🪑卓・オブジェクトの選択（クリック→上部ツールバーで編集）
  const [selObj, setSelObj] = useState<{ kind: "table" | "object"; id: string } | null>(null);
  // 初回ロード時は会場全体が見えるようにフィット
  const fitDoneRef = useRef(false);
  useEffect(() => {
    if (loaded && !fitDoneRef.current) { fitDoneRef.current = true; setTimeout(fitZoom, 0); }
  }, [loaded, fitZoom]);
  const historyRef = useRef<{ tables: Table[]; guests: Guest[]; objects: FloorObj[] }[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  // 📱 かんたん入力モード（スマホは自動でON。ボタンでいつでも切替）
  const [simpleMode, setSimpleMode] = useState<boolean | null>(null);
  useEffect(() => {
    if (simpleMode === null && typeof window !== "undefined") {
      setSimpleMode(window.matchMedia("(max-width: 700px)").matches);
    }
  }, [simpleMode]);

  const load = useCallback(async (force = false) => {
    // force=true は編集ポップアップを閉じた直後の即時リフレッシュ用（ガードを無視）
    if (!force && (movingRef.current || addingAt || renaming || hallEdit)) return;
    const res = await fetch(`/api/v1/cases/${caseId}/seating`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setTables(data.tables);
    setGuests(data.guests);
    setObjects(data.objects ?? []);
    if (data.hall) setHall(data.hall);
    setHallMeters(data.hallMeters ?? null);
    setLoaded(true);
  }, [caseId, addingAt, renaming, hallEdit]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000); // 共同編集：相手の変更を自動反映
    return () => clearInterval(timer);
  }, [load]);

  async function op(body: Record<string, unknown>, reload = true) {
    setErr("");
    // 「元に戻す」用スナップショット（復元操作自体は記録しない・最大20件）
    if (body.op !== "restore") {
      historyRef.current = [
        ...historyRef.current.slice(-19),
        {
          tables: tables.map((t) => ({ ...t })),
          guests: guests.map((g) => ({ ...g })),
          objects: objects.map((o) => ({ ...o })),
        },
      ];
    }
    const res = await fetch(`/api/v1/cases/${caseId}/seating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.op !== "restore") historyRef.current.pop();
      setErr(data.error ?? `操作に失敗しました（HTTP ${res.status}）`);
    }
    setUndoCount(historyRef.current.length);
    if (reload) await load();
    return res.ok;
  }

  async function undo() {
    const snap = historyRef.current.pop();
    setUndoCount(historyRef.current.length);
    if (!snap) return;
    await op({ op: "restore", ...snap });
  }

  // ===== 座標ユーティリティ =====
  const defaultPos = (i: number) => ({ x: 130 + (i % 3) * 340, y: 150 + Math.floor(i / 3) * 300 });
  const tablePos = (t: Table, i: number) =>
    livePos[`t:${t.id}`] ?? (t.posX >= 0 ? { x: t.posX, y: t.posY } : defaultPos(i));
  const objPos = (o: FloorObj) => livePos[`o:${o.id}`] ?? { x: o.posX, y: o.posY };
  const objSize = (o: FloorObj) => liveSize[o.id] ?? { w: o.width, h: o.height };

  /** 汎用ドラッグ（卓・オブジェクトの移動／オブジェクトのリサイズ） */
  function startDrag(
    e: React.PointerEvent,
    onMove: (dx: number, dy: number) => void,
    onDone: (dx: number, dy: number) => void,
  ) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    movingRef.current = true;
    const sx = e.clientX, sy = e.clientY;
    // 画面上の移動量(px) → キャンバス座標へzoomで補正
    const z = () => zoomRef.current || 1;
    const move = (ev: PointerEvent) => onMove((ev.clientX - sx) / z(), (ev.clientY - sy) / z());
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      movingRef.current = false;
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) {
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 180);
      }
      onDone((ev.clientX - sx) / z(), (ev.clientY - sy) / z());
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  // 新規追加はいま見えている範囲の中央に置く（左上に固まらない）
  const centerPos = (w = BOX, h = BOX) => {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 60, y: 60 };
    return {
      x: clamp(Math.round((wrap.scrollLeft + wrap.clientWidth / 2) / (zoomRef.current || 1) - w / 2), 0, hall.w - w),
      y: clamp(Math.round((wrap.scrollTop + wrap.clientHeight / 2) / (zoomRef.current || 1) - h / 2), 0, hall.h - h),
    };
  };

  function moveTable(t: Table, i: number, e: React.PointerEvent) {
    const start = tablePos(t, i);
    startDrag(e,
      (dx, dy) => setLivePos((p) => ({ ...p, [`t:${t.id}`]: { x: clamp(start.x + dx, 0, hall.w - BOX), y: clamp(start.y + dy, 0, hall.h - BOX) } })),
      async (dx, dy) => {
        // クリック（ほぼ移動なし）は保存しない＝選択操作として扱う
        if (Math.abs(dx) + Math.abs(dy) < 3) {
          setLivePos((p) => { const q = { ...p }; delete q[`t:${t.id}`]; return q; });
          return;
        }
        const x = clamp(start.x + dx, 0, hall.w - BOX), y = clamp(start.y + dy, 0, hall.h - BOX);
        await op({ op: "moveTable", tableId: t.id, posX: x, posY: y }, false);
        setTables((ts) => ts.map((tt) => (tt.id === t.id ? { ...tt, posX: x, posY: y } : tt)));
        setLivePos((p) => { const q = { ...p }; delete q[`t:${t.id}`]; return q; });
      });
  }

  function moveObject(o: FloorObj, e: React.PointerEvent) {
    const start = objPos(o);
    const sz = objSize(o);
    startDrag(e,
      (dx, dy) => setLivePos((p) => ({ ...p, [`o:${o.id}`]: { x: clamp(start.x + dx, 0, hall.w - sz.w), y: clamp(start.y + dy, 0, hall.h - sz.h) } })),
      async (dx, dy) => {
        // クリック（ほぼ移動なし）は保存しない＝選択操作として扱う
        if (Math.abs(dx) + Math.abs(dy) < 3) {
          setLivePos((p) => { const q = { ...p }; delete q[`o:${o.id}`]; return q; });
          return;
        }
        const x = clamp(start.x + dx, 0, hall.w - sz.w), y = clamp(start.y + dy, 0, hall.h - sz.h);
        await op({ op: "updateObject", objectId: o.id, posX: x, posY: y }, false);
        setObjects((os) => os.map((oo) => (oo.id === o.id ? { ...oo, posX: x, posY: y } : oo)));
        setLivePos((p) => { const q = { ...p }; delete q[`o:${o.id}`]; return q; });
      });
  }

  function resizeObject(o: FloorObj, e: React.PointerEvent) {
    const start = objSize(o);
    const pos = objPos(o);
    startDrag(e,
      (dx, dy) => setLiveSize((p) => ({ ...p, [o.id]: { w: clamp(start.w + dx, 50, hall.w - pos.x), h: clamp(start.h + dy, 40, hall.h - pos.y) } })),
      async (dx, dy) => {
        const w = clamp(start.w + dx, 50, hall.w - pos.x), h = clamp(start.h + dy, 40, hall.h - pos.y);
        await op({ op: "updateObject", objectId: o.id, width: w, height: h }, false);
        setObjects((os) => os.map((oo) => (oo.id === o.id ? { ...oo, width: w, height: h } : oo)));
        setLiveSize((p) => { const q = { ...p }; delete q[o.id]; return q; });
      });
  }

  // ===== ゲスト =====
  // seatNo を渡すと「その席」に着席。省略時は自動配置
  async function moveGuest(guestId: string, tableId: string | null, seatNo?: number) {
    setSelected(null);
    setDragOver(null);
    // 未割当へ戻すときは椅子の割当も解除
    await op({ op: "updateGuest", guestId, tableId, seatNo: tableId ? seatNo ?? null : null, ...(tableId ? {} : { seatObjectId: null }) });
  }

  // 椅子（1脚=1名）への割当
  async function moveGuestToChair(guestId: string, chairId: string) {
    setSelected(null);
    setDragOver(null);
    await op({ op: "updateGuest", guestId, seatObjectId: chairId });
  }

  async function addGuest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries());
    if (await op({ op: "addGuest", ...f }, false)) { form.reset(); await load(true); }
  }

  // ===== CSV入出力（氏名,肩書,側,間柄,卓名） =====
  function exportCsv() {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      "氏名,肩書,側,間柄,卓名,アレルギー",
      ...guests.map((g) => [
        // 側の値：婚礼は従来どおり「新郎/新婦」。宴会は取込互換のため raw値（groom/bride）で出力（サーバー取込は 新婦/bride のみ bride 判定）
        g.name, g.title ?? "", bridal ? (g.side === "bride" ? "新婦" : "新郎") : g.side, g.relation,
        tables.find((t) => t.id === g.tableId)?.name
          ?? (g.seatObjectId ? objects.find((o) => o.id === g.seatObjectId)?.label ?? "椅子席" : ""),
        g.allergy ?? "",
      ].map(esc).join(",")),
    ];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }); // BOM付き（Excel対応）
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "席次ゲスト.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importCsv(file: File) {
    setErr("");
    const text = (await file.text()).replace(/^﻿/, "");
    // 簡易CSVパース（引用符対応）
    const parseLine = (line: string): string[] => {
      const out: string[] = []; let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) { setErr("CSVが空です"); return; }
    const start = lines[0].includes("氏名") ? 1 : 0; // ヘッダー行はスキップ
    const rows = lines.slice(start).map((l) => {
      const [name, title, side, relation, tableName, allergy] = parseLine(l);
      return { name, title, side, relation, tableName, allergy };
    });
    if (await op({ op: "importGuests", rows }, false)) await load(true); // 「元に戻す」対応
  }

  const unassigned = guests.filter((g) => !g.tableId && !g.seatObjectId);
  const selectedGuest = guests.find((g) => g.id === selected) ?? null;

  function Chip({ g, style }: { g: Guest; style?: React.CSSProperties }) {
    return (
      <span
        className={`seat-chip ${g.side} ${selected === g.id ? "selected" : ""}`}
        style={style}
        title={`${g.name} 様（${sideLabel(g.side)}・${g.relation}${g.title ? `・${g.title}` : ""}${g.allergy ? `・⚠${g.allergy}` : ""}）`}
        draggable={canEdit}
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", g.id); setSelected(null); }}
        onClick={(e) => { e.stopPropagation(); canEdit && setSelected(selected === g.id ? null : g.id); }}
      >
        {g.allergy && <span style={{ marginRight: 2 }}>⚠</span>}{g.name}
      </span>
    );
  }

  const seatPos = (idx: number, total: number, seatR: number) => {
    const angle = (-90 + (360 / total) * idx) * (Math.PI / 180);
    return { left: BOX / 2 + Math.cos(angle) * seatR, top: BOX / 2 + Math.sin(angle) * seatR };
  };

  const dropProps = (target: string, tableId: string | null) =>
    canEdit
      ? {
          onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(target); },
          onDragLeave: () => setDragOver(null),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const gid = e.dataTransfer.getData("text/plain");
            if (gid) moveGuest(gid, tableId);
          },
          onClick: () => { if (selectedGuest) moveGuest(selectedGuest.id, tableId); },
        }
      : {};

  if (!loaded) return <div className="card"><div className="empty">読み込み中…</div></div>;

  return (
    <>
      <div className="section-h" style={{ margin: "0 0 12px" }}>
        <span className="pill gray">登録 {guests.length} / 予定 {guestCount}名</span>
        <span className="pill blue">{sideLabel("groom")} {guests.filter((g) => g.side === "groom").length}</span>
        <span className="pill accent">{sideLabel("bride")} {guests.filter((g) => g.side === "bride").length}</span>
        {hallMeters && (
          <span className="pill green" title="会場マスタの実寸を反映（1m＝80px。円卓Ø200cm・長机180cm×45cmの実寸比）">
            📐 実寸 {hallMeters.w}m × {hallMeters.h}m
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* ✏ 編集モードの切り替え（誤操作防止：編集するを押すまでロック） */}
        {canEditProp && !simpleMode && (
          <button className={editMode ? "btn" : "btn primary"}
            title={editMode ? "編集を終了して閲覧に戻ります" : "卓の移動・追加・サイズ変更などレイアウト編集を始めます"}
            onClick={() => { setEditMode(!editMode); setSelObj(null); setSelected(null); setHallEdit(false); }}>
            {editMode ? "✅ 編集を抜ける" : "✏ 編集する"}
          </button>
        )}
        {/* レイアウト編集はPC専用（スマホは常にかんたん入力） */}
        <button className="btn pc-only" onClick={() => setSimpleMode(!simpleMode)}
          title="スマホ向けのリスト入力とPC向けのレイアウト表示を切り替えます">
          {simpleMode ? "🖥 レイアウト表示" : "📱 かんたん入力"}
        </button>
        <a className="btn" href={`/print/${caseId}/seating`} target="_blank">🖨 席次表</a>
        <a className="btn" href={`/print/${caseId}/guests`} target="_blank">🖨 出席リスト</a>
      </div>
      {/* 📱 かんたん入力（スマホ最適化）：名前を入力しながら卓・席をその場で指定 */}
      {simpleMode && (
        <MobileSeating caseId={caseId} canEdit={canEditProp} relations={RELATIONS} lockSide={lockSide} caseType={caseType} />
      )}
      {!simpleMode && <>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* ツールバー（画面上部に固定＝スクロールしても追加ボタンが消えない） */}
      {canEdit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center",
          position: "sticky", top: 58, zIndex: 8, background: "var(--bg)", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
          <button className="btn primary sm" onClick={() => {
            const p = tables.length === 0 ? defaultPos(0) : centerPos();
            op({ op: "addTable", posX: p.x, posY: p.y });
          }}>＋ 円卓</button>
          <button className="btn sm" onClick={() => op({ op: "addObject", kind: "takasago", posX: hall.w / 2 - 140, posY: 24 })}>＋ 高砂</button>
          <button className="btn sm" onClick={() => op({ op: "addObject", kind: "stage", posX: hall.w - 280, posY: hall.h / 2 - 75 })}>＋ ステージ</button>
          <button className="btn sm" onClick={() => op({ op: "addObject", kind: "mc", posX: 30, posY: hall.h / 2 - 40 })}>＋ 司会台</button>
          <button className="btn sm" onClick={() => { const p = centerPos(144, 36); op({ op: "addObject", kind: "longtable", posX: p.x, posY: p.y }); }}>＋ 長机</button>
          <button className="btn sm" onClick={() => {
            // 椅子は最後に置いた長机の付近（下側）に並べて追加。長机がなければ中央
            const lt = [...objects].reverse().find((o) => o.kind === "longtable");
            const chairsNear = lt ? objects.filter((o) => o.kind === "chair" && Math.abs(o.posY - (lt.posY + lt.height + 8)) < 40 && o.posX >= lt.posX - 20 && o.posX <= lt.posX + lt.width + 40).length : 0;
            const pos = lt
              ? { x: Math.min(lt.posX + chairsNear * 36, hall.w - 30), y: lt.posY + lt.height + 8 }
              : centerPos(28, 28);
            op({ op: "addObject", kind: "chair", posX: pos.x, posY: pos.y });
          }}>＋ 椅子</button>
          <button className="btn sm" onClick={() => {
            const label = prompt("オブジェクト名（例：ケーキ台・音響ブース・受付）", "ケーキ台");
            const p = centerPos(160, 100);
            if (label?.trim()) op({ op: "addObject", kind: "custom", label, posX: p.x, posY: p.y });
          }}>＋ オブジェクト</button>
          <button className="btn sm" onClick={undo} disabled={undoCount === 0}
            title="直前の操作（移動・追加・削除・席替え）を取り消します">↩ 元に戻す{undoCount > 0 ? `（${undoCount}）` : ""}</button>
          <div style={{ flex: 1 }} />
          {canHall && !hallEdit && (
            <button className="btn sm" onClick={() => setHallEdit(true)}
              title="会場の実寸（m）で指定します。卓・長机と同じ縮尺（1m=80px）で描画されます">
              ⚙ 会場サイズ（{(hall.w / 80).toFixed(hall.w % 80 === 0 ? 0 : 1)}m × {(hall.h / 80).toFixed(hall.h % 80 === 0 ? 0 : 1)}m）
            </button>
          )}
          {canHall && hallEdit && (
            <form style={{ display: "flex", gap: 6, alignItems: "center" }} onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              // メートル → px（1m=80px）。卓の実寸（円卓Ø2m）と縮尺が揃う
              const w = Math.round(Number(f.get("wm")) * 80), h = Math.round(Number(f.get("hm")) * 80);
              setHallEdit(false);
              if (await op({ op: "setHall", w, h }, false)) {
                setHall({ w, h });
                setTimeout(fitZoom, 0); // サイズ変更後は全体表示に合わせ直す
              }
            }}>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>会場の実寸</span>
              <input className="form-input" style={{ width: 72, padding: "4px 8px" }} name="wm" type="number" min={9} max={30} step={0.5} defaultValue={(hall.w / 80).toFixed(1)} />
              <span>m ×</span>
              <input className="form-input" style={{ width: 72, padding: "4px 8px" }} name="hm" type="number" min={6} max={20} step={0.5} defaultValue={(hall.h / 80).toFixed(1)} />
              <span>m</span>
              <button className="btn sm primary">適用</button>
              <button type="button" className="btn sm" onClick={() => setHallEdit(false)}>×</button>
            </form>
          )}
        </div>
      )}

      {canEdit ? (
        <p style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 10 }}>
          <b>移動</b>：卓・オブジェクトを<b>そのままドラッグ</b>　｜　<b>編集</b>：クリックで選択→上のツールバー（席±・サイズ・名前・削除・回転）　｜
          <b>ゲスト追加</b>：空席➕をクリック　｜　<b>席替え</b>：名札をドラッグ　｜　<b>画面</b>：背景ドラッグでスクロール・Ctrl（⌘）+ホイールで拡大縮小　｜
          終わったら<b>「✅ 編集を抜ける」</b>
        </p>
      ) : canEditProp ? (
        <p style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 10 }}>
          🔒 いまは閲覧モードです。右上の<b>「✏ 編集する」</b>を押すと、卓の移動・追加・サイズ変更・ゲストの席替えができます（誤操作防止のためロックしています）
        </p>
      ) : null}

      {selectedGuest && (
        <div className="card" style={{ padding: "10px 16px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderColor: "var(--amber)" }}>
          <span className="pill amber">選択中</span>
          <b>{selectedGuest.name} 様</b>
          <span className={`pill ${selectedGuest.side === "groom" ? "blue" : "accent"}`}>{sideLabel(selectedGuest.side)}</span>
          <span className="pill gray">{selectedGuest.relation}</span>
          {selectedGuest.title && <span className="pill gray">{selectedGuest.title}</span>}
          {selectedGuest.allergy && <span className="pill red">⚠ {selectedGuest.allergy}</span>}
          <span className="pill gray">
            {tables.find((t) => t.id === selectedGuest.tableId)?.name
              ?? (selectedGuest.seatObjectId ? "椅子に着席中" : "未割当")}
          </span>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>移動先の円卓・椅子（または未割当エリア）をタップ</span>
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => {
            const name = prompt("お名前を変更", selectedGuest.name);
            if (name?.trim()) op({ op: "updateGuest", guestId: selectedGuest.id, name });
          }}>名前変更</button>
          <button className="btn sm" onClick={() => {
            const t = prompt("肩書を入力（空欄で削除）", selectedGuest.title ?? "");
            if (t !== null) op({ op: "updateGuest", guestId: selectedGuest.id, title: t });
          }}>肩書</button>
          <button className="btn sm" onClick={() => {
            const a = prompt("アレルギー・食事配慮を入力（空欄で削除）\n例：甲殻類アレルギー／小麦アレルギー", selectedGuest.allergy ?? "");
            if (a !== null) op({ op: "updateGuest", guestId: selectedGuest.id, allergy: a });
          }}>⚠ アレルギー</button>
          <button className="btn sm" onClick={() => op({ op: "deleteGuest", guestId: selectedGuest.id }).then(() => setSelected(null))}>ゲスト削除</button>
          <button className="btn sm" onClick={() => setSelected(null)}>キャンセル</button>
        </div>
      )}

      {/* 🔍 ズームバー＋選択ツールバー */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: "var(--text3)", fontWeight: 700 }}>🔍 表示</span>
        <button className="btn sm" onClick={() => setZoomClamped(zoom - 0.1)} title="縮小">−</button>
        <span style={{ fontSize: 12, fontWeight: 700, minWidth: 44, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)}%</span>
        <button className="btn sm" onClick={() => setZoomClamped(zoom + 0.1)} title="拡大">＋</button>
        <button className="btn sm" onClick={fitZoom} title="会場全体が画面に収まる倍率にします">⤢ 全体</button>
        <button className="btn sm" onClick={() => setZoom(1)} title="実寸比100%（1m=80px）">100%</button>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>背景ドラッグでスクロール／Ctrl（⌘）＋ホイールで拡大縮小</span>
      </div>

      {/* 🪑 選択中の卓・オブジェクトの操作（卓の中のボタンを廃止してここに集約） */}
      {canEdit && selObj && (() => {
        const t = selObj.kind === "table" ? tables.find((x) => x.id === selObj.id) : undefined;
        const o = selObj.kind === "object" ? objects.find((x) => x.id === selObj.id) : undefined;
        if (!t && !o) return null;
        const rot = o?.kind === "longtable" && (o.rotation ?? 0) === 90;
        return (
          <div className="card" style={{ padding: "8px 12px", marginBottom: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", borderColor: "var(--accent)" }}>
            <span className="pill accent">
              {t ? `${t.name}（${guests.filter((g) => g.tableId === t.id).length}/${t.capacity}名）` : o!.label || (o!.kind === "chair" ? "椅子" : "オブジェクト")}
            </span>
            {t && (
              <>
                <button className="btn sm" disabled={t.capacity <= 3} title="席を減らす（最小3）"
                  onClick={() => op({ op: "renameTable", tableId: t.id, capacity: t.capacity - 1 })}>席−</button>
                <button className="btn sm" disabled={t.capacity >= 10} title="席を増やす（最大10）"
                  onClick={() => op({ op: "renameTable", tableId: t.id, capacity: t.capacity + 1 })}>席＋</button>
                <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11.5 }}>
                  サイズ
                  <select className="form-input" style={{ padding: "3px 6px", fontSize: 11.5 }}
                    value={t.sizeCm ?? 200}
                    title="円卓の直径（実寸比で描画・印刷されます）"
                    onChange={(e) => op({ op: "renameTable", tableId: t.id, sizeCm: Number(e.target.value) })}>
                    {TABLE_SIZES.map(([cm, l]) => <option key={cm} value={cm}>{l}</option>)}
                  </select>
                </label>
                <button className="btn sm" onClick={() => {
                  const name = prompt("卓の名前を変更", t.name);
                  if (name?.trim()) op({ op: "renameTable", tableId: t.id, name });
                }}>名前変更</button>
                <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => {
                  if (confirm(`${t.name} を削除しますか？（ゲストは未割当に戻ります）`)) op({ op: "deleteTable", tableId: t.id }).then(() => setSelObj(null));
                }}>削除</button>
              </>
            )}
            {o && (
              <>
                {o.kind === "longtable" && (
                  <>
                    <button className="btn sm" disabled={(o.capacity ?? 0) <= 0} title="席を減らす（最小0）"
                      onClick={() => op({ op: "updateObject", objectId: o.id, capacity: (o.capacity ?? 0) - 1 })}>席−</button>
                    <button className="btn sm" disabled={(o.capacity ?? 0) >= 6} title="席を増やす（最大6）"
                      onClick={() => op({ op: "updateObject", objectId: o.id, capacity: (o.capacity ?? 0) + 1 })}>席＋</button>
                    <button className="btn sm" title="90°回転"
                      onClick={() => op({ op: "updateObject", objectId: o.id, rotation: rot ? 0 : 90 })}>↻ 回転</button>
                  </>
                )}
                {o.kind !== "chair" && (
                  <button className="btn sm" onClick={() => {
                    const label = prompt("名前を変更", o.label);
                    if (label?.trim()) op({ op: "updateObject", objectId: o.id, label });
                  }}>名前変更</button>
                )}
                <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => {
                  if (confirm(`「${o.label || "オブジェクト"}」を外しますか？`)) op({ op: "deleteObject", objectId: o.id }).then(() => setSelObj(null));
                }}>削除</button>
              </>
            )}
            <span style={{ fontSize: 11, color: "var(--text3)" }}>本体をそのままドラッグで移動できます</span>
            <div style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setSelObj(null)}>✕ 選択解除</button>
          </div>
        );
      })()}

      {/* フロアプランキャンバス（1m=80pxの実寸キャンバスをzoomで表示） */}
      <div className="seat-canvas-wrap" ref={wrapRef}
        onWheel={(e) => {
          // カーソル位置を基準に拡大縮小（見ていた場所がズレない）
          if (!(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          const wrap = wrapRef.current;
          if (!wrap) return;
          const rect = wrap.getBoundingClientRect();
          const cx = e.clientX - rect.left + wrap.scrollLeft;
          const cy = e.clientY - rect.top + wrap.scrollTop;
          const nz = Math.min(2, Math.max(0.25, Math.round((zoom + (e.deltaY < 0 ? 0.1 : -0.1)) * 100) / 100));
          if (nz === zoom) return;
          setZoom(nz);
          requestAnimationFrame(() => {
            wrap.scrollLeft = (cx / zoom) * nz - (e.clientX - rect.left);
            wrap.scrollTop = (cy / zoom) * nz - (e.clientY - rect.top);
          });
        }}>
        <div style={{ width: hall.w * zoom, height: hall.h * zoom }}>
        <div className="seat-canvas" ref={canvasRef}
          style={{ width: hall.w, height: hall.h, transform: `scale(${zoom})`, transformOrigin: "0 0", cursor: "grab" }}
          onPointerDown={(e) => {
            // 背景ドラッグでスクロール（パン）
            if (e.target !== canvasRef.current) return;
            const wrap = wrapRef.current;
            if (!wrap) return;
            const sx = e.clientX, sy = e.clientY, sl = wrap.scrollLeft, st = wrap.scrollTop;
            const move = (ev: PointerEvent) => { wrap.scrollLeft = sl - (ev.clientX - sx); wrap.scrollTop = st - (ev.clientY - sy); };
            const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
          onClick={(e) => {
            // 背景クリックで選択解除
            if (e.target === canvasRef.current) { setSelected(null); setSelObj(null); }
          }}>
          {/* 会場の範囲を明示（壁の太枠＋左上ラベル。外側のグレー＝会場外） */}
          <div className="hall-label">
            披露宴会場　{(hall.w / 80).toFixed(hall.w % 80 === 0 ? 0 : 1)}m × {(hall.h / 80).toFixed(hall.h % 80 === 0 ? 0 : 1)}m
          </div>
          {/* 会場オブジェクト */}
          {objects.map((o) => {
            const p = objPos(o);
            const sz = objSize(o);
            const isChair = o.kind === "chair";
            // 長机の回転（90°で縦横入替え表示）
            const rot = o.kind === "longtable" && (o.rotation ?? 0) === 90;
            const dw = rot ? sz.h : sz.w;
            const dh = rot ? sz.w : sz.h;
            const sitter = isChair ? guests.find((g) => g.seatObjectId === o.id) ?? null : null;
            // 椅子はドロップ／タップで席次を割当（1脚=1名）
            const chairProps = isChair && canEdit ? {
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(o.id); },
              onDragLeave: () => setDragOver(null),
              onDrop: (e: React.DragEvent) => {
                e.preventDefault(); e.stopPropagation();
                const gid = e.dataTransfer.getData("text/plain");
                if (gid) moveGuestToChair(gid, o.id);
              },
              onClick: (e: React.MouseEvent) => {
                if (suppressClickRef.current) return;
                e.stopPropagation();
                if (selectedGuest) { moveGuestToChair(selectedGuest.id, o.id); return; }
                if (!sitter) setAddingAt({ chairId: o.id, x: p.x, y: p.y + sz.h });
              },
            } : {};
            return (
              <div key={o.id} className={`floor-obj ${o.kind} ${dragOver === o.id ? "droppable" : ""}`}
                style={{
                  left: p.x, top: p.y, width: dw, height: dh,
                  cursor: canEdit ? "grab" : undefined,
                  ...(dragOver === o.id
                    ? { boxShadow: "0 0 0 3px var(--amber, #b07a2a)" }
                    : selObj?.kind === "object" && selObj.id === o.id
                    ? { boxShadow: "0 0 0 3px var(--amber-soft), var(--shadow-lg)", borderColor: "var(--amber)" }
                    : {}),
                }}
                onDoubleClick={() => {
                  if (!canEdit || isChair) return;
                  const label = prompt("名前を変更", o.label);
                  if (label?.trim()) op({ op: "updateObject", objectId: o.id, label });
                }}
                onPointerDown={(e) => {
                  // 本体をそのままドラッグで移動（ボタン・名札・リサイズは除く）
                  if (!canEdit) return;
                  if ((e.target as HTMLElement).closest("button,input,form,.seat-chip,.seat-add,.fo-resize")) return;
                  moveObject(o, e);
                }}
                onClick={(e) => {
                  // クリックで選択（上のツールバーで編集）。ドラッグ直後は無視
                  if (!canEdit || isChair || suppressClickRef.current) return;
                  e.stopPropagation();
                  setSelObj({ kind: "object", id: o.id });
                }}
                {...chairProps}
                title={isChair
                  ? (sitter ? `${sitter.name} 様（クリックした名札をここへ／ドラッグでも割当可）` : "空席：名札をドロップ or クリックで直接入力")
                  : canEdit ? "ドラッグで移動／クリックで選択して編集" : o.label}>
                <span className="fo-label">{isChair ? "" : o.label}</span>
                {canEdit && (
                  <>
                    {isChair && (
                      <button className="fo-del" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
                        e.stopPropagation();
                        if (sitter && !confirm(`この椅子には ${sitter.name} 様が着席中です。外しますか？（未割当に戻ります）`)) return;
                        if (sitter || confirm(`「${o.label}」を外しますか？`)) op({ op: "deleteObject", objectId: o.id });
                      }}>×</button>
                    )}
                    {!isChair && !rot && <span className="fo-resize" onPointerDown={(e) => resizeObject(o, e)}>◢</span>}
                  </>
                )}
                {/* 椅子の着席者（名札はドラッグで席替え可能） */}
                {sitter && (
                  <span onPointerDown={(e) => e.stopPropagation()}>
                    <Chip g={sitter} style={{ left: dw / 2, top: dh + 12 }} />
                  </span>
                )}
                {/* 長机の席：円卓と同じ操作（＋クリックで直接入力／名札ドロップ／選択タップ）
                    席数は「席＋/席−」で増減（片側3席まで・最大6。初期0）。回転時は左右に配置 */}
                {o.kind === "longtable" && (() => {
                  const longEdge = rot ? dh : dw;
                  const perSideSlots = Math.min(3, Math.max(1, Math.round(longEdge / 56)));
                  const cap = Math.max(0, Math.min(6, o.capacity ?? 0));
                  const bottomN = Math.min(cap, perSideSlots);
                  const topN = Math.min(cap - bottomN, perSideSlots);
                  const seats = bottomN + topN;
                  const members = guests.filter((g) => g.seatObjectId === o.id);
                  const bySeat = new Map<number, Guest>();
                  const unseated: Guest[] = [];
                  for (const g of members) {
                    if (g.seatNo !== null && g.seatNo >= 0 && g.seatNo < seats && !bySeat.has(g.seatNo)) bySeat.set(g.seatNo, g);
                    else unseated.push(g);
                  }
                  const seatGuest: (Guest | undefined)[] = Array.from({ length: seats }, (_, k) => bySeat.get(k));
                  for (let k = 0; k < seats && unseated.length > 0; k++) {
                    if (!seatGuest[k]) seatGuest[k] = unseated.shift();
                  }
                  return Array.from({ length: seats }, (_, k) => {
                    const isBottom = k < bottomN; // 回転時は「右側」
                    const col = isBottom ? k : k - bottomN;
                    const rowN = isBottom ? bottomN : topN;
                    let lx: number, ly: number;
                    if (!rot) {
                      lx = ((col + 0.5) * dw) / rowN;
                      ly = isBottom ? dh + 18 : -18;
                    } else {
                      ly = ((col + 0.5) * dh) / rowN;
                      lx = isBottom ? dw + 18 : -18;
                    }
                    const g = seatGuest[k];
                    if (g) {
                      return (
                        <span key={`s${k}`} onPointerDown={(e) => e.stopPropagation()}>
                          <Chip g={g} style={{ left: lx, top: ly }} />
                        </span>
                      );
                    }
                    return canEdit ? (
                      <button key={`s${k}`} className="seat-add" style={{ left: lx, top: ly }}
                        title="クリックで直接入力／名札をここへドロップでも着席できます"
                        onPointerDown={(e) => e.stopPropagation()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(o.id); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOver(null);
                          const gid = e.dataTransfer.getData("text/plain");
                          if (gid) { setSelected(null); op({ op: "updateGuest", guestId: gid, seatObjectId: o.id, seatNo: k }); }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedGuest) {
                            setSelected(null);
                            op({ op: "updateGuest", guestId: selectedGuest.id, seatObjectId: o.id, seatNo: k });
                            return;
                          }
                          setAddingAt({ chairId: o.id, seatNo: k, x: p.x + lx, y: p.y + ly });
                        }}>＋</button>
                    ) : (
                      <span key={`s${k}`} className="seat-empty" style={{ left: lx, top: ly }} />
                    );
                  });
                })()}
              </div>
            );
          })}

          {/* 円卓 */}
          {tables.map((t, i) => {
            const p = tablePos(t, i);
            const members = guests.filter((g) => g.tableId === t.id);
            const seats = Math.max(t.capacity, members.length);
            const full = members.length >= t.capacity;
            // 席番号（＋を押した席）優先で配置。番号なしは空席へ順に自動配置
            const bySeat = new Map<number, Guest>();
            const unseated: Guest[] = [];
            for (const g of members) {
              if (g.seatNo !== null && g.seatNo >= 0 && g.seatNo < seats && !bySeat.has(g.seatNo)) bySeat.set(g.seatNo, g);
              else unseated.push(g);
            }
            const seatGuest: (Guest | undefined)[] = Array.from({ length: seats }, (_, k) =>
              bySeat.get(k) ?? undefined);
            for (let k = 0; k < seats && unseated.length > 0; k++) {
              if (!seatGuest[k]) seatGuest[k] = unseated.shift();
            }
            const disc = tableDiscPx(t); // 円卓サイズ（cm→px・実寸比）
            const sr = tableSeatR(t);
            return (
              <div key={t.id} className={`stable ${dragOver === t.id ? "droppable" : ""}`}
                style={{ left: p.x, top: p.y, width: BOX, height: BOX }}>
                <div className="disc" {...dropProps(t.id, t.id)}
                  style={{
                    width: disc, height: disc,
                    cursor: canEdit ? "grab" : undefined,
                    ...(selObj?.kind === "table" && selObj.id === t.id
                      ? { borderColor: "var(--amber)", boxShadow: "0 0 0 3px var(--amber-soft), var(--shadow-lg)" }
                      : {}),
                  }}
                  title={canEdit ? "ドラッグで移動／クリックで選択して編集（席±・名前・削除）" : t.name}
                  onPointerDown={(e) => {
                    // 卓そのものをドラッグで移動（ボタン・入力・名札は除く）
                    if (!canEdit) return;
                    if ((e.target as HTMLElement).closest("button,input,form,.seat-chip")) return;
                    moveTable(t, i, e);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressClickRef.current) return;
                    if (selectedGuest) { moveGuest(selectedGuest.id, t.id); return; }
                    setSelObj({ kind: "table", id: t.id });
                  }}>
                  {renaming === t.id ? (
                    <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      op({ op: "renameTable", tableId: t.id, name: f.get("name"), capacity: f.get("capacity") });
                      setRenaming(null);
                    }}>
                      <input className="form-input" style={{ padding: "3px 6px", width: 92, fontSize: 11 }} name="name" defaultValue={t.name} autoFocus />
                      <input className="form-input" style={{ padding: "3px 6px", width: 50, fontSize: 11, marginTop: 4 }} name="capacity" type="number" min={3} max={10} defaultValue={t.capacity} title="定員（3〜10名）" />
                      <div style={{ display: "flex", gap: 4, marginTop: 4, justifyContent: "center" }}>
                        <button className="btn sm primary">保存</button>
                        <button type="button" className="btn sm" onClick={() => setRenaming(null)}>×</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {/* 卓内はシンプルに名前と人数のみ（編集は選択→上部ツールバー） */}
                      <b>{t.name}</b>
                      <span className="cnt" style={full ? { color: "var(--red)", fontWeight: 700 } : {}}>{members.length}/{t.capacity}名</span>
                    </>
                  )}
                </div>
                {Array.from({ length: seats }, (_, k) => {
                  const g = seatGuest[k];
                  const sp = seatPos(k, seats, sr);
                  if (g) return <Chip key={g.id} g={g} style={{ left: sp.left, top: sp.top }} />;
                  return canEdit && !full ? (
                    <button key={`e${k}`} className="seat-add" style={{ left: sp.left, top: sp.top }}
                      title="クリックで直接入力／名札をここへドロップでも着席できます"
                      onDragOver={(e) => { e.preventDefault(); setDragOver(t.id); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const gid = e.dataTransfer.getData("text/plain");
                        if (gid) moveGuest(gid, t.id, k); // この席に着席
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedGuest) { moveGuest(selectedGuest.id, t.id, k); return; } // 選択中ゲストをこの席へ
                        setAddingAt({ tableId: t.id, seatNo: k, x: p.x + sp.left, y: p.y + sp.top });
                      }}>＋</button>
                  ) : (
                    <span key={`e${k}`} className="seat-empty" style={{ left: sp.left, top: sp.top }} />
                  );
                })}
              </div>
            );
          })}

          {/* 空席クリック → その場で直接入力 */}
          {addingAt && (
            <form className="seat-pop"
              style={{ left: Math.min(addingAt.x, hall.w - 210), top: Math.min(addingAt.y + 14, hall.h - 160) }}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget).entries());
                // reload=false → ポップアップを閉じてから強制リフレッシュ（即時反映）
                if (await op({ op: "addGuest", ...f, tableId: addingAt.tableId, seatNo: addingAt.seatNo, seatObjectId: addingAt.chairId }, false)) {
                  setAddingAt(null);
                  await load(true);
                }
              }}>
              <input className="form-input" style={{ width: "100%", padding: "6px 10px", fontSize: 12.5 }}
                name="name" placeholder="お名前（例：田中 一郎）" autoFocus required />
              <input className="form-input" style={{ width: "100%", padding: "6px 10px", fontSize: 12.5, marginTop: 6 }}
                name="title" placeholder="肩書（例：㈱◯◯ 代表取締役）※任意" />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <select className="form-input" style={{ flex: 1, padding: "4px 6px", fontSize: 11.5 }} name="side">
                  <option value="groom">{sideLabel("groom")}</option><option value="bride">{sideLabel("bride")}</option>
                </select>
                <select className="form-input" style={{ flex: 1, padding: "4px 6px", fontSize: 11.5 }} name="relation">
                  {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button className="btn sm primary" style={{ flex: 1 }}>この席に追加</button>
                <button type="button" className="btn sm" onClick={() => setAddingAt(null)}>×</button>
              </div>
            </form>
          )}
        </div>
        </div>
      </div>

      {/* 未割当ゾーン＋一括追加 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          未割当のゲスト <span className={`pill ${unassigned.length ? "amber" : "green"}`}>{unassigned.length}名</span>
        </div>
        <div className={`unassigned-zone ${dragOver === "unassigned" ? "droppable" : ""}`} {...dropProps("unassigned", null)}>
          {unassigned.length === 0 && <span style={{ fontSize: 12, color: "var(--text3)" }}>全員の席が決まっています 🎉（卓から外すときはここへドラッグ）</span>}
          {/* 新郎側／新婦側 → 間柄ごとに仕分けして表示 */}
          {(["groom", "bride"] as const).map((side) => {
            const sideGuests = unassigned.filter((g) => g.side === side);
            if (sideGuests.length === 0) return null;
            // 間柄はマスタの並び順 → その他
            const relOrder = [...RELATIONS, ...Array.from(new Set(sideGuests.map((g) => g.relation))).filter((r) => !RELATIONS.includes(r))];
            return (
              <div key={side} style={{ width: "100%", marginBottom: 8 }}>
                <div style={{
                  fontSize: 12, fontWeight: 800, marginBottom: 4, paddingBottom: 2,
                  color: side === "groom" ? "var(--blue)" : "var(--accent-text)",
                  borderBottom: `1.5px solid ${side === "groom" ? "var(--blue)" : "var(--accent)"}`,
                }}>
                  {sideEmoji(side)} {sideLabel(side)} <span style={{ fontWeight: 500, fontSize: 11 }}>{sideGuests.length}名</span>
                </div>
                {relOrder.map((rel) => {
                  const group = sideGuests.filter((g) => g.relation === rel);
                  if (group.length === 0) return null;
                  return (
                    <div key={rel} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 10.5, color: "var(--text3)", minWidth: 34, fontWeight: 600 }}>{rel}</span>
                      {group.map((g) => <Chip key={g.id} g={g} />)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {canEditProp && (
          <>
            <form className="card" style={{ padding: 12, marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} onSubmit={addGuest}>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>リストに追加：</span>
              <input className="form-input" style={{ flex: 1, minWidth: 130 }} name="name" placeholder="ゲスト氏名" required />
              <input className="form-input" style={{ flex: 1, minWidth: 130 }} name="title" placeholder="肩書（任意）" />
              <select className="form-input" style={{ width: 96 }} name="side">
                <option value="groom">{sideLabel("groom")}</option><option value="bride">{sideLabel("bride")}</option>
              </select>
              <select className="form-input" style={{ width: 96 }} name="relation">
                {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="btn primary">追加</button>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn sm" onClick={exportCsv}>⬇ CSV出力</button>
              <label className="btn sm" style={{ cursor: "pointer" }}>
                ⬆ CSV取込
                <input type="file" accept=".csv,text/csv" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
              </label>
            </form>
            <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
              CSV形式：<code>{bridal ? "氏名,肩書,側(新郎/新婦),間柄,卓名" : "氏名,肩書,側(groom/bride),間柄,卓名"}</code>（1行目ヘッダー可・Excelから保存したCSVもOK・卓名が一致すると自動で着席）
            </p>
          </>
        )}
      </div>
      </>}
    </>
  );
}
