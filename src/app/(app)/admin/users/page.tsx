import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UsersAdmin } from "@/components/users-admin";
import { VendorsAdmin } from "@/components/vendors-admin";
import { VenuesAdmin } from "@/components/venues-admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "admin") redirect("/dashboard");

  const [users, vendors, venues, cases] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { vendor: true } }),
    prisma.vendor.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true, orders: true } } },
    }),
    prisma.venue.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { _count: { select: { banquetCases: true, chapelCases: true, events: true, assignments: true } } },
    }),
    prisma.case.findMany({
      where: { weddingDate: { gte: new Date(Date.now() - 30 * 86400000) } },
      orderBy: { weddingDate: "asc" },
      select: { id: true, groomName: true, brideName: true, weddingDate: true },
    }),
  ]);
  const pendingUsers = users.filter((u) => !u.approved && u.isActive);

  // 顧客種別の自動判定：紐付いた案件の種別から（ブライダル／宴会／その他）
  const coupleIds = users.filter((u) => u.role === "couple").map((u) => u.id);
  const memberships = coupleIds.length > 0
    ? await prisma.caseMember.findMany({
        where: { userId: { in: coupleIds } },
        include: { case: { select: { caseType: true } } },
      })
    : [];
  const TYPE_LABEL: Record<string, string> = { wedding: "ブライダル", party: "宴会" };
  const customerTypeOf = (userId: string): string => {
    const types = memberships.filter((m) => m.userId === userId).map((m) => m.case.caseType);
    if (types.length === 0) return "未紐付け";
    const labels = [...new Set(types.map((t) => TYPE_LABEL[t] ?? "その他"))];
    return labels.join("・");
  };

  // 区分：社員／外注（業者）／顧客
  const STAFF_ROLES = ["admin", "manager", "planner", "chef", "audio", "mc", "service"];
  const groupOf = (u: (typeof users)[number]): "staff" | "vendor" | "customer" =>
    u.role === "couple" ? "customer" : u.vendorId || !STAFF_ROLES.includes(u.role) ? "vendor" : "staff";

  return (
    <>
      <div className="section-h"><h2>ユーザー・権限管理</h2><span className="pill gray">{users.length}名</span></div>
      {pendingUsers.length > 0 && (
        <p style={{ fontSize: 12.5, marginBottom: 12 }}>
          🔔 承認待ちのお客様が <b>{pendingUsers.length}名</b> います → <Link href="/approvals">承認画面を開く</Link>
        </p>
      )}
      <p style={{ fontSize: 12.5, marginBottom: 12 }}>
        💐 顧客（新郎新婦・宴会）の管理は <Link href="/customers">顧客マスタ</Link> へ移動しました。
      </p>
      <UsersAdmin
        meId={s.userId}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        users={users.filter((u) => u.role !== "couple" && (u.approved || !u.isActive)).map((u) => ({
          id: u.id, name: u.name, email: u.email, role: u.role,
          isActive: u.isActive, vendorName: u.vendor?.name ?? null,
          group: groupOf(u),
          customerType: u.role === "couple" ? customerTypeOf(u.id) : null,
        }))}
      />
      <VendorsAdmin
        vendors={vendors.map((v) => ({
          id: v.id, name: v.name, category: v.category,
          userCount: v._count.users, orderCount: v._count.orders,
        }))}
      />
      <VenuesAdmin
        venues={venues.map((v) => ({
          id: v.id, name: v.name, type: v.type, capacity: v.capacity,
          widthM: v.widthM, depthM: v.depthM,
          useCount: v._count.banquetCases + v._count.chapelCases + v._count.events + v._count.assignments,
        }))}
      />
    </>
  );
}
