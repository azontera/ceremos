// アプリ設定（key-value）
import { prisma } from "./db";

export const SETTING_DEFAULTS: Record<string, string> = {
  bank_info: "○○銀行 ○○支店 普通 1234567 カ）セレモス", // 請求書の振込先
  // ===== 式場ブランド（帳票のヘッダー・発行元に印字） =====
  venue_logo: "", // ロゴ画像URL（設定画面からアップロードで差し替え。既定は空=ソフト名「CEREMOS」を表示）
  venue_name: "CEREMOS",  // 式場名（左上タイトル。既定はソフト名＝CEREMOS。設定画面で式場名に変更可）
  venue_info: "Banquet & Wedding Venue\n〒509-0000 岐阜県可児市○○ 1-2-3　TEL 0574-00-0000", // 発行元情報（住所・電話など）
  screen_image_key: "", // 映像ウィンドウの待機画像（storageキー。空=真っ黒）
};

/** 帳票用ブランド情報をまとめて取得 */
export async function getBranding(): Promise<{ logoUrl: string; name: string; info: string }> {
  const [logoUrl, name, info] = await Promise.all([
    getSetting("venue_logo"), getSetting("venue_name"), getSetting("venue_info"),
  ]);
  return { logoUrl, name, info };
}

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key] ?? "";
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function emailVerificationEnabled(): Promise<boolean> {
  // メール認証機能は廃止（Resend連携を撤去したため）。登録は常に「管理者承認待ち」のみ。
  return false;
}
