"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SURVEY_30 } from "@/lib/survey";

// 承認待ちのお客様（セルフ登録）— プランナー・支配人・管理者が承認して案件に紐付ける
export type Profile = {
  furigana?: string; partnerName?: string; partnerFurigana?: string; partnerBirthDate?: string;
  age?: string; gender?: string; birthDate?: string; hasChildren?: string;
  eventType?: string; profileComplete?: boolean; survey?: Record<string, string>;
} | null;
export type PendingUser = {
  id: string; name: string; email: string; address: string | null; phone: string | null;
  emailVerified: boolean; createdAt: string;
  role: string;
  vendorName?: string | null;   // 業者登録の場合の店舗名
  vendorCategory?: string | null;
  profile?: Profile;
};
const EVENT_TYPE_LABEL: Record<string, string> = { wedding: "ブライダル", party: "宴会", other: "その他" };
const VENDOR_CAT_LABEL: Record<string, string> = {
  dress: "ドレス・衣装", florist: "装花", catering: "料理", audio: "音響", mc: "司会",
  photo: "写真", video: "映像", gift: "引出物", print: "印刷", beauty: "美容",
};
// 承認猶予（登録から10時間は仮利用できる）の残り表示
function graceLabel(createdAt: string, nowMs: number) {
  const remain = new Date(createdAt).getTime() + 10 * 3600000 - nowMs;
  if (remain <= 0) return { text: "仮利用 期限切れ（承認までログイン不可）", cls: "red" };
  return { text: `仮利用中（あと約${Math.max(1, Math.ceil(remain / 3600000))}時間）`, cls: "amber" };
}
const SURVEY_LABEL: Record<string, string> = Object.fromEntries(
  SURVEY_30.map((s) => [s.key, s.q.replace(/^\d+\.\s*/, "")]),
);

