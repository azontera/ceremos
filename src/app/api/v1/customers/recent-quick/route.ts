import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET: 直近72時間にクイック登録した、まだ案件に紐付いていないお客様
// （新規案件画面に表示 → 選ぶと名前・連絡先が自動入力され、作成時に紐付く）
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "cases", "edit")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const since = new Date(Date.now() - 72 * 3600 * 1000);
  const users = await prisma.user.findMany({
    where: {
      role: "couple", isActive: true,
      createdAt: { gte: since },
      memberships: { none: {} }, // 案件未紐付けのみ
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return NextResponse.json({
    customers: users.map((u) => {
      let partnerName = "", eventType = "wedding";
      try {
        const p = JSON.parse(u.profileJson ?? "{}");
        partnerName = p.partnerName ?? "";
        eventType = p.eventType === "party" ? "party" : "wedding";
      } catch { /* ignore */ }
      return { id: u.id, name: u.name, partnerName, eventType, email: u.email, phone: u.phone, createdAt: u.createdAt };
    }),
  });
}
