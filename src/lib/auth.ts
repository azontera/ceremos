// セッション管理（署名付きJWT Cookie）
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "werp_session";
const secret = () =>
  new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret");

export type Session = {
  userId: string;
  name: string;
  role: string;
  vendorId?: string | null;
};

export async function createSession(s: Session, remember = false) {
  // 通常12時間・「ログイン状態を保持」で30日
  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;
  const token = await new SignJWT(s as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(remember ? "30d" : "12h")
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export function destroySession() {
  cookies().delete(COOKIE);
}

// ===== 用途別ユーザートークン（DB保存不要・SESSION_SECRETで署名） =====
// purpose: profile（プロフィール入力・2時間）/ survey（アンケート・30日）
export async function createUserToken(userId: string, purpose: string, expiresIn: string): Promise<string> {
  return new SignJWT({ userId, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verifyUserToken(token: string, purpose: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== purpose || typeof payload.userId !== "string") return null;
    return payload.userId;
  } catch {
    return null;
  }
}
