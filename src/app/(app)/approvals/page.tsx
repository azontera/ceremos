import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PendingApprovals } from "@/components/pending-approvals";
import { getNow } from "@/lib/clock";

export const dynamic = "force-dynamic";

// 承認待ちのお取引先（業者） — プランナー・支配人・管理者が対応（やることリストからも遷移）
// ※ お客様は登録時に承認不要のため通常ここには出ない（管理画面から手動で未承認にした場合のみ表示）
export default async function ApprovalsPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["admin", "manager", "planner"].includes(s.role)) redirect("/dashboard");

  const [pendingUsers, cases] = await Promise.all([
    prisma.user.findMany({
      where: { approved: false, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.case.findMany({
      where: { weddingDate: { gte: new Date(Date.now() - 30 * 86400000) } },
      orderBy: { weddingDate: "asc" },
      select: { id: true, groomName: true, brideName: true, weddingDate: true },
    }),
  ]);

  return (
    <>
      <div className="section-h">
        <h2>✅ 承認待ち（お取引先）</h2>
        <span className={`pill ${pendingUsers.length ? "amber" : "green"}`}>{pendingUsers.length}件</span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 12 }}>
        業者のセルフ登録は承認前でも<b>登録から10時間</b>は仮利用できます（期限後は承認までログイン不可・情報は消えません）。
        内容を確認し、承認、または否認（削除）を行ってください。
      </p>
      <PendingApprovals
        serverNowISO={(await getNow()).toISOString()}
        pendingUsers={pendingUsers.map((u) => {
          let profile: { accountType?: string; vendorName?: string; category?: string; furigana?: string } | null = null;
          try { profile = u.profileJson ? JSON.parse(u.profileJson) : null; } catch { /* ignore */ }
          return {
            id: u.id, name: u.name, email: u.email, address: u.address, phone: u.phone,
            emailVerified: u.emailVerified, createdAt: u.createdAt.toISOString(),
            role: u.role,
            vendorName: profile?.accountType === "vendor" ? profile?.vendorName ?? null : null,
            vendorCategory: profile?.accountType === "vendor" ? profile?.category ?? null : null,
            profile,
          };
        })}
        cases={cases.map((c) => ({
          id: c.id,
          label: `${c.brideName === "―" ? c.groomName : `${c.groomName} & ${c.brideName}`}（${c.weddingDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}）`,
        }))}
      />
    </>
  );
}
