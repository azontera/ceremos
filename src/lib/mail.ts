// メール送信：廃止済み（Resend連携を撤去）。呼び出し箇所は残すが、実送信は行わずサーバーログにのみ出力する。
export async function sendMail(to: string, subject: string, text: string): Promise<{ ok: boolean; stub: boolean }> {
  console.log(`[mail:stub] メール送信機能は無効化されています。To: ${to}\nSubject: ${subject}\n${text}`);
  return { ok: true, stub: true };
}
