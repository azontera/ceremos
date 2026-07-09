// ヒヤリング結果 → AIテンプレ生成依頼MD の出力（リニューアル仕様書 4.2）
// このMDを ChatGPT / Claude 等に貼ると、この案件専用のテンプレ一式（pack JSON）が返ってくる。
// 返ってきたpackは 管理→テンプレート「📥 AIテンプレ読み込み」から取り込み → 案件に適用（既存フロー）。
// 生成部分はこのルートに閉じているため、将来 Claude API 組み込みに差し替え可能（仕様書のアダプタ方針）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessCase } from "@/lib/rbac";
import { hearingSet, type HearingData } from "@/lib/hearing";
import { PACK_JSON_SCHEMA } from "@/lib/template-pack-prompt";
import { isBridal, t } from "@/lib/terms";
// t() は guests 等の用語切替に使用

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "couple" || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const c = await prisma.case.findUnique({
    where: { id: params.id },
    select: { groomName: true, brideName: true, caseType: true, guestCount: true, weddingDate: true, hearingJson: true },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  let data: HearingData = { answers: {} };
  try { if (c.hearingJson) data = JSON.parse(c.hearingJson); } catch { /* ignore */ }
  const { questions } = hearingSet(c.caseType);
  const qLabel = new Map(questions.map((q) => [q.id, q.text]));
  const optLabel = (qid: string, v: string) =>
    questions.find((q) => q.id === qid)?.options?.find((o) => o.value === v)?.label ?? v;

  const answerLines = (person: string, label: string) => {
    const a = data.answers[person as "groom"] ?? {};
    const rows = Object.entries(a).map(([k, v]) => `- ${qLabel.get(k) ?? k}: ${optLabel(k, v)}`);
    return rows.length ? `### ${label}の回答\n${rows.join("\n")}` : "";
  };

  const bridal = isBridal(c.caseType);
  const results = JSON.stringify(data.results ?? {}, null, 2);
  const md = `# ${bridal ? "結婚式" : "宴会・式典"}テンプレ一式 生成依頼（CEREMOS）

あなたはブライダル・宴会のベテランプランナー兼放送作家です。
以下のヒヤリング結果と診断をもとに、この${bridal ? "おふたり" : "主催者様"}のための
**テンプレ一式（pack JSON）を1本**作ってください。

## 案件情報
- ${bridal ? "新郎新婦" : "主催者"}: ${c.groomName}${c.brideName && c.brideName !== "―" ? ` / ${c.brideName}` : ""}
- 種別: ${bridal ? "婚礼" : "宴会・式典"} ／ 開催予定日: ${c.weddingDate.toISOString().slice(0, 10)}
- 想定${t("guests", c.caseType)}数: ${c.guestCount}名

## ヒヤリング回答
${[bridal ? answerLines("groom", "新郎") : "", bridal ? answerLines("bride", "新婦") : "", !bridal ? answerLines("host", "主催者") : ""].filter(Boolean).join("\n\n")}

## 診断結果（性格・相性・攻略メモ — 提案の根拠に使うこと）
\`\`\`json
${results}
\`\`\`

## 作成ルール
1. 進行表（rundown）は診断・好みを反映した演目構成にし、各演目に **MCが読める台本（mcScript）** を必ず書く。台本内の名前は {新郎}{新婦}{新郎姓}{新婦姓} トークンを使う${bridal ? "" : "（宴会では {新郎}=代表者名として使う。新婦・両家などの婚礼用語は一切使わない）"}
2. 見積（quote）は回答の予算帯・人数に収まる構成にし、こだわり回答（料理・写真等）の項目は1ランク上を提案してよい
3. 選曲方針・演出のコメントは note に書く
4. 出力は下記スキーマの **JSONコードブロック1個のみ**。説明文は不要

## pack JSONスキーマ
\`\`\`
${PACK_JSON_SCHEMA}
\`\`\`

---
※ 返ってきたJSONは CEREMOS の 管理 → テンプレート → 「📥 AIテンプレ読み込み」に貼り付けて取り込み、
　この案件の見積ウィザードでテンプレとして選択すると進行表・台本・見積が自動適用されます。
　（2回目以降の取り込みで見積に影響させたくない場合は、見積テンプレを選び直さなければ進行表のみ更新できます）
`;

  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="hearing-${params.id.slice(-6)}.md"`,
    },
  });
}
