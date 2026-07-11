"use client";
// 🖼 フル画面カタログ（/catalog）— ウィザード形式
// ジャンルごとに1ページずつ進み、選択ルールを守って選ぶと最後に見積もりが完成する。
//  ・1択（挙式・披露宴会場・料理コース・ドリンク）＝選ぶと他が外れる
//  ・上限あり（衣装は3着まで）
//  ・何個でも（オプション類・数量つき）
// URL共有で誰でも閲覧（ログイン不要）。選択は端末に保存。coupleログイン中は案件見積へ保存（同期）。
import { useCallback, useEffect, useMemo, useState } from "react";

type Item = {
  id: string; category: string; name: string; desc: string | null; price: number;
  vendorName: string | null; imageId: string | null;
};
type Viewer = { role: string; name: string; caseId: string | null; cases: { id: string; label: string }[] } | null;

type Rule = { kind: "one" } | { kind: "max"; n: number } | { kind: "any" };
type Group = { key: string; title: string; note: string; rule: Rule; match: (i: Item) => boolean };
type Step = { key: string; title: string; en: string; desc: string; groups: Group[] };

// ===== ステップ定義（品目はカテゴリ＋品名キーワードで自動振り分け） =====
const isVenueMain = (i: Item) => /利用料|貸切/.test(i.name);
const isCourse = (i: Item) => /コース|ビュッフェ|会席|懐石/.test(i.name);
const isDrink = (i: Item) => /ドリンク|飲み放題|乾杯酒?|シャンパン(?!.*ケーキ)/.test(i.name);
const isFamilyAttire = (i: Item) => /留袖|父親|母親|親御|子ども|キッズ|ベビー|お子様|ペット/.test(i.name);
const isBrideAttire = (i: Item) => /ドレス|ガウン|白無垢|色打掛|打掛|振袖/.test(i.name) && !isFamilyAttire(i);
const isGroomAttire = (i: Item) => /タキシード|紋付|袴|モーニング|フロックコート|スーツ/.test(i.name) && !isFamilyAttire(i);
const isParentAttire = (i: Item) => /留袖|黒留袖|色留袖|父親|母親|親御/.test(i.name);
const isChildAttire = (i: Item) => /子ども|キッズ|ベビー|お子様/.test(i.name) && !/ペット/.test(i.name);
const isPetAttire = (i: Item) => /ペット/.test(i.name);

