import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLES, audit } from "@/lib/rbac";
import { validatePassword } from "@/lib/password";

// PATCH: ロール変更・有効/無効・パスワードリセット（管理者のみ）
// 顧客アカウントの連絡先変更・PW再設定・案件紐付け・有効/無効はプランナー・支配人も可
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  // 権限：管理者=全操作／プランナー・支配人=顧客アカウントの連絡先変更・PW再設定・案件紐付け
  const CUSTOMER_KEYS = ["caseId", "isActive", "name", "email", "phone", "address", "password"];
  const customerEditOnly = target.role === "couple" && Object.keys(b).every((k) => CUSTOMER_KEYS.includes(k));
  const canStaff = ["admin", "manager", "planner"].includes(s.role);
  if (!(s.role === "admin" || (customerEditOnly && canStaff))) {
    return NextResponse.json({ error: "権限がありません（顧客アカウントの変更はプランナー以上・その他は管理者のみ）" }, { status: 403 });
  }
  if (params.id === s.userId) {
    return NextResponse.json({ error: "自分自身のアカウントはここでは変更できません" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (b.role !== undefined) {
    if (!ROLES[b.role]) return NextResponse.json({ error: "不正なロールです" }, { status: 400 });
    data.role = b.role;
  }
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  // 連絡先の変更（案件概要・顧客マスタから）
  if (b.name !== undefined) {
    if (!String(b.name).trim()) return NextResponse.json({ error: "お名前を入力してください" }, { status: 400 });
    data.name = String(b.name).trim();
  }
  if (b.email !== undefined) {
    const email = String(b.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "メールアドレスの形式が正しくありません" }, { status: 400 });
    const dup = await prisma.user.findUnique({ where: { email } });
    if (dup && dup.id !== params.id) return NextResponse.json({ error: "このメールアドレスは他のアカウントで使用されています" }, { status: 409 });
    data.email = email;
  }
  if (b.phone !== undefined) data.phone = String(b.phone).trim() || null;
  if (b.address !== undefined) data.address = String(b.address).trim() || null;
  if (b.password) {
    const policyErr = validatePassword(String(b.password));
    if (policyErr) return NextResponse.json({ error: policyErr }, { status: 400 });
    data.passwordHash = await bcrypt.hash(String(b.password), 10);
  }
  const u = await prisma.user.update({ where: { id: params.id }, data });
  // 案件へ紐付け（案件メンバー登録）
  if (b.caseId) {
    await prisma.caseMember.upsert({
      where: { caseId_userId: { caseId: b.caseId, userId: u.id } },
      update: {},
      create: { caseId: b.caseId, userId: u.id, roleInCase: "customer" },
    });
  }
  await audit(s.userId, "update", "user", u.id, {
    role: b.role, isActive: b.isActive, passwordReset: !!b.password,
    linkedCase: b.caseId ?? undefined,
  });
  return NextResponse.json({ user: { id: u.id, isActive: u.isActive, role: u.role } });
}

// DELETE: 顧客アカウントの削除（支配人・管理者のみ／顧客ロール限定）
// チャット履歴がある場合はデータ保全のため削除不可（無効化を案内）
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (params.id === s.userId) {
    return NextResponse.json({ error: "自分自身は削除できません" }, { status: 400 });
  }
  const u = await prisma.user.findUnique({
    where: { id: params.id },
    include: { _count: { select: { messages: true } } },
  });
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!["admin", "manager"].includes(s.role)) {
    return NextResponse.json({ error: "削除は支配人または管理者のみ可能です" }, { status: 403 });
  }
  // スタッフの削除は管理者のみ。最後の管理者と、案件の担当プランナーは削除不可
  if (u.role !== "couple") {
    if (s.role !== "admin") {
      return NextResponse.json({ error: "スタッフの削除は管理者のみ可能です" }, { status: 403 });
    }
    if (u.role === "admin") {
      const admins = await prisma.user.count({ where: { role: "admin", isActive: true } });
      if (admins <= 1) return NextResponse.json({ error: "最後の管理者は削除できません" }, { status: 400 });
    }
    const planning = await prisma.case.count({ where: { plannerId: u.id } });
    if (planning > 0) {
      return NextResponse.json(
        { error: `${planning}件の案件で担当プランナーになっているため削除できません。案件の担当を変更するか「無効化」をご利用ください` },
        { status: 400 },
      );
    }
  }
  if (u._count.messages > 0) {
    return NextResponse.json(
      { error: `チャット履歴が${u._count.messages}件あるため削除できません。記録保全のため「無効化」をご利用ください` },
      { status: 400 },
    );
  }
  // 案件メンバー・既読・リアクションは cascade、タスク担当・監査ログは自動的に切り離される
  await prisma.user.delete({ where: { id: params.id } });
  await audit(s.userId, "delete", "user", params.id, {
    name: u.name, email: u.email, profile: u.profileJson ? JSON.parse(u.profileJson) : null, // 復元用スナップショット
  });
  return NextResponse.json({ ok: true });
}
