"use client";
// 顧客攻略パネル（案件コックピット右ペイン）
// AIヒヤリングの診断結果から「この顧客にどう売るか」を常時表示する。
// ヒヤリング未実施のときは実施導線を出す。
import Link from "next/link";

export type StrategyData = {
  typeCard?: { title: string; summary: string; proposals: string[]; ng: string[] };
  compat?: { score: number; decisionMaker: string; friction: string; tips: string[] };
  persons?: { label: string; mbti?: string; mbtiName?: string; sign?: string; element?: string }[];
  upsells?: { name: string; reason: string; price?: number }[];
};

export function StrategyPanel({ caseId, isBridalCase, strategy }: {
  caseId: string;
  isBridalCase: boolean;
  strategy: StrategyData | null;
}) {
  return (
    <aside className="strategy-panel">
      <div className="step-nav-title">顧客攻略</div>
      {!strategy ? (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🔮 ヒヤリング未実施</div>
          <p style={{ fontSize: 12, color: "var(--text2)", margin: "0 0 10px" }}>
            診断型ヒヤリングを実施すると、{isBridalCase ? "おふたり" : "主催者様"}のタイプ・刺さる提案・NG行動がここに表示されます。
          </p>
          <Link className="btn primary sm" href={`/cases/${caseId}/hearing`}>ヒヤリングを開始 →</Link>
        </div>
      ) : (
        <>
          {strategy.typeCard && (
            <div className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--accent-text)", fontWeight: 700, letterSpacing: ".06em" }}>顧客タイプ</div>
              <div style={{ fontSize: 14.5, fontWeight: 800, margin: "2px 0 6px" }}>{strategy.typeCard.title}</div>
              <p style={{ fontSize: 12, color: "var(--text2)", margin: 0 }}>{strategy.typeCard.summary}</p>
              {(strategy.persons ?? []).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {strategy.persons!.map((p, i) => (
                    <span key={i} className="pill accent" title={p.mbtiName ?? ""}>
                      {p.label} {p.mbti ?? ""}{p.sign ? `・${p.sign}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {strategy.typeCard && strategy.typeCard.proposals.length > 0 && (
            <div className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>💡 刺さる提案</div>
              <ul className="strategy-list">{strategy.typeCard.proposals.map((t, i) => <li key={i}>{t}</li>)}</ul>
              {strategy.typeCard.ng.length > 0 && (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 700, margin: "10px 0 6px" }}>🚫 NG行動</div>
                  <ul className="strategy-list ng">{strategy.typeCard.ng.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </>
              )}
            </div>
          )}
          {isBridalCase && strategy.compat && (
            <div className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>💞 おふたりの相性 <span className="pill accent">{strategy.compat.score}点</span></div>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>
                <div>意思決定の主導：<b>{strategy.compat.decisionMaker}</b></div>
                {strategy.compat.friction && <div>もめやすい論点：{strategy.compat.friction}</div>}
              </div>
              {strategy.compat.tips.length > 0 && (
                <ul className="strategy-list" style={{ marginTop: 6 }}>{strategy.compat.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
              )}
            </div>
          )}
          {(strategy.upsells ?? []).length > 0 && (
            <div className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>📈 アップセル候補</div>
              {strategy.upsells!.map((u, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: i < strategy.upsells!.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{u.name}{u.price ? <span style={{ float: "right" }}>¥{u.price.toLocaleString("ja-JP")}</span> : null}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text2)" }}>{u.reason}</div>
                </div>
              ))}
            </div>
          )}
          <Link className="btn sm" href={`/cases/${caseId}/hearing`} style={{ width: "100%", justifyContent: "center" }}>🔮 診断の詳細・再ヒヤリング</Link>
        </>
      )}
    </aside>
  );
}
