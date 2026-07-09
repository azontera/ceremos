"use client";
// AI生成結果の取り込み（案件ページの🔮ヒヤリングカードから直接）
// ChatGPT/Claude の出力（pack JSON＋アドバイス文）を全文貼り付け → テンプレ登録 → この案件へ即適用。
// JSONの前後に説明文・コードフェンスが混ざっていてもサーバー側の寛容パーサが読み取る。
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AiPlanImport({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [applyNow, setApplyNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string[] | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true); setErr(""); setDone(null);
    try {
      // ① pack としてテンプレ登録（寛容パース: コードフェンス・前後の文章OK）
      const r1 = await fetch("/api/v1/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pack", bodyJson: text }),
      });
      const j1 = await r1.json().catch(() => ({}));
      if (!r1.ok) { setErr(j1.error ?? "読み込みに失敗しました"); setBusy(false); return; }
      const tpl = (j1.created as { id: string; name: string }[]).find((x) => x.id !== "catalog");
      if (!tpl) { setErr("テンプレとして読み込める内容がありませんでした"); setBusy(false); return; }
      if (!applyNow) {
        setDone([`テンプレ「${tpl.name}」として保存しました（見積ウィザードから適用できます）`]);
        setBusy(false); return;
      }
      // ② この案件へ即適用（見積・進行表・台本・料理・席次・リソースまで自動セットアップ）
      const r2 = await fetch(`/api/v1/cases/${caseId}/apply-pack`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: tpl.id }),
      });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok) { setErr(j2.error ?? "適用に失敗しました（テンプレ保存までは完了しています）"); setBusy(false); return; }
      setDone([`テンプレ「${tpl.name}」を取り込み、この案件へ適用しました`, ...(j2.autoSetup ?? [])]);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <>
      <button className="btn sm" onClick={() => { setOpen(true); setDone(null); setErr(""); }}>📥 生成結果を取り込む</button>
      {open && (
        <div className="mnav-sheet" style={{ zIndex: 90 }} onClick={() => setOpen(false)}>
          <div className="mnav-sheet-body" style={{ maxWidth: 560, margin: "8vh auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>📥 AI生成結果の取り込み</div>
            <p style={{ fontSize: 12, color: "var(--text2)", margin: "0 0 8px" }}>
              「📄 AI生成依頼MD」をChatGPT/Claudeに貼って返ってきた回答を、<b>そのまま全文</b>貼り付けてください
              （アドバイス文が混ざっていてもOK。アドバイスはAIの画面でプランナーが読む用です）。
            </p>
            <textarea
              className="form-input" rows={9} style={{ fontFamily: "monospace", fontSize: 11.5 }}
              placeholder={'{\n  "kind": "ceremos-template-pack",\n  "name": "...",\n  ...\n}\n\n## プランナーへのアドバイス\n...'}
              value={text} onChange={(e) => setText(e.target.value)}
            />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, margin: "10px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} />
              この案件へすぐ適用する（見積の新Ver・進行表・台本・料理・席次・リソースを自動セットアップ）
            </label>
            <p style={{ fontSize: 11, color: "var(--text3)", margin: "0 0 8px" }}>
              ※ チェックを外すとテンプレ保存のみ（見積に影響させたくない場合）。進行表だけ更新したい場合は、保存後に進行タブの「テンプレ適用」から。
            </p>
            {err && <div className="form-err">{err}</div>}
            {done && (
              <div className="card" style={{ padding: "10px 14px", margin: "8px 0", borderColor: "var(--green)" }}>
                {done.map((line, i) => <div key={i} style={{ fontSize: 12.5 }}>✅ {line}</div>)}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setOpen(false)}>{done ? "閉じる" : "キャンセル"}</button>
              {!done && <button className="btn primary" disabled={!text.trim() || busy} onClick={run}>{busy ? "取り込み中…" : "取り込む"}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
