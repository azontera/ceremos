// 新郎側/新婦側の担当解決（席次の分担入力・ヒヤリングの回答者判定に使用）
// 優先順: CaseMember.roleInCase（"groom"/"bride"）→ 氏名の一致 → ヒヤリングの性別 → 判定不能(null)
// 判定不能のときは両方編集可（ロックしない）にフォールバックする。

export type CoupleSide = "groom" | "bride";

export function resolveCoupleSide(
  user: { name: string; profileJson?: string | null },
  c: { groomName: string; brideName: string },
  roleInCase?: string | null,
): CoupleSide | null {
  if (roleInCase === "groom" || roleInCase === "bride") return roleInCase;
  const uname = (user.name ?? "").replace(/\s/g, "");
  const g = (c.groomName ?? "").replace(/\s/g, "");
  const b = (c.brideName ?? "").replace(/\s/g, "");
  if (uname && g && g !== "―" && (uname === g || uname.includes(g) || g.includes(uname))) return "groom";
  if (uname && b && b !== "―" && (uname === b || uname.includes(b) || b.includes(uname))) return "bride";
  try {
    const p = JSON.parse(user.profileJson ?? "{}");
    if (p.gender === "男性") return "groom";
    if (p.gender === "女性") return "bride";
  } catch { /* ignore */ }
  return null;
}
