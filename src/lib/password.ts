// パスワードポリシー：8文字以上・英字と数字を含む
export function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 8) return "パスワードは8文字以上にしてください";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "パスワードには英字と数字の両方を含めてください";
  return null;
}
