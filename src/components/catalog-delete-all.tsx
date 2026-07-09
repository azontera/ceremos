"use client";
// 🗑 全カタログ削除（式場＋全業者の全品目・写真ごと）。スタッフ専用のカタログ管理ページで使用。
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CatalogDeleteAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (count === 0) return;
    if (!confirm(`カタログの全${count}品目（式場＋全業者）をすべて削除しますか？\nこの操作は元に戻せません（写真も削除されます）。`)) return;
    if (!confirm("本当によろしいですか？　すべてのカタログ品目が消えます。")) return;
    setBusy(true);
    const res = await fetch("/api/v1/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulkDelete: true, all: true }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { alert(data.error ?? "削除に失敗しました"); return; }
    router.refresh();
  }

  if (count === 0) return null;
  return (
    <button className="btn sm" style={{ color: "var(--red)" }} disabled={busy} onClick={run}
      title="式場・全業者のカタログ品目をすべて削除します（写真も削除されます）">
      {busy ? "削除中…" : "🗑 全カタログを削除"}
    </button>
  );
}
