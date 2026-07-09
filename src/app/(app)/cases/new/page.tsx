import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NewCaseForm } from "@/components/new-case-form";
import { getMasterOptions } from "@/lib/masters";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!can(s.role, "cases", "edit")) redirect("/cases");

  const [venues, caseTypeOptions] = await Promise.all([
    prisma.venue.findMany({ where: { type: { in: ["banquet", "external"] } }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    getMasterOptions("case_type"),
  ]);
  return (
    <>
      <div className="section-h"><h2>新規案件の作成</h2></div>
      <NewCaseForm
        venues={venues.map((v) => ({ id: v.id, name: v.type === "external" ? `${v.name}（外部）` : v.name }))}
        caseTypeOptions={caseTypeOptions}
      />
    </>
  );
}
