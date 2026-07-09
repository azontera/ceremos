"use client";
// 商談ステップナビ（案件コックピット左ペイン）
// 常に「いま何のステップで、次に何をすべきか」を表示する。
// ステップをクリックすると やること／トーク／チェック が展開し、対応セクションへ飛べる。
import { useState } from "react";
import type { SalesStepState } from "@/lib/sales-steps";

export function SalesStepNav({ steps, currentKey }: { steps: SalesStepState[]; currentKey: string }) {
  const [open, setOpen] = useState<string | null>(currentKey);
  return (
    <nav className="step-nav">
      <div className="step-nav-title">商談ステップ</div>
      {steps.map((st, i) => {
        const isCurrent = st.key === currentKey;
        const isOpen = open === st.key;
        return (
          <div key={st.key} className={`step ${st.done ? "done" : ""} ${isCurrent ? "current" : ""}`}>
            <button className="step-head" onClick={() => setOpen(isOpen ? null : st.key)}>
              <span className="step-dot">{st.done ? "✓" : i + 1}</span>
              <span className="step-label">{st.emoji} {st.label}</span>
            </button>
            {isOpen && (
              <div className="step-body">
                <div className="step-goal">{st.goal}</div>
                <div className="step-hint">{st.hint}</div>
                {st.talkPoints.length > 0 && (
                  <div className="step-sec">
                    <b>💬 トーク</b>
                    <ul>{st.talkPoints.map((t, j) => <li key={j}>{t}</li>)}</ul>
                  </div>
                )}
                <div className="step-sec">
                  <b>☑ チェック</b>
                  <ul>{st.checks.map((t, j) => <li key={j}>{t}</li>)}</ul>
                </div>
                {st.anchor && (
                  <a className="btn sm" href={st.anchor === "hearing" ? "#hearing" : `?tab=${st.anchor}`}>このステップの作業へ →</a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
