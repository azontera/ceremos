import { redirect } from "next/navigation";

// （廃止）当日運営モード → 再生プレイヤーに一本化
export default function LivePage({ params }: { params: { id: string } }) {
  redirect(`/live/${params.id}/audio`);
}
