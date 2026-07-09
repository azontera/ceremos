// ヒヤリングシート（30問アンケート）の回答から初期見積テンプレートを自動選択する
// テンプレ名の規約「ブライダル④（ガーデンウェディング・60名 約390万）」から人数・金額を読み取り、
// 挙式スタイル・人数・予算・時間帯の希望に最も近いプランを推奨する。

export type QuoteTplLite = { id: string; name: string };
export type Recommendation = {
  templateId: string;
  templateName: string;
  reasons: string[];
  score: number;
};

/** テンプレ名から「◯名」「約◯万」を抽出 */
function parseTplSpec(name: string): { guests: number | null; man: number | null } {
  const g = name.match(/(\d+)\s*名/);
  const m = name.match(/約\s*(\d+)\s*万/);
  return { guests: g ? Number(g[1]) : null, man: m ? Number(m[1]) : null };
}

/** アンケートの人数バケット → 概算人数 */
function guessGuests(survey: Record<string, string>, caseGuests: number): { n: number; from: string } | null {
  if (caseGuests > 0) return { n: caseGuests, from: `ご予定人数 ${caseGuests}名` };
  const v = survey.guests ?? "";
  if (v.includes("〜30")) return { n: 25, from: "ご希望人数 〜30名" };
  if (v.includes("31〜60")) return { n: 50, from: "ご希望人数 31〜60名" };
  if (v.includes("61〜90")) return { n: 75, from: "ご希望人数 61〜90名" };
  if (v.includes("91")) return { n: 100, from: "ご希望人数 91名以上" };
  return null;
}

/** アンケートの予算バケット → 概算（万円） */
function guessBudget(survey: Record<string, string>): { man: number; from: string } | null {
  const v = survey.budget ?? "";
  if (v.includes("〜200")) return { man: 180, from: "ご予算 〜200万円" };
  if (v.includes("200〜300")) return { man: 250, from: "ご予算 200〜300万円" };
  if (v.includes("300〜400")) return { man: 350, from: "ご予算 300〜400万円" };
  if (v.includes("400")) return { man: 430, from: "ご予算 400万円以上" };
  return null;
}

/**
 * 回答＋案件情報からテンプレを採点して最良の1件を返す
 * （回答が少なくても、案件種別と人数だけで最低限の推奨は出す）
 */
export function recommendQuoteTemplate(
  tpls: QuoteTplLite[],
  opts: { caseType: string; guestCount: number; survey: Record<string, string> },
): Recommendation | null {
  const { survey } = opts;
  const isBanquet = opts.caseType !== "wedding";
  const pool = tpls.filter((t) =>
    isBanquet ? t.name.startsWith("宴会") : t.name.startsWith("ブライダル"));
  if (pool.length === 0) return null;

  const style = survey.style ?? "";
  const g = guessGuests(survey, opts.guestCount);
  const b = guessBudget(survey);

  let best: Recommendation | null = null;
  for (const t of pool) {
    const spec = parseTplSpec(t.name);
    let score = 0;
    const reasons: string[] = [];

    // ①挙式スタイル（最重視）
    if (!isBanquet) {
      if (style.includes("神前") && (t.name.includes("和婚") || t.name.includes("神前"))) {
        score += 300; reasons.push("挙式スタイル「神前式」→ 和婚プラン");
      } else if (style.includes("人前") && t.name.includes("人前")) {
        score += 300; reasons.push("挙式スタイル「人前式」→ 人前式プラン");
      } else if (style.includes("会食") && (t.name.includes("少人数") || t.name.includes("会食"))) {
        score += 300; reasons.push("「挙式なし（会食のみ）」→ 少人数・会食プラン");
      }
      // ガーデン・ナイトの希望（演出・時間帯の回答から）
      const perf = `${survey.performance ?? ""}${survey.concerns ?? ""}`;
      if (perf.includes("ガーデン") && t.name.includes("ガーデン")) {
        score += 200; reasons.push("演出のご希望「ガーデン」");
      }
      if ((survey.timeSlot ?? "").includes("ナイト") && t.name.includes("ナイト")) {
        score += 200; reasons.push("時間帯のご希望「夕方〜ナイト」→ ナイトプラン");
      }
      if ((survey.afterParty ?? "") === "あり" && (t.name.includes("二部") || t.name.includes("1.5"))) {
        score += 80; reasons.push("二次会あり → 二部制/1.5次会プランも好相性");
      }
    } else {
      // 宴会：式典・ディナーショー等はテンプレ名の種類だけで判定（人数・予算で選ぶ）
      score += 50;
    }

    // ②人数の近さ
    if (g && spec.guests !== null) {
      const diff = Math.abs(spec.guests - g.n);
      score += Math.max(0, 150 - diff * 3);
      if (diff <= 15) reasons.push(`${g.from} に近い ${spec.guests}名プラン`);
    }
    // ③予算の近さ
    if (b && spec.man !== null) {
      const diff = Math.abs(spec.man - b.man);
      score += Math.max(0, 100 - diff);
      if (diff <= 60) reasons.push(`${b.from} に近い 約${spec.man}万円`);
    }

    if (!best || score > best.score) {
      best = { templateId: t.id, templateName: t.name, reasons, score };
    }
  }
  // スコアが低すぎる（材料が無い）場合は推奨を出さない
  if (best && best.score < 60) return null;
  return best;
}
