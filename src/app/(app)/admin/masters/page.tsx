import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MASTER_GROUPS } from "@/lib/masters";
import { MastersAdmin } from "@/components/masters-admin";

export const dynamic = "force-dynamic";

export default async function AdminMastersPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "admin") redirect("/dashboard");

  const options = await prisma.masterOption.findMany({
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
  });

  return (
    <>
      <div className="section-h"><h2>選択肢マスタ</h2><span className="pill gray">{options.length}件</span></div>
      <MastersAdmin
        groups={Object.entries(MASTER_GROUPS)}
        options={options.map((o) => ({
          id: o.id, group: o.group, value: o.value, label: o.label,
          sortOrder: o.sortOrder, isActive: o.isActive,
        }))}
      />
    </>
  );
}
