// ===== 検証用の仮想時計（DEMO_MODE=1 のときだけ有効）=====
// 「時間を進める」機能：Setting demo_time_offset_ms に加算ミリ秒を保存し、
// 時間依存ロジックは getNow() を使う。
// 本番（.env に DEMO_MODE が無い／0）では常に実時刻を返すため、
// 本番実装時にコードを消す必要はなく、環境変数を外すだけでよい。
import { prisma } from "./db";

export const DEMO_MODE = process.env.DEMO_MODE === "1";

export async function getTimeOffsetMs(): Promise<number> {
  if (!DEMO_MODE) return 0;
  try {
    const row = await prisma.setting.findUnique({ where: { key: "demo_time_offset_ms" } });
    return Number(row?.value ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** 現在時刻（検証モードでは「進めた時間」を加算した仮想時刻） */
export async function getNow(): Promise<Date> {
  return new Date(Date.now() + (await getTimeOffsetMs()));
}
