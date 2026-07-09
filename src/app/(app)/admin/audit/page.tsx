import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ACTION: Record<string, string> = {
  login: "ログイン", create: "作成", update: "更新", delete: "削除", status: "状態変更",
  signup: "セルフ登録", "verify-email": "メール認証", restore: "復元",
  "auto-order": "発注自動作成", "auto-order-cleanup": "発注自動削除", "vendor-edit": "業者編集",
};
const TARGET: Record<string, string> = {
  auth: "認証", case: "案件", meeting: "打ち合わせ", task: "タスク", quote: "見積",
  quote_item: "見積明細", order: "発注", meal_requirement: "料理配慮", songs: "楽曲", song: "楽曲",
  rundown_item: "進行表", rundown: "進行表", seating: "席次表", seating_table: "卓", guest: "ゲスト",
  floor_object: "会場オブジェクト", hall_size: "会場サイズ", assignment: "リソース割当",
  user: "ユーザー", template: "テンプレート", venue: "会場", vendor: "業者",
  master_option: "選択肢マスタ", settings: "設定", invoice: "請求書", payment_plan: "支払予定",
  followup: "アフター記録", attachment: "添付",
};
const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: { searchParams: { q?: string; action?: string; target?: string; from?: string; to?: string; page?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "admin") redirect("/dashboard");

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const where = {
    ...(searchParams.action ? { action: searchParams.action } : {}),
    ...(searchParams.target ? { targetType: searchParams.target } : {}),
    ...(searchParams.q ? { user: { name: { contains: searchParams.q } } } : {}),
    ...(searchParams.from || searchParams.to
      ? {
          createdAt: {
            ...(searchParams.from ? { gte: new Date(`${searchParams.from}T00:00:00`) } : {}),
            ...(searchParams.to ? { lt: new Date(new Date(`${searchParams.to}T00:00:00`).getTime() + 86400000) } : {}),
          },
        }
      : {}),
  };
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v && k !== "page") u.set(k, v);
    u.set("page", String(p));
    return `/admin/audit?${u.toString()}`;
  };

  return (
    <>
      <div className="section-h"><h2>操作履歴（監査ログ）</h2><span className="pill gray">{total.toLocaleString()}件</span></div>

      {/* フィルタ */}
      <form action="/admin/audit" className="card" style={{ padding: 12, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input className="form-input" style={{ width: 150 }} name="q" placeholder="ユーザー名" defaultValue={searchParams.q ?? ""} />
        <select className="form-input" style={{ width: 140 }} name="action" defaultValue={searchParams.action ?? ""}>
          <option value="">操作：すべて</option>
          {Object.entries(ACTION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="form-input" style={{ width: 150 }} name="target" defaultValue={searchParams.target ?? ""}>
          <option value="">対象：すべて</option>
          {Object.entries(TARGET).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="form-input" type="date" name="from" defaultValue={searchParams.from ?? ""} title="開始日" />
        <span style={{ color: "var(--text3)" }}>〜</span>
        <input className="form-input" type="date" name="to" defaultValue={searchParams.to ?? ""} title="終了日" />
        <button className="btn primary">絞り込む</button>
        <Link className="btn" href="/admin/audit">クリア</Link>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>日時</th><th>ユーザー</th><th>操作</th><th>対象</th><th>詳細（削除時はスナップショット）</th></tr></thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={5} className="empty">該当する操作履歴はありません</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {l.createdAt.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </td>
                <td>{l.user?.name ?? "—"}</td>
                <td><span className={`pill ${l.action === "delete" ? "red" : "blue"}`}>{ACTION[l.action] ?? l.action}</span></td>
                <td>{TARGET[l.targetType] ?? l.targetType}</td>
                <td style={{ fontSize: 11.5, color: "var(--text3)", maxWidth: 380 }}>
                  {l.diffJson && l.diffJson.length > 80 ? (
                    <details>
                      <summary style={{ cursor: "pointer" }}>{l.diffJson.slice(0, 70)}…（クリックで全文）</summary>
                      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 10.5, marginTop: 4, background: "var(--surface2)", padding: 8, borderRadius: 6 }}>{l.diffJson}</pre>
                    </details>
                  ) : (l.diffJson ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ページング */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        {page > 1 && <Link className="btn sm" href={qs(page - 1)}>← 前の{PAGE_SIZE}件</Link>}
        <span style={{ fontSize: 12, color: "var(--text3)" }}>{page} / {pages} ページ</span>
        {page < pages && <Link className="btn sm" href={qs(page + 1)}>次の{PAGE_SIZE}件 →</Link>}
      </div>
    </>
  );
}
