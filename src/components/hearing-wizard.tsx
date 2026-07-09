"use client";
// AIヒヤリングウィザード（1問1画面・章ごとにミニ診断結果を出す「楽しい診断」体験）
// スタッフ=店頭ヒヤリング／お客様=自分のスマホから回答（新郎・新婦それぞれ）
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  hearingSet, chapterReward,
  type Answers, type HearingQuestion,
} from "@/lib/hearing";
import type { StrategyData } from "@/components/strategy-panel";

type Person = "groom" | "bride" | "host";

export function HearingWizard({ caseId, caseType, isStaff, initialAnswers }: {
  caseId: string;
  caseType: string;
  isStaff: boolean;
  initialAnswers: Partial<Record<Person, Answers>>;
}) {
  const bridal = !caseType || caseType === "wedding";
  const { chapters, questions } = useMemo(() => hearingSet(caseType), [caseType]);
  const [person, setPerson] = useState<Person | null>(bridal ? null : "host");
  const [answers, setAnswers] = useState<Answers>({});
  const [idx, setIdx] = useState(0);            // questions内のインデックス
  const [reward, setReward] = useState<string | null>(null); // 章末ミニ結果の表示中
  const [phase, setPhase] = useState<"select" | "quiz" | "done">(bridal ? "select" : "quiz");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<StrategyData | null>(null);
  const [textDraft, setTextDraft] = useState("");

  const q: HearingQuestion | undefined = questions[idx];
  const total = questions.length;

  const start = (p: Person) => {
    setPerson(p);
    setAnswers(initialAnswers[p] ?? {});
    setIdx(0); setReward(null); setPhase("quiz"); setTextDraft("");
  };

  const save = async (final: Answers) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/cases/${caseId}/hearing`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person, answers: final }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setResults((j.results as StrategyData) ?? null);
    } finally { setSaving(false); }
  };

  const advance = (next: Answers) => {
    setAnswers(next);
    const cur = questions[idx];
    const nextQ = questions[idx + 1];
    if (nextQ && nextQ.chapter !== cur.chapter) {
      const rw = chapterReward(caseType, cur.chapter, next);
      if (rw) { setReward(rw); return; } // 章末のご褒美画面（「次へ」で先へ）
    }
    if (!nextQ) { void save(next); setPhase("done"); return; }
    setIdx(idx + 1); setTextDraft("");
  };

  const afterReward = () => {
    setReward(null);
    if (idx + 1 >= total) { void save(answers); setPhase("done"); }
    else { setIdx(idx + 1); setTextDraft(""); }
  };

  // ---------- 回答者選択（婚礼のみ） ----------
  if (phase === "select") {
    const done = (p: Person) => Object.keys(initialAnswers[p] ?? {}).length > 0;
    return (
      <div className="hearing-shell">
        <h1 className="hearing-title">ふたりの結婚式診断</h1>
        <p className="hearing-sub">
          性格診断と占いをまじえた{total}問のヒヤリングです（10〜15分）。<br />
          おふたりそれぞれの回答から、最適なプランをおつくりします。
        </p>
        <div className="hearing-persons">
          <button className="hearing-person" onClick={() => start("groom")}>
            <span style={{ fontSize: 34 }}>🤵</span><b>新郎さま</b>
            <span className="pill accent">{done("groom") ? "回答済み（更新できます）" : "未回答"}</span>
          </button>
          <button className="hearing-person" onClick={() => start("bride")}>
            <span style={{ fontSize: 34 }}>👰</span><b>新婦さま</b>
            <span className="pill accent">{done("bride") ? "回答済み（更新できます）" : "未回答"}</span>
          </button>
        </div>
        <p className="hearing-note">※ 診断・占いは、おふたりに合う提案をつくるための演出です。結果に良い悪いはありません 🕊</p>
        {isStaff && <Link className="btn sm" href={`/cases/${caseId}`}>← 案件に戻る</Link>}
      </div>
    );
  }

  // ---------- 完了画面 ----------
  if (phase === "done") {
    return (
      <div className="hearing-shell">
        <h1 className="hearing-title">🎉 診断完了！</h1>
        {saving && <p className="hearing-sub">結果を保存しています…</p>}
        {results?.typeCard && (
          <div className="card" style={{ padding: 18, maxWidth: 480, margin: "0 auto 14px", textAlign: "left" }}>
            <div style={{ fontSize: 11, color: "var(--accent-text)", fontWeight: 700 }}>診断結果</div>
            <div style={{ fontSize: 17, fontWeight: 800, margin: "2px 0 8px" }}>{results.typeCard.title}</div>
            <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>{results.typeCard.summary}</p>
            {results.compat && (
              <p style={{ fontSize: 13, margin: "10px 0 0" }}>
                💞 おふたりの相性スコア：<b style={{ fontSize: 16 }}>{results.compat.score}点</b>
              </p>
            )}
          </div>
        )}
        <p className="hearing-sub">
          {bridal && person && Object.keys(initialAnswers[person === "groom" ? "bride" : "groom"] ?? {}).length === 0
            ? `${person === "groom" ? "新婦さま" : "新郎さま"}の回答が集まると、相性診断が完成します。`
            : "回答ありがとうございました。この結果をもとに最適なプランをご提案します。"}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {bridal && <button className="btn" onClick={() => { setPhase("select"); setResults(null); }}>回答者を切り替える</button>}
          {isStaff && <a className="btn" href={`/api/v1/cases/${caseId}/hearing/md`}>📄 AI生成依頼MDを出力</a>}
          {isStaff ? <Link className="btn primary" href={`/cases/${caseId}`}>案件に戻る →</Link> : <Link className="btn primary" href="/dashboard">ホームへ →</Link>}
        </div>
      </div>
    );
  }

  // ---------- 章末ミニ結果 ----------
  if (reward) {
    return (
      <div className="hearing-shell">
        <div className="hearing-reward">✨</div>
        <h2 className="hearing-title" style={{ fontSize: 20 }}>{reward}</h2>
        <button className="btn primary" onClick={afterReward}>つづける →</button>
      </div>
    );
  }

  // ---------- 設問画面 ----------
  if (!q) return null;
  const chapter = chapters.find((ch) => ch.num === q.chapter);
  const answeredCount = idx;
  return (
    <div className="hearing-shell">
      <div className="hearing-progress">
        <div className="progress"><span style={{ width: `${Math.round((answeredCount / total) * 100)}%` }} /></div>
        <span className="hearing-count">{answeredCount + 1} / {total}</span>
      </div>
      <div className="hearing-chapter">第{q.chapter}章 {chapter?.title}</div>
      <h2 className="hearing-q">{q.text}</h2>
      {q.type === "choice" && (
        <div className="hearing-opts">
          {q.options!.map((o) => (
            <button
              key={o.value}
              className={`hearing-opt ${answers[q.id] === o.value ? "sel" : ""}`}
              onClick={() => advance({ ...answers, [q.id]: o.value })}
            >{o.label}</button>
          ))}
        </div>
      )}
      {q.type === "date" && (
        <div className="hearing-opts">
          <input
            type="date" className="form-input" style={{ maxWidth: 240, margin: "0 auto" }}
            defaultValue={answers[q.id] ?? ""}
            onChange={(e) => setTextDraft(e.target.value)}
          />
          <button className="btn primary" disabled={!textDraft && !answers[q.id]}
            onClick={() => advance({ ...answers, [q.id]: textDraft || answers[q.id] })}>次へ →</button>
        </div>
      )}
      {q.type === "text" && (
        <div className="hearing-opts">
          <textarea
            className="form-input" rows={4} style={{ maxWidth: 420, margin: "0 auto" }}
            placeholder="任意です。スキップもできます"
            value={textDraft || answers[q.id] || ""}
            onChange={(e) => setTextDraft(e.target.value)}
          />
          <button className="btn primary" onClick={() => advance({ ...answers, [q.id]: textDraft || answers[q.id] || "" })}>
            {textDraft || answers[q.id] ? "次へ →" : "スキップ →"}
          </button>
        </div>
      )}
      {idx > 0 && <button className="hearing-back" onClick={() => { setIdx(idx - 1); setTextDraft(""); }}>← 前の質問へ</button>}
    </div>
  );
}
