// 帳票ヘッダーの式場ロゴ（未設定時はCEREMOSマークにフォールバック）
export function PrintBrand({ logoUrl, name }: { logoUrl: string; name: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={name || "式場ロゴ"} style={{ maxHeight: 46, maxWidth: 300, objectFit: "contain", display: "block" }} />
    );
  }
  return (
    <div style={{ fontSize: 12, color: "#b06a5e", letterSpacing: ".22em", fontWeight: 700 }}>
      CEREM<span style={{ color: "#d99a86" }}>◈</span>S
      <span style={{ color: "#888", fontWeight: 400, letterSpacing: ".1em", marginLeft: 8, fontSize: 10 }}>CEREMONY & EVENT PLATFORM</span>
    </div>
  );
}
