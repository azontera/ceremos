"use client";
// 📲 「ホーム画面に追加」案内バナー（お客様向け）
// ブラウザで開いているスマホにだけ表示。スタンドアロン起動（PWA）ならURLバーも下のバーも消える。
// Android Chrome は beforeinstallprompt を捕まえてワンタップ追加、iOS Safari は手順を案内。
import { useEffect, useState } from "react";

const DISMISS_KEY = "ceremos-a2hs-dismissed";

export function A2hsBanner() {
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installEvt, setInstallEvt] = useState<Event | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    if (standalone || !mobile || localStorage.getItem(DISMISS_KEY)) return;
    setIsIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    setShow(true);
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show) return null;

  return (
    <div className="a2hs">
      <span aria-hidden style={{ fontSize: 20 }}>📲</span>
      <span>
        {installEvt ? (
          <>
            <b>アプリとしてご利用いただけます。</b>
            <button className="btn sm" style={{ marginLeft: 8 }}
              onClick={async () => {
                const evt = installEvt as unknown as { prompt: () => Promise<void> };
                await evt.prompt();
                localStorage.setItem(DISMISS_KEY, "1");
                setShow(false);
              }}>
              ホーム画面に追加
            </button>
          </>
        ) : isIos ? (
          <><b>アプリとしてご利用いただけます</b> — 画面下の共有ボタン<b>（□↑）</b>から<b>「ホーム画面に追加」</b>を選ぶと、全画面のアプリとして開きます。</>
        ) : (
          <><b>アプリとしてご利用いただけます</b> — ブラウザのメニュー<b>（⋮）</b>から<b>「ホーム画面に追加」</b>を選ぶと、全画面のアプリとして開きます。</>
        )}
      </span>
      <button className="a2hs-x" aria-label="閉じる"
        onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setShow(false); }}>✕</button>
    </div>
  );
}
