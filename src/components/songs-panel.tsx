"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CUE_TIMINGS } from "@/lib/cue-timings";
import { t as term, isBridal } from "@/lib/terms";

type Media = { id: string; fileName: string; mime: string | null } | null;
// 進行表の行と同じデータ（進行表がマスター：順序・時刻・追加・削除は進行表側で管理）
// songId が null の行は曲枠がまだ無い＝「＋曲を選ぶ」でその場で作成できる
export type LinkedSong = {
  itemId: string; time: string; itemTitle: string; note: string | null; // 進行表側（読み取り専用）
  songId: string | null; scene: string; title: string; artist: string | null;
  durationSec: number | null; startSec: number | null;
  volume: number; fadeInSec: number; fadeOutSec: number; videoOn: boolean;
  cueTiming: string | null; // 流すタイミング（板付き・曲先・キャプテン指示 等）
  memo: string | null; url: string | null; media: Media;
};

/** 演目名から選曲シーンを推定（曲枠をあとから作る行用） */
function sceneForItemTitle(title: string): string {
  if (title.includes("挙式") || title.includes("チャペル")) return "chapel";
  if (title.includes("再入場")) return "reentry";
  if (title.includes("入場")) return "entrance";
  if (title.includes("乾杯")) return "toast";
  if (title.includes("ケーキ")) return "cake";
  if (title.includes("中座")) return "leave";
  if (title.includes("手紙") || title.includes("花束")) return "bouquet";
  if (title.includes("送賓") || title.includes("お見送り")) return "farewell";
  return "party";
}

/** YouTube URL → 埋め込みID */
function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/);
  return m ? m[1] : null;
}

/** アップロードされたファイル名から曲名（＋わかれば アーティスト）を推定
 *  例："Earth, Wind & Fire - September.mp4" → artist="Earth, Wind & Fire" title="September"
 *  例："JUJU 「ラストシーン」〜LIVE映像.mp4" → artist="JUJU" title="ラストシーン"
 *  区切りが無い場合はファイル名全体を曲名候補にする（拡張子・アンダースコアのみ除去） */
function titleFromFileName(fileName: string): { title: string; artist: string | null } {
  const base = fileName.replace(/\.[^./]+$/, "").replace(/[_]+/g, " ").trim();
  // "アーティスト「曲名」…" 形式（YouTube由来のファイル名に多い）
  const kagi = base.match(/^(.{1,40}?)[ 　]*[「『](.+?)[」』]/);
  if (kagi && kagi[1].trim() && kagi[2].trim()) return { artist: kagi[1].trim(), title: kagi[2].trim() };
  // "「曲名」…" だけの形式
  const kagi2 = base.match(/^[「『](.+?)[」』]/);
  if (kagi2 && kagi2[1].trim()) return { title: kagi2[1].trim(), artist: null };
  const m = base.match(/^(.+?)\s*[-–—／/]\s*(.+)$/); // "アーティスト - 曲名" 形式（半角/全角ハイフン・スラッシュ対応）
  if (m && m[1].trim() && m[2].trim()) return { artist: m[1].trim(), title: m[2].trim() };
  return { title: base, artist: null };
}

