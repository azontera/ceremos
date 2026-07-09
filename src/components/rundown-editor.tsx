"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mcTemplates } from "@/lib/mc-templates";

type Item = {
  id: string; time: string; title: string; note: string | null;
  mcScript: string | null; durationMin: number | null; roles: string; status: string;
  songId: string | null;
  song: { title: string; artist: string | null; durationSec: number | null; memo: string | null; url: string | null; cueTiming?: string | null; videoOn?: boolean; mediaMime?: string | null } | null;
};
type SongInfo = { scene: string; title: string; artist: string | null };

const ROLE_OPTS: [string, string][] = [
  ["mc", "司会"], ["audio", "音響"], ["catering", "料理"], ["service", "サービス"], ["photo", "カメラ"],
];

// 新規シーンのプリセット（選ぶと演目名・担当・所要・おすすめ選曲のシーンが自動設定される）
// useSong: 楽曲を使うのが定番のシーンは最初から「楽曲を使用」にチェックが入る
const SCENE_PRESETS: { value: string; label: string; title: string; roles: string; dur: number; songScene: string; useSong: boolean }[] = [
  { value: "chapel", label: "⛪ チャペル挙式", title: "挙式（チャペル）", roles: "mc,audio,photo", dur: 30, songScene: "chapel", useSong: true },
  { value: "entrance", label: "🚪 入場", title: "新郎新婦 入場", roles: "mc,audio,photo", dur: 5, songScene: "entrance", useSong: true },
  { value: "toast", label: "🥂 乾杯", title: "ウェルカムスピーチ・乾杯", roles: "mc,catering", dur: 15, songScene: "toast", useSong: true },
  { value: "cake", label: "🎂 ケーキカット", title: "ケーキ入刀・ファーストバイト", roles: "mc,audio,photo", dur: 15, songScene: "cake", useSong: true },
  { value: "meal", label: "🍽 お食事・歓談", title: "お食事・ご歓談", roles: "catering,service", dur: 30, songScene: "party", useSong: true },
  { value: "leave", label: "👗 中座", title: "中座（お色直し）", roles: "mc,audio", dur: 20, songScene: "leave", useSong: true },
  { value: "reentry", label: "✨ 再入場", title: "再入場・テーブルラウンド", roles: "mc,audio,photo", dur: 20, songScene: "reentry", useSong: true },
  { value: "performance", label: "🎤 余興・スピーチ", title: "ご友人による余興", roles: "mc,audio", dur: 15, songScene: "party", useSong: true },
  { value: "bouquet", label: "💐 手紙・花束", title: "新婦の手紙・花束贈呈", roles: "mc,audio", dur: 20, songScene: "bouquet", useSong: true },
  { value: "farewell", label: "🎁 送賓", title: "送賓（プチギフト）", roles: "service,audio", dur: 20, songScene: "farewell", useSong: true },
  { value: "custom", label: "✏️ 自由入力", title: "", roles: "", dur: 10, songScene: "", useSong: true },
];

/** YouTube URL → 埋め込みID */
function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/);
  return m ? m[1] : null;
}

