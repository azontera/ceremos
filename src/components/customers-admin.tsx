"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SURVEY_ALL } from "@/lib/survey";

// 顧客マスタ（独立ページ）— 一覧・検索・無効化・削除・ヒヤリング閲覧
type Profile = {
  furigana?: string; partnerName?: string; partnerFurigana?: string; partnerBirthDate?: string;
  birthDate?: string; gender?: string; hasChildren?: string;
  eventType?: string; profileComplete?: boolean; survey?: Record<string, string>;
} | null;
export type CustomerRow = {
  id: string; name: string; email: string; phone: string | null; address: string | null;
  isActive: boolean; approved: boolean; createdAt: string;
  profile: Profile;
  cases: { id: string; label: string }[];
  messageCount: number;
};
const EVENT_TYPE_LABEL: Record<string, string> = { wedding: "ブライダル", party: "宴会", other: "その他" };
const SURVEY_LABEL: Record<string, string> = Object.fromEntries(
  SURVEY_ALL.map((s) => [s.key, s.q.replace(/^\d+\.\s*/, "")]),
);

export function CustomersAdmin({ customers, canDelete }: { customers: CustomerRow[]; canDelete: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? `操作に失敗しました（HTTP ${res.status}）`); return false; }
    setErr(""); router.refresh(); return true;
  }

  const k = q.trim().toLowerCase();
  const list = customers.filter((u) => {
    if (!k) return true;
    const p = u.profile;
    return [u.name, p?.furigana, p?.partnerName, u.email, u.phone, u.address]
      .some((v) => v?.toLowerCase().includes(k));
  });

  return (
    <>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input className="form-input" style={{ width: 280 }} placeholder="氏名・ふりがな・メール・電話で検索"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="pill gray">{list.length}名</span>
      </div>

      <div className="grid" style={{ gap: 10 }}>
        {list.length === 0 && <div className="card"><div className="empty">該当する顧客がいません</div></div>}
        {list.map((u) => {
          const p = u.profile;
          const answered = p?.survey ? Object.values(p.survey).filter((v) => v?.trim()).length : 0;
          return (
            <div className="card" key={u.id} style={{ padding: "12px 16px", opacity: u.isActive ? 1 : 0.55 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div className="t" style={{ flex: 1, minWidth: 220 }}>
                  <b>{u.name} 様{p?.furigana ? <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)" }}>（{p.furigana}）</span> : null}
                    {p?.partnerName && <> ＆ {p.partnerName} 様{p.partnerFurigana ? <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)" }}>（{p.partnerFurigana}）</span> : null}</>}
                    {p?.eventType && <span className="pill blue" style={{ marginLeft: 6 }}>{EVENT_TYPE_LABEL[p.eventType] ?? p.eventType}</span>}
                    {!u.approved && <span className="pill amber" style={{ marginLeft: 6 }}>承認待ち</span>}
                    {!u.isActive && <span className="pill gray" style={{ marginLeft: 6 }}>無効</span>}
                  </b>
                  <span>
                    {u.email}{u.phone ? ` ／ ${u.phone}` : ""}{u.address ? ` ／ ${u.address}` : ""}
                    {p && (p.birthDate || p.gender || p.hasChildren) && <>　｜　{p.birthDate ? `${p.birthDate}生` : ""}{p.partnerBirthDate ? `・お相手${p.partnerBirthDate}生` : ""}{p.gender ? `・${p.gender}` : ""}{p.hasChildren ? `・お子様${p.hasChildren}` : ""}</>}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn sm" onClick={() => call(`/api/v1/admin/users/${u.id}`, "PATCH", { isActive: !u.isActive })}>
                    {u.isActive ? "無効化" : "有効化"}
                  </button>
                  {canDelete && (
                    <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => {
                      if (confirm(`${u.name} 様のアカウントを削除しますか？この操作は取り消せません。\n（チャット履歴がある場合は削除できず、無効化をご案内します）`)) {
                        call(`/api/v1/admin/users/${u.id}`, "DELETE");
                      }
                    }}>🗑 削除</button>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6, fontSize: 12 }}>
                {u.cases.length > 0
                  ? u.cases.map((cs) => (
                      <Link key={cs.id} href={`/cases/${cs.id}`} className="pill accent">📁 {cs.label}</Link>
                    ))
                  : <span className="pill gray">案件未紐付け</span>}
                {u.messageCount > 0 && <span className="pill gray">💬 {u.messageCount}件</span>}
              </div>
              {answered > 0 && (
                <details style={{ marginTop: 6, fontSize: 12 }}>
                  <summary style={{ cursor: "pointer", color: "var(--accent-text)" }}>📝 ヒヤリング（{answered}問回答）を見る</summary>
                  <div style={{ padding: "8px 12px", background: "var(--surface2)", borderRadius: 8, marginTop: 6, columnCount: 2, columnGap: 24 }}>
                    {Object.entries(p!.survey!).filter(([, v]) => v?.trim()).map(([key, v]) => (
                      <div key={key} style={{ breakInside: "avoid", marginBottom: 4 }}>
                        <span style={{ color: "var(--text3)" }}>{SURVEY_LABEL[key] ?? key}：</span><b>{v}</b>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 10 }}>
        ※ 削除できるのはチャット履歴のない顧客のみ（支配人・管理者）。履歴のある顧客は記録保全のため「無効化」を使ってください。承認待ちの対応は「✅ 承認待ち」ページから。
      </p>
    </>
  );
}