export function PendingApprovals({
  pendingUsers, cases, serverNowISO,
}: { pendingUsers: PendingUser[]; cases: { id: string; label: string }[]; serverNowISO?: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const nowMs = serverNowISO ? new Date(serverNowISO).getTime() : Date.now();
  const [caseSel, setCaseSel] = useState<Record<string, string>>({});
  const defaultDate = (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10); })();
  const [caseDate, setCaseDate] = useState<Record<string, string>>({});

  async function call(url: string, method: string, body: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? `操作に失敗しました（HTTP ${res.status}）`); return false; }
    setErr(""); router.refresh(); return true;
  }

  // 承認と同時に、希望種別で新規案件（仮予約）を作成して紐付け
  async function approveWithNewCase(u: PendingUser) {
    setErr("");
    const p = u.profile;
    const eventType = p?.eventType ?? "wedding";
    const weddingDate = caseDate[u.id] || defaultDate;
    const body = eventType === "wedding"
      ? {
          caseType: "wedding", groomName: u.name, brideName: p?.partnerName?.trim() || p?.survey?.partnerName?.trim() || "―",
          weddingDate, startTime: "11:30", endTime: "15:30",
          email: u.email, phone: u.phone ?? undefined, status: "tentative",
        }
      : {
          caseType: eventType === "party" ? "party" : "event",
          eventName: `${u.name} 様 ${eventType === "party" ? "ご宴会" : "イベント"}`,
          weddingDate, startTime: "18:00", endTime: "21:00",
          email: u.email, status: "tentative",
        };
    const res = await fetch("/api/v1/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? `案件の作成に失敗しました（HTTP ${res.status}）`); return; }
    await call(`/api/v1/admin/users/${u.id}`, "PATCH", {
      approved: true, isActive: true, emailVerified: true, caseId: data.case.id,
    });
  }

  // 否認＝削除（登録情報を消す）。無効化（却下）と違い、完全に消える
  async function reject(u: PendingUser) {
    if (!confirm(`${u.vendorName ? `${u.vendorName}（${u.name} 様）` : `${u.name} 様`}の登録を否認して削除しますか？\n登録情報は完全に消えます（この操作は取り消せません）`)) return;
    await call(`/api/v1/admin/users/${u.id}`, "DELETE", undefined);
  }

  const customers = pendingUsers.filter((u) => u.role === "couple");
  const vendorsPend = pendingUsers.filter((u) => u.role !== "couple");

  if (pendingUsers.length === 0) {
    return <div className="card"><div className="empty">承認待ちのお客様・お取引先はいません 🎉</div></div>;
  }

  return (
    <>
    {/* 🏪 お取引先（業者）のセルフ登録：承認 or 否認（削除）。仮利用は登録から10時間 */}
    {vendorsPend.length > 0 && (
      <div className="card" style={{ border: "1.5px solid var(--amber, #b07a2a)", marginBottom: 14 }}>
        <div className="card-h">🏪 承認待ち（お取引先・業者）<span className="pill amber">{vendorsPend.length}件</span></div>
        <div className="card-b">
          {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}
          {vendorsPend.map((u) => {
            const g = graceLabel(u.createdAt, nowMs);
            return (
              <div key={u.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <div className="t" style={{ minWidth: 220, flex: 1 }}>
                  <b>{u.vendorName ?? "（店舗名不明）"}
                    {u.vendorCategory && <span className="pill blue" style={{ marginLeft: 6 }}>{VENDOR_CAT_LABEL[u.vendorCategory] ?? u.vendorCategory}</span>}
                    <span className={`pill ${g.cls}`} style={{ marginLeft: 6 }}>{g.text}</span>
                  </b>
                  <span>担当：{u.name} ／ {u.email}{u.phone ? ` ／ ${u.phone}` : ""}</span>
                </div>
                <button className="btn sm primary" onClick={() => call(`/api/v1/admin/users/${u.id}`, "PATCH", { approved: true, isActive: true })}>
                  ✅ 承認する
                </button>
                <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => reject(u)}>否認して削除</button>
              </div>
            );
          })}
          <p style={{ fontSize: 11, color: "var(--text3)", margin: "8px 0 0" }}>
            承認すると制限なくログインできます（自社カタログの出店・編集が可能）。未承認のまま10時間経過するとログインできなくなりますが、情報は消えません。否認＝削除で消えます。
          </p>
        </div>
      </div>
    )}
    <div className="card" style={{ border: "1.5px solid var(--amber, #b07a2a)" }}>
      <div className="card-h">🔔 承認待ち（お客様のセルフ登録）<span className="pill amber">{customers.length}件</span></div>
      <div className="card-b">
        {vendorsPend.length === 0 && err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}
        {customers.length === 0 && <div className="empty">承認待ちのお客様はいません 🎉</div>}
        {customers.map((u) => {
          const p = u.profile;
          const answered = p?.survey ? Object.values(p.survey).filter((v) => v?.trim()).length : 0;
          return (
            <div key={u.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <div className="t" style={{ minWidth: 200, flex: 1 }}>
                  <b>{u.name} 様{p?.furigana ? <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)" }}>（{p.furigana}）</span> : null}
                    {p?.partnerName && <> ＆ {p.partnerName} 様{p.partnerFurigana ? <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)" }}>（{p.partnerFurigana}）</span> : null}</>}
                    {!u.emailVerified && <span className="pill red" style={{ marginLeft: 6 }}>メール未認証</span>}
                    {p?.eventType && <span className="pill blue" style={{ marginLeft: 6 }}>{EVENT_TYPE_LABEL[p.eventType] ?? p.eventType} 希望</span>}
                    {p?.profileComplete === false && <span className="pill amber" style={{ marginLeft: 6 }}>プロフィール未入力（Google仮登録）</span>}
                    {(() => { const g = graceLabel(u.createdAt, nowMs); return <span className={`pill ${g.cls}`} style={{ marginLeft: 6 }}>{g.text}</span>; })()}
                  </b>
                  <span>
                    {u.email}{u.phone ? ` ／ ${u.phone}` : ""}
                    {p && (p.birthDate || p.gender || p.hasChildren) && <>　｜　{p.birthDate ? `${p.birthDate}生` : ""}{p.partnerBirthDate ? `・お相手${p.partnerBirthDate}生` : ""}{p.gender ? `・${p.gender}` : ""}{p.hasChildren ? `・お子様${p.hasChildren}` : ""}</>}
                    {u.address ? <>　｜　{u.address}</> : null}
                  </span>
                </div>
              </div>
              {answered > 0 && (
                <details style={{ margin: "6px 0 0", fontSize: 12 }}>
                  <summary style={{ cursor: "pointer", color: "var(--accent-text)" }}>📝 事前アンケート（{answered}問回答）を見る</summary>
                  <div style={{ padding: "8px 12px", background: "var(--surface2)", borderRadius: 8, marginTop: 6, columnCount: 2, columnGap: 24 }}>
                    {Object.entries(p!.survey!).filter(([, v]) => v?.trim()).map(([k, v]) => (
                      <div key={k} style={{ breakInside: "avoid", marginBottom: 4 }}>
                        <span style={{ color: "var(--text3)" }}>{SURVEY_LABEL[k] ?? k}：</span><b>{v}</b>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11.5, color: "var(--text3)" }}>開催日</span>
                <input className="form-input" type="date" style={{ padding: "4px 8px" }}
                  value={caseDate[u.id] ?? defaultDate}
                  onChange={(e) => setCaseDate((m) => ({ ...m, [u.id]: e.target.value }))} />
                <button className="btn sm primary" onClick={() => approveWithNewCase(u)}
                  title="希望種別で仮予約の案件を作成し、承認・紐付けまで一括で行います">
                  ✅ 承認して新規案件を作成
                </button>
                <span style={{ color: "var(--text3)", fontSize: 11 }}>／</span>
                <select className="form-input" style={{ padding: "4px 8px", maxWidth: 220 }}
                  value={caseSel[u.id] ?? ""}
                  onChange={(e) => setCaseSel((m) => ({ ...m, [u.id]: e.target.value }))}>
                  <option value="">既存案件に紐付けない</option>
                  {cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <button className="btn sm" onClick={() =>
                  call(`/api/v1/admin/users/${u.id}`, "PATCH", {
                    approved: true, isActive: true, caseId: caseSel[u.id] || undefined,
                    ...(u.emailVerified ? {} : { emailVerified: true }),
                  })}>承認のみ{caseSel[u.id] ? "＋紐付け" : ""}</button>
                <button className="btn sm" onClick={() => {
                  if (confirm(`${u.name} 様の登録を却下（無効化）しますか？`)) call(`/api/v1/admin/users/${u.id}`, "PATCH", { isActive: false, approved: false });
                }}>却下</button>
                <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => reject(u)}>否認して削除</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