export function SongsPanel({
  caseId, initial, canEdit, isStaff = false, caseType,
}: { caseId: string; initial: LinkedSong[]; canEdit: boolean; isStaff?: boolean; caseType?: string }) {
  const router = useRouter();
  // 宴会・式典モードでは婚礼用語（新郎/新婦）を出さない（表示文言のみ。データ・APIは不変）
  const bridal = isBridal(caseType);
  const [rows, setRows] = useState(initial.map((r) => ({
    ...r,
    title: r.title === "（曲未定）" ? "" : r.title, // 未定は空欄として編集
    artist: r.artist ?? "", memo: r.memo ?? "", url: r.url ?? "",
    durationSecStr: r.durationSec ? String(r.durationSec) : "",
    dirty: false,
  })));
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // おすすめ10曲＋好みのアーティスト
  const [suggestFor, setSuggestFor] = useState<string | null>(null); // songId
  const [suggests, setSuggests] = useState<{ title: string; artist: string; memo?: string }[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [prefsApplied, setPrefsApplied] = useState(false);
  const [dbSize, setDbSize] = useState(0);       // 楽曲DBの総曲数（約2万曲）
  const [dbQuery, setDbQuery] = useState("");    // 曲DB検索キーワード
  const [dbSearchMode, setDbSearchMode] = useState(false); // 検索結果表示中か
  const [previewVid, setPreviewVid] = useState<{ key: string; id: string } | null>(null);
  const [ytBusy, setYtBusy] = useState<string | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<{ groomArtists?: string; brideArtists?: string }>({});
  const hasPrefs = !!(prefs.groomArtists?.trim() || prefs.brideArtists?.trim());

  // 好みのアーティスト（初回読み込み）
  useEffect(() => {
    fetch(`/api/v1/cases/${caseId}/music-prefs`)
      .then((r) => r.json())
      .then((d) => { if (d.prefs) setPrefs({ groomArtists: d.prefs.groomArtists ?? "", brideArtists: d.prefs.brideArtists ?? "" }); })
      .catch(() => {});
  }, [caseId]);

  async function savePrefs() {
    const res = await fetch(`/api/v1/cases/${caseId}/music-prefs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });
    if (res.ok) setPrefsOpen(false);
    else setErr("好みのアーティストの保存に失敗しました");
  }

  async function loadSuggests(r: (typeof rows)[number], q = "") {
    setSuggestFor(r.songId);
    setSuggestBusy(true);
    setPreviewVid(null);
    setDbSearchMode(!!q.trim());
    const res = await fetch(`/api/v1/songs/suggest?scene=${encodeURIComponent(r.scene)}&caseId=${caseId}&q=${encodeURIComponent(q.trim())}`);
    const data = await res.json().catch(() => ({}));
    setSuggests(data.songs ?? []);
    setPrefsApplied(!!data.prefsApplied);
    if (data.dbSize) setDbSize(data.dbSize);
    setSuggestBusy(false);
  }

  async function fetchYoutube(q: string): Promise<{ videoId: string | null; url: string }> {
    const res = await fetch(`/api/v1/songs/youtube-search?q=${encodeURIComponent(q)}`);
    const data = await res.json().catch(() => ({}));
    return { videoId: data.videoId ?? null, url: data.url ?? "" };
  }

  // 採用：曲情報＋YouTube URLを自動設定して即保存
  async function adopt(r: (typeof rows)[number], sg: { title: string; artist: string; memo?: string }) {
    setYtBusy(`adopt-${r.songId}`);
    const yt = await fetchYoutube(`${sg.title} ${sg.artist}`);
    setYtBusy(null);
    setSuggestFor(null);
    setBusyId(r.songId); setErr("");
    const res = await fetch(`/api/v1/songs/${r.songId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: sg.title, artist: sg.artist, memo: sg.memo ?? r.memo, url: yt.url, durationSec: r.durationSecStr }),
    });
    setBusyId(null);
    if (!res.ok) { setErr("採用の保存に失敗しました"); return; }
    setRows((rs) => rs.map((x) => (x.songId === r.songId
      ? { ...x, title: sg.title, artist: sg.artist, memo: sg.memo ?? x.memo, url: yt.url, dirty: false }
      : x)));
    router.refresh();
  }

  async function previewSuggest(sg: { title: string; artist: string }, key: string) {
    setYtBusy(key);
    const yt = await fetchYoutube(`${sg.title} ${sg.artist}`);
    setYtBusy(null);
    if (yt.videoId) setPreviewVid({ key, id: yt.videoId });
    else if (yt.url) window.open(yt.url, "_blank");
  }

  function setRow(songId: string | null, patch: Partial<(typeof rows)[number]>) {
    setRows((rs) => rs.map((r) => (r.songId === songId ? { ...r, ...patch, dirty: true } : r)));
  }

  // ♪ 全シーンに曲枠を一括作成（楽曲は基本すべて使う想定）
  const [slotBusy, setSlotBusy] = useState(false);
  async function createAllSlots() {
    const targets = rows.filter((r) => !r.songId);
    if (targets.length === 0) return;
    setSlotBusy(true); setErr("");
    for (const r of targets) {
      await fetch(`/api/v1/rundown-items/${r.itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song: { use: true, scene: sceneForItemTitle(r.itemTitle) } }),
      }).catch(() => {});
    }
    location.reload();
  }

  // 曲枠がまだ無い行に曲枠（未定）を作成
  async function createSlot(r: (typeof rows)[number]) {
    setBusyId(r.itemId); setErr("");
    const res = await fetch(`/api/v1/rundown-items/${r.itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song: { use: true, scene: sceneForItemTitle(r.itemTitle) } }),
    });
    setBusyId(null);
    if (!res.ok) { setErr("曲枠の作成に失敗しました"); return; }
    location.reload(); // 新しい songId を反映
  }

  // 🎲 全曲おまかせ：曲が未定のシーンすべてに好みのアーティストを反映して自動選曲（YouTube URLも自動設定）
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoProg, setAutoProg] = useState("");
  async function autoFillAll() {
    let targets = rows.filter((r) => r.songId && !r.title);
    let replaceAll = false;
    if (targets.length === 0) {
      // 全曲設定済み → 確認のうえ「全入れ替え」モード（何度でも引き直せる）
      targets = rows.filter((r) => r.songId);
      if (targets.length === 0) { setErr("曲枠がありません（♪全シーンに曲枠を作成 を先に実行してください）"); return; }
      if (!confirm(`全曲設定済みです。${targets.length}シーンすべての曲を新しく選び直しますか？\n（現在の曲はすべて置き換わります。あとから1曲ずつ自由に変更できます）`)) return;
      replaceAll = true;
    } else if (!confirm(`曲が未定の${targets.length}シーンに、${hasPrefs ? "好みのアーティストを優先して" : ""}自動で曲を割り当てます。よろしいですか？\n（あとから1曲ずつ自由に変更できます）`)) return;
    setAutoBusy(true); setErr("");
    const usedTitles = new Set(replaceAll ? [] : rows.filter((r) => r.title).map((r) => r.title));
    const usedArtists = new Set(replaceAll ? [] : rows.filter((r) => r.artist).map((r) => r.artist));
    let done = 0;
    for (const r of targets) {
      setAutoProg(`${done + 1}/${targets.length}曲目を選曲中…（${r.itemTitle}）`);
      try {
        const res = await fetch(`/api/v1/songs/suggest?scene=${encodeURIComponent(r.scene)}&caseId=${caseId}`);
        const data = await res.json().catch(() => ({}));
        const cands: { title: string; artist: string; memo?: string }[] = data.songs ?? [];
        const cand = cands.find((c) => !usedTitles.has(c.title) && !usedArtists.has(c.artist)) ?? cands[0];
        if (!cand) continue;
        const yt = await fetchYoutube(`${cand.title} ${cand.artist}`);
        const pr = await fetch(`/api/v1/songs/${r.songId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: cand.title, artist: cand.artist, memo: cand.memo ?? "", url: yt.url }),
        });
        if (pr.ok) {
          usedTitles.add(cand.title); usedArtists.add(cand.artist); done++;
          setRows((rs) => rs.map((x) => (x.songId === r.songId
            ? { ...x, title: cand.title, artist: cand.artist, memo: cand.memo ?? "", url: yt.url, dirty: false }
            : x)));
        }
      } catch { /* 1曲失敗しても続行 */ }
    }
    setAutoBusy(false); setAutoProg("");
    router.refresh();
    alert(`🎲 ${done}曲を自動設定しました。${hasPrefs ? "（好みのアーティストを反映）" : "好みのアーティストを登録するとさらに好みに寄ります。"}\n各曲は▶視聴して、気に入らなければ「おすすめ10曲」やYouTube検索で差し替えられます。`);
  }

  // 流すタイミングの保存（即時保存・進行表と再生プレイヤーにも反映）
  async function saveCue(r: (typeof rows)[number], value: string | null) {
    if (!r.songId) return;
    const res = await fetch(`/api/v1/songs/${r.songId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cueTiming: value }),
    });
    if (!res.ok) { setErr("タイミングの保存に失敗しました"); return; }
    setRows((rs) => rs.map((x) => (x.songId === r.songId ? { ...x, cueTiming: value } : x)));
    router.refresh();
  }

  // 曲名・アーティストからYouTubeを検索してURLを自動入力＋視聴を開く
  async function searchYoutube(r: (typeof rows)[number]) {
    if (!r.title) return;
    setYtBusy(`yt-${r.songId}`);
    const yt = await fetchYoutube(`${r.title} ${r.artist}`.trim());
    setYtBusy(null);
    if (!yt.url) { setErr("YouTubeが見つかりませんでした"); return; }
    setRow(r.songId, { url: yt.url });
    setPreviewing(r.songId);
  }

  async function save(r: (typeof rows)[number]) {
    setBusyId(r.songId); setErr("");
    const res = await fetch(`/api/v1/songs/${r.songId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: r.title, artist: r.artist, durationSec: r.durationSecStr,
        memo: r.memo, url: r.url,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error ?? `保存に失敗しました（HTTP ${res.status}）`);
    else { setRows((rs) => rs.map((x) => (x.songId === r.songId ? { ...x, dirty: false } : x))); router.refresh(); }
    setBusyId(null);
  }

  async function upload(r: (typeof rows)[number], file: File) {
    if (!r.songId) return;
    setErr(""); setUploading(r.songId);
    // 本番はこのファイルが流れるため、曲名・アーティストをファイル名の情報で常に更新
    // （旧: 未入力時のみ補完 → アップロード済みファイルと表示タイトルがズレる問題を修正）
    let titlePatch: { title: string; artist?: string } | null = null;
    {
      const guess = titleFromFileName(file.name);
      if (guess.title) titlePatch = { title: guess.title, artist: guess.artist ?? "" };
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("parentType", "song");
    fd.append("parentId", r.songId);
    const res = await fetch(`/api/v1/cases/${caseId}/attachments`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? `アップロードに失敗しました（HTTP ${res.status}）`); setUploading(null); return; }
    setRows((rs) => rs.map((x) => (x.songId === r.songId ? { ...x, media: data.attachment } : x)));
    // 音源/動画ファイルをアップロードしたら、本番再生はそちらを優先するため視聴URL（YouTube等）は消しておく
    const patch: { title?: string; artist?: string; url: string } = { ...(titlePatch ?? {}), url: "" };
    const pr = await fetch(`/api/v1/songs/${r.songId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (pr.ok) {
      setRows((rs) => rs.map((x) => (x.songId === r.songId ? { ...x, ...patch, dirty: false } : x)));
    }
    setUploading(null);
    router.refresh();
  }

  /** エクスポート用の整理済みファイル名（例：03_ケーキ入刀_I Was Born To Love You） */
  const exportName = (r: (typeof rows)[number], idx: number) =>
    `${String(idx + 1).padStart(2, "0")}_${r.itemTitle}_${r.title || "無題"}`;

  return (
    <>
      <div className="section-h songs-head" style={{ margin: "0 0 14px" }}>
        <span className="pill gray pc-only">JASRAC申請項目（曲名・アーティスト・使用時間）を保持</span>
        {hasPrefs && <span className="pill green" title="おすすめ選曲に好みのアーティストを反映中">🎯 好み反映中</span>}
        <div className="pc-only" style={{ flex: 1 }} />
        {canEdit && (
          <button className="btn" onClick={() => setPrefsOpen((o) => !o)}>
            🎯 好みのアーティスト{hasPrefs ? "を変更" : ""}
          </button>
        )}
        {canEdit && rows.some((r) => !r.songId) && (
          <button className="btn primary" onClick={createAllSlots} disabled={slotBusy}
            title="楽曲は基本すべてのシーンで使う想定です。曲枠が無いシーン全部に曲枠（未定）を作成します">
            {slotBusy ? "作成中…" : `♪ 全シーンに曲枠を作成（${rows.filter((r) => !r.songId).length}件）`}
          </button>
        )}
        {canEdit && (
          <button className="btn primary" onClick={autoFillAll} disabled={autoBusy}
            title="曲が未定のシーン全部に、好みのアーティストを反映して自動で曲＋YouTube URLを設定します">
            {autoBusy ? autoProg || "選曲中…" : "🎲 全曲おまかせ"}
          </button>
        )}
        {/* 進行表・台本はスマホのお客様には出さない（下部ナビ・PCタブに集約） */}
        <a className={isStaff ? "btn" : "btn pc-only"} href={`/cases/${caseId}?tab=rundown`}>📋 進行表（順序・時刻の編集）</a>
        <a className={isStaff ? "btn" : "btn pc-only"} href={`/print/${caseId}/rundown`} target="_blank">🖨 台本</a>
        {isStaff && (
          <a className="btn primary" href={`/live/${caseId}/audio`}
            title="本番用の全画面プレイヤー（Space再生・波形シーク・映像小窓・シーンごとの音量/F.I/F.O）">🎚 再生プレイヤー</a>
        )}
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* 好みのアーティスト：登録するとおすすめ10曲・🎲全曲おまかせが好みに寄る */}
      {prefsOpen && (
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>🎯 好みのアーティスト・曲</div>
          <p style={{ fontSize: 11.5, color: "var(--text3)", margin: "0 0 12px" }}>
            登録したアーティスト・曲は「🎲 おすすめ10曲」「🎲 全曲おまかせ」で優先されます。あとからいつでも変更できます。
          </p>
          <div className="quiz-artists" style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>{bridal ? "🤵 新郎" : `🏢 ${term("groom", caseType)}`}の好きなアーティスト・曲</div>
              <textarea className="form-input" rows={2} value={prefs.groomArtists ?? ""}
                placeholder="例：Mr.Children、Official髭男dism、Subtitle"
                onChange={(e) => setPrefs((x) => ({ ...x, groomArtists: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>{bridal ? "👰 新婦" : `👤 ${term("bride", caseType)}`}の好きなアーティスト・曲</div>
              <textarea className="form-input" rows={2} value={prefs.brideArtists ?? ""}
                placeholder="例：YOASOBI、back number、ハナミズキ"
                onChange={(e) => setPrefs((x) => ({ ...x, brideArtists: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            <button className="btn primary" onClick={savePrefs}>保存して選曲に反映</button>
            <button className="btn" onClick={() => setPrefsOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 10 }}>
        進行表と<b>同じ行がそのまま並んでいます</b>（時刻・順序は進行表と自動連動）。
        ここで各シーンの曲を選びます — <b>🎲 おすすめ10曲</b>から採用するか、曲名を入力して<b>🔎 YouTube</b>で検索・視聴。曲名が空欄＝未定（台本には空白で印刷）。
        アップロードいただいた本番用の音源・映像データは、<b>式終了後に自動でサーバーから削除</b>されます（曲名等の記録は残ります）。
        {isStaff && <>　本番の再生（音量・F.I/F.O・映像）は<b>🎚 再生プレイヤー</b>で行います。</>}
      </p>

      <div className="grid" style={{ gap: 12 }}>
        {rows.length === 0 && (
          <div className="card"><div className="empty">
            進行表がまだありません。先に進行表タブでスケジュールを作成してください。
          </div></div>
        )}
        {rows.map((r, idx) => {
          // 曲枠がまだ無い行：その場で作成できる
          if (!r.songId) {
            return (
              <div className="card song-flex" key={r.itemId} style={{ padding: "12px 18px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="pill gray" title="進行表の時刻（自動連動）">{r.time}</span>
                <span className="pill accent">{idx + 1}. {r.itemTitle}</span>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>この演目にはまだ曲枠がありません</span>
                <div style={{ flex: 1 }} />
                {canEdit && (
                  <button className="btn sm primary" disabled={busyId === r.itemId} onClick={() => createSlot(r)}>
                    {busyId === r.itemId ? "作成中…" : "＋ 曲を選ぶ"}
                  </button>
                )}
              </div>
            );
          }
          const yid = r.url ? youtubeId(r.url) : null;
          const isVideo = r.media?.mime?.startsWith("video/");
          return (
            <div className="card" key={r.songId} style={{ padding: "14px 18px" }}>
              <div className="song-flex" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {/* 進行表側（読み取り専用）：シーンは大きく */}
                <span className="pill gray" style={{ fontSize: 13, fontWeight: 700 }} title="進行表の時刻（自動連動）">{r.time}</span>
                <span className="pill accent" style={{ fontSize: 14.5, fontWeight: 800, padding: "5px 14px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }} title={r.itemTitle}>
                  {idx + 1}. {r.itemTitle}
                </span>
                <input className="form-input" style={{ flex: 2, minWidth: 150 }} value={r.title} disabled={!canEdit}
                  placeholder="曲名" onChange={(e) => setRow(r.songId, { title: e.target.value })} />
                <input className="form-input" style={{ flex: 1.4, minWidth: 110 }} value={r.artist} disabled={!canEdit}
                  placeholder="アーティスト" onChange={(e) => setRow(r.songId, { artist: e.target.value })} />
                {/* 秒数・音響メモは技術項目：スマホでは隠す（PCで編集） */}
                <input className={isStaff ? "form-input" : "form-input sp-hide"} type="number" style={{ width: 76 }} value={r.durationSecStr} disabled={!canEdit}
                  placeholder="秒数" title="使用秒数" onChange={(e) => setRow(r.songId, { durationSecStr: e.target.value })} />
                <input className={isStaff ? "form-input" : "form-input sp-hide"} style={{ flex: 1.6, minWidth: 130 }} value={r.memo} disabled={!canEdit}
                  placeholder="音響メモ" onChange={(e) => setRow(r.songId, { memo: e.target.value })} />
                {canEdit && (
                  <button className="btn sm primary" disabled={busyId === r.songId || !r.dirty} onClick={() => save(r)}>
                    {busyId === r.songId ? "保存中…" : r.dirty ? "保存" : "保存済 ✓"}
                  </button>
                )}
              </div>

              <div className="song-flex" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                {/* ⏱ 流すタイミング（本番の合図。技術項目のためお客様のスマホでは非表示） */}
                <label className={isStaff ? undefined : "sp-hide"} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12, fontWeight: 700 }}
                  title="この曲を流し始める合図（板付き・曲先・キャプテン指示など）">
                  ⏱
                  <select className="form-input" style={{ padding: "5px 8px", fontSize: 12, maxWidth: 230, fontWeight: r.cueTiming ? 700 : 400, color: r.cueTiming ? "var(--amber, #b07a2a)" : undefined }}
                    disabled={!canEdit}
                    value={r.cueTiming && CUE_TIMINGS.includes(r.cueTiming) ? r.cueTiming : r.cueTiming ? "__custom__" : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__free__") {
                        const t = prompt(bridal ? "流すタイミングを入力（例：新婦手紙の朗読終わりで）" : "流すタイミングを入力（例：代表挨拶の終わりで）", r.cueTiming ?? "");
                        if (t !== null) saveCue(r, t.trim() || null);
                      } else if (v === "__custom__") {
                        /* 現在の自由入力値のまま */
                      } else {
                        saveCue(r, v || null);
                      }
                    }}>
                    <option value="">タイミング未設定</option>
                    {CUE_TIMINGS.map((t) => <option key={t} value={t}>{t}</option>)}
                    {r.cueTiming && !CUE_TIMINGS.includes(r.cueTiming) && (
                      <option value="__custom__">✏️ {r.cueTiming}</option>
                    )}
                    <option value="__free__">✏️ 自由入力…</option>
                  </select>
                </label>
                {canEdit && (
                  <button className="btn sm" disabled={suggestBusy && suggestFor === r.songId}
                    title="シーンと好みのアーティストに合わせて定番曲から10曲提案（何度でも引き直せます）"
                    onClick={() => loadSuggests(r)}>
                    {suggestBusy && suggestFor === r.songId ? "…" : suggestFor === r.songId ? "🎲 別の10曲に更新" : "🎲 おすすめ10曲"}
                  </button>
                )}
                {canEdit && (
                  <button className="btn sm" disabled={!r.title || ytBusy === `yt-${r.songId}`}
                    title="曲名・アーティストからYouTubeを検索してURLを自動入力＆視聴"
                    onClick={() => searchYoutube(r)}>
                    {ytBusy === `yt-${r.songId}` ? "…" : "🔎 YouTube"}
                  </button>
                )}
                {/* 視聴URLの直接編集はPC向け（スマホは🔎検索・採用で自動入力） */}
                <input className={isStaff ? "form-input" : "form-input sp-hide"} style={{ flex: 1, minWidth: 200, fontSize: 12 }} value={r.url} disabled={!canEdit}
                  placeholder="視聴URL（🔎検索・おすすめ採用で自動入力）" onChange={(e) => setRow(r.songId, { url: e.target.value })} />
                {(yid || r.url || r.media) && (
                  <button className="btn sm" onClick={() => setPreviewing(previewing === r.songId ? null : r.songId)}>
                    {previewing === r.songId ? "閉じる" : "▶ 視聴"}
                  </button>
                )}
                {canEdit && (
                  <>
                    <input ref={(el) => { fileRefs.current[r.songId!] = el; }} type="file" style={{ display: "none" }}
                      accept=".wav,.mp3,.mp4,.m4a,.aac,audio/*,video/mp4"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(r, f); e.target.value = ""; }} />
                    <button className="btn sm" disabled={uploading === r.songId}
                      onClick={() => fileRefs.current[r.songId!]?.click()}>
                      {uploading === r.songId
                        ? "アップロード中…"
                        : r.media
                        ? (isVideo ? "🔁 動画差替" : "🔁 音源差替")
                        : "⬆ 音源/動画"}
                    </button>
                  </>
                )}
                {r.media && (
                  <>
                    <span className="pill green" title={r.media.fileName}>
                      {isVideo ? "🎬" : "🎵"} {r.media.fileName.length > 22 ? r.media.fileName.slice(0, 22) + "…" : r.media.fileName}
                    </span>
                    {isStaff && (
                      <a className="btn sm" title="整理済みファイル名でダウンロード（スタッフのみ）"
                        href={`/api/v1/attachments/${r.media.id}?download=1&name=${encodeURIComponent(exportName(r, idx))}`}>
                        ⬇ {exportName(r, idx).slice(0, 24)}…
                      </a>
                    )}
                  </>
                )}
              </div>

              {/* おすすめ10曲（シーン×好みのアーティスト）＋ 曲DB検索（約2万曲） */}
              {suggestFor === r.songId && !suggestBusy && (
                <div className="card song-suggest" style={{ marginTop: 8, padding: "8px 12px", maxHeight: 340, overflowY: "auto", background: "var(--surface2)" }}>
                  <div className="song-flex" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                    <input className="form-input" style={{ flex: 1, minWidth: 160, fontSize: 12, padding: "5px 9px" }}
                      placeholder={`ブライダル定番${dbSize ? `${Math.round(dbSize / 1000)}千` : "2万"}曲から検索（曲名・アーティスト）`}
                      value={dbQuery}
                      onChange={(e) => setDbQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); loadSuggests(r, dbQuery); } }} />
                    <button type="button" className="btn sm" onClick={() => loadSuggests(r, dbQuery)}>🔎 DB検索</button>
                    {dbSearchMode && (
                      <button type="button" className="btn sm" onClick={() => { setDbQuery(""); loadSuggests(r); }}>おすすめに戻る</button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>
                    {dbSearchMode
                      ? <>「{dbQuery}」の検索結果（{suggests.length}件）— ▶で視聴、「採用」で曲名と視聴URLが自動保存されます</>
                      : <>「{r.itemTitle}」のシーンに合わせた提案{prefsApplied ? "（🎯 好みのアーティストを反映）" : ""}
                        — ▶で視聴、「採用」で曲名と視聴URLが自動保存されます</>}
                    <button type="button" className="btn sm" style={{ marginLeft: 8 }} onClick={() => { setSuggestFor(null); setDbSearchMode(false); }}>閉じる</button>
                  </div>
                  {suggests.length === 0 && <div className="empty" style={{ padding: 10 }}>候補がありません</div>}
                  {suggests.map((sg, i) => {
                    const key = `${r.songId}-${i}`;
                    return (
                      <div key={key} style={{ borderBottom: "1px solid var(--border)" }}>
                        <div className="list-row" style={{ border: "none" }}>
                          <div className="t">
                            <b style={{ fontSize: 12.5 }}>{sg.title}<span style={{ fontWeight: 400, color: "var(--text3)" }}>／{sg.artist}</span></b>
                            {sg.memo && <span>{sg.memo}</span>}
                          </div>
                          <button type="button" className="btn sm" disabled={ytBusy === key}
                            onClick={() => previewSuggest(sg, key)}>
                            {ytBusy === key ? "…" : "▶ 視聴"}
                          </button>
                          <button type="button" className="btn sm primary" disabled={ytBusy === `adopt-${r.songId}`}
                            onClick={() => adopt(r, sg)}>
                            {ytBusy === `adopt-${r.songId}` ? "…" : "採用"}
                          </button>
                        </div>
                        {previewVid?.key === key && (
                          <iframe width="100%" height="240" style={{ maxWidth: 426, borderRadius: 10, border: "1px solid var(--border)", margin: "0 0 8px" }}
                            src={`https://www.youtube.com/embed/${previewVid.id}?autoplay=1`}
                            title="視聴プレビュー" allow="autoplay; encrypted-media" allowFullScreen />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 視聴・再生エリア */}
              {previewing === r.songId && (
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {yid && (
                    <iframe
                      width="100%" height="315" style={{ maxWidth: 560, borderRadius: 12, border: "1px solid var(--border)" }}
                      src={`https://www.youtube.com/embed/${yid}`}
                      title="視聴プレビュー" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen />
                  )}
                  {!yid && r.url && (
                    <a href={r.url} target="_blank" className="btn sm" style={{ width: "fit-content" }}>🔗 リンクを開く（{r.url.slice(0, 40)}…）</a>
                  )}
                  {r.media && (
                    isVideo ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video controls preload="metadata" style={{ maxWidth: 560, width: "100%", borderRadius: 12, border: "1px solid var(--border)" }}
                        src={`/api/v1/attachments/${r.media.id}`} />
                    ) : (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <audio controls preload="metadata" style={{ width: "100%", maxWidth: 560 }}
                        src={`/api/v1/attachments/${r.media.id}`} />
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 本番音源エクスポート一覧（スタッフのみ：お客様は視聴・アップロードまで） */}
      {isStaff && rows.some((r) => r.media) && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h">📀 本番メディア一覧（エクスポート）</div>
          <div className="card-b">
            {rows.filter((r) => r.media).map((r) => {
              const idx = rows.indexOf(r);
              return (
                <div className="list-row" key={r.songId}>
                  <span className="pill gray">{r.time}</span>
                  <span className="pill accent">{r.itemTitle}</span>
                  <div className="t">
                    <b>{exportName(r, idx)}</b>
                    <span>{r.media!.fileName}（{r.media!.mime}）</span>
                  </div>
                  <a className="btn sm" href={`/api/v1/attachments/${r.media!.id}?download=1&name=${encodeURIComponent(exportName(r, idx))}`}>⬇ ダウンロード</a>
                </div>
              );
            })}
            <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8 }}>
              番号＿演目＿曲名 の形式で整理されたファイル名でダウンロードされます。当日はこの画面からそのまま再生も可能です。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
