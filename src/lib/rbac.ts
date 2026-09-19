// RBAC — 設計ドキュメント第7章「権限一覧」準拠
// ◎=edit ○=view △=scoped —=none
import { prisma } from "./db";
import type { Session } from "./auth";

export type Module =
  | "cases" | "chat" | "meetings" | "quotes" | "orders" | "meals"
  | "songs" | "rundown" | "seating" | "live" | "calendar" | "templates" | "admin";

type Level = "edit" | "view" | "scoped" | "none";

export const ROLES: Record<string, string> = {
  admin: "管理者", manager: "支配人", planner: "ブライダルプランナー",
  chef: "料理長", audio: "音響スタッフ", mc: "司会者", dress: "ドレス担当",
  florist: "装花担当", photo: "写真・映像担当",
  service: "サービススタッフ", couple: "顧客（新郎新婦・宴会）",
};

const P: Record<string, Partial<Record<Module, Level>>> = {
  admin:   { cases:"edit",chat:"edit",meetings:"edit",quotes:"edit",orders:"edit",meals:"edit",songs:"edit",rundown:"edit",seating:"edit",live:"edit",calendar:"edit",templates:"edit",admin:"edit" },
  manager: { cases:"edit",chat:"edit",meetings:"edit",quotes:"edit",orders:"edit",meals:"view",songs:"view",rundown:"edit",seating:"edit",live:"edit",calendar:"edit",templates:"view" },
  planner: { cases:"edit",chat:"edit",meetings:"edit",quotes:"edit",orders:"edit",meals:"view",songs:"edit",rundown:"edit",seating:"edit",live:"edit",calendar:"edit",templates:"view" },
  chef:    { cases:"view",chat:"edit",meetings:"view",orders:"scoped",meals:"edit",rundown:"view",seating:"view",live:"edit",calendar:"view" },
  audio:   { cases:"view",chat:"edit",meetings:"view",orders:"scoped",songs:"edit",rundown:"view",live:"edit",calendar:"view" },
  mc:      { cases:"view",chat:"edit",meetings:"view",orders:"scoped",songs:"view",rundown:"view",seating:"view",live:"edit",calendar:"view" },
  dress:   { cases:"view",chat:"edit",meetings:"view",orders:"scoped",rundown:"view",live:"view",calendar:"view" },
  florist: { cases:"view",chat:"edit",meetings:"view",orders:"scoped",rundown:"view",live:"view",calendar:"view" },
  photo:   { cases:"view",chat:"edit",meetings:"view",orders:"scoped",songs:"view",rundown:"view",live:"edit",calendar:"view" },
  service: { cases:"view",chat:"edit",meetings:"view",meals:"view",rundown:"view",seating:"view",live:"edit",calendar:"view" },
  // couple: 「アプリに沿えば誰でもプランナーになれる」— 楽曲・席次に加え進行表（司会台本）も自分で作成できる。
  // 見積は閲覧＋カタログ追加（定価のみ・専用API）。値引き等の見積編集はプランナー以上
  couple:  { cases:"scoped",chat:"edit",meetings:"view",quotes:"view",meals:"view",songs:"edit",rundown:"edit",seating:"edit",calendar:"scoped" },
};

export function can(role: string, mod: Module, need: "view" | "edit" = "view"): boolean {
  const lv = P[role]?.[mod] ?? "none";
  if (lv === "none") return false;
  if (need === "view") return true;
  return lv === "edit";
}

/** 案件スコープ: 管理者/支配人は全件、それ以外は case_members 登録案件のみ */
export async function caseScopeWhere(s: Session) {
  if (s.role === "admin" || s.role === "manager") return {};
  return { members: { some: { userId: s.userId } } };
}

export async function canAccessCase(s: Session, caseId: string): Promise<boolean> {
  if (s.role === "admin" || s.role === "manager") return true;
  const m = await prisma.caseMember.findUnique({
    where: { caseId_userId: { caseId, userId: s.userId } },
  });
  return !!m;
}

export async function audit(userId: string | null, action: string, targetType: string, targetId?: string, diff?: unknown) {
  await prisma.auditLog.create({
    data: { userId, action, targetType, targetId, diffJson: diff ? JSON.stringify(diff) : null },
  });
}
