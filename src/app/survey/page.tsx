"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { WEDDING_SURVEY, BANQUET_SURVEY, GENDER_OPTS, CHILDREN_OPTS } from "@/lib/survey";

export default function SurveyPage() {
  return <Suspense><SurveyInner /></Suspense>;
}

// ヒヤリング（すべて任意）— ログイン済みセッションで回答できる
function SurveyInner() {
  const token = useSearchParams().get("token") ?? "";
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [basics, setBasics] = useState<Record<string, string>>({}); // 生年月日・性別・子供の有無（任意）
  const [eventType, setEventType] = useState<"wedding" | "party">("wedding");
  const [loaded, setLoaded] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/auth/survey${token ? `?token=${encodeURIComponent(token)}` : ""}`)
      .then(async (r) => {
        if (!r.ok) { setInvalid(true); return; }
        const d = await r.json();
        setAnswers(d.survey ?? {});
        setBasics(d.basics ?? {});
        setEventType(d.eventType === "party" ? "party" : "wedding");
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoaded(true));
  }, [token]);

  const bridal = eventType === "wedding";
  const questions = bridal ? WEDDING_SURVEY : BANQUET_SURVEY;
  const answered = Object.values(answers).filter((v) => v?.trim()).length;

  async function save() {
    setBusy(true); setErr(""); setSaved(false);
    const res = await fetch("/api/v1/auth/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token || undefined, survey: answers, basics }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSaved(true);
    else setErr(data.error ?? `保存に失敗しました（HTTP ${res.status}）`);
    setBusy(false);
  }

  if (!loaded) return <div className="login-wrap"><div className="login-card"><p>読み込み中…</p></div></div>;
  if (invalid) {
    return (
      <div className="login-wrap"><div className="login-card">
        <p>リンクの有効期限が切れているか、無効です。<br />ログイン後にヒヤリングへ回答できます。</p>
        <Link className="btn" href="/login">ログイン画面へ</Link>
      </div></div>
    );
  }

  return (
    <div className="login-wrap" style={{ alignItems: "flex-start", paddingTop: 40 }}>
      <div className="login-card" style={{ maxWidth: 560, textAlign: "left" }}>
        <div style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ceremos-mark.svg" alt="CEREMOS" width={44} height={44} />
          <h1 style={{ letterSpacing: ".12em", color: "var(--accent-text)", fontSize: 20 }}>ヒヤリングシート</h1>
          <p style={{ fontSize: 12.5 }}>ご登録ありがとうございます。{bridal ? "お打ち合わせ・お見積り" : "ご相談・お見積り"}がスムーズになるよう、{questions.length}問だけお答えください。<br />すべて任意です。途中まででも保存できます（あとから変更OK）。担当プランナーが内容を確認し、追ってご連絡します。</p>
        </div>

        {/* 基本情報（任意） */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>基本情報（任意）</div>
          {/* 個人情報（ログイン後に入力・修正OK。プランナーにも共有されます） */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
              <label>おなまえ（ふりがな）</label>
              <input className="form-input" value={basics.furigana ?? ""} placeholder="やまだ たろう"
                onChange={(e) => setBasics((x) => ({ ...x, furigana: e.target.value }))} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
              <label>{bridal ? "お相手のお名前" : "ご担当部署・役職"}</label>
              <input className="form-input" value={basics.partnerName ?? ""} placeholder={bridal ? "山田 花子" : "例：総務部 部長"}
                onChange={(e) => setBasics((x) => ({ ...x, partnerName: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
              <label>お電話番号</label>
              <input className="form-input" type="tel" value={basics.phone ?? ""} placeholder="090-1234-5678"
                onChange={(e) => setBasics((x) => ({ ...x, phone: e.target.value }))} />
            </div>
            <div className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
              <label>ご住所</label>
              <input className="form-input" value={basics.address ?? ""} placeholder="○○県○○市…"
                onChange={(e) => setBasics((x) => ({ ...x, address: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* 生年月日はご登録時にいただくため、ヒヤリングでは伺いません */}
            <div className="field" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
              <label>性別</label>
              <select className="form-input" value={basics.gender ?? ""}
                onChange={(e) => setBasics((x) => ({ ...x, gender: e.target.value }))}>
                <option value="">— 未回答 —</option>
                {GENDER_OPTS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
              <label>お子様の有無</label>
              <select className="form-input" value={basics.hasChildren ?? ""}
                onChange={(e) => setBasics((x) => ({ ...x, hasChildren: e.target.value }))}>
                <option value="">— 未回答 —</option>
                {CHILDREN_OPTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {questions.map((item) => (
          <div key={item.key} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{item.q}</div>
            {item.type === "select" ? (
              <select className="form-input" style={{ padding: "7px 10px", fontSize: 13 }}
                value={answers[item.key] ?? ""}
                onChange={(e) => setAnswers((x) => ({ ...x, [item.key]: e.target.value }))}>
                <option value="">— 未回答 —</option>
                {item.opts!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input className="form-input" style={{ padding: "7px 10px", fontSize: 13 }}
                value={answers[item.key] ?? ""} placeholder="自由記入"
                onChange={(e) => setAnswers((x) => ({ ...x, [item.key]: e.target.value }))} />
            )}
          </div>
        ))}

        {err && <div className="form-err">{err}</div>}
        {saved && (
          <div style={{ background: "#e8f3ea", border: "1px solid #3d8a5f", color: "#2c6a48", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 10 }}>
            ✅ 保存しました（{answered}問回答）。ご協力ありがとうございます！このページは閉じていただいて大丈夫です。
          </div>
        )}
        <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy} onClick={save}>
          {busy ? "保存中…" : `保存する（${answered}/${questions.length}問 回答済み）`}
        </button>
      </div>
    </div>
  );
}
