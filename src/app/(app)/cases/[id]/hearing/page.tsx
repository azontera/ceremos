// AIヒヤリング（診断型）ページ — スタッフの店頭ヒヤリング／お客様のスマホ回答の両方で使う
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessCase } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { HearingWizard } from "@/components/hearing-wizard";
import type { HearingData } from "@/lib/hearing";

export const dynamic = "force-dynamic";

export default async function HearingPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canAccessCase(s, params.id))) redirect("/cases");
  const c = await prisma.case.findUnique({
    where: { id: params.id },
    select: { id: true, caseType: true, hearingJson: true },
  });
  if (!c) notFound();
  let data: HearingData = { answers: {} };
  try { if (c.hearingJson) data = JSON.parse(c.hearingJson); } catch { /* ignore */ }
  return (
    <HearingWizard
      caseId={c.id}
      caseType={c.caseType}
      isStaff={s.role !== "couple"}
      initialAnswers={data.answers}
    />
  );
}
