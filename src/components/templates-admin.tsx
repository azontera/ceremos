"use client";
// テンプレート管理：AI生成テンプレ一式（pack）の読み込み・編集・削除＋AIプロンプトのコピー
// パック＝見積・料理・進行台本・会場リソース（STAFF/設備）がひとまとまりのJSON。
// 案件への適用は「コピー」なので、適用後にテンプレを編集しても案件側には同期しない。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildAiPrompt, PACK_JSON_SCHEMA } from "@/lib/template-pack-prompt";
import { buildSpecMarkdown } from "@/lib/template-pack-spec";

type Tmpl = { id: string; type: string; name: string; bodyJson: string; isSystem: boolean };
const TYPE_LABEL: Record<string, string> = {
  pack: "テンプレ一式", meeting: "打ち合わせ", quote: "見積", rundown: "進行表",
  mc_script: "司会台本", audio_script: "音響台本", meal_sheet: "料理提供表", order_sheet: "発注書",
};

function packInfo(bodyJson: string): string {
  try {
    const p = JSON.parse(bodyJson);
    const parts: string[] = [];
    if (p.quote?.items?.length) {
      const total = p.quote.items.reduce((s: number, i: { qty?: number; unitPrice?: number }) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0);
      parts.push(`見積${p.quote.items.length}品目（¥${total.toLocaleString("ja-JP")}）`);
    }
    if (p.menu?.items?.length) parts.push(`料理${p.menu.items.length}品`);
    if (p.rundown?.items?.length) parts.push(`進行${p.rundown.items.length}演目`);
    const st = p.resources?.staff?.length ?? 0;
    const eq = p.resources?.equipment?.length ?? 0;
    if (st || eq) parts.push(`STAFF${st}・設備${eq}`);
    return parts.join("　") || "（内容なし）";
  } catch { return "（JSONを確認してください）"; }
}

