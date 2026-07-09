// 商談ステップナビ（リニューアル仕様書 2.3）
// 「このアプリのやり方をしていれば売れるプランナーになれる」の本体。
// 各ステップに やること／トークポイント／確認漏れチェック／完了条件 を持ち、
// 完了判定はサーバー側（computeSalesSteps）で案件データから機械的に行う。
import { isBridal } from "@/lib/terms";

export type SalesStepDef = {
  key: string;
  label: string;
  emoji: string;
  goal: string;          // このステップのゴール（1行）
  talkPoints: string[];  // 売れるトークポイント
  checks: string[];      // 確認漏れチェック
  anchor?: string;       // 案件ページ内の対応セクション（#アンカー）
};

export type SalesStepState = SalesStepDef & {
  done: boolean;
  hint: string;          // 判定根拠の表示（例: 見積Ver.2まで作成）
};

export type SalesStepInput = {
  caseType: string;
  status: string;
  hearingDone: boolean;
  surveyAnswered: boolean;
  meetingsCount: number;
  quotesCount: number;
  quoteApproved: boolean;
  progressPercent: number;   // 準備チェックリストの進捗
  daysUntil: number;         // 当日=0・過去=負
  invoicePaid: boolean;
  followUpsCount: number;
};

const WEDDING_STEPS: SalesStepDef[] = [
  {
    key: "hearing", label: "初回接客・ヒヤリング", emoji: "🔮", anchor: "hearing",
    goal: "診断型ヒヤリングでおふたりの人柄と理想を掴み、次回（見学）の約束を取る",
    talkPoints: [
      "「まずおふたりのことを教えてください」— 会場説明より先に相手の話を聞く",
      "診断結果を一緒に見て盛り上がる（当たってる！を作ると心の距離が縮まる）",
      "帰り際に必ず次回来館の候補日を2つ提示する（持ち帰らせない）",
    ],
    checks: ["ヒヤリング（診断）実施", "希望時期・予算感・ゲスト人数を聞けた", "次回来館の約束"],
  },
  {
    key: "tour", label: "会場見学", emoji: "🏛", anchor: "quotes",
    goal: "診断結果に合わせた「おふたり専用の見せ方」で会場を体験してもらう",
    talkPoints: [
      "攻略パネルの「刺さる提案」を見学ルートに織り込む（例: 写真重視→光が入る時間に案内）",
      "会場では説明せず「ここでおふたりが◯◯している姿」を語る（情景で売る）",
      "見学後その場で概算見積へ（熱が高いうちに数字を見せる）",
    ],
    checks: ["診断結果に合わせた見学ルートにした", "希望日の空き状況を確認した", "概算見積の提示につなげた"],
  },
  {
    key: "quote", label: "見積提示", emoji: "💰", anchor: "quotes",
    goal: "AIテンプレから「おふたり専用プラン」として見積を提示する",
    talkPoints: [
      "見積は「削る前提の松」から出す（後から足すより削る方が満足度が高い）",
      "アップセル候補（攻略パネル）を根拠つきで1〜2件だけ乗せる（欲張らない）",
      "「この内容なら」と仮予約の期限特典を案内する",
    ],
    checks: ["テンプレ適用で見積作成", "持込・値引き規定の説明", "仮予約期限の案内"],
  },
  {
    key: "contract", label: "成約", emoji: "✍️", anchor: "quotes",
    goal: "見積承認＝ご成約。お支払い条件と今後の流れを固める",
    talkPoints: [
      "迷いが出たら攻略パネルの「意思決定の主導側」を最終確認の相手にする",
      "成約後すぐ「今後のスケジュール表」を渡して安心させる（成約直後の不安ケア）",
    ],
    checks: ["見積の承認", "支払いスケジュール登録", "お客様アカウント発行（スマホアプリ案内）"],
  },
  {
    key: "meetings", label: "打ち合わせ", emoji: "📝", anchor: "meetings",
    goal: "スマホアプリの宿題と打ち合わせを回して準備を進める（遅延させない）",
    talkPoints: [
      "毎回の打ち合わせは「前回の宿題確認→今日決めること→次回までの宿題」の型で",
      "決まらない議題は攻略パネルの「もめやすい論点」を先回りして提案で誘導",
      "追加提案はヒヤリング根拠つきで（「診断で◯◯がお好きと出ていたので」）",
    ],
    checks: ["議事録・決定事項の記録", "宿題をお客様アプリのタスクに登録", "次回日程の確定"],
  },
  {
    key: "final", label: "最終確認", emoji: "✅", anchor: "rundown",
    goal: "全項目確定。未確定ゼロで当日を迎える",
    talkPoints: ["未確定が残っている項目はこの画面の赤表示から順に潰す"],
    checks: ["席次確定（アレルギー最終確認）", "進行表・MC台本確定", "楽曲・音源確定", "発注すべて確定"],
  },
  {
    key: "day", label: "当日", emoji: "💒", anchor: "resources",
    goal: "当日運営（進行・音響・映像）をライブ画面で回す",
    talkPoints: ["開始前にスタッフ全員で進行表の「役割」列を読み合わせ"],
    checks: ["当日運営画面の起動確認", "音源・映像の再生テスト"],
  },
  {
    key: "after", label: "アフター", emoji: "💌", anchor: "billing",
    goal: "請求・入金と御礼連絡。紹介・記念日利用につなげる",
    talkPoints: [
      "1週間以内に手書きの御礼＋写真データ納品の連絡（紹介の種まき）",
      "結婚記念日・お子様のお祝いなど「次の来館理由」を作って締める",
    ],
    checks: ["請求書発行・入金確認", "アフター連絡の記録", "アンケート（満足度）回収"],
  },
];

