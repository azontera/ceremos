"use client";
// 映像ウィンドウ（プロジェクター用）：再生プレイヤーから BroadcastChannel で操作される
// ・YouTube動画（videoId）と、アップロードされたMP4等の動画ファイル（mediaUrl）の両方を投影できる
// ・再生していない間は「待機画像」（設定でアップロード。無ければ真っ黒）
// ・動画は読み込んだら即表示する（開始数秒はYouTubeのタイトル表示が出るが、確実に映ることを優先）
// ・停止（F.O）時は音と同じ秒数で映像も暗転
// ・🌑暗転コマンドで即ブラックアウト
import { useEffect, useRef, useState } from "react";
import { YTPlayer, loadYTApi } from "@/lib/yt-player";

export default function ScreenPage({ params }: { params: { id: string } }) {
  const playerRef = useRef<YTPlayer | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null); // アップロード動画（MP4等）
  const activeRef = useRef<"yt" | "media" | null>(null);  // いま投影中の種別
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [label, setLabel] = useState("");        // 再生中の曲（""=待機）
  const [mediaMode, setMediaMode] = useState(false); // アップロード動画を表示中か
  const [dim, setDim] = useState(0);              // F.O用の暗転（0〜1）
  const [dimSec, setDimSec] = useState(0);        // 暗転のトランジション秒
  const [blackout, setBlackout] = useState(false); // 🌑暗転
  const [hasIdle, setHasIdle] = useState(false);   // 待機画像の有無
  const [idleV, setIdleV] = useState(0);           // 待機画像の更新カウンタ（差し替え即反映）
  const [fsHint, setFsHint] = useState(true);      // フル画面の案内（クリックで切替）
  const [isFs, setIsFs] = useState(false);         // フル画面中か
  const endedRef = useRef(false);                  // 終了処理の二重実行防止
  // 自動再生ブロック対策：新しく開いたウィンドウは「音声あり自動再生」がブラウザに
  // ブロックされることがある（→映像が始まらず真っ暗なまま）。
  // 一定時間で再生が始まらなければ「ミュートで映像だけ再生」に切り替え、
  // 画面クリック（＝ユーザー操作）で音声を有効化する。
  const [needTap, setNeedTap] = useState(false);   // 「クリックで音声ON」の案内表示
  const needTapRef = useRef(false);
  const [playErr, setPlayErr] = useState("");      // 再生できない原因の表示（埋め込み禁止・API読込失敗など）
  const stateRef = useRef(-1);                     // YouTubeの直近の再生状態
  const targetRef = useRef({ vol: 100, fi: 0 });   // 本来の音量・フェードイン
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedFallbackRef = useRef(false);          // ミュート再生に切り替えたか

  useEffect(() => {
    const onFs = () => { const fs = !!document.fullscreenElement; setIsFs(fs); setFsHint(!fs); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // クリックで音声を有効化（自動再生ブロックのフォールバック中のみ）
  const unlockAudio = () => {
    if (!needTapRef.current) return false;
    try {
      if (activeRef.current === "media" && videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.volume = targetRef.current.vol / 100;
        videoRef.current.play().catch(() => {});
      } else {
        playerRef.current?.unMute?.();
        playerRef.current?.setVolume(targetRef.current.vol);
        playerRef.current?.playVideo();
      }
    } catch { /* ignore */ }
    mutedFallbackRef.current = false;
    needTapRef.current = false;
    setNeedTap(false);
    return true; // このクリックは音声ONに使った（フル画面切替はしない）
  };

  // フル画面切替（このウィンドウ内のクリック／コンソールの⛶ボタンから）
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setFsHint(true);
    } else {
      document.documentElement.requestFullscreen()
        .then(() => setFsHint(false))
        .catch(() => setFsHint(true)); // ジェスチャー必須でブロックされた場合は案内を出す
    }
  };

  useEffect(() => {
    document.title = "CEREMOS 映像ウィンドウ";
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(`ceremos-live-${params.id}`);
    const killFade = () => { if (fadeTimer.current) { clearInterval(fadeTimer.current); fadeTimer.current = null; } };
    const stopMedia = () => {
      const v = videoRef.current;
      if (v) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch { /* ignore */ } }
      setMediaMode(false);
    };
    // 終了処理：終了画面・関連動画を見せずに待機画像へ
    const endNow = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      killFade();
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      needTapRef.current = false; setNeedTap(false);
      try { playerRef.current?.stopVideo(); } catch { /* ignore */ }
      stopMedia();
      activeRef.current = null;
      setLabel("");
      ch.postMessage({ cmd: "screen-ended" });
    };

    ch.onmessage = async (ev) => {
      const m = (ev.data ?? {}) as { cmd?: string; videoId?: string; mediaUrl?: string; start?: number; volume?: number; fadeInSec?: number; label?: string; v?: number; sec?: number; t?: number; on?: boolean };

      // ===== アップロード動画（MP4等）の投影 =====
      if (m.cmd === "load" && m.mediaUrl) {
        killFade();
        endedRef.current = false;
        stateRef.current = -1;
        try { playerRef.current?.stopVideo(); } catch { /* ignore */ }
        activeRef.current = "media";
        setMediaMode(true);
        setLabel(m.label ?? "");
        setTimeout(() => { try { window.opener?.focus(); } catch { /* ignore */ } }, 300);
        setDimSec(0); setDim(0);
        const vol = m.volume ?? 100;
        const fi = m.fadeInSec ?? 0;
        targetRef.current = { vol, fi };
        mutedFallbackRef.current = false;
        needTapRef.current = false; setNeedTap(false);
        setPlayErr("");
        const v = videoRef.current;
        if (!v) return;
        v.onended = () => endNow();
        v.onerror = () => {
          const msg = "動画ファイルを再生できませんでした（形式非対応またはネットワークエラー）。コンソールでファイルをご確認ください";
          setPlayErr(msg);
          ch.postMessage({ cmd: "screen-error", msg: `映像ウィンドウ：${msg}` });
        };
        v.muted = false;
        v.volume = fi > 0 ? 0 : vol / 100;
        v.src = m.mediaUrl;
        v.currentTime = m.start ?? 0;
        // 自動再生ブロック対策：失敗したらミュートで映像だけ開始→クリックで音声ON
        v.play().catch(() => {
          mutedFallbackRef.current = true;
          needTapRef.current = true; setNeedTap(true);
          v.muted = true;
          v.play().catch(() => {
            const msg = "再生を開始できません。画面をクリックしてください";
            setPlayErr(msg);
            ch.postMessage({ cmd: "screen-error", msg: `映像ウィンドウ：${msg}` });
          });
        });
        // フェードイン（音量）
        if (fi > 0) {
          const steps = Math.max(1, Math.round(fi * 10));
          let n = 0;
          fadeTimer.current = setInterval(() => {
            n++;
            try { if (!v.muted) v.volume = (vol / 100) * Math.min(1, n / steps); } catch { /* ignore */ }
            if (n >= steps) killFade();
          }, 100);
        }
        return;
      }

      // ===== YouTube動画の投影 =====
      if (m.cmd === "load" && m.videoId) {
        killFade();
        endedRef.current = false;
        stateRef.current = -1; // 前の動画の状態を引き継がない（終了誤判定の防止）
        stopMedia();
        activeRef.current = "yt";
        setLabel(m.label ?? "");
        // 操作をコンソール側に戻す（このウィンドウはフォーカスを持たない）
        setTimeout(() => { try { window.opener?.focus(); } catch { /* ignore */ } }, 300);
        setDimSec(0); setDim(0);
        const vol = m.volume ?? 100;
        const fi = m.fadeInSec ?? 0;
        const startVol = fi > 0 ? 0 : vol;
        targetRef.current = { vol, fi };
        // 自動再生ウォッチドッグ：3秒以内に再生が始まらなければミュートで映像だけ開始
        // （さらに3秒待っても始まらない場合は原因を画面に表示）
        mutedFallbackRef.current = false;
        needTapRef.current = false; setNeedTap(false);
        setPlayErr("");
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        watchdogRef.current = setTimeout(() => {
          if (stateRef.current === 1 || endedRef.current) return;
          mutedFallbackRef.current = true;
          needTapRef.current = true; setNeedTap(true);
          try { playerRef.current?.mute?.(); playerRef.current?.playVideo(); } catch { /* ignore */ }
          // 第2段階：ミュートでも始まらない → 原因の案内を表示
          watchdogRef.current = setTimeout(() => {
            if (stateRef.current === 1 || endedRef.current) return;
            const msg = playerRef.current
              ? "再生を開始できません。画面をクリックしてください。それでも映らない場合は、この動画が埋め込み再生に対応していない可能性があります（コンソールで別の動画に差し替えを）"
              : "YouTubeプレイヤーを読み込めませんでした。この端末のネットワーク（フィルタリング・プロキシ）で youtube.com への接続が許可されているかご確認ください";
            setPlayErr(msg);
            ch.postMessage({ cmd: "screen-error", msg: `映像ウィンドウ：${msg}` });
          }, 3000);
        }, 3000);
        const beginFadeIn = () => {
          if (fi <= 0) return;
          const steps = Math.max(1, Math.round(fi * 10));
          let n = 0;
          fadeTimer.current = setInterval(() => {
            n++;
            try { playerRef.current?.setVolume(Math.round(vol * Math.min(1, n / steps))); } catch { /* ignore */ }
            if (n >= steps) killFade();
          }, 100);
        };
        await loadYTApi();
        if (playerRef.current) {
          try { playerRef.current.unMute?.(); } catch { /* ignore */ }
          playerRef.current.setVolume(startVol);
          playerRef.current.loadVideoById({ videoId: m.videoId, startSeconds: m.start ?? 0 });
          beginFadeIn();
        } else {
          playerRef.current = new window.YT!.Player("screen-player", {
            width: "100%", height: "100%", videoId: m.videoId,
            playerVars: { autoplay: 1, controls: 0, rel: 0, start: m.start ?? 0, fs: 1, iv_load_policy: 3 },
            events: {
              onReady: (e: { target: YTPlayer }) => { e.target.setVolume(startVol); e.target.playVideo(); beginFadeIn(); },
              onStateChange: (e: { data: number }) => {
                stateRef.current = e.data;
                if (e.data === 1) {
                  setPlayErr("");
                  if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
                }
                if (e.data === 0) endNow(); // 終了 → 待機画像へ
              },
              onError: (e: { data: number }) => {
                // 100=削除/非公開 101・150=埋め込み禁止 2=ID不正 5=プレイヤーエラー
                const code = e.data;
                const msg =
                  code === 101 || code === 150
                    ? "この動画は埋め込み再生が許可されていません（YouTube側の設定）。コンソールで別の動画URLに差し替えてください"
                    : code === 100
                    ? "動画が見つかりません（削除・非公開の可能性）。コンソールで別の動画URLに差し替えてください"
                    : code === 2
                    ? "動画URLが不正です。コンソールでURLをご確認ください"
                    : `動画を再生できませんでした（YouTubeエラー ${code}）`;
                if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
                needTapRef.current = false; setNeedTap(false);
                setPlayErr(msg);
                ch.postMessage({ cmd: "screen-error", msg: `映像ウィンドウ：${msg}` });
              },
            },
          });
        }
      }
      if (m.cmd === "volume" && typeof m.v === "number") {
        try {
          if (activeRef.current === "media" && videoRef.current) videoRef.current.volume = m.v / 100;
          else playerRef.current?.setVolume(m.v);
        } catch { /* ignore */ }
      }
      if (m.cmd === "seek" && typeof m.t === "number") {
        try {
          if (activeRef.current === "media" && videoRef.current) videoRef.current.currentTime = m.t;
          else playerRef.current?.seekTo?.(m.t, true);
        } catch { /* ignore */ }
      }
      if (m.cmd === "stop") {
        killFade();
        if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
        needTapRef.current = false; setNeedTap(false); setPlayErr("");
        try { playerRef.current?.stopVideo(); } catch { /* ignore */ }
        stopMedia();
        activeRef.current = null;
        setLabel(""); setDimSec(0); setDim(0);
      }
      if (m.cmd === "fade") {
        killFade();
        const sec = m.sec ?? 3;
        // 映像も音と同じ秒数で暗転（F.O）
        setDimSec(sec);
        requestAnimationFrame(() => setDim(1));
        const steps = Math.max(1, Math.round(sec * 10));
        const v0 = m.volume ?? 100;
        let n = 0;
        fadeTimer.current = setInterval(() => {
          n++;
          const ratio = Math.max(0, 1 - n / steps);
          try {
            if (activeRef.current === "media" && videoRef.current) videoRef.current.volume = (v0 / 100) * ratio;
            else playerRef.current?.setVolume(Math.round(Math.max(0, v0 * ratio)));
          } catch { /* ignore */ }
          if (n >= steps) {
            killFade();
            try { playerRef.current?.stopVideo(); } catch { /* ignore */ }
            stopMedia();
            activeRef.current = null;
            setLabel("");
            // 暗転を解いて待機画像へ
            setTimeout(() => { setDimSec(0.8); setDim(0); }, 400);
          }
        }, 100);
      }
      if (m.cmd === "blackout") setBlackout(!!m.on);
      if (m.cmd === "idle-refresh") setIdleV(Date.now()); // 待機画像の差し替え即反映
      if (m.cmd === "fullscreen") {
        // コンソールの⛶ボタン。ブラウザにブロックされたら「クリックで切替」の案内を表示
        document.documentElement.requestFullscreen().then(() => setFsHint(false)).catch(() => setFsHint(true));
      }
    };
    // 起動完了をコンソールへ通知（投影中の映像があれば再送してもらう＝後からウィンドウを開いてもOK）
    ch.postMessage({ cmd: "screen-ready" });
    // このウィンドウで押した Space / Esc もコンソールへ転送（フォーカスがどちらにあっても操作可能）
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); ch.postMessage({ cmd: "key", k: "space" }); }
      // フル画面中のEscは「フル画面解除」専用（曲は止めない）
      if (e.key === "Escape" && !document.fullscreenElement) { e.preventDefault(); ch.postMessage({ cmd: "key", k: "esc" }); }
    };
    window.addEventListener("keydown", onKey);
    // 再生位置をコンソールへ送信（波形シークバー用）
    const prog = setInterval(() => {
      try {
        if (activeRef.current === "media") {
          const v = videoRef.current;
          if (!v || v.paused) return;
          const t = v.currentTime || 0;
          const d = v.duration || 0;
          if (d > 0) ch.postMessage({ cmd: "progress", t, d });
          return;
        }
        const t = playerRef.current?.getCurrentTime?.() ?? 0;
        const d = playerRef.current?.getDuration?.() ?? 0;
        // 「実際に再生中（state=1）」のときだけ進捗送信・終了判定を行う。
        // ※次の動画の読み込み中は、プレイヤーが前の動画の再生位置・長さを返し続けるため、
        //   ここで判定すると「残り0.9秒」と誤認して新しい動画を即終了→真っ暗のままになる（リグレッション修正）
        if (stateRef.current !== 1) return;
        if (d > 0) {
          ch.postMessage({ cmd: "progress", t, d });
          // 終了0.9秒前に先回りして待機画像へ（YouTubeの終了画面・関連動画を映さない）
          if (t > 1 && d - t <= 0.9) endNow();
        }
      } catch { /* ignore */ }
    }, 500);
    return () => {
      killFade(); clearInterval(prog); window.removeEventListener("keydown", onKey); ch.close();
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, [params.id]);

  return (
    // クリックでフル画面切替（プロジェクター＝拡張ディスプレイに移してからクリック）
    // ※自動再生ブロック中は、最初のクリックを「音声ON」に使う
    <div onClick={() => { if (!unlockAudio()) toggleFullscreen(); }}
      style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", cursor: "none" }}>
      {/* YouTube プレイヤー：動画を読み込んだら即表示（確実に映ることを優先）。
          YouTube APIは #screen-player 自体をiframeに置換するため、表示制御は外側のラッパーで行う
          （置換後の要素にはReactのstyle更新が届かない） */}
      <div style={{ position: "absolute", inset: 0, visibility: label && !mediaMode ? "visible" : "hidden" }}>
        <div id="screen-player" style={{ width: "100%", height: "100%" }} />
      </div>
      {/* アップロード動画（MP4等）プレイヤー */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} playsInline
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain",
          background: "#000", visibility: label && mediaMode ? "visible" : "hidden",
        }} />
      {/* 待機画像（動画を読み込んでいない間だけ表示。未設定なら真っ黒） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/v1/branding/screen-image?v=${idleV}`} alt=""
        onLoad={() => setHasIdle(true)} onError={() => setHasIdle(false)}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain",
          background: "#000", opacity: !label && hasIdle ? 1 : 0, transition: "opacity .8s",
          pointerEvents: "none",
        }} />
      {/* F.O 暗転（音と同じ秒数） */}
      <div style={{
        position: "absolute", inset: 0, background: "#000", pointerEvents: "none",
        opacity: dim, transition: `opacity ${dimSec}s linear`,
      }} />
      {/* 🌑 暗転（最前面・即時） */}
      {blackout && <div style={{ position: "absolute", inset: 0, background: "#000", zIndex: 10 }} />}
      {/* ⚠ 再生できない原因の表示（埋め込み禁止・削除動画・API読込失敗など） */}
      {playErr && !blackout && (
        <div style={{
          position: "absolute", bottom: 60, left: 0, right: 0, textAlign: "center", zIndex: 7, pointerEvents: "none",
        }}>
          <span style={{
            display: "inline-block", maxWidth: "80%", background: "rgba(120,30,30,.88)", color: "#fff",
            border: "1px solid #a55", borderRadius: 10, padding: "10px 18px", fontSize: 13, lineHeight: 1.7,
          }}>
            ⚠ {playErr}
          </span>
        </div>
      )}
      {/* 🔊 自動再生ブロック時の案内（クリックで音声ON。本番前のチェックで一度クリックすれば以後は出ない） */}
      {needTap && !blackout && (
        <div style={{
          position: "absolute", top: "50%", left: 0, right: 0, transform: "translateY(-50%)",
          textAlign: "center", zIndex: 7, pointerEvents: "none",
        }}>
          <span style={{
            display: "inline-block", background: "rgba(0,0,0,.78)", color: "#fff",
            border: "1px solid #666", borderRadius: 12, padding: "14px 26px",
            fontSize: 16, letterSpacing: ".08em",
          }}>
            🔊 画面をクリックすると音声つきで再生します
          </span>
        </div>
      )}
      {/* ⛶ フル画面ボタン（常設・動画の上にも出る。フル画面中は消える） */}
      {!isFs && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
          style={{
            position: "absolute", bottom: 12, right: 12, zIndex: 6, cursor: "pointer",
            background: "rgba(0,0,0,.65)", color: "#ddd", border: "1px solid #555",
            borderRadius: 8, padding: "8px 14px", fontSize: 13,
          }}>
          ⛶ フル画面
        </button>
      )}
      {/* フル画面の案内（フル画面中は消える） */}
      {fsHint && !isFs && (
        <div style={{
          position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center", zIndex: 5,
          fontSize: 12, color: "#777", letterSpacing: ".12em", pointerEvents: "none",
        }}>
          プロジェクターへ移してから ⛶ フル画面（Escで解除）
        </div>
      )}
    </div>
  );
}
