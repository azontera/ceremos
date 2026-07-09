"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        background: "#a4586b", color: "#fff", border: "none", borderRadius: 8,
        padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
      }}
    >
      🖨 印刷 / PDFとして保存
    </button>
  );
}