const BANQUET_STEPS: SalesStepDef[] = [
  {
    key: "hearing", label: "初回商談・ヒヤリング", emoji: "🔮", anchor: "hearing",
    goal: "会の目的と主催者の狙いを掴み、下見の約束を取る",
    talkPoints: [
      "「どんな会にしたいか」より先に「この会が終わったとき誰にどう思われたいか」を聞く",
      "主催者タイプ診断（格式重視/盛り上がり重視/コスパ重視）で提案の軸を決める",
    ],
    checks: ["ヒヤリング実施（会の目的・人数・予算感）", "キーパーソン（決裁者）の確認", "下見日程の約束"],
  },
  {
    key: "tour", label: "会場下見", emoji: "🏛", anchor: "quotes",
    goal: "会の目的に合わせたレイアウト・進行イメージを現地で見せる",
    talkPoints: ["「当日はここに受付、ここでご挨拶」と動線で語る", "下見後その場で概算見積へ"],
    checks: ["レイアウト案の提示", "希望日の空き確認", "概算見積の提示"],
  },
  {
    key: "quote", label: "見積提示", emoji: "💰", anchor: "quotes",
    goal: "宴会テンプレから会の目的に合ったプランとして見積を提示",
    talkPoints: ["会費・予算の上限を先に確認し、その中での松竹梅で出す"],
    checks: ["テンプレ適用で見積作成", "キャンセル規定の説明"],
  },
  {
    key: "contract", label: "受注", emoji: "✍️", anchor: "quotes",
    goal: "見積承認＝ご受注。支払い条件と今後の流れを固める",
    talkPoints: ["発注書・稟議が必要な企業向けに見積書PDFを即日送付"],
    checks: ["見積の承認", "支払い条件の確定", "主催者アカウント発行"],
  },
  {
    key: "meetings", label: "打ち合わせ", emoji: "📝", anchor: "meetings",
    goal: "進行・料理・席次を確定させる",
    talkPoints: ["乾杯・挨拶の登壇者リストは主催者の宿題として早めに依頼"],
    checks: ["進行表の作成", "登壇者・席次の確定", "音響・映像素材の受領"],
  },
  {
    key: "final", label: "最終確認", emoji: "✅", anchor: "rundown",
    goal: "全項目確定。人数変動の最終締め",
    talkPoints: ["人数の最終確定日を明確に伝える（請求トラブル防止）"],
    checks: ["最終人数の確定", "進行表・司会台本確定", "料理・ドリンク確定"],
  },
  {
    key: "day", label: "当日", emoji: "🥂", anchor: "resources",
    goal: "当日運営をライブ画面で回す",
    talkPoints: ["主催者側の窓口担当と開始前に最終挨拶"],
    checks: ["当日運営画面の起動確認", "音源・映像の再生テスト"],
  },
  {
    key: "after", label: "アフター", emoji: "💌", anchor: "billing",
    goal: "請求・入金と御礼。次年度・定例利用につなげる",
    talkPoints: ["「来年も同時期に」の仮押さえ提案で定例化する"],
    checks: ["請求書発行・入金確認", "御礼連絡", "次回利用の打診記録"],
  },
];

export function salesStepDefs(caseType: string): SalesStepDef[] {
  return isBridal(caseType) ? WEDDING_STEPS : BANQUET_STEPS;
}

/** 案件データからステップの完了状態を判定する（サーバー側で使用） */
export function computeSalesSteps(x: SalesStepInput): { steps: SalesStepState[]; currentKey: string } {
  const defs = salesStepDefs(x.caseType);
  const contracted = x.quoteApproved || ["planning", "final_prep", "done"].includes(x.status);
  const stateOf = (key: string): { done: boolean; hint: string } => {
    switch (key) {
      case "hearing":
        return { done: x.hearingDone || x.surveyAnswered, hint: x.hearingDone ? "ヒヤリング実施済み" : x.surveyAnswered ? "アンケート回答あり" : "未実施" };
      case "tour":
        return { done: x.quotesCount > 0 || contracted, hint: x.quotesCount > 0 ? "見積提示まで進行" : "未実施" };
      case "quote":
        return { done: x.quotesCount > 0, hint: x.quotesCount > 0 ? `見積 Ver.${x.quotesCount} まで作成` : "見積なし" };
      case "contract":
        return { done: contracted, hint: contracted ? "見積承認済み" : "承認待ち" };
      case "meetings":
        return { done: contracted && x.meetingsCount > 0 && x.progressPercent >= 50, hint: `${x.meetingsCount}回実施・準備${x.progressPercent}%` };
      case "final":
        return { done: x.progressPercent >= 100, hint: `準備 ${x.progressPercent}%` };
      case "day":
        return { done: x.daysUntil < 0, hint: x.daysUntil > 0 ? `あと${x.daysUntil}日` : x.daysUntil === 0 ? "本日" : "実施済み" };
      case "after":
        return { done: x.daysUntil < 0 && (x.invoicePaid || x.followUpsCount > 0), hint: x.invoicePaid ? "入金確認済み" : x.followUpsCount > 0 ? "アフター記録あり" : "未対応" };
      default:
        return { done: false, hint: "" };
    }
  };
  const steps = defs.map((d) => ({ ...d, ...stateOf(d.key) }));
  const current = steps.find((st) => !st.done);
  return { steps, currentKey: current?.key ?? "after" };
}

/** 失注理由の選択肢（status="lost" 時に必須。成果ダッシュボードで集計） */
export const LOST_REASONS: [string, string][] = [
  ["price", "価格"],
  ["schedule", "日程が合わない"],
  ["competitor", "他会場に決定"],
  ["atmosphere", "雰囲気・相性"],
  ["other", "その他"],
];