/** "HH:MM" → 分。終了時刻の表示用 */
function hm2min(t: string): number | null {
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function min2hm(mins: number): string {
  mins = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function sceneForTitle(title: string): string | null {
  if (title.includes("再入場")) return "reentry";
  if (title.includes("入場")) return "entrance";
  if (title.includes("乾杯")) return "toast";
  if (title.includes("ケーキ")) return "cake";
  if (title.includes("中座")) return "leave";
  if (title.includes("手紙") || title.includes("花束")) return "bouquet";
  if (title.includes("送賓") || title.includes("お見送り")) return "farewell";
  return null;
}

export function RundownEditor({
  caseId, items, canEdit, songs, groomName, brideName,
}: { caseId: string; items: Item[]; canEdit: boolean; songs: SongInfo[]; groomName: string; brideName: string }) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [scriptOpen, setScriptOpen] = useState<Record<string, boolean>>({});
  // 「元に戻す」用スナップショット（変更操作の直前状態を最大20件）
  const history = useRef<Item[][]>([]);
  const [undoCount, setUndoCount] = useState(0);

  async function api(url: string, method: string, body?: unknown) {
    history.current = [...history.current.slice(-19), items.map((i) => ({ ...i }))];
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      history.current.pop(); // 失敗時はスナップショット破棄
      setErr(data.error ?? `操作に失敗しました（HTTP ${res.status}）`);
      return false;
    }
    setUndoCount(history.current.length);
    setErr(""); router.refresh(); return true;
  }

  async function undo() {
    const snap = history.current.pop();
    setUndoCount(history.current.length);
    if (!snap) return;
    const res = await fetch(`/api/v1/cases/${caseId}/rundown`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: snap }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "元に戻せませんでした");
      return;
    }
    setErr(""); router.refresh();
  }

  // ===== マイテンプレート（この進行表を型として保存・読み込み） =====
  const [tplChoices, setTplChoices] = useState<{ id: string; name: string; isSystem: boolean; count: number; items: unknown[] }[] | null>(null);

  async function saveAsTemplate() {
    const name = prompt("テンプレート名を入力（例：ナイトウェディング用・二部制パーティ）");
    if (!name?.trim()) return;
    const res = await fetch("/api/v1/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "rundown",
        name,
        bodyJson: {
          items: items.map((r) => ({
            time: r.time, title: r.title, note: r.note ?? undefined,
            mcScript: r.mcScript ?? undefined, durationMin: r.durationMin ?? 10, roles: r.roles,
          })),
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? "テンプレートの保存に失敗しました"); return; }
    setErr("");
    alert(`テンプレート「${name}」を保存しました。新規案件の作成時や「📥 テンプレ読込」で使えます。`);
  }

  async function openTemplates() {
    const res = await fetch("/api/v1/templates?type=rundown");
    const data = await res.json().catch(() => ({}));
    const parsed = (data.templates ?? []).map((t: { id: string; name: string; isSystem: boolean; bodyJson: string }) => {
      let its: unknown[] = [];
      try { its = JSON.parse(t.bodyJson ?? "{}").items ?? []; } catch { /* ignore */ }
      return { id: t.id, name: t.name, isSystem: t.isSystem, count: its.length, items: its };
    }).filter((t: { count: number }) => t.count > 0);
    setTplChoices(parsed);
  }

  async function applyTemplate(tpl: { name: string; items: unknown[] }) {
    if (!confirm(`現在の進行表を「${tpl.name}」で置き換えますか？（↩元に戻すで取り消せます）`)) return;
    // Undo用スナップショットを積んでから一括置換
    history.current = [...history.current.slice(-19), items.map((i) => ({ ...i }))];
    setUndoCount(history.current.length);
    const res = await fetch(`/api/v1/cases/${caseId}/rundown`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: tpl.items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { history.current.pop(); setUndoCount(history.current.length); setErr(data.error ?? "読み込みに失敗しました"); return; }
    setErr(""); setTplChoices(null); router.refresh();
  }

  // 表示用楽曲：行に紐付いた曲が最優先（旧データはシーン推定でフォールバック）
  // 「（曲未定）」は空白扱い＝表示しない（曲が決まったら自動で出る）
  const songOf = (r: Item) => {
    const s = r.song ?? (sceneForTitle(r.title) ? songs.find((x) => x.scene === sceneForTitle(r.title)) ?? null : null);
    return s && s.title !== "（曲未定）" ? s : null;
  };

  /** 行の追加・編集フォーム（司会台本テンプレート3種＋自由入力） */
  function RowForm({ item, onDone }: { item?: Item; onDone: () => void }) {
    const [roles, setRoles] = useState<string[]>(item?.roles.split(",").filter(Boolean) ?? []);
    const [title, setTitle] = useState(item?.title ?? "");
    const [dur, setDur] = useState(String(item?.durationMin ?? 10));
    const [script, setScript] = useState(item?.mcScript ?? "");
    // シーン（新規作成時に選択 → 演目名・担当・所要・選曲シーンが自動設定）
    const [scene, setScene] = useState<string>(item ? "" : "");
    const applyScene = (p: (typeof SCENE_PRESETS)[number]) => {
      setScene(p.value);
      if (p.value !== "custom") {
        setTitle(p.title);
        setRoles(p.roles.split(",").filter(Boolean));
        setDur(String(p.dur));
      } else {
        setTitle("");
      }
    };
    // 楽曲の編集は楽曲タブ専用（ここではシーンだけ決めて、新規行に曲枠を自動作成する）
    const suggestScene = () =>
      SCENE_PRESETS.find((p) => p.value === scene)?.songScene || sceneForTitle(title) || "";
    const tmpls = title ? mcTemplates(title, groomName, brideName) : [];

    async function submit(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget).entries());
      const body = {
        ...f, title, durationMin: dur, mcScript: script, roles: roles.join(","),
        // 新規行には曲枠（未定）を自動作成。既存行の楽曲はここでは触らない（楽曲タブ専用）
        ...(item ? {} : { song: { use: true, scene: suggestScene() } }),
      };
      const ok = item
        ? await api(`/api/v1/rundown-items/${item.id}`, "PATCH", body)
        : await api(`/api/v1/cases/${caseId}/rundown`, "POST", body);
      if (ok) onDone();
    }
    return (
      <form onSubmit={submit} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", display: "grid", gap: 8 }}>
        {/* シーン選択（新規作成時）：演目・担当・所要・おすすめ選曲が自動設定される */}
        {!item && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>シーン:</span>
            {SCENE_PRESETS.map((p) => (
              <button type="button" key={p.value} onClick={() => applyScene(p)}
                className={`pill ${scene === p.value ? "accent" : "gray"}`}
                style={{ cursor: "pointer", border: "none" }}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="form-input" style={{ flex: 2, minWidth: 150 }} value={title} placeholder="演目（例：ケーキ入刀）"
            onChange={(e) => setTitle(e.target.value)} required />
          <span style={{ fontSize: 12, color: "var(--text3)" }}>所要</span>
          <input className="form-input" style={{ width: 72 }} type="number" min={1} max={600}
            value={dur} onChange={(e) => setDur(e.target.value)} title="所要分（時刻は自動計算）" />
          <span style={{ fontSize: 12, color: "var(--text3)" }}>分</span>
          <input className="form-input" style={{ flex: 2, minWidth: 160 }} name="note" defaultValue={item?.note ?? ""} placeholder="備考・演出メモ" />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>担当:</span>
          {ROLE_OPTS.map(([v, l]) => (
            <label key={v} className={`pill ${roles.includes(v) ? "blue" : "gray"}`} style={{ cursor: "pointer" }}>
              <input type="checkbox" style={{ display: "none" }} checked={roles.includes(v)}
                onChange={() => setRoles((r) => r.includes(v) ? r.filter((x) => x !== v) : [...r, v])} />
              {l}
            </label>
          ))}
        </div>
        {/* 楽曲はここでは編集しない（楽曲タブ専用） */}
        <p style={{ fontSize: 11.5, color: "var(--text3)", margin: 0 }}>
          ♪ 曲選びは<a href={`/cases/${caseId}?tab=songs`} style={{ fontWeight: 700 }}>楽曲タブ</a>で。
          この進行表と同じ行が並び、シーンに合わせた「🎲 おすすめ10曲」やYouTube視聴で選べます。
          {item?.song && item.song.title !== "（曲未定）" && <>　現在の曲：<b>{item.song.title}</b></>}
        </p>
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>🎤 司会コメント</span>
            {tmpls.map((t) => (
              <button type="button" key={t.name} className="btn sm" onClick={() => setScript(t.text)}>{t.name}</button>
            ))}
            <button type="button" className="btn sm" onClick={() => setScript("")}>自由入力（クリア）</button>
          </div>
          <textarea className="form-input" rows={3} value={script} placeholder="テンプレートを選ぶか、自由に入力（編集可）"
            onChange={(e) => setScript(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm primary">{item ? "保存" : "追加"}</button>
          <button type="button" className="btn sm" onClick={onDone}>キャンセル</button>
        </div>
      </form>
    );
  }

  const first = items[0];

  return (
    <>
      <div className="section-h" style={{ margin: "0 0 14px", flexWrap: "wrap" }}>
        {canEdit && first && (
          <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            開始時刻
            <input className="form-input" style={{ width: 86, padding: "5px 8px" }} type="time" defaultValue={first.time}
              onBlur={(e) => { if (e.target.value && e.target.value !== first.time) api(`/api/v1/rundown-items/${first.id}`, "PATCH", { time: e.target.value }); }} />
            <span className="pill gray">以降は所要分から自動計算</span>
          </span>
        )}
        {canEdit && (
          <button className="btn" onClick={undo} disabled={undoCount === 0}
            title="直前の編集・削除・並び替えを取り消します">↩ 元に戻す{undoCount > 0 ? `（${undoCount}）` : ""}</button>
        )}
        <button className="btn" onClick={() => {
          const anyClosed = items.some((r) => r.mcScript && !scriptOpen[r.id]);
          setScriptOpen(Object.fromEntries(items.map((r) => [r.id, anyClosed])));
        }}>🎤 台本を{items.some((r) => r.mcScript && !scriptOpen[r.id]) ? "全て表示" : "隠す"}</button>
        {canEdit && (
          <>
            <button className="btn" onClick={saveAsTemplate} disabled={items.length === 0}
              title="この進行表を自分のテンプレートとして保存します">💾 テンプレ保存</button>
            <button className="btn" onClick={openTemplates}
              title="保存済みテンプレートで進行表を置き換えます">📥 テンプレ読込</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <a className="btn" href={`/print/${caseId}/rundown`} target="_blank" title="司会コメント・楽曲込みの共通台本（1本）">🖨 台本</a>
        <a className="btn" href={`/print/${caseId}/kouban`} target="_blank">🖨 香盤表</a>
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* テンプレート選択（読み込み） */}
      {tplChoices && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📥 進行表テンプレートを選択</div>
          {tplChoices.length === 0 && <div className="empty">テンプレートがありません（「💾 テンプレ保存」で作成できます）</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
            {tplChoices.map((t) => (
              <button key={t.id} className="card" style={{ padding: 14, textAlign: "left", cursor: "pointer" }}
                onClick={() => applyTemplate(t)}>
                <b style={{ fontSize: 13 }}>{t.name}</b>
                <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 4 }}>
                  {t.count}演目 {t.isSystem ? <span className="pill gray">標準</span> : <span className="pill accent">マイテンプレ</span>}
                </div>
              </button>
            ))}
          </div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setTplChoices(null)}>キャンセル</button>
        </div>
      )}
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 10 }}>
        進行表がすべての台本の親データです。<b>行をクリックすると編集</b>、⠿ドラッグで並び替え（<b>時刻は自動再計算</b>）。
        枠の縦の長さ＝所要時間です（バーチャート）。🎤は司会コメント（クリックで開閉）、🎵は楽曲タブの曲と自動連動。
      </p>

      <div className="card" style={{ overflowX: "auto" }}>
        <div className="rg-wrap">
          {items.length === 0 && !adding && <div className="empty">進行表はまだありません</div>}
          {items.length > 0 && (
            <div className="rg-row rg-head">
              <div className="rg-cell">時刻・所要</div>
              <div className="rg-cell">演目</div>
              <div className="rg-cell">うごき・楽曲・音響</div>
              <div className="rg-cell">担当・司会</div>
            </div>
          )}
          {items.map((r, i) => {
            const song = songOf(r);
            if (editId === r.id) return <RowForm key={r.id} item={r} onDone={() => setEditId(null)} />;
            // 縦バーチャート：所要分に比例して枠を長くする（極端に長い演目は240pxで頭打ち）
            const dur = r.durationMin ?? 10;
            const h = Math.max(64, Math.min(240, dur * 4.4));
            const startMin = hm2min(r.time);
            const endHM = startMin !== null ? min2hm(startMin + dur) : null;
            return (
              <div key={r.id} className={`rg-row ${canEdit ? "editable" : ""}`}
                style={{ minHeight: h, ...(dropAt === i ? { boxShadow: "inset 0 3px 0 var(--accent)" } : {}) }}
                draggable={canEdit}
                onClick={() => canEdit && setEditId(r.id)}
                title={canEdit ? "クリックで編集／ドラッグで並び替え" : undefined}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDropAt(i); } }}
                onDragLeave={() => setDropAt(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropAt(null);
                  const gid = e.dataTransfer.getData("text/plain");
                  if (gid && gid !== r.id) api(`/api/v1/rundown-items/${gid}`, "PATCH", { toIndex: i });
                }}>
                {/* 時刻・所要（開始〜終了） */}
                <div className="rg-cell rg-time" style={canEdit ? { cursor: "grab" } : undefined}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    {canEdit && <span style={{ color: "var(--text3)", fontWeight: 400, fontSize: 12 }}>⠿</span>}
                    <span>{r.time}</span>
                  </div>
                  {endHM && <div style={{ fontSize: 10.5, color: "var(--text3)", fontWeight: 500 }}>〜{endHM}</div>}
                  <span className="pill gray" style={{ fontSize: 10, marginTop: 4 }}>{dur}分</span>
                </div>
                {/* 演目 */}
                <div className="rg-cell">
                  <b style={{ fontSize: 14 }}>
                    <span style={{ color: "var(--text3)", fontWeight: 600, marginRight: 6 }}>{i + 1}.</span>{r.title}
                  </b>
                </div>
                {/* うごき・楽曲・音響 */}
                <div className="rg-cell" style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.75 }}>
                  {r.note && <div>{r.note}</div>}
                  {song && (() => {
                    // 音か動画か一目でわかるバッジ（🎬=映像ウィンドウに投影される／🎵=音のみ）
                    const isVideo = !!r.song?.mediaMime?.startsWith("video/") || !!r.song?.videoOn;
                    const srcLabel = r.song?.mediaMime
                      ? (r.song.mediaMime.startsWith("video/") ? "動画ファイル" : "音源ファイル")
                      : r.song?.url && youtubeId(r.song.url) ? "YouTube" : null;
                    return (
                      <div style={{ color: "var(--accent-text)", marginTop: r.note ? 3 : 0 }}>
                        {isVideo ? "🎬" : "🎵"} {song.title}{song.artist ? `／${song.artist}` : ""}
                        {srcLabel && (
                          <span className={`pill ${isVideo ? "accent" : "gray"}`} style={{ fontSize: 10, marginLeft: 6 }}
                            title={isVideo ? "本番でこのシーンは映像ウィンドウに投影されます" : "音のみ再生"}>
                            {isVideo ? "🎬 " : "♪ "}{srcLabel}{r.song?.videoOn ? "・映像ON" : ""}
                          </span>
                        )}
                        {r.song?.cueTiming && <span style={{ color: "var(--amber, #b07a2a)", fontWeight: 700 }}>　⏱ {r.song.cueTiming}</span>}
                      </div>
                    );
                  })()}
                  {r.mcScript && scriptOpen[r.id] && (
                    <div style={{ marginTop: 5, whiteSpace: "pre-wrap", borderLeft: "3px solid var(--accent)", paddingLeft: 8 }}>
                      🎤 {r.mcScript}
                    </div>
                  )}
                </div>
                {/* 担当・司会 */}
                <div className="rg-cell" style={{ display: "flex", flexWrap: "wrap", gap: 4, alignContent: "flex-start" }}>
                  {r.roles.split(",").filter(Boolean).map((role) => (
                    <span key={role} className="pill blue">{ROLE_OPTS.find(([v]) => v === role)?.[1] ?? role}</span>
                  ))}
                  {r.mcScript && (
                    <button className="btn sm" title="司会コメントを表示"
                      onClick={(e) => { e.stopPropagation(); setScriptOpen((s) => ({ ...s, [r.id]: !s[r.id] })); }}>🎤</button>
                  )}
                  {canEdit && (
                    <>
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); setEditId(r.id); }}>編集</button>
                      <button className="btn sm" onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`「${r.title}」を削除しますか？`)) api(`/api/v1/rundown-items/${r.id}`, "DELETE");
                      }}>削除</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {adding && <RowForm onDone={() => setAdding(false)} />}
        </div>
      </div>
      {canEdit && !adding && (
        <button className="btn" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>＋ 行を追加</button>
      )}
    </>
  );
}