const STEPS: Step[] = [
  {
    key: "ceremony", title: "挙式スタイル", en: "CEREMONY", desc: "チャペル・ガーデン・神前。おふたりの誓いの場所をひとつ選んでください。",
    groups: [{ key: "ceremony", title: "挙式", note: "1つ選択", rule: { kind: "one" }, match: (i) => i.category === "ceremony" }],
  },
  {
    key: "venue", title: "披露宴会場", en: "BANQUET", desc: "おもてなしの舞台。会場をひとつ選び、必要なオプションを加えてください。",
    groups: [
      { key: "venueMain", title: "会場", note: "1つ選択", rule: { kind: "one" }, match: (i) => i.category === "venue" && isVenueMain(i) },
      { key: "venueOpt", title: "会場オプション（控室・装飾・設営）", note: "いくつでも", rule: { kind: "any" }, match: (i) => i.category === "venue" && !isVenueMain(i) },
    ],
  },
  {
    key: "cuisine", title: "お料理とお飲み物", en: "CUISINE & DRINK", desc: "お料理コースとお飲み物をひとつずつ。ケーキなどのオプションもこちらから。",
    groups: [
      { key: "course", title: "お料理コース", note: "1つ選択", rule: { kind: "one" }, match: (i) => i.category === "catering" && isCourse(i) },
      { key: "drink", title: "お飲み物", note: "1つ選択", rule: { kind: "one" }, match: (i) => i.category === "catering" && isDrink(i) && !isCourse(i) },
      { key: "cuisineOpt", title: "ケーキ・デザート・オプション", note: "いくつでも", rule: { kind: "any" }, match: (i) => i.category === "catering" && !isCourse(i) && !isDrink(i) },
    ],
  },
  {
    key: "dress", title: "衣装", en: "DRESS & ATTIRE", desc: "新婦・新郎はお色直しを含めて各4着まで。ご家族やペットの衣装もこちらから。",
    groups: [
      { key: "brideAttire", title: "👰 新婦の衣装", note: "4着まで", rule: { kind: "max", n: 4 }, match: (i) => i.category === "dress" && isBrideAttire(i) },
      { key: "groomAttire", title: "🤵 新郎の衣装", note: "4着まで", rule: { kind: "max", n: 4 }, match: (i) => i.category === "dress" && isGroomAttire(i) },
      { key: "parentAttire", title: "👘 ご両親の衣装", note: "いくつでも", rule: { kind: "any" }, match: (i) => i.category === "dress" && isParentAttire(i) },
      { key: "childAttire", title: "🧒 お子様の衣装", note: "いくつでも", rule: { kind: "any" }, match: (i) => i.category === "dress" && isChildAttire(i) },
      { key: "petAttire", title: "🐶 ペットの衣装", note: "いくつでも", rule: { kind: "any" }, match: (i) => i.category === "dress" && isPetAttire(i) },
      { key: "attireOpt", title: "💍 小物・美容", note: "いくつでも", rule: { kind: "any" }, match: (i) => (i.category === "dress" && !isBrideAttire(i) && !isGroomAttire(i) && !isFamilyAttire(i)) || i.category === "beauty" },
    ],
  },
  {
    key: "flower", title: "装花", en: "FLOWERS", desc: "ブーケ・高砂・テーブル装花。会場を彩る花々を選んでください。",
    groups: [{ key: "flower", title: "装花", note: "いくつでも", rule: { kind: "any" }, match: (i) => i.category === "florist" }],
  },
  {
    key: "gift", title: "贈りもの", en: "GIFT", desc: "引出物・引菓子・プチギフト。数量はゲスト数に合わせて調整できます。",
    groups: [{ key: "gift", title: "引出物・ギフト", note: "いくつでも", rule: { kind: "any" }, match: (i) => i.category === "gift" }],
  },
  {
    key: "paper", title: "ペーパーアイテム", en: "STATIONERY", desc: "招待状・席次表・席札。最初に届くおもてなしです。",
    groups: [{ key: "paper", title: "ペーパーアイテム", note: "いくつでも", rule: { kind: "any" }, match: (i) => i.category === "print" }],
  },
  {
    key: "stage", title: "演出", en: "SOUND / VISUAL / LIGHT", desc: "音響・映像・照明・司会・写真・記録。忘れられない瞬間のために。",
    groups: [{ key: "stage", title: "演出・記録", note: "いくつでも", rule: { kind: "any" }, match: (i) => ["audio", "video", "photo", "mc"].includes(i.category) }],
  },
  {
    key: "transport", title: "送迎", en: "BUS & TAXI", desc: "送迎バス・タクシー・ハイヤー。ゲストの足まで心配りを。",
    groups: [{ key: "transport", title: "送迎", note: "いくつでも", rule: { kind: "any" }, match: (i) => i.category === "transport" }],
  },
  {
    key: "other", title: "その他オプション", en: "OTHERS", desc: "そのほかのオプションです。",
    groups: [{ key: "other", title: "オプション", note: "いくつでも", rule: { kind: "any" }, match: (i) => true }], // 残り物すべて
  },
];
const CART_KEY = "ceremos-catalog-cart";
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function CatalogShowcase() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [venueName, setVenueName] = useState("CEREMOS");
  const [viewer, setViewer] = useState<Viewer>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState(-1); // -1=表紙 / 0..n-1=各ステップ / n=見積もり
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [limitMsg, setLimitMsg] = useState("");
  const [zoom, setZoom] = useState<{ src: string; title: string } | null>(null);
  const [pickedCaseId, setPickedCaseId] = useState("");

  // ===== データ取得＋選択の復元 =====
  useEffect(() => {
    fetch("/api/v1/catalog/public")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setVenueName(d.venueName || "CEREMOS");
        setViewer(d.viewer ?? null);
      })
      .catch(() => setItems([]));
    try { const raw = localStorage.getItem(CART_KEY); if (raw) setCart(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart]);
  useEffect(() => { window.scrollTo({ top: 0 }); setLimitMsg(""); }, [step]);

  // ===== ステップへ品目を振り分け（先勝ち。「その他」は残り全部） =====
  const { steps, groupItems } = useMemo(() => {
    const claimed = new Set<string>();
    const map = new Map<string, Item[]>();
    for (const st of STEPS) for (const g of st.groups) {
      const list = (items ?? []).filter((i) => !claimed.has(i.id) && g.match(i));
      list.forEach((i) => claimed.add(i.id));
      map.set(`${st.key}/${g.key}`, list);
    }
    const active = STEPS.filter((st) => st.groups.some((g) => (map.get(`${st.key}/${g.key}`) ?? []).length > 0));
    return { steps: active, groupItems: map };
  }, [items]);

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const cartList = useMemo(
    () => Object.entries(cart).map(([id, qty]) => ({ item: byId.get(id), qty })).filter((x): x is { item: Item; qty: number } => !!x.item && x.qty > 0),
    [cart, byId],
  );
  const cartCount = cartList.reduce((s, x) => s + x.qty, 0);
  const cartTotal = cartList.reduce((s, x) => s + x.qty * x.item.price, 0);

  // ===== 選択操作（ルールを強制） =====
  const selectOne = useCallback((group: Item[], id: string) => {
    setCart((c) => {
      const n = { ...c };
      const already = !!n[id];
      group.forEach((i) => delete n[i.id]); // 同グループの他選択を外す
      if (!already) n[id] = 1;              // もう一度タップで解除
      return n;
    });
    setSaved(false);
  }, []);
  const toggleMax = useCallback((group: Item[], id: string, max: number, groupName: string) => {
    setCart((c) => {
      const n = { ...c };
      if (n[id]) { delete n[id]; return n; }
      const count = group.filter((i) => n[i.id]).length;
      if (count >= max) { setLimitMsg(`${groupName}は${max}着までです。外してから選び直してください`); setTimeout(() => setLimitMsg(""), 2600); return c; }
      n[id] = 1;
      return n;
    });
    setSaved(false);
  }, []);
  const addQty = useCallback((id: string, d: number) => {
    setCart((c) => {
      const q = (c[id] ?? 0) + d;
      const n = { ...c };
      if (q <= 0) delete n[id]; else n[id] = Math.min(999, q);
      return n;
    });
    setSaved(false);
  }, []);

  // ===== 見積もりへ保存 =====
  // couple はログイン中の自分の案件へ自動反映。スタッフ（見積編集権限あり）は案件を選んで反映する
  const saveCaseId = viewer?.caseId || pickedCaseId || "";
  async function saveToQuote() {
    if (!saveCaseId || cartList.length === 0) return;
    setSaving(true); setSaveErr("");
    const res = await fetch(`/api/v1/cases/${saveCaseId}/quotes/catalog-add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cartList.map((x) => ({ catalogItemId: x.item.id, qty: x.qty })) }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setSaveErr(data.error ?? "保存に失敗しました"); return; }
    setSaved(true); setCart({});
  }

  // 各ステップの選択済み数
  const stepPicked = (st: Step) =>
    st.groups.reduce((s, g) => s + (groupItems.get(`${st.key}/${g.key}`) ?? []).filter((i) => cart[i.id]).length, 0);

  const petals = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    left: (i * 137 + 40) % 100, size: 10 + ((i * 53) % 14), dur: 9 + ((i * 97) % 8), delay: -((i * 71) % 12),
  })), []);

  if (!items) {
    return <div className="cshow"><div className="cs-loading"><div className="ring" /><span>WEDDING COLLECTION</span></div></div>;
  }

  const quoteStep = steps.length; // 最終＝見積もり
  const cur = step >= 0 && step < quoteStep ? steps[step] : null;

  // ===== 表紙 =====
  if (step === -1) {
    return (
      <div className="cshow">
        {viewer && (
          <a className="cs-back cs-back-hero" href={viewer.caseId ? `/cases/${viewer.caseId}` : "/dashboard"}>← アプリに戻る</a>
        )}
        <section className="cs-hero">
          {petals.map((p, i) => (
            <span key={i} className="cs-petal" style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.8, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />
          ))}
          <div className="jp">ふたりの一日を、選ぶたのしさから。</div>
          <h1 className="en">WEDDING<br />COLLECTION</h1>
          <div className="venue">{venueName}</div>
          <p className="lead">挙式、会場、料理、衣装、装花、演出 ——<br />質問に答えるように選んでいくだけで、<br />最後におふたりのお見積もりができあがります。</p>
          <div className="cs-flow">
            {steps.map((s, i) => <span key={s.key}>{String(i + 1).padStart(2, "0")} {s.title}</span>)}
            <span>💐 見積もり</span>
          </div>
          <button className="cta" onClick={() => setStep(0)}>{cartCount > 0 ? "つづきから選ぶ" : "はじめる"}</button>
          {cartCount > 0 && <div style={{ marginTop: 14, fontSize: 12, opacity: .7, letterSpacing: ".1em" }}>前回の選択（{cartCount}点・{yen(cartTotal)}）が残っています</div>}
          <div className="cs-scrolldown">START</div>
        </section>
      </div>
    );
  }

  return (
    <div className="cshow cs-wiz">
      {/* ===== ヘッダー（進行状況） ===== */}
      <header className="cs-top scrolled">
        {viewer && (
          <a className="cs-back" href={viewer.caseId ? `/cases/${viewer.caseId}` : "/dashboard"}>← アプリに戻る</a>
        )}
        <div className="cs-brand" style={{ cursor: "pointer" }} onClick={() => setStep(-1)}>{venueName}</div>
        <nav className="cs-steps">
          {steps.map((s, i) => {
            const picked = stepPicked(s);
            return (
              <button key={s.key} className={`cs-stepdot ${i === step ? "on" : ""} ${picked > 0 ? "done" : ""}`} onClick={() => setStep(i)}>
                <span className="n">{picked > 0 && i !== step ? "✓" : i + 1}</span>
                <span className="t">{s.title}</span>
              </button>
            );
          })}
          <button className={`cs-stepdot final ${step === quoteStep ? "on" : ""}`} onClick={() => setStep(quoteStep)}>
            <span className="n">💐</span><span className="t">見積もり</span>
          </button>
        </nav>
      </header>

      {/* ===== ステップ本体 ===== */}
      {cur && (
        <main className="cs-stepbody" key={cur.key}>
          <div className="cs-shead">
            <span className="no">{String(step + 1).padStart(2, "0")}</span>
            <h2>{cur.title}</h2>
            <span className="en">{cur.en}</span>
          </div>
          <p className="cs-sdesc">{cur.desc}</p>

          {cur.groups.map((g) => {
            const list = groupItems.get(`${cur.key}/${g.key}`) ?? [];
            if (list.length === 0) return null;
            const isOne = g.rule.kind === "one";
            const isMax = g.rule.kind === "max";
            const pickedCount = list.filter((i) => cart[i.id]).length;
            return (
              <div key={g.key} className="cs-group">
                <div className="cs-ghead">
                  <h3>{g.title}</h3>
                  <span className={`cs-rulepill ${isOne ? "one" : isMax ? "max" : "any"}`}>
                    {isOne ? (pickedCount > 0 ? "✓ 選択済み" : "1つ選択") :
                     isMax ? `${g.note}（あと${Math.max(0, (g.rule as { n: number }).n - pickedCount)}着）` : g.note}
                  </span>
                </div>
                <div className="cs-grid">
                  {list.map((i) => {
                    const q = cart[i.id] ?? 0;
                    const sel = q > 0;
                    const clickable = isOne || isMax;
                    return (
                      <div
                        className={`cs-card cs-pick in ${sel ? "sel" : ""} ${clickable ? "clickable" : ""}`}
                        key={i.id}
                        onClick={() => {
                          if (isOne) selectOne(list, i.id);
                          else if (isMax) toggleMax(list, i.id, (g.rule as { n: number }).n, g.title);
                        }}
                      >
                        <div className="ph" onClick={(e) => { if (!clickable) { e.stopPropagation(); } if (i.imageId && !clickable) setZoom({ src: `/api/v1/attachments/${i.imageId}`, title: i.name }); }}>
                          {i.imageId && <img src={`/api/v1/attachments/${i.imageId}`} alt={i.name} loading="lazy" />}
                          {sel && <span className="cs-selmark">✓ 選択中{!isOne && !isMax && q > 1 ? ` × ${q}` : ""}</span>}
                          {clickable && i.imageId && (
                            <button className="cs-zoombtn" title="写真を拡大" onClick={(e) => { e.stopPropagation(); setZoom({ src: `/api/v1/attachments/${i.imageId}`, title: i.name }); }}>🔍</button>
                          )}
                        </div>
                        <div className="bd">
                          <div className="vendor">{i.vendorName ?? venueName}</div>
                          <h3>{i.name}</h3>
                          <div className="desc">{i.desc ?? ""}</div>
                          <div className="row">
                            <span className="price">{yen(i.price)}<small>定価</small></span>
                            {clickable ? (
                              <span className={`cs-radio ${sel ? "on" : ""}`}>{sel ? "✓" : ""}</span>
                            ) : q === 0 ? (
                              <button className="cs-add" title="追加" onClick={(e) => { e.stopPropagation(); addQty(i.id, 1); }}>＋</button>
                            ) : (
                              <span className="cs-qty" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => addQty(i.id, -1)}>−</button>
                                <b>{q}</b>
                                <button onClick={() => addQty(i.id, 1)}>＋</button>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {limitMsg && <div className="cs-limit">{limitMsg}</div>}
        </main>
      )}

      {/* ===== 見積もり（最終ステップ） ===== */}
      {step === quoteStep && (
        <main className="cs-stepbody">
          <div className="cs-qpaper" style={{ margin: "0 auto", boxShadow: "0 16px 50px rgba(80,60,30,.18)" }}>
            {saved ? (
              <div className="cs-done">
                <div className="mark">💐</div>
                <h3>見積もりに保存しました</h3>
                <p>マイページの「お見積り」からいつでも確認できます。<br />値引き・調整はプランナーがご案内いたします。</p>
                <div className="cs-qacts">
                  <a className="cs-primary" style={{ textAlign: "center", textDecoration: "none" }} href={saveCaseId ? `/cases/${saveCaseId}` : "/dashboard"}>{viewer?.caseId ? "マイページで見る" : "案件ページで見る"}</a>
                  <button className="cs-ghost" onClick={() => { setStep(-1); setSaved(false); }}>表紙に戻る</button>
                </div>
              </div>
            ) : cartList.length === 0 ? (
              <div className="cs-done">
                <div className="mark">🕊</div>
                <h3>まだ何も選ばれていません</h3>
                <p>上のステップから、挙式スタイルや会場を選んでみてください。</p>
                <div className="cs-qacts"><button className="cs-primary" onClick={() => setStep(0)}>最初のステップへ</button></div>
              </div>
            ) : (
              <>
                <div className="brand">{venueName}</div>
                <h2>お見積もり</h2>
                <div className="date">ESTIMATE　{new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}</div>
                {steps.map((st, i) => {
                  const rows = st.groups.flatMap((g) => (groupItems.get(`${st.key}/${g.key}`) ?? []).filter((it) => cart[it.id]).map((it) => ({ item: it, qty: cart[it.id] })));
                  if (rows.length === 0) return null;
                  return (
                    <div key={st.key}>
                      <div className="sec">
                        {String(i + 1).padStart(2, "0")}　{st.title}
                        <button className="cs-editlink" onClick={() => setStep(i)}>変更する</button>
                      </div>
                      {rows.map(({ item, qty }) => (
                        <div className="cs-qrow" key={item.id}>
                          <span>{item.name}{item.vendorName ? `（${item.vendorName}）` : ""}</span>
                          <span className="q">× {qty}</span>
                          <span className="a">{yen(item.price * qty)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div className="cs-qtotal"><span>概算合計</span><b>{yen(cartTotal)}</b></div>
                <p className="cs-qnote">※ 掲載の定価による概算です。人数・日程・値引きにより変動します。正式なお見積もりはプランナーが作成いたします。</p>
                {saveErr && <p style={{ color: "#b0554f", fontSize: 12.5 }}>{saveErr}</p>}
                {viewer && !viewer.caseId && viewer.cases.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12, letterSpacing: ".08em", color: "var(--ink2)" }}>反映する案件を選択</label>
                    <select
                      value={pickedCaseId}
                      onChange={(e) => setPickedCaseId(e.target.value)}
                      style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5, background: "#fff" }}
                    >
                      <option value="">選んでください</option>
                      {viewer.cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                )}
                <div className="cs-qacts">
                  {viewer && (viewer.caseId || (viewer.cases.length > 0 && pickedCaseId)) ? (
                    <button className="cs-primary" disabled={saving} onClick={saveToQuote}>
                      {saving ? "保存しています…" : viewer.caseId ? "この内容をマイページの見積もりに保存" : "選択した案件の見積もりに反映"}
                    </button>
                  ) : viewer && viewer.cases.length > 0 ? (
                    <div style={{ flex: 2, minWidth: 220, fontSize: 12.5, color: "var(--ink2)", lineHeight: 2 }}>反映する案件を選んでください</div>
                  ) : viewer ? (
                    <div style={{ flex: 2, minWidth: 220, fontSize: 12.5, color: "var(--ink2)", lineHeight: 2 }}>
                      アクセスできる案件がありません。案件ページの「🛍 カタログ」タブをご利用ください。
                    </div>
                  ) : (
                    <a className="cs-primary" style={{ textAlign: "center", textDecoration: "none" }} href="/login">ログイン／新規登録して保存する</a>
                  )}
                  <button className="cs-ghost" onClick={() => setCart({})}>選び直す（全クリア）</button>
                </div>
                {!viewer && <p className="cs-qnote">選んだ内容はこの端末に保存されています。ログイン後にもう一度この画面から保存してください。</p>}
              </>
            )}
          </div>
        </main>
      )}

      {/* ===== フッター（合計＋前へ／次へ） ===== */}
      <footer className="cs-wizfoot">
        <div className="sum">
          <span className="c">{cartCount}点</span>
          <b>{yen(cartTotal)}</b>
        </div>
        <div className="btns">
          <button className="cs-ghost" onClick={() => setStep(step <= 0 ? -1 : step - 1)}>← 戻る</button>
          {step < quoteStep && (
            <button className="cs-primary" style={{ width: "auto", padding: "14px 34px" }} onClick={() => setStep(step + 1)}>
              {step === quoteStep - 1 ? "見積もりを見る 💐" : cur && stepPicked(cur) > 0 ? "次へ →" : "選ばずに次へ →"}
            </button>
          )}
        </div>
      </footer>

      {/* 保存成功の紙吹雪 */}
      {saved && (
        <div className="cs-confetti">
          {Array.from({ length: 28 }, (_, i) => (
            <i key={i} style={{
              left: `${(i * 61) % 100}%`,
              background: ["#d8b878", "#c4808f", "#f2d7dc", "#b98f4e", "#8aab7c"][i % 5],
              animationDelay: `${(i % 9) * 0.14}s`,
              borderRadius: i % 3 === 0 ? "50%" : "2px",
            }} />
          ))}
        </div>
      )}

      {/* 写真の拡大 */}
      {zoom && (
        <div className="cs-quote" style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }} onClick={() => setZoom(null)}>
          <div style={{ maxWidth: "92vw", maxHeight: "86vh", textAlign: "center" }}>
            <img src={zoom.src} alt={zoom.title} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 10, boxShadow: "0 30px 90px rgba(0,0,0,.6)" }} />
            <div style={{ color: "#f7f0e2", marginTop: 14, fontFamily: "var(--serif)", letterSpacing: ".12em", fontSize: 15 }}>{zoom.title}</div>
          </div>
        </div>
      )}
    </div>
  );
}
