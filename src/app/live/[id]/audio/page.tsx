import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can, canAccessCase } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { AudioConsole } from "@/components/audio-console";
import { timeRangeLabel } from "@/lib/case-time";

export const dynamic = "force-dynamic";

// 🎚 再生プレイヤー（全画面・黒ベース）：楽曲タブのプレイヤーの本番向けフルスクリーン版
export default async function AudioLivePage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canAccessCase(s, params.id))) redirect("/cases");
  if (!can(s.role, "live", "edit")) redirect(`/cases/${params.id}?tab=rundown#songs`); // お客様は操作不可

  const c = await prisma.case.findUnique({
    where: { id: params.id },
    include: { banquetVenue: true },
  });
  if (!c) redirect("/cases");

  const titleName = c.brideName === "―"
    ? c.groomName
    : `${c.groomName.split(" ")[0]}家・${c.brideName.split(" ")[0]}家`;
  return (
    <AudioConsole
      caseId={c.id}
      title={`${titleName} 再生プレイヤー`}
      sub={`${c.banquetVenue?.name ?? ""} ・ ${timeRangeLabel(c.weddingDate, c.endTime)}`}
    />
  );
}
