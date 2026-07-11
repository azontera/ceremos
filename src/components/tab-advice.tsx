"use client";
// 「進め方」の単独タブは廃止し、関連するタブの中にさりげないアドバイスとして表示する。
// 案件×ステップごとに記憶して消せる（✕で閉じると、そのステップの間は再表示しない）
import { useEffect, useState } from "react";
import type { SalesStepState } from "@/lib/sales-steps";

export function TabAdvice({ caseId, step }: { caseId: string; step: SalesStepState }) {
  const dismissKey = `advice-hide-${caseId}-${step.key}`;
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { setHidden(localStorage.getItem(dismissKey) === "1"); }, [dismissKey]);

  if (hidden !== false) return null;

  return (
    <div className="card advice-card">
      <button className="advice-close" title="このアドバイスを閉じる" onClick={() => { localStorage.setItem(dismissKey, "1"); setHidden(true); }}>✕</button>
      <div className="advice-head">
        <span className="pill accent">🪜 進め方</span>
        <b>{step.emoji} {step.label}</b>
      </div>
      <div className="advice-goal">{step.goal}</div>
      {step.talkPoints[0] && <div className="advice-talk">💬 {step.talkPoints[0]}</div>}
      <button className="advice-more" onClick={() => setOpen((o) => !o)}>{open ? "閉じる ▲" : "もっと見る ▼"}</button>
      {open && (
        <div className="advice-detail">
          {step.talkPoints.length > 1 && (
            <div className="advice-sec">
              <b>💬 トーク</b>
              <ul>{step.talkPoints.slice(1).map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          <div className="advice-sec">
            <b>☑ チェック</b>
            <ul>{step.checks.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
