"use client";
// 入口はここ1つ：メールアドレス（ID）とパスワードだけでログイン
// ・お客様は「新規登録」タブでその場でアカウント作成 → プランナーの承認後に全機能が使える
// ・店頭QR（?quick=トークン・24h）経由の登録は承認不要で即利用開始
// ・スタッフ・業者も同じフォームでログイン
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { APP_VERSION } from "@/lib/version";

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}

// 業者（お取引先）セルフ登録のカテゴリ
const VENDOR_CATS: [string, string][] = [
  ["dress", "ドレス・衣装"], ["gift", "引出物"], ["florist", "装花"], ["catering", "料理"],
  ["photo", "写真"], ["video", "映像"], ["beauty", "美容"], ["mc", "司会"], ["audio", "音響"], ["print", "印刷"],
];

function LoginInner() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState<"wedding" | "party" | "vendor">("wedding");
  const [vendorName, setVendorName] = useState("");
  const [vendorCat, setVendorCat] = useState("dress");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [venueName, setVenueName] = useState("");
  // 🧪 検証用ワンクリックログイン（DEMO_MODE=1 のときだけサーバーが一覧を返す）
  const [demoAccounts, setDemoAccounts] = useState<{ key: string; label: string; userId?: string; role?: string; vendorCategory?: string; seq?: number }[]>([]);
  const router = useRouter();
  const sp = useSearchParams();
  const verify = sp.get("verify");
  const quick = sp.get("quick"); // 店頭QR（24h・承認不要）
  const graceExpired = sp.get("grace") === "expired";

  useEffect(() => {
    fetch("/api/v1/branding").then((r) => r.json())
      .then((d) => { setLogoUrl(d.logoUrl ?? ""); setVenueName(d.name ?? ""); })
      .catch(() => {});
    fetch("/api/v1/auth/demo-login").then((r) => r.json())
      .then((d) => { if (d.enabled) setDemoAccounts(d.accounts ?? []); })
      .catch(() => {});
  }, []);

  // 🧪 検証：クリックだけでログイン
  async function demoLogin(a: { userId?: string; role?: string; vendorCategory?: string; seq?: number }) {
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

  // ログイン（お客様・スタッフ・業者 共通：メール＋パスワード）
  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setInfo("");
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

  // 新規登録：お客様（ブライダル・宴会）はヒヤリングページへ直行（トークンで承認前でも回答できる）。
  // 承認は別途プランナーが行う。クイック登録・業者登録はそのままログインを試す（承認待ちでも10時間は仮利用できる）
  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setInfo("");
    const body = eventType === "vendor"
      ? { accountType: "vendor", vendorName, category: vendorCat, name, email, password, phone }
      : { name, partnerName, email, password, phone, eventType, quick: quick ?? undefined };
    const res = await fetch("/api/v1/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? "登録に失敗しました"); setBusy(false); return; }
    if (data.surveyToken && !quick) { window.location.href = `/survey?token=${data.surveyToken}`; return; }
    // 登録できたらそのままログイン（承認待ちでも10時間は仮利用できる）
    const r2 = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (r2.ok) { window.location.href = "/dashboard"; return; }
    setMode("login");
    setInfo("ご登録ありがとうございます。メールアドレスとパスワードでログインしてご利用ください。");
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

        {/* 各種メッセージ */}
        {verify === "ok" && <div style={{ background: "#e8f3ea", border: "1px solid #3d8a5f", color: "#2c6a48", borderRadius: 6, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>✅ メール認証が完了しました。</div>}
        {graceExpired && (
          <div style={{ background: "#fdf0ee", border: "1px solid #c96a5a", color: "#96473b", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 10, lineHeight: 1.8 }}>
            ⏳ 仮利用期間（登録から10時間）が終了しました。プランナーの確認・承認が完了しますと、再びログインできます。ご登録の情報は保存されています。
          </div>
        )}
        {quick && (
          <div style={{ background: "#f5efe6", border: "1px solid #c8a97e", color: "#7a6248", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
            ようこそ！「新規登録」からご登録いただくと、承認なしですぐにご利用いただけます。
          </div>
        )}
        {info && <div style={{ background: "#f0f4ec", border: "1px solid #9db892", color: "#4c6b42", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 10, lineHeight: 1.8 }}>{info}</div>}

        {/* ログイン／新規登録 切り替え */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "4px 0 14px" }}>
          {([["login", "ログイン"], ["signup", "新規登録"]] as const).map(([v, l]) => (
            <button type="button" key={v} className="eg-toggle" data-active={mode === v}
              onClick={() => { setMode(v); setErr(""); }}>{l}</button>
          ))}
        </div>

        {mode === "login" ? (
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
            <p style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 10, marginBottom: 0 }}>
              スタッフ・お取引先の方も同じフォームからログインできます
            </p>
          </form>
        ) : (
          <form onSubmit={submitSignup}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "2px 0 10px", flexWrap: "wrap" }}>
              {([["wedding", "ブライダル"], ["party", "ご宴会・イベント"], ["vendor", "お取引先（業者）"]] as const).map(([v, l]) => (
                <button type="button" key={v} onClick={() => setEventType(v)} className="eg-toggle" data-active={eventType === v}>{l}</button>
              ))}
            </div>
            {eventType === "vendor" && (
              <div style={{ display: "flex", gap: 8 }}>
                <div className="field" style={{ flex: 2 }}>
                  <label>店舗名・会社名 *</label>
                  <input className="form-input" value={vendorName} required onChange={(e) => setVendorName(e.target.value)} placeholder="例：ドレスサロン美翔" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>カテゴリ *</label>
                  <select className="form-input" value={vendorCat} onChange={(e) => setVendorCat(e.target.value)}>
                    {VENDOR_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>{eventType === "wedding" ? "新郎さまのお名前 *" : eventType === "vendor" ? "ご担当者さまのお名前 *" : "代表者さまのお名前 *"}</label>
                <input className="form-input" value={name} required onChange={(e) => setName(e.target.value)} placeholder="例：高橋 蓮" />
              </div>
              {eventType === "wedding" && (
                <div className="field" style={{ flex: 1 }}>
                  <label>新婦さまのお名前</label>
                  <input className="form-input" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="例：佐藤 美咲" />
                </div>
              )}
            </div>
            <div className="field">
              <label>メールアドレス *</label>
              <input className="form-input" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>パスワード *</label>
                <input className="form-input" type="password" value={password} required minLength={8}
                  onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="8文字以上・英字＋数字" />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>お電話番号</label>
                <input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例：090-1234-5678" />
              </div>
            </div>
            {err && <div className="form-err">{err}</div>}
            <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} disabled={busy}>
              {busy ? "登録中…" : "登録してはじめる"}
            </button>
            {!quick && eventType === "vendor" && (
              <p style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 10, marginBottom: 0, lineHeight: 1.9 }}>
                ご登録後、すぐにご利用いただけます。担当プランナーの確認は後ほど行われます<br />
                （確認完了まで10時間を超えると一時的にログインできなくなりますが、ご登録の情報は消えません）
              </p>
            )}
            {!quick && eventType !== "vendor" && (
              <p style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 10, marginBottom: 0, lineHeight: 1.9 }}>
                ご登録後、簡単なヒヤリング（約10問・任意）にお答えいただきます。担当プランナーの確認完了後にご利用いただけます<br />
                （確認完了まで10時間を超えると一時的にログインできなくなりますが、ご登録の情報は消えません）
              </p>
            )}
          </form>
        )}

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
