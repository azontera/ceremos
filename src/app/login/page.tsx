"use client";
// 入口はここ1つ：メールアドレス（ID）とパスワードだけでログイン
// ・お客様のアカウントはプランナーが案件ページ（顧客アカウント）から作成してお渡しする
// ・スタッフも同じフォームでログイン
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_VERSION } from "@/lib/version";

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}

function LoginInner() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [venueName, setVenueName] = useState("");
  // 🧪 検証用ワンクリックログイン（DEMO_MODE=1 のときだけサーバーが一覧を返す）
  const [demoAccounts, setDemoAccounts] = useState<{ key: string; label: string; userId?: string; role?: string; seq?: number }[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/v1/branding").then((r) => r.json())
      .then((d) => { setLogoUrl(d.logoUrl ?? ""); setVenueName(d.name ?? ""); })
      .catch(() => {});
    fetch("/api/v1/auth/demo-login").then((r) => r.json())
      .then((d) => { if (d.enabled) setDemoAccounts(d.accounts ?? []); })
      .catch(() => {});
  }, []);

  // 🧪 検証：クリックだけでログイン
  async function demoLogin(a: { userId?: string; role?: string; seq?: number }) {
    setBusy(true); setErr("");
    const res = await fetch("/api/v1/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a),
    });
    if (res.ok) { window.location.href = "/dashboard"; return; }
    const data = await res.json().catch(() => ({}));
    setErr(data.error ?? "検証ログインに失敗しました");
    setBusy(false);
  }

  // ログイン（お客様・スタッフ共通：メール＋パスワード）
  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
    });
    if (res.ok) { router.push("/dashboard"); router.refresh(); return; }
    const data = await res.json().catch(() => ({}));
    setErr(data.error ?? `ログインに失敗しました（HTTP ${res.status}）`);
    setBusy(false);
  }

  return (
    <div className="login-wrap elegant">
      <div className="login-card" style={{ maxWidth: 430 }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={venueName || "式場ロゴ"} style={{ maxHeight: 64, maxWidth: 260, margin: "0 auto 6px", display: "block", objectFit: "contain" }} />
        ) : (
          <div className="eg-eyebrow">WELCOME</div>
        )}
        <h1 className="eg-title">{venueName || "CEREMOS"}</h1>
        <div className="eg-rule" />

        <p style={{ fontSize: 12.5, lineHeight: 2 }}>
          おふたりの専用ページ<br />
          <span style={{ fontSize: 11 }}>準備の進み具合・楽曲えらび・プランナーとのご連絡に</span>
        </p>

        <form onSubmit={submitLogin}>
          <div className="field">
            <label>メールアドレス</label>
            <input className="form-input" type="email" value={email} required autoFocus
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label>パスワード</label>
            <input className="form-input" type="password" value={password} required
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, cursor: "pointer", marginTop: 4, justifyContent: "center" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            ログイン状態を保持する（30日間）
          </label>
          {err && <div className="form-err">{err}</div>}
          <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={busy}>
            {busy ? "ログイン中…" : "ログイン"}
          </button>
          <p style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 10, marginBottom: 0, lineHeight: 1.9 }}>
            ログインIDとパスワードは担当プランナーからお渡しします。<br />
            お忘れの場合は担当プランナーへご連絡ください。スタッフの方も同じフォームからログインできます。
          </p>
        </form>

        {/* 🧪 検証用ワンクリックログイン（DEMO_MODE=1 のときだけ表示。本番では出ない） */}
        {demoAccounts.length > 0 && (
          <div style={{ marginTop: 16, padding: "10px 12px", background: "#f3eef9", border: "1px dashed #9b7fc0", borderRadius: 8, textAlign: "left" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#5d4a7a", marginBottom: 6 }}>🧪 検証用：クリックだけでログイン（本番では表示されません）</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {demoAccounts.map((a) => (
                <button key={a.key} type="button" className="btn sm" style={{ fontSize: 11 }} disabled={busy} onClick={() => demoLogin(a)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p style={{ marginTop: 14, marginBottom: 0, fontSize: 9.5, color: "var(--text3)", letterSpacing: ".08em" }}>
          CEREMOS {APP_VERSION}
        </p>
      </div>
    </div>
  );
}
