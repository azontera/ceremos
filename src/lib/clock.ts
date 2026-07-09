// ===== 検証用の仮想時計（DEMO_MODE=1 のときだけ有効）=====
// 「時間を進める」機能：Setting demo_time_offset_ms に加算ミリ秒を保存し、
// 承認猶予（10時間）の判定など時間依存ロジックは getNow() を使う。
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

// ===== 承認猶予（プランナー確認は後でもできる）=====
// セルフ登録（お客様・業者）は承認前でも登録から10時間はログイン・利用できる。
// 10時間を過ぎると承認まではログイン不可（データは消えない）。否認＝削除で消せる。
export const APPROVAL_GRACE_MS = 10 * 60 * 60 * 1000;

/** 承認猶予の残りミリ秒（0以下＝期限切れ） */
export function graceRemainingMs(createdAt: Date, now: Date): number {
  return createdAt.getTime() + APPROVAL_GRACE_MS - now.getTime();
}
