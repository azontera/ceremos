// YouTube IFrame API の最小型と共通ヘルパー（本番プレイヤー・映像ウィンドウ共用）
export type YTPlayer = {
  loadVideoById: (opts: string | { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  stopVideo: () => void;
  setVolume: (v: number) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
};

declare global {
  interface Window {
    YT?: { Player: new (el: string, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YouTube URL → 動画ID */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/);
  return m ? m[1] : null;
}

let ytLoading: Promise<void> | null = null;
/** IFrame API を1回だけ読み込む */
export function loadYTApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (!ytLoading) {
    ytLoading = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = () => resolve();
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }
  return ytLoading;
}
