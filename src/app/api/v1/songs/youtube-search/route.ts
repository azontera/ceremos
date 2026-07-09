import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: 曲名＋アーティストからYouTubeの最上位動画を検索してURLを返す（APIキー不要）
// YouTubeの検索結果HTMLから最初の videoId を抽出する簡易方式。
// 取得できない場合は検索結果ページのURLをフォールバックとして返す。
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q が必要です" }, { status: 400 });

  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "ja,en;q=0.8",
      },
      // 3秒でタイムアウト（進行を止めない）
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/"videoId":"([\w-]{11})"/);
      if (m) {
        return NextResponse.json({ videoId: m[1], url: `https://www.youtube.com/watch?v=${m[1]}` });
      }
    }
  } catch { /* ネットワーク不通・タイムアウトはフォールバックへ */ }
  return NextResponse.json({ videoId: null, url: searchUrl });
}
