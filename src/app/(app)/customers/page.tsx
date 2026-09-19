import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { caseLabel } from "@/lib/case-types";
import { CustomersAdmin } from "@/components/customers-admin";

export const dynamic = "force-dynamic";

// 顧客マスタ（独立ページ）— プランナー・支配人・管理者
export default async function CustomersPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["admin", "manager", "planner"].includes(s.role)) redirect("/dashboard");

  const customers = await prisma.user.findMany({
    where: { role: "couple" },
    orderBy: { createdAt: "desc" },
    include: {
      memberships: { include: { case: { select: { id: true, groomName: true, brideName: true, weddingDate: true } } } },
      _count: { select: { messages: true } },
    },
  });

  return (
    <>
      <div className="section-h">
        <h2>💐 顧客マスタ</h2>
        <span className="pill gray">{customers.length}名</span>
      </div>
      <CustomersAdmin
        canDelete={["admin", "manager"].includes(s.role)}
        customers={customers.map((u) => {
          let profile = null;
          try { profile = u.profileJson ? JSON.parse(u.profileJson) : null; } catch { /* ignore */ }
          return {
            id: u.id, name: u.name, email: u.email, phone: u.phone, address: u.address,
            isActive: u.isActive, createdAt: u.createdAt.toISOString(),
            profile,
            cases: u.memberships.map((m) => ({
              id: m.case.id,
              label: `${caseLabel(m.case)}（${m.case.weddingDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}）`,
            })),
            messageCount: u._count.messages,
          };
        })}
      />
    </>
  );
}
