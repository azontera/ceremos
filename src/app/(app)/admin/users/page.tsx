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
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.vendor.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { orders: true } } },
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


  return (
    <>
      <div className="section-h"><h2>ユーザー・権限管理</h2><span className="pill gray">{users.length}名</span></div>
      <p style={{ fontSize: 12.5, marginBottom: 12 }}>
        💐 顧客（新郎新婦・宴会）の管理は <Link href="/customers">顧客マスタ</Link> へ移動しました。
      </p>
      <UsersAdmin
        meId={s.userId}
        users={users.filter((u) => u.role !== "couple" && !u.vendorId).map((u) => ({
          id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive,
        }))}
      />
      <VendorsAdmin
        vendors={vendors.map((v) => ({
          id: v.id, name: v.name, category: v.category, orderCount: v._count.orders,
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
