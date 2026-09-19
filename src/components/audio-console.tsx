"use client";
// 🎚 再生プレイヤー（全画面・黒ベース）＝本番の暗い環境向けフルスクリーンコンソール
// 楽曲タブ内のプレイヤーと同じデータ・同じ設定（音量・F.I/F.O・開始秒・映像ON）を使用
// ・Space＝再生／再生中にもう一度＝次の曲へ　・Esc＝停止（そのシーンのF.Oでフェードアウト）
// ・シーンをクリック＝「次に流す曲」をそこに設定（NEXT表示）
// ・波形シークバー：クリックした位置から再生（音源は波形表示、YouTubeはシークバー）
// ・映像は基本投影しない。「映像ON」のシーンだけ小窓（枠なし）に投影
import { useCallback, useEffect, useRef, useState } from "react";
import { YTPlayer, youtubeId, loadYTApi } from "@/lib/yt-player";
import { CUE_TIMINGS } from "@/lib/cue-timings";

type Song = {
  id: string; title: string; artist: string | null;
  durationSec: number | null; startSec: number | null;
  volume: number; fadeInSec: number; fadeOutSec: number; videoOn: boolean;
  cueTiming: string | null;
  memo: string | null; url: string | null; mediaId: string | null; mediaMime: string | null;
};
type Item = {
  id: string; time: string; title: string; note: string | null;
  roles: string; status: string; delayMin: number; song: Song | null;
};

