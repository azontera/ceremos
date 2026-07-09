// freee会計 API連携（OAuth2）
// 必要な環境変数：FREEE_CLIENT_ID / FREEE_CLIENT_SECRET（freeeアプリストアで発行）
// トークン・事業所IDは Setting テーブルに保存（freee_access_token など）
import { getSetting, setSetting } from "./settings";

const AUTH_BASE = "https://accounts.secure.freee.co.jp/public_api";
const API_BASE = "https://api.freee.co.jp";

export function freeeConfigured(): boolean {
  return !!process.env.FREEE_CLIENT_ID && !!process.env.FREEE_CLIENT_SECRET;
}

export function freeeAuthUrl(redirectUri: string): string {
  const q = new URLSearchParams({
    client_id: process.env.FREEE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    prompt: "select_company", // 事業所を選択してから許可
  });
  return `${AUTH_BASE}/authorize?${q}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.FREEE_CLIENT_ID ?? "",
      client_secret: process.env.FREEE_CLIENT_SECRET ?? "",
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`freee token error: ${data.error_description ?? data.error ?? res.status}`);
  return data as { access_token: string; refresh_token: string; expires_in: number };
}

export async function exchangeCode(code: string, redirectUri: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  await saveTokens(t);
  // 事業所を取得して保存（select_companyで選んだ事業所が先頭に来る）
  const companies = await api<{ companies: { id: number; display_name: string }[] }>("/api/1/companies");
  const co = companies.companies?.[0];
  if (co) {
    await setSetting("freee_company_id", String(co.id));
    await setSetting("freee_company_name", co.display_name);
  }
  return co;
}

async function saveTokens(t: { access_token: string; refresh_token: string; expires_in: number }) {
  await setSetting("freee_access_token", t.access_token);
  await setSetting("freee_refresh_token", t.refresh_token);
  await setSetting("freee_token_expires", String(Date.now() + (t.expires_in - 120) * 1000));
}

/** 有効なアクセストークンを返す（期限切れは自動リフレッシュ） */
async function accessToken(): Promise<string> {
  const token = await getSetting("freee_access_token");
  if (!token) throw new Error("freee未連携です。管理者が「freeeと連携」を実行してください");
  const exp = Number(await getSetting("freee_token_expires") || 0);
  if (Date.now() < exp) return token;
  const refresh = await getSetting("freee_refresh_token");
  if (!refresh) throw new Error("freeeの再連携が必要です（リフレッシュトークンなし）");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  await saveTokens(t);
  return t.access_token;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.map((e: { messages?: string[] }) => e.messages?.join("、")).join("／")
      ?? data?.message ?? `HTTP ${res.status}`;
    throw new Error(`freee APIエラー：${msg}`);
  }
  return data as T;
}

export async function companyId(): Promise<number> {
  const id = Number(await getSetting("freee_company_id"));
  if (!id) throw new Error("freeeの事業所が未設定です（再連携してください）");
  return id;
}

/** 取引先を名前で検索、無ければ作成してIDを返す */
export async function findOrCreatePartner(name: string): Promise<number> {
  const cid = await companyId();
  const found = await api<{ partners: { id: number; name: string }[] }>(
    `/api/1/partners?company_id=${cid}&keyword=${encodeURIComponent(name)}&limit=50`);
  const hit = found.partners?.find((p) => p.name === name) ?? found.partners?.[0];
  if (hit && hit.name === name) return hit.id;
  const created = await api<{ partner: { id: number } }>("/api/1/partners", {
    method: "POST",
    body: JSON.stringify({ company_id: cid, name }),
  });
  return created.partner.id;
}

/** 勘定科目「売上高」のIDを取得 */
export async function salesAccountItemId(): Promise<number> {
  const cid = await companyId();
  const res = await api<{ account_items: { id: number; name: string }[] }>(
    `/api/1/account_items?company_id=${cid}`);
  const hit = res.account_items.find((a) => a.name === "売上高")
    ?? res.account_items.find((a) => a.name.includes("売上"));
  if (!hit) throw new Error("freeeに勘定科目「売上高」が見つかりません");
  return hit.id;
}

/** 税区分「課税売上10%」のコードを取得 */
export async function salesTaxCode(): Promise<number> {
  const res = await api<{ taxes: { code: number; name_ja: string }[] }>(`/api/1/taxes/codes`);
  const hit = res.taxes.find((t) => t.name_ja === "課税売上10%")
    ?? res.taxes.find((t) => t.name_ja.includes("課税売上") && t.name_ja.includes("10"));
  if (!hit) throw new Error("freeeの税区分「課税売上10%」が見つかりません");
  return hit.code;
}

/** 請求書1件を freee の収入取引として登録し、取引IDを返す */
export async function createDealForInvoice(inv: {
  number: string; issuedAt: Date; dueAt: Date | null; amount: number; note: string | null; paidAt: Date | null;
}, partnerName: string): Promise<number> {
  const cid = await companyId();
  const [partnerId, accountItemId, taxCode] = await Promise.all([
    findOrCreatePartner(partnerName), salesAccountItemId(), salesTaxCode(),
  ]);
  const d = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const deal = await api<{ deal: { id: number } }>("/api/1/deals", {
    method: "POST",
    body: JSON.stringify({
      company_id: cid,
      issue_date: d(inv.issuedAt),
      ...(inv.dueAt ? { due_date: d(inv.dueAt) } : {}),
      type: "income",
      partner_id: partnerId,
      ref_number: inv.number,
      details: [{
        account_item_id: accountItemId,
        tax_code: taxCode,
        amount: inv.amount,
        description: inv.note ?? "婚礼売上",
      }],
    }),
  });
  return deal.deal.id;
}