export function TemplatesAdmin({ templates, canEdit }: { templates: Tmpl[]; canEdit: boolean }) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const packs = templates.filter((t) => t.type === "pack");
  const others = templates.filter((t) => t.type !== "pack");

  function toggleSel(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function setSelForAll(list: Tmpl[], on: boolean) {
    setSelected((prev) => { const n = new Set(prev); list.forEach((t) => (on ? n.add(t.id) : n.delete(t.id))); return n; });
  }

  // まとめて削除（選択した複数テンプレを一括削除）
  async function delMany(ids: string[], confirmMsg: string) {
    if (ids.length === 0) return;
    if (!confirm(confirmMsg)) return;
    setBusy(true); setErr(""); setMsg("");
    const res = await fetch("/api/v1/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulkDelete: true, ids }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "削除に失敗しました"); return; }
    setSelected(new Set()); setMsg(`🗑 ${data.count}件のテンプレを削除しました`); router.refresh();
  }

  async function save(t: Tmpl, name: string, bodyJson: string) {
    const res = await fetch(`/api/v1/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, bodyJson }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? `保存に失敗しました（HTTP ${res.status}）`); return; }
    setErr(""); setEditId(null); router.refresh();
  }

  async function del(t: Tmpl) {
    if (!confirm(`テンプレ「${t.name}」を削除しますか？\n（すでに案件へ適用した内容はコピーのため影響しません）`)) return;
    const res = await fetch(`/api/v1/templates/${t.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? "削除に失敗しました"); return; }
    setErr(""); router.refresh();
  }

  async function importPacks(text: string) {
    if (!text.trim()) return;
    setBusy(true); setErr(""); setMsg("");
    const res = await fetch("/api/v1/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "pack", import: true, bodyJson: text }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "読み込みに失敗しました"); return; }
    const names = (data.created ?? []).map((c: { name: string }) => c.name);
    const hasCatalog = names.some((n: string) => n.startsWith("カタログ"));
    const catalogHint = hasCatalog ? "　📸 写真は「🛍 取り込んだカタログ（写真）を見る」から確認できます" : "";
    setMsg(`✅ ${names.length}件のテンプレを読み込みました：${names.join("／")}${catalogHint}${data.errors?.length ? `　⚠ ${data.errors.join("／")}` : ""}`);
    setImportText(""); setImportOpen(false);
    router.refresh();
  }

  // 📖 要件をMarkdownファイルとしてダウンロード（AIに渡す・社内共有用）
  function downloadSpecMd() {
    const blob = new Blob([buildSpecMarkdown()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CEREMOSテンプレ作成要件.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildAiPrompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // クリップボード不可の環境：プロンプトを表示
      prompt("以下をコピーしてAIに貼り付けてください", buildAiPrompt());
    }
  }

  return (
    <>
      {/* ヘッダー：主要操作は2つ（コピー・読み込み）だけ。写真はカタログへ */}
      <div className="section-h" style={{ margin: "0 0 10px", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: "var(--text3)" }}>
          AIで作ったJSONを読み込むと、見積・料理・進行台本・<b>カタログ（写真つき）</b>まで一括登録されます。
        </span>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <>
            <button className="btn" onClick={copyPrompt} title="AIに貼り付けるだけでJSONを作れるプロンプトをコピー">
              {copied ? "✅ コピーしました" : "🤖 AIプロンプトをコピー"}
            </button>
            <button className="btn primary" onClick={() => setImportOpen((o) => !o)}>📥 AIテンプレ読み込み</button>
          </>
        )}
      </div>
      {/* 写真はカタログに入る。導線を1本用意 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 12px" }}>
        <a className="btn sm" href="/admin/catalog" title="取り込んだカタログ品目と写真を確認・編集します">🛍 取り込んだカタログ（写真）を見る →</a>
        <button className="btn sm" onClick={() => setSpecOpen((o) => !o)}>{specOpen ? "▲ 使い方・要件を閉じる" : "ⓘ 使い方・テンプレ要件"}</button>
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}
      {msg && <div className="card" style={{ padding: "10px 14px", marginBottom: 10, fontSize: 12.5 }}>{msg}</div>}

      {/* ⓘ 使い方・テンプレ作成の要件（仕様）：既定は閉じておきシンプルに */}
      {specOpen && (
        <div className="card" style={{ padding: 16, marginBottom: 14, fontSize: 12, lineHeight: 1.9 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>ⓘ 使い方</div>
          <div style={{ marginBottom: 12, color: "var(--text2)" }}>
            ① <b>🤖 AIプロンプトをコピー</b> → ChatGPT・Claude等に貼り付けて送信（式場に合わせて内容を書き換えてOK）<br />
            ② AIが出力したJSONをコピー → <b>📥 AIテンプレ読み込み</b> に貼り付けて登録<br />
            ③ 新規案件ウィザード・お客様の新規ウィザードで選べるようになります。<b>🛍 カタログ</b>（業者・品目・<b>写真</b>）も同じJSONに含めれば一括登録され、<a href="/admin/catalog">カタログ画面</a>で写真つきで確認できます
          </div>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>📖 テンプレ一式（pack）作成の要件</div>
          <div style={{ display: "grid", gap: 4 }}>
            <div><b>形式：</b>JSON 1個（複数プランは配列 [ {"{…}"}, {"{…}"} ]）。<code>kind: &quot;ceremos-template-pack&quot;</code></div>
            <div><b>必須：</b><code>name</code>（テンプレ名）＋ <code>quote / menu / rundown</code> のいずれか1つ以上に items があること</div>
            <div><b>💰 quote.items：</b><code>name</code> 必須。<code>category</code> は ceremony/venue/catering/florist/dress/beauty/photo/video/mc/audio/print/gift/service/discount/other。金額は円の整数。値引き・特典は category=&quot;discount&quot; でマイナス金額</div>
            <div><b>🍽 menu.items：</b><code>name</code> 必須。<code>course</code> は 乾杯酒/アミューズ/前菜/スープ/魚料理/お口直し/肉料理/デザート/パン・飲物/その他。<code>cost</code>=原価・<code>price</code>=売値</div>
            <div><b>📋 rundown.items：</b><code>title</code> 必須。<code>durationMin</code>（実所要分。時刻は先頭から自動再計算）を必ず入れる。<code>mcScript</code>=司会台本（読み上げ文）。<code>roles</code> は mc,audio,catering,service,photo のカンマ区切り。文中の <code>{"{新郎}{新婦}{新郎姓}{新婦姓}"}</code> は適用時に実名へ自動置換</div>
            <div><b>👥 resources：</b><code>staff</code>/<code>equipment</code> の各行は <code>label</code>＋<code>startOffsetMin</code>/<code>endOffsetMin</code>（開催の開始/終了時刻からの相対分、負の値=前）。<code>useRooms: true</code> で控室・厨房を会場マスタから自動割当</div>
            <div><b>🧭 wizard（おすすめ判定）：</b><code>styles</code>（chapel/garden/night/wakon/small/casual/formal/party/ceremony/dinnershow）・<code>guestMin/guestMax</code>・<code>budgetManMin/budgetManMax</code>（万円）・<code>timeSlots</code>（day/evening/night）</div>
            <div><b>🪑 seating：</b><code>perTable</code>=1卓あたり人数（席次の自動レイアウトに使用）</div>
            <div style={{ color: "var(--text3)" }}><b>適用ルール：</b>適用はコピー方式（適用後の編集はテンプレと同期しない）。見積は常に新バージョン(下書き)を作成。料理・席次・リソースは案件に既存データが無いときのみ、進行表は未編集（台本なし・全曲未定）のときのみ作成される</div>
          </div>
          <div style={{ fontWeight: 700, margin: "10px 0 4px" }}>スキーマ例（コメントは説明用。実際のJSONには書かない）</div>
          <pre style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, fontSize: 10.5, overflowX: "auto", whiteSpace: "pre", margin: 0 }}>{PACK_JSON_SCHEMA}</pre>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {canEdit && <button className="btn sm" onClick={copyPrompt}>{copied ? "✅ コピーしました" : "🤖 この要件入りのAIプロンプトをコピー"}</button>}
            <button className="btn sm" onClick={downloadSpecMd}>⬇ この要件をMDファイルでダウンロード</button>
            <button className="btn sm" onClick={() => setSpecOpen(false)}>閉じる</button>
          </div>
        </div>
      )}

      {/* インポート */}
      {importOpen && (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>📥 AIが出力したJSONを貼り付け（単体でも配列でもOK・カタログ「ceremos-catalog」も同時に読み込めます）</div>
          <textarea className="form-input" rows={10} value={importText}
            style={{ fontFamily: "monospace", fontSize: 11.5 }}
            placeholder='{"kind":"ceremos-template-pack","name":"…", …}  または  [ {…}, {…} ]'
            onChange={(e) => setImportText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn primary" disabled={busy || !importText.trim()} onClick={() => importPacks(importText)}>
              {busy ? "読み込み中…" : "読み込む"}
            </button>
            <label className="btn" style={{ cursor: "pointer" }}>
              📄 JSONファイルから
              <input type="file" accept=".json,application/json" style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const text = await f.text();
                  setImportText(text);
                  importPacks(text);
                }} />
            </label>
            <button className="btn" onClick={() => setImportOpen(false)}>キャンセル</button>
          </div>
        </div>
      )}

      {/* テンプレ一式（pack） */}
      <div style={{ fontWeight: 800, fontSize: 13.5, margin: "4px 0 8px" }}>📦 テンプレ一式（見積・料理・進行台本・リソース）<span className="pill accent" style={{ marginLeft: 8 }}>{packs.length}件</span></div>
      {canEdit && packs.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 8px", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={packs.every((t) => selected.has(t.id))}
              onChange={(e) => setSelForAll(packs, e.target.checked)} /> 全選択
          </label>
          <button className="btn sm" style={{ color: "var(--red)" }} disabled={busy || packs.filter((t) => selected.has(t.id)).length === 0}
            onClick={() => { const ids = packs.filter((t) => selected.has(t.id)).map((t) => t.id); delMany(ids, `選択した${ids.length}件のテンプレを削除しますか？\n（すでに案件へ適用した内容はコピーのため影響しません）`); }}>
            🗑 選択したものを削除（{packs.filter((t) => selected.has(t.id)).length}）
          </button>
          <button className="btn sm" style={{ color: "var(--red)" }} disabled={busy}
            onClick={() => delMany(packs.map((t) => t.id), `テンプレ一式を${packs.length}件すべて削除しますか？この操作は元に戻せません。\n（すでに案件へ適用した内容はコピーのため影響しません）`)}>
            すべて削除
          </button>
        </div>
      )}
      {packs.length === 0 && (
        <div className="card"><div className="empty">
          テンプレ一式はまだありません。「🤖 AIプロンプトをコピー」→ AIでJSONを生成 → 「📥 AIテンプレ読み込み」で登録してください。
        </div></div>
      )}
      <div className="grid" style={{ gap: 12 }}>
        {packs.map((t) => (
          <div className="card" key={t.id}>
            <div className="card-h">
              {canEdit && (
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)}
                  title="選択（まとめて削除）" style={{ marginRight: 2, cursor: "pointer" }} />
              )}
              <span className="pill accent">📦 {TYPE_LABEL.pack}</span>
              {t.name}
              <div style={{ flex: 1 }} />
              {canEdit && editId !== t.id && (
                <>
                  <button className="btn sm" onClick={() => setEditId(t.id)}>編集</button>
                  <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => del(t)}>削除</button>
                </>
              )}
            </div>
            {editId === t.id ? (
              <div className="card-b">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  save(t, String(f.get("name")), String(f.get("bodyJson")));
                }}>
                  <div className="field">
                    <label>テンプレート名</label>
                    <input className="form-input" name="name" defaultValue={t.name} required />
                  </div>
                  <div className="field">
                    <label>内容（JSON。quote/menu/rundown/resources/wizard を編集できます）</label>
                    <textarea className="form-input" name="bodyJson" rows={14} defaultValue={t.bodyJson}
                      style={{ fontFamily: "monospace", fontSize: 11.5 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn primary sm">保存</button>
                    <button type="button" className="btn sm" onClick={() => setEditId(null)}>キャンセル</button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="card-b" style={{ fontSize: 12, color: "var(--text3)" }}>
                {packInfo(t.bodyJson)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* その他のテンプレ（旧形式・個別） */}
      {others.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: 13.5, margin: "18px 0 8px" }}>🗂 個別テンプレ（旧形式）<span className="pill gray" style={{ marginLeft: 8 }}>{others.length}件</span></div>
          {canEdit && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 8px", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={others.every((t) => selected.has(t.id))}
                  onChange={(e) => setSelForAll(others, e.target.checked)} /> 全選択
              </label>
              <button className="btn sm" style={{ color: "var(--red)" }} disabled={busy || others.filter((t) => selected.has(t.id)).length === 0}
                onClick={() => { const ids = others.filter((t) => selected.has(t.id)).map((t) => t.id); delMany(ids, `選択した${ids.length}件のテンプレを削除しますか？`); }}>
                🗑 選択したものを削除（{others.filter((t) => selected.has(t.id)).length}）
              </button>
              <button className="btn sm" style={{ color: "var(--red)" }} disabled={busy}
                onClick={() => delMany(others.map((t) => t.id), `個別テンプレを${others.length}件すべて削除しますか？この操作は元に戻せません。`)}>
                すべて削除
              </button>
            </div>
          )}
          <div className="grid" style={{ gap: 12 }}>
            {others.map((t) => (
              <div className="card" key={t.id}>
                <div className="card-h">
                  {canEdit && (
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)}
                      title="選択（まとめて削除）" style={{ marginRight: 2, cursor: "pointer" }} />
                  )}
                  <span className="pill gray">{TYPE_LABEL[t.type] ?? t.type}</span>
                  {t.name}
                  <span className={`pill ${t.isSystem ? "gray" : "blue"}`}>{t.isSystem ? "標準" : "式場独自"}</span>
                  <div style={{ flex: 1 }} />
                  {canEdit && editId !== t.id && (
                    <>
                      <button className="btn sm" onClick={() => setEditId(t.id)}>編集</button>
                      <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => del(t)}>削除</button>
                    </>
                  )}
                </div>
                {editId === t.id && (
                  <div className="card-b">
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      save(t, String(f.get("name")), String(f.get("bodyJson")));
                    }}>
                      <div className="field">
                        <label>テンプレート名</label>
                        <input className="form-input" name="name" defaultValue={t.name} required />
                      </div>
                      <div className="field">
                        <label>内容（JSON）</label>
                        <textarea className="form-input" name="bodyJson" rows={8} defaultValue={t.bodyJson}
                          style={{ fontFamily: "monospace", fontSize: 11.5 }} />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn primary sm">保存</button>
                        <button type="button" className="btn sm" onClick={() => setEditId(null)}>キャンセル</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
