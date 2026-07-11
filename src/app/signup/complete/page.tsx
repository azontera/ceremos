"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EVENT_TYPE_OPTS } from "@/lib/survey";

export default function CompleteProfilePage() {
  return <Suspense><CompleteInner /></Suspense>;
}

// QR登録後の必須プロフィール入力（名前・ふりがな・連絡先・住所）
function CompleteInner() {
  const token = useSearchParams().get("token") ?? "";
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [eventType, setEventType] = useState("wedding");
  const [done, setDone] = useState<null | { surveyToken: string }>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const res = await fetch("/api/v1/auth/complete-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, eventType, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDone({ surveyToken: data.surveyToken ?? "" });
    else { setErr(data.error ?? `保存に失敗しました（HTTP ${res.status}）`); setBusy(false); }
  }

  if (!token) {
    return (
      <div className="login-wrap"><div className="login-card">
        <p>リンクが無効です。もう一度QRコードからやり直してください。</p>
        <Link className="btn" href="/login">ログイン画面へ</Link>
      </div></div>
    );
  }

  if (done) {
    return (
      <div className="login-wrap"><div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ceremos-mark.svg" alt="CEREMOS" width={52} height={52} />
        <h1 style={{ letterSpacing: ".16em", color: "var(--accent-text)" }}>ご登録ありがとうございます</h1>
        <p>ご登録が完了しました。すぐにログインしてご利用いただけます。</p>
        <Link className="btn primary" style={{ display: "inline-flex", marginTop: 6 }} href="/login">ログイン画面へ →</Link>
        {done.surveyToken && (
          <>
            <p style={{ fontSize: 12.5, marginTop: 14 }}>よろしければ続けて<b>事前アンケート（任意）</b>にご協力ください。</p>
            <Link className="btn" style={{ display: "inline-flex", marginTop: 6 }}
              href={`/survey?token=${done.surveyToken}`}>📝 アンケートに回答する（約3分）</Link>
          </>
        )}
      </div></div>
    );
  }

  const isWedding = eventType === "wedding";
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit} style={{ maxWidth: 480 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ceremos-mark.svg" alt="CEREMOS" width={52} height={52} />
        <h1 style={{ letterSpacing: ".16em", color: "var(--accent-text)" }}>あと少しです</h1>
        <p>ご登録ありがとうございます。ご本人確認のため、以下のご入力をお願いします。</p>

        <div className="field">
          <label>ご利用目的 *</label>
          <select className="form-input" value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {EVENT_TYPE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>{isWedding ? "お名前（ご本人）" : "代表者のお名前"} *</label>
            <input className="form-input" name="name" required placeholder="例：高橋 蓮" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>ふりがな *</label>
            <input className="form-input" name="furigana" required placeholder="たかはし れん" />
          </div>
        </div>
        <div className="field">
          <label>生年月日（ご本人） *</label>
          <input className="form-input" type="date" name="birthDate" required />
        </div>
        {isWedding && (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>お相手のお名前 *</label>
                <input className="form-input" name="partnerName" required={isWedding} placeholder="例：佐藤 美咲" />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>ふりがな *</label>
                <input className="form-input" name="partnerFurigana" required={isWedding} placeholder="さとう みさき" />
              </div>
            </div>
            <div className="field">
              <label>お相手の生年月日 *</label>
              <input className="form-input" type="date" name="partnerBirthDate" required={isWedding} />
            </div>
          </>
        )}
        <div className="field">
          <label>連絡先（お電話番号） *</label>
          <input className="form-input" name="phone" required placeholder="例：090-1234-5678" />
        </div>
        <div className="field">
          <label>ご住所 *</label>
          <input className="form-input" name="address" required placeholder="例：岐阜県可児市…" />
        </div>

        {err && <div className="form-err">{err}</div>}
        <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={busy}>
          {busy ? "送信中…" : "登録を完了する"}
        </button>
      </form>
    </div>
  );
}
