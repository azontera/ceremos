"use client";
// 🗑 案件カードの削除ボタン（支配人以上のみ表示）。テストデータの掃除用。
// 案件カード（<Link>）の中に置くため、クリックはカード遷移を止めてから処理する
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CaseDeleteButton({ caseId, label }: { caseId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn sm" disabled={busy}
      title="案件を完全に削除（見積・進行表・席次・楽曲・請求・添付ごと）"
      style={{ padding: "2px 8px", fontSize: 12, color: "var(--red)" }}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(
          `「${label}」を完全に削除しますか？\n\n打ち合わせ・見積・発注・料理・席次・進行表・楽曲・請求・添付ファイルなど、この案件のデータがすべて消えます。\nこの操作は元に戻せません。`,
        )) return;
        setBusy(true);
        const res = await fetch(`/api/v1/cases/${caseId}`, { method: "DELETE" });
        setBusy(false);
        if (res.ok) router.refresh();
        else {
          const data = await res.json().catch(() => ({}));
          alert(data.error ?? `削除に失敗しました（HTTP ${res.status}）`);
        }
      }}>
      {busy ? "…" : "🗑"}
    </button>
  );
}
