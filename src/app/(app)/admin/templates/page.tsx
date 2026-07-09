import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TemplatesAdmin } from "@/components/templates-admin";

export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["admin", "manager", "planner"].includes(s.role)) redirect("/dashboard");

  const templates = await prisma.template.findMany({ orderBy: { type: "asc" } });
  return (
    <>
      <div className="section-h">
        <h2>テンプレート管理</h2>
        <span className="pill gray">{templates.length}件</span>
        {s.role !== "admin" && <span className="pill amber">閲覧のみ（編集は管理者）</span>}
      </div>
      <TemplatesAdmin
        canEdit={s.role === "admin"}
        templates={templates.map((t) => ({
          id: t.id, type: t.type, name: t.name, bodyJson: t.bodyJson, isSystem: t.isSystem,
        }))}
      />
    </>
  );
}