const fmt = (s: number) => {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function AudioConsole({ caseId, title, sub }: { caseId: string; title: string; sub: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [clock, setClock] = useState("--:--:--");
  const [err, setErr] = useState("");

  const [playing, setPlaying] = useState<{ itemId: string; label: string; kind: "yt" | "media"; onScreen: boolean } | null>(null);
  const [fading, setFading] = useState(false);
  const [screenOpen, setScreenOpen] = useState(false);
  const [blackout, setBlackout] = useState(false); // 🌑 映像ウィンドウの暗転
  const [screenVid, setScreenVid] = useState<string | null>(null); // 投影中のYouTube動画ID（モニター用）
  const [screenMedia, setScreenMedia] = useState<string | null>(null); // 投影中のアップロード動画URL（モニター用）
  const monVideoRef = useRef<HTMLVideoElement | null>(null); // 投影モニター（アップロード動画のミュートプレビュー）
  const [idleVer, setIdleVer] = useState(0); // 待機画像の更新カウンタ（モニターのプレビュー更新）
  const [cursor, setCursor] = useState(0); // 次にSpaceで流れる曲（クリックで変更）
  const cursorRef = useRef(0);
  cursorRef.current = cursor;
  const [prog, setProg] = useState({ t: 0, d: 0 }); // 再生位置
  const [peaks, setPeaks] = useState<number[] | null>(null); // 波形（音源のみ）

  const ytRef = useRef<YTPlayer | null>(null);
  const monRef = useRef<YTPlayer | null>(null); // 投影モニター用（ミュートの同期プレビュー）
  const keyActionsRef = useRef<{ space: () => void; esc: () => void }>({ space: () => {}, esc: () => {} });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rampTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const winRef = useRef<Window | null>(null);
  const chRef = useRef<BroadcastChannel | null>(null);
  const lastLoadRef = useRef<Record<string, unknown> | null>(null); // 直近の投影コマンド（ウィンドウ起動時に再送）
  const remoteProg = useRef({ t: 0, d: 0 });
  const peaksCache = useRef<Record<string, number[]>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef<typeof playing>(null);
  playingRef.current = playing;
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  // 映像ウィンドウとの通信（進捗も受信）※未対応ブラウザでは映像連携のみ無効
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(`ceremos-live-${caseId}`);
    chRef.current = ch;
    ch.onmessage = (ev) => {
      const m = ev.data ?? {};
      if (m.cmd === "progress") remoteProg.current = { t: m.t ?? 0, d: m.d ?? 0 };
      // 映像ウィンドウ側で押された Space / Esc（フォーカスがどちらでも操作可能）
      if (m.cmd === "key") {
        if (m.k === "space") keyActionsRef.current.space();
        if (m.k === "esc") keyActionsRef.current.esc();
      }
      // 映像ウィンドウ側で動画が最後まで終わった → コンソールの状態もクリア（NEXTはそのまま）
      if (m.cmd === "screen-ended") {
        if (playingRef.current?.onScreen) hardStop(false);
      }
      // 映像ウィンドウ側の再生エラー（埋め込み禁止・API読込失敗など）を表示
      if (m.cmd === "screen-error" && m.msg) setErr(String(m.msg));
      // 映像ウィンドウが（後から）起動した → 投影中なら現在位置から再送
      if (m.cmd === "screen-ready") {
        setScreenOpen(true);
        const cur = playingRef.current;
        if (cur?.onScreen && lastLoadRef.current) {
          ch.postMessage({ ...lastLoadRef.current, start: Math.floor(remoteProg.current.t || Number(lastLoadRef.current.start) || 0), fadeInSec: 0 });
        }
      }
    };
    return () => ch.close();
  }, [caseId]);
  useEffect(() => {
    const t = setInterval(() => {
      if (winRef.current && winRef.current.closed) { winRef.current = null; setScreenOpen(false); }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const killRamp = () => {
    if (rampTimer.current) { clearInterval(rampTimer.current); rampTimer.current = null; }
    setFading(false);
  };
  const hardStop = useCallback((notifyScreen = true) => {
    killRamp();
    try { ytRef.current?.stopVideo(); } catch { /* ignore */ }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); }
    if (notifyScreen) chRef.current?.postMessage({ cmd: "stop" });
    try { monRef.current?.stopVideo(); } catch { /* ignore */ }
    remoteProg.current = { t: 0, d: 0 };
    setProg({ t: 0, d: 0 });
    setPlaying(null);
    setScreenVid(null);
    setScreenMedia(null);
  }, []);
  useEffect(() => () => hardStop(), [hardStop]);

  const playable = (it: Item) =>
    !!it.song && it.song.title !== "（曲未定）" && (!!(it.song.url && youtubeId(it.song.url)) || !!it.song.mediaId);
  const playlist = items.filter(playable);
  const playlistRef = useRef<Item[]>([]);
  playlistRef.current = playlist;

  function ramp(kind: "yt" | "media", from: number, to: number, sec: number, onDone?: () => void) {
    killRamp();
    const setVol = (v: number) => {
      try {
        if (kind === "yt") ytRef.current?.setVolume(Math.round(v));
        else if (audioRef.current) audioRef.current.volume = v / 100;
      } catch { /* ignore */ }
    };
    if (sec <= 0) { setVol(to); onDone?.(); return; }
    const steps = Math.max(1, Math.round(sec * 10));
    let n = 0;
    setVol(from);
    rampTimer.current = setInterval(() => {
      n++;
      setVol(from + (to - from) * (n / steps));
      if (n >= steps) { killRamp(); onDone?.(); }
    }, 100);
  }

  // 映像ウィンドウ：小さめ・枠なしポップアップ（プロジェクターへ移して全画面に）
  // ※ 開いた後はフォーカスをコンソールへ戻す（Space/Esc操作が映像側に取られないように）
  const refocusConsole = useCallback(() => {
    setTimeout(() => { try { winRef.current?.blur(); window.focus(); } catch { /* ignore */ } }, 150);
    setTimeout(() => { try { window.focus(); } catch { /* ignore */ } }, 800);
  }, []);
  const openScreenWindow = useCallback(() => {
    if (winRef.current && !winRef.current.closed) { winRef.current.focus(); refocusConsole(); return; }
    winRef.current = window.open(
      `/live/${caseId}/screen`, "ceremos-screen",
      "popup,width=640,height=360,left=80,top=80,resizable,scrollbars=no",
    );
    setScreenOpen(true);
    refocusConsole();
  }, [caseId, refocusConsole]);

  // 波形の読み込み（アップロード音源のみ。YouTubeはシークバー表示）
  async function loadPeaks(sg: Song) {
    if (!sg.mediaId) { setPeaks(null); return; }
    // 動画ファイルは波形解析をスキップ（大容量のため。シークバー表示にフォールバック）
    if (sg.mediaMime?.startsWith("video/")) { setPeaks(null); return; }
    if (peaksCache.current[sg.id]) { setPeaks(peaksCache.current[sg.id]); return; }
    setPeaks(null);
    try {
      const buf = await (await fetch(`/api/v1/attachments/${sg.mediaId}`)).arrayBuffer();
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(buf);
      const ch0 = audio.getChannelData(0);
      const BUCKETS = 600;
      const step = Math.max(1, Math.floor(ch0.length / BUCKETS));
      const out: number[] = [];
      for (let i = 0; i < BUCKETS; i++) {
        let max = 0;
        const base = i * step;
        for (let j = 0; j < step; j += 20) {
          const v = Math.abs(ch0[base + j] ?? 0);
          if (v > max) max = v;
        }
        out.push(max);
      }
      ctx.close();
      peaksCache.current[sg.id] = out;
      if (playingRef.current && itemsRef.current.find((x) => x.id === playingRef.current!.itemId)?.song?.id === sg.id) {
        setPeaks(out);
      }
    } catch { setPeaks(null); }
  }

  const play = useCallback(async (it: Item) => {
    const sg = it.song;
    if (!sg) return;
    hardStop(true);
    const label = `${sg.title}${sg.artist ? `／${sg.artist}` : ""}`;
    const start = sg.startSec ?? 0;
    // 音源/動画ファイルがアップロード済みならそちらを優先（YouTube URLが残っていても無視）
    const vid = sg.mediaId ? null : (sg.url ? youtubeId(sg.url) : null);
    const isVideoFile = !!sg.mediaId && !!sg.mediaMime?.startsWith("video/");
    const idx = playlistRef.current.findIndex((x) => x.id === it.id);
    setCursor(idx >= 0 ? idx + 1 : cursorRef.current);
    setProg({ t: start, d: sg.durationSec ?? 0 });

    // アップロードされた動画ファイル（MP4等）＋映像ON → 映像ウィンドウに投影（音声もそちらで再生）
    if (isVideoFile && sg.videoOn) {
      const mediaUrl = `/api/v1/attachments/${sg.mediaId}`;
      const needOpen = !(winRef.current && !winRef.current.closed);
      openScreenWindow();
      setPlaying({ itemId: it.id, label, kind: "media", onScreen: true });
      setScreenVid(null);
      setScreenMedia(mediaUrl); // 投影モニター用
      setPeaks(null);
      const payload = { cmd: "load", mediaUrl, start, volume: sg.volume, fadeInSec: sg.fadeInSec, label };
      lastLoadRef.current = payload; // ウィンドウが後から開いても screen-ready で再送される
      const send = () => {
        chRef.current?.postMessage(payload);
        refocusConsole();
      };
      setTimeout(send, needOpen ? 1600 : 100);
      return;
    }
    if (vid && sg.videoOn) {
      const needOpen = !(winRef.current && !winRef.current.closed);
      openScreenWindow();
      setPlaying({ itemId: it.id, label, kind: "yt", onScreen: true });
      setScreenVid(vid); // 投影モニター用
      setScreenMedia(null);
      setPeaks(null);
      const payload = { cmd: "load", videoId: vid, start, volume: sg.volume, fadeInSec: sg.fadeInSec, label };
      lastLoadRef.current = payload; // ウィンドウが後から開いても screen-ready で再送される
      const send = () => {
        chRef.current?.postMessage(payload);
        refocusConsole(); // 操作（Space/Esc）をコンソールに保つ
      };
      setTimeout(send, needOpen ? 1600 : 100);
      return;
    }
    if (vid) {
      setPlaying({ itemId: it.id, label, kind: "yt", onScreen: false });
      setPeaks(null);
      await loadYTApi();
      if (ytRef.current) {
        ytRef.current.setVolume(sg.fadeInSec > 0 ? 0 : sg.volume);
        ytRef.current.loadVideoById({ videoId: vid, startSeconds: start });
      } else {
        ytRef.current = new window.YT!.Player("ac-yt-player", {
          width: "1", height: "1", videoId: vid,
          playerVars: { autoplay: 1, controls: 0, rel: 0, start },
          events: {
            onReady: (e: { target: YTPlayer }) => { e.target.setVolume(sg.fadeInSec > 0 ? 0 : sg.volume); e.target.playVideo(); },
            onStateChange: (e: { data: number }) => { if (e.data === 0) hardStop(); }, // 曲が終わったら状態クリア
          },
        });
      }
      ramp("yt", 0, sg.volume, sg.fadeInSec);
    } else if (sg.mediaId) {
      setPlaying({ itemId: it.id, label, kind: "media", onScreen: false });
      loadPeaks(sg); // 波形
      if (!audioRef.current) audioRef.current = new Audio();
      const a = audioRef.current;
      a.onended = () => hardStop(); // 音源が終わったら状態クリア
      a.src = `/api/v1/attachments/${sg.mediaId}`;
      a.volume = sg.fadeInSec > 0 ? 0 : sg.volume / 100;
      a.currentTime = start;
      a.play().catch(() => setErr("音源を再生できませんでした"));
      ramp("media", 0, sg.volume, sg.fadeInSec);
    }
  }, [hardStop, openScreenWindow]);

  const stopWithFade = useCallback(() => {
    const cur = playingRef.current;
    if (!cur) return;
    const it = itemsRef.current.find((x) => x.id === cur.itemId);
    const fo = it?.song?.fadeOutSec ?? 2;
    const vol = it?.song?.volume ?? 70;
    if (cur.onScreen) {
      setFading(true);
      chRef.current?.postMessage({ cmd: "fade", sec: fo, volume: vol });
      setTimeout(() => { setFading(false); setPlaying(null); setProg({ t: 0, d: 0 }); }, fo * 1000 + 200);
      return;
    }
    if (fo <= 0) { hardStop(); return; }
    setFading(true);
    ramp(cur.kind, vol, 0, fo, () => hardStop());
  }, [hardStop]);

  // シーク：波形／バーのクリック位置から再生
  function seek(t: number) {
    const cur = playingRef.current;
    if (!cur) return;
    if (cur.onScreen) chRef.current?.postMessage({ cmd: "seek", t });
    else if (cur.kind === "yt") { try { ytRef.current?.seekTo?.(t, true); } catch { /* ignore */ } }
    else if (audioRef.current) audioRef.current.currentTime = t;
  }

  // 再生位置のポーリング（250ms）
  useEffect(() => {
    const t = setInterval(() => {
      const cur = playingRef.current;
      if (!cur) return;
      try {
        if (cur.onScreen) {
          setProg({ ...remoteProg.current });
          // 投影モニターのズレ補正（2秒以上ずれたら同期）＋自動再生ブロック対策（常に再生を促す）
          const mv = monVideoRef.current;
          if (mv && mv.src) {
            // アップロード動画のミュートプレビュー同期
            if (Math.abs((mv.currentTime || 0) - remoteProg.current.t) > 2) mv.currentTime = remoteProg.current.t;
            if (mv.paused) { mv.muted = true; mv.play().catch(() => {}); }
          } else {
            const mt = monRef.current?.getCurrentTime?.();
            if (typeof mt === "number" && Math.abs(mt - remoteProg.current.t) > 2) {
              monRef.current?.seekTo?.(remoteProg.current.t, true);
            }
            try { monRef.current?.mute?.(); monRef.current?.playVideo(); } catch { /* ignore */ }
          }
        }
        else if (cur.kind === "yt") setProg({ t: ytRef.current?.getCurrentTime?.() ?? 0, d: ytRef.current?.getDuration?.() ?? 0 });
        else if (audioRef.current) setProg({ t: audioRef.current.currentTime || 0, d: audioRef.current.duration || 0 });
      } catch { /* ignore */ }
    }, 250);
    return () => clearInterval(t);
  }, []);

  // 波形／シークバーの描画
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const W = 1200, H = 128;
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const frac = prog.d > 0 ? Math.min(1, prog.t / prog.d) : 0;
    if (peaks && peaks.length > 0) {
      const bw = W / peaks.length;
      const maxP = Math.max(0.01, ...peaks);
      peaks.forEach((p, i) => {
        const h = Math.max(2, (p / maxP) * (H - 10));
        const x = i * bw;
        g.fillStyle = i / peaks.length <= frac ? "#d4a75a" : "#3a3a46";
        g.fillRect(x, (H - h) / 2, Math.max(1, bw - 1), h);
      });
    } else {
      g.fillStyle = "#2b2b36";
      g.fillRect(0, H / 2 - 5, W, 10);
      g.fillStyle = "#d4a75a";
      g.fillRect(0, H / 2 - 5, W * frac, 10);
      g.beginPath();
      g.arc(W * frac, H / 2, 11, 0, Math.PI * 2);
      g.fillStyle = "#e8c583";
      g.fill();
    }
  }, [prog, peaks]);

  // キーボード：Space＝再生／次の曲、Esc＝停止（F.O）
  // 映像ウィンドウ側で押されたキーも同じ動作（BroadcastChannel経由 → keyActionsRef）
  useEffect(() => {
    const doSpace = () => {
      if (fading) return;
      const target = playlistRef.current[cursorRef.current] ?? playlistRef.current[0];
      if (target) play(target);
      else if (playingRef.current) stopWithFade();
    };
    const doEsc = () => { if (!fading) stopWithFade(); };
    keyActionsRef.current = { space: doSpace, esc: doEsc };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t?.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); doSpace(); }
      if (e.key === "Escape") { e.preventDefault(); doEsc(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play, stopWithFade, fading]);

  // 📺 投影モニター（アップロード動画）：src解除時に確実に停止
  useEffect(() => {
    const mv = monVideoRef.current;
    if (!mv) return;
    if (!screenMedia) { try { mv.pause(); mv.removeAttribute("src"); mv.load(); } catch { /* ignore */ } }
    else { mv.muted = true; mv.currentTime = remoteProg.current.t || 0; mv.play().catch(() => {}); }
  }, [screenMedia]);

  // 📺 投影モニター：ミュートの同期プレビュー（投影中の動画をリアルタイム表示）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!screenVid) { try { monRef.current?.stopVideo(); } catch { /* ignore */ } return; }
      await loadYTApi();
      if (cancelled) return;
      const start = Math.floor(remoteProg.current.t || 0);
      if (monRef.current) {
        monRef.current.mute?.();
        monRef.current.loadVideoById({ videoId: screenVid, startSeconds: start });
        monRef.current.playVideo();
      } else {
        monRef.current = new window.YT!.Player("ac-mon-yt", {
          width: "168", height: "94", videoId: screenVid,
          playerVars: { autoplay: 1, controls: 0, rel: 0, mute: 1, start, iv_load_policy: 3 },
          events: { onReady: (e: { target: YTPlayer }) => { e.target.mute?.(); e.target.playVideo(); } },
        });
      }
    })();
    return () => { cancelled = true; };
  }, [screenVid]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/cases/${caseId}/rundown`, { cache: "no-store" });
    if (res.ok) setItems((await res.json()).items);
  }, [caseId]);
  useEffect(() => {
    load();
    const poll = setInterval(load, 3000);
    const tick = setInterval(() => {
      const d = new Date();
      setClock([d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":"));
    }, 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [load]);

  async function saveSong(sg: Song, patch: Record<string, unknown>) {
    const res = await fetch(`/api/v1/songs/${sg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { setErr("設定の保存に失敗しました"); return; }
    setItems((its) => its.map((it) => it.song?.id === sg.id ? { ...it, song: { ...it.song!, ...patch } as Song } : it));
    const cur = playingRef.current;
    if (patch.volume !== undefined && cur && itemsRef.current.find((x) => x.id === cur.itemId)?.song?.id === sg.id) {
      const v = Number(patch.volume);
      if (cur.onScreen) chRef.current?.postMessage({ cmd: "volume", v });
      else if (cur.kind === "yt") { try { ytRef.current?.setVolume(v); } catch { /* ignore */ } }
      else if (audioRef.current) audioRef.current.volume = v / 100;
    }
  }

  const nextItem = playlist[cursor] ?? null;
  const playingItem = playing ? items.find((x) => x.id === playing.itemId) ?? null : null;

  return (
    <div className="live ac-dark open" style={{ display: "flex", background: "var(--bg)" }}>
      <div className="live-top">
        <div className="clock" style={{ color: "var(--accent-text)" }}>{clock}</div>
        <div>
          <b style={{ fontSize: 15 }}>🎚 {title}</b>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>{sub}</div>
        </div>
        <div className="grow" />
        <a className="btn" href={`/print/${caseId}/rundown`} target="_blank">🖨 台本</a>
        <a className="btn" href={`/cases/${caseId}?tab=rundown#songs`}>終了</a>
      </div>
      {err && <div className="form-err" style={{ margin: "8px 16px 0" }}>{err}</div>}

      {/* NOW PLAYING：波形シーク付きトランスポート */}
      <div style={{ padding: "14px 22px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: playing ? 10 : 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {playing ? (
              <>
                <div className="ac-now-label">{fading ? "FADE OUT…" : playing.onScreen ? "NOW PLAYING ─ 🖥 投影中" : "NOW PLAYING"}</div>
                <div className="ac-now-title">♪ {playing.label}</div>
                {playingItem?.song?.cueTiming && <div className="ac-cue" style={{ fontSize: 14 }}>⏱ {playingItem.song.cueTiming}</div>}
                {playingItem?.note && <div className="ac-cue">🔖 {playingItem.note}</div>}
              </>
            ) : (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: "var(--text3)" }}><b style={{ color: "var(--accent-text)" }}>Space</b>＝再生　<b style={{ color: "var(--accent-text)" }}>Esc</b>＝停止（F.O）　再生中に<b style={{ color: "var(--accent-text)" }}>Space</b>＝次の曲</span>
              </div>
            )}
          </div>
          {nextItem && (
            <div style={{ textAlign: "right", fontSize: 12, color: "var(--text3)", minWidth: 0 }}>
              <div style={{ fontSize: 10.5, letterSpacing: ".24em", color: "var(--amber)", fontWeight: 800 }}>NEXT（Space）</div>
              <div style={{ fontWeight: 700, color: "var(--text2)" }}>♪ {nextItem.song!.title}<span style={{ color: "var(--text3)", fontWeight: 400 }}>　{nextItem.title}</span></div>
              {nextItem.song!.cueTiming && <div style={{ color: "var(--amber)", fontSize: 12.5, fontWeight: 800 }}>⏱ {nextItem.song!.cueTiming}</div>}
              {nextItem.note && <div style={{ color: "var(--amber)", fontSize: 11.5 }}>🔖 {nextItem.note}</div>}
            </div>
          )}
          {/* 📺 投影モニター：映像ウィンドウ（プロジェクター）に今出ている内容 */}
          <div style={{ width: 168, flexShrink: 0 }} title="映像ウィンドウに今投影されている内容">
            <div style={{ fontSize: 9, letterSpacing: ".3em", color: "var(--text3)", marginBottom: 3 }}>PROJECTOR</div>
            <div style={{
              position: "relative", width: 168, height: 94, borderRadius: 8, overflow: "hidden",
              background: "#000", border: `1px solid ${screenOpen ? "var(--accent)" : "var(--border)"}`,
              display: "grid", placeItems: "center",
            }}>
              {/* リアルタイム同期プレビュー（ミュート）。投影中のみ表示 */}
              <div id="ac-mon-yt" style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                visibility: playing?.onScreen && screenVid && !blackout && screenOpen ? "visible" : "hidden",
              }} />
              {/* アップロード動画（MP4等）のミュート同期プレビュー */}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={monVideoRef} muted playsInline
                src={screenMedia ?? undefined}
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none",
                  visibility: playing?.onScreen && screenMedia && !blackout && screenOpen ? "visible" : "hidden",
                }} />
              {!screenOpen ? (
                <span style={{ fontSize: 10.5, color: "var(--text3)" }}>未接続（🖥映像で開く）</span>
              ) : blackout ? (
                <span style={{ fontSize: 11, color: "#666" }}>🌑 暗転中</span>
              ) : playing?.onScreen && (screenVid || screenMedia) ? (
                <span style={{ position: "absolute", bottom: 3, right: 5, zIndex: 2, fontSize: 10, background: "rgba(0,0,0,.7)", padding: "1px 5px", borderRadius: 4, color: "#fff" }}>
                  ▶ LIVE {fmt(prog.t)}
                </span>
              ) : (
                <>
                  {/* 待機画像（未設定なら真っ黒） */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/v1/branding/screen-image?v=${idleVer}`} alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  <span style={{ position: "absolute", bottom: 3, right: 5, fontSize: 9.5, color: "#888" }}>待機中</span>
                </>
              )}
            </div>
          </div>
          <button className="btn" onClick={openScreenWindow}
            title="プロジェクター用の小窓（枠なし）を開いておく。投影されるのは映像ONのシーンだけ">
            🖥 映像{screenOpen ? "（表示中）" : ""}
          </button>
          <button className="btn" disabled={!screenOpen}
            title="映像ウィンドウをフル画面に（拡張ディスプレイ＝プロジェクターへ移してから押す。ブロックされた場合はウィンドウをクリック）"
            onClick={() => chRef.current?.postMessage({ cmd: "fullscreen" })}>
            ⛶ フル画面
          </button>
          {/* 待機画像：動画を再生していない間、映像ウィンドウに投影される */}
          <label className="btn" style={{ cursor: "pointer" }}
            title="動画が流れていない時に映像ウィンドウへ投影する画像（お客様のロゴ・ウェルカム画像など）をその場で設定">
            🖼 待機画像
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const fd = new FormData();
                fd.append("file", f);
                const res = await fetch("/api/v1/admin/settings/screen-image", { method: "POST", body: fd });
                if (res.ok) {
                  chRef.current?.postMessage({ cmd: "idle-refresh" }); // 映像ウィンドウに即反映
                  setIdleVer(Date.now()); // モニターのプレビューも更新
                  setErr("");
                } else {
                  const d = await res.json().catch(() => ({}));
                  setErr(d.error ?? "待機画像のアップロードに失敗しました");
                }
              }} />
          </label>
          <button className={`btn ${blackout ? "primary" : ""}`}
            title="映像ウィンドウを即ブラックアウト／解除（音は止まりません）"
            onClick={() => {
              const on = !blackout;
              setBlackout(on);
              chRef.current?.postMessage({ cmd: "blackout", on });
            }}>
            🌑 暗転{blackout ? "中" : ""}
          </button>
          <button className="btn" style={{ color: "var(--red)" }} disabled={!playing || fading} onClick={stopWithFade}>
            {fading ? "…" : "⏹ 停止"}
          </button>
        </div>
        {playing && (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="ac-time">{fmt(prog.t)}</span>
            <div className="ac-wave" style={{ flex: 1 }}
              title="クリックした位置から再生"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (prog.d > 0) seek(((e.clientX - rect.left) / rect.width) * prog.d);
              }}>
              <canvas ref={canvasRef} />
            </div>
            <span className="ac-time">{prog.d > 0 ? fmt(prog.d) : "--:--"}</span>
          </div>
        )}
      </div>

      {/* シーンリスト：クリック＝次に流す曲に設定 */}
      <div className="live-body" style={{ maxWidth: 980 }}>
        {playlist.length === 0 && <div className="empty" style={{ color: "var(--text3)" }}>再生できる曲がありません（楽曲タブでYouTube URLか音源を設定してください）</div>}
        {items.map((it) => {
          const sg = it.song;
          const inList = playable(it);
          const isPlaying = playing?.itemId === it.id;
          const isNext = inList && !isPlaying && playlist[cursor]?.id === it.id;
          return (
            <div key={it.id}
              className={`live-item ${it.status === "done" ? "done" : ""} ${isPlaying ? "now" : ""}`}
              onClick={() => {
                if (!inList || isPlaying) return;
                const idx = playlist.findIndex((x) => x.id === it.id);
                if (idx >= 0) setCursor(idx);
              }}
              style={{
                ...(inList ? { cursor: "pointer" } : { opacity: 0.4 }),
                ...(isNext ? { boxShadow: "inset 4px 0 0 var(--amber)", borderColor: "var(--amber)" } : {}),
              }}
              title={inList && !isPlaying ? "クリックすると次はこのシーンが再生されます" : undefined}>
              <div className="lt">
                {it.time}
                {isNext && <div style={{ fontSize: 9.5, letterSpacing: ".2em", color: "var(--amber)", fontWeight: 800, marginTop: 3 }}>NEXT</div>}
                {isPlaying && <div style={{ fontSize: 9.5, letterSpacing: ".2em", color: "var(--accent-text)", fontWeight: 800, marginTop: 3 }}>▶ ON AIR</div>}
              </div>
              <div className="ln">
                <b>{it.title}</b>
                {sg?.cueTiming && <div className="ac-cue" style={{ fontSize: 13.5 }}>⏱ {sg.cueTiming}</div>}
                {it.note && <div className="ac-cue" style={{ opacity: 0.85 }}>🔖 {it.note}</div>}
                <div className="ac-song">
                  {sg && sg.title !== "（曲未定）"
                    ? <>♪ {sg.title}<span className="dim">{sg.artist ? `／${sg.artist}` : ""}{sg.memo ? `　※${sg.memo}` : ""}</span>
                        　<span className={`pill ${sg.mediaMime?.startsWith("video/") || (sg.videoOn && sg.url && youtubeId(sg.url)) ? "accent" : "gray"}`} style={{ fontSize: 10 }}>
                          {sg.mediaId
                            ? (sg.mediaMime?.startsWith("video/") ? "🎬 動画ファイル" : "🎵 音源")
                            : sg.url && youtubeId(sg.url) ? (sg.videoOn ? "🎬 YouTube映像" : "♪ YouTube") : "—"}
                        </span>
                      </>
                    : <span className="dim">曲未定</span>}
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                {sg && inList && (
                  <>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {((sg.url && youtubeId(sg.url)) || sg.mediaMime?.startsWith("video/")) && (
                        <label className={`pill ${sg.videoOn ? "accent" : "gray"}`} style={{ cursor: "pointer" }}
                          title="ONにすると、このシーンの再生時だけ映像ウィンドウに投影します（MP4等の動画ファイルもOK）">
                          <input type="checkbox" style={{ display: "none" }} checked={sg.videoOn}
                            onChange={(e) => saveSong(sg, { videoOn: e.target.checked })} />
                          🖥 {sg.videoOn ? "映像ON" : "映像OFF"}
                        </label>
                      )}
                      <label style={{ fontSize: 11, color: "var(--text3)", display: "flex", gap: 4, alignItems: "center" }} title="このシーンの音量（再生中も反映）">
                        🔊
                        <input type="range" min={0} max={100} value={sg.volume} style={{ width: 84 }}
                          onChange={(e) => saveSong(sg, { volume: Number(e.target.value) })} />
                        <span style={{ width: 24, fontWeight: 700, textAlign: "right", color: "var(--text2)" }}>{sg.volume}</span>
                      </label>
                      {isPlaying ? (
                        <button className="btn" style={{ color: "var(--red)" }} disabled={fading} onClick={stopWithFade}>
                          {fading ? "…" : "⏹ 停止"}
                        </button>
                      ) : (
                        <button className="btn primary" onClick={() => play(it)}>▶ 再生</button>
                      )}
                    </div>
                    {/* F.I／F.O／開始位置・タイミング：隅に小さく */}
                    <div className="ac-mini">
                      <label title="流すタイミング（合図）">⏱
                        <select className="form-input" style={{ width: 150, padding: "2px 4px", fontSize: 10.5 }}
                          value={sg.cueTiming && CUE_TIMINGS.includes(sg.cueTiming) ? sg.cueTiming : sg.cueTiming ? "__custom__" : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__free__") {
                              const t = prompt("流すタイミングを入力", sg.cueTiming ?? "");
                              if (t !== null) saveSong(sg, { cueTiming: t.trim() || null });
                            } else if (v !== "__custom__") {
                              saveSong(sg, { cueTiming: v || null });
                            }
                          }}>
                          <option value="">未設定</option>
                          {CUE_TIMINGS.map((t) => <option key={t} value={t}>{t}</option>)}
                          {sg.cueTiming && !CUE_TIMINGS.includes(sg.cueTiming) && <option value="__custom__">✏️ {sg.cueTiming}</option>}
                          <option value="__free__">✏️ 自由入力…</option>
                        </select>
                      </label>
                      <label title="フェードイン秒">F.I
                        <input className="form-input" type="number" min={0} max={30}
                          defaultValue={sg.fadeInSec} key={`fi-${sg.id}-${sg.fadeInSec}`}
                          onBlur={(e) => { if (Number(e.target.value) !== sg.fadeInSec) saveSong(sg, { fadeInSec: Number(e.target.value) || 0 }); }} />
                      </label>
                      <label title="フェードアウト秒">F.O
                        <input className="form-input" type="number" min={0} max={30}
                          defaultValue={sg.fadeOutSec} key={`fo-${sg.id}-${sg.fadeOutSec}`}
                          onBlur={(e) => { if (Number(e.target.value) !== sg.fadeOutSec) saveSong(sg, { fadeOutSec: Number(e.target.value) || 0 }); }} />
                      </label>
                      <label title="流し始める位置（秒）">開始
                        <input className="form-input" type="number" min={0}
                          defaultValue={sg.startSec ?? ""} placeholder="0" key={`st-${sg.id}-${sg.startSec}`}
                          onBlur={(e) => { if (e.target.value !== String(sg.startSec ?? "")) saveSong(sg, { startSec: e.target.value === "" ? null : Number(e.target.value) }); }} />
                        秒
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 音声専用YouTubeプレイヤー（映像ONのシーンだけ🖥小窓に投影） */}
      <div id="ac-yt-player" style={{ position: "fixed", left: -9999, top: -9999 }} />

      <div className="next-strip">
        <b>Space</b>＝再生／次の曲　<b>Esc</b>＝停止（各シーンのF.O）　｜　シーンをクリック＝次はそこから　｜　波形クリック＝その位置から再生
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--text3)", fontSize: 12 }}>進行状況と3秒ごとに同期</span>
      </div>
    </div>
  );
}
