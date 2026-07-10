// 席次表の専用編集ページ（案件詳細タブはプレビューのみ・編集はここに切り出し）
// 案件詳細タブの「🔒閲覧モード→✏編集する」のロック解除の手間をなくすため、ここでは開いた時点から編集可能。
// レイアウト編集（卓ドラッグ配置）はPC・iPad向け。スマホ幅では自動でかんたん入力（リスト）のみになる
//（SeatingPanel内の.pc-only切替ボタンが720px以下で非表示・simpleModeが自動ON。既存の挙動をそのまま利用）。
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can, canAccessCase } from "@/lib/rbac";
import { getMasterOptions } from "@/lib/masters";
import { caseLabel } from "@/lib/case-types";
import { resolveCoupleSide } from "@/lib/couple-side";
import { isBridal } from "@/lib/terms";
import { prisma } from "@/lib/db";
import { SeatingPanel } from "@/components/seating-panel";

export const dynamic = "force-dynamic";

export default async function SeatingEditPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canAccessCase(s, params.id))) redirect("/cases");

  const c = await prisma.case.findUnique({
    where: { id: params.id },
    select: { id: true, groomName: true, brideName: true, guestCount: true, caseType: true },
  });
  if (!c) notFound();

  const relationOptions = await getMasterOptions("relation").then((rows) => rows.map(([, l]) => l));

  let mySeatingSide: "groom" | "bride" | null = null;
  if (s.role === "couple" && isBridal(c.caseType)) {
    const [meUser, myMember] = await Promise.all([
      prisma.user.findUnique({ where: { id: s.userId }, select: { name: true, profileJson: true } }),
      prisma.caseMember.findFirst({ where: { caseId: c.id, userId: s.userId }, select: { roleInCase: true } }),
    ]);
    if (meUser) mySeatingSide = resolveCoupleSide(meUser, c, myMember?.roleInCase);
  }

  return (
    <>
      <div className="section-h" style={{ marginBottom: 4 }}>
        <Link href={`/cases/${c.id}?tab=seating`} className="btn sm">← 案件に戻る</Link>
      </div>
      <div className="section-h" style={{ marginTop: 2, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>🪑 席次編集 — {caseLabel(c)}</h1>
      </div>
      <SeatingPanel
        caseId={c.id}
        canEdit={can(s.role, "seating", "edit")}
        canHall={can(s.role, "cases", "edit")}
        guestCount={c.guestCount}
        relations={relationOptions}
        lockSide={mySeatingSide}
        caseType={c.caseType}
        defaultEditMode
      />
    </>
  );
}
