"use client";
// 🛍 カタログ：会場費・ドレス・料理・引き出物・その他を「カタログを見て」見積に追加できる
// ・お客様も利用可（定価でのみ追加。価格はサーバー側で強制）
// ・プランナーの値引きは見積タブの編集（単価変更・値引行）で行う
// ・追加は常に最新見積へ反映（下書き=追記／確認済み・承認済み=新バージョン作成）＝最後の反映が見積カードに必ず載る
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isBridal, BRIDAL_ONLY_CATALOG_CATEGORIES } from "@/lib/terms";

type CatalogItem = {
  id: string; category: string; name: string; desc: string | null; price: number;
  vendorId: string | null; vendorName: string | null; imageId: string | null;
};

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
// 表示順：ご要望の主要5カテゴリを先頭に
const CAT_ORDER = ["venue", "dress", "catering", "gift", "other"];

export function CatalogPanel({
  caseId, isCouple, categories, canAdd = true, caseType,
}: { caseId: string; isCouple: boolean; categories: [string, string][]; canAdd?: boolean; caseType?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [cat, setCat] = useState<string>("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // 📷 写真の拡大表示（ライトボックス）
  const [zoom, setZoom] = useState<{ src: string; title: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/catalog").then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, []);

  const catLabel = (c: string) => categories.find(([v]) => v === c)?.[1] ?? "その他";
  // 宴会・式典モードでは婚礼専用カテゴリ（衣装＝dress）のタブ・品目を出さない（表示のみ。カタログデータは不変）
  const bridal = isBridal(caseType);
  const cats = useMemo(() => {
    const present = [...new Set((items ?? []).map((i) => i.category))]
      .filter((c) => bridal || !BRIDAL_ONLY_CATALOG_CATEGORIES.includes(c));
    return present.sort((a, b) => {
      const ia = CAT_ORDER.indexOf(a); const ib = CAT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [items, bridal]);
  const active = cat || cats[0] || "";
  const list = (items ?? []).filter((i) => i.category === active);
  // 出店店舗（最大3）ごとにまとめる。自社（式場）品目は先頭
  const byVendor = useMemo(() => {
    const map = new Map<string, { vendorName: string; items: CatalogItem[] }>();
    for (const i of list) {
      const k = i.vendorId ?? "";
      const cur = map.get(k) ?? { vendorName: i.vendorName ?? "式場プラン", items: [] };
      cur.items.push(i);
      map.set(k, cur);
    }
    return [...map.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : 0));
  }, [list]);

  async function add(item: CatalogItem) {
    setBusy(item.id); setErr(""); setMsg("");
    const res = await fetch(`/api/v1/cases/${caseId}/quotes/catalog-add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ catalogItemId: item.id, qty: qty[item.id] ?? 1 }] }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg(`✅ 「${item.name}」を見積 Ver.${data.quote?.version ?? ""} に追加しました${data.newVersion ? "（新しいバージョンを作成）" : ""}`);
      router.refresh();
    } else {
      setErr(data.error ?? `追加に失敗しました（HTTP ${res.status}）`);
    }
    setBusy("");
  }

  if (items === null) return <div className="card"><div className="empty">カタログを読み込み中…</div></div>;

  return (
    <>
      <div className="card" style={{ padding: "12px 16px", marginBottom: 14, fontSize: 12.5, lineHeight: 1.9 }}>
        🛍 カタログから選ぶだけで、そのままお見積りに反映されます。
        {isCouple
          ? <>価格は<b>定価</b>での追加となります。値引き・特典はプランナーが承認時に調整いたします。</>
          : <>お客様は定価でのみ追加できます。<b>値引きは見積タブの編集</b>（単価変更・値引行の追加）で行ってください。</>}
        <Link href={`/cases/${caseId}?tab=quotes`} style={{ marginLeft: 6 }}>→ 見積カードを見る</Link>
        <a href="/catalog" target="_blank" style={{ marginLeft: 10 }}>✨ フル画面カタログで選ぶ →</a>
      </div>
      {msg && <div style={{ background: "#e8f3ea", border: "1px solid #3d8a5f", color: "#2c6a48", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{msg}</div>}
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {cats.length === 0 && (
        <div className="card"><div className="empty">カタログはまだ登録されていません{isCouple ? "" : "（業者ページ・管理画面から品目を登録できます）"}</div></div>
      )}
      {cats.length > 0 && (
        <>
          <div className="tabs" style={{ marginBottom: 12 }}>
            {cats.map((c) => (
              <a key={c} className={active === c ? "active" : ""} style={{ cursor: "pointer" }} onClick={() => setCat(c)}>
                {catLabel(c)}
              </a>
            ))}
          </div>
          {byVendor.map(([vId, v]) => (
            <div key={vId || "house"} style={{ marginBottom: 18 }}>
              <div className="section-h" style={{ margin: "0 0 8px" }}>
                <h2 style={{ fontSize: 14 }}>{vId ? `🏪 ${v.vendorName}` : "🏛 式場プラン"}</h2>
                <span className="pill gray">{v.items.length}品目</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
                {v.items.map((i) => (
                  <div key={i.id} className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    {i.imageId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/v1/attachments/${i.imageId}`} alt={i.name}
                        title="タップで拡大"
                        onClick={() => setZoom({ src: `/api/v1/attachments/${i.imageId}`, title: i.name })}
                        style={{ width: "100%", height: 130, objectFit: "cover", background: "var(--surface2)", cursor: "zoom-in" }} />
                    ) : (
                      <div style={{ width: "100%", height: 60, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🛍</div>
                    )}
                    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                      <b style={{ fontSize: 13 }}>{i.name}</b>
                      {i.desc && <div style={{ fontSize: 11.5, color: "var(--text3)", lineHeight: 1.7 }}>{i.desc}</div>}
                      <div style={{ marginTop: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                        <b style={{ fontSize: 14 }}>{yen(i.price)}</b>
                        <span style={{ fontSize: 10.5, color: "var(--text3)" }}>定価</span>
                        <div style={{ flex: 1 }} />
                        {canAdd && (
                          <>
                            <input className="form-input" type="number" min={1} max={999} style={{ width: 56, padding: "4px 6px" }}
                              value={qty[i.id] ?? 1}
                              onChange={(e) => setQty((m) => ({ ...m, [i.id]: Math.max(1, Number(e.target.value) || 1) }))} />
                            <button className="btn sm primary" disabled={busy === i.id} onClick={() => add(i)}>
                              {busy === i.id ? "…" : "＋見積へ"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* 📷 拡大表示（背景タップで閉じる） */}
      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.82)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: 18, cursor: "zoom-out",
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.src} alt={zoom.title}
            style={{ maxWidth: "94vw", maxHeight: "84vh", objectFit: "contain", borderRadius: 10, background: "#fff" }} />
          <div style={{ color: "#fff", marginTop: 10, fontSize: 13, display: "flex", gap: 12, alignItems: "center" }}>
            <b>{zoom.title}</b>
            <button className="btn sm" onClick={() => setZoom(null)}>✕ 閉じる</button>
          </div>
        </div>
      )}
    </>
  );
}
