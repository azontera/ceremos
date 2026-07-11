"use client";
// 🧭 お客様向け「新規プランづくりウィザード」
// 4つの質問（スタイル・人数・予算・時間帯）に答えると、ふさわしいテンプレ一式を提案。
// 自分で一覧から選ぶこともできる。選ぶと見積（下書き）・進行表・料理などが自動で用意され、
// 内容の確定・調整は担当プランナーが行う（作成後の編集はテンプレと同期しない）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isBridal } from "@/lib/terms";

type Pack = {
  id: string; name: string; category: string; description: string;
  summary: { quoteCount: number; quoteTotal: number; menuCount: number; rundownCount: number; staffCount: number; equipmentCount: number };
  score: number; reasons: string[];
};

const STYLES: [string, string, string][] = [
  ["chapel", "⛪", "チャペル挙式"], ["garden", "🌿", "ガーデン"], ["night", "🌙", "ナイト"],
  ["wakon", "🎎", "和婚・神前式"], ["small", "👨‍👩‍👧", "少人数・会食"], ["casual", "🎈", "カジュアル"],
  ["formal", "🎩", "フォーマル"], ["party", "🥂", "パーティ"],
];
// 宴会・式典・イベント案件用のスタイル選択肢（初期テンプレ15本のbanquetパックのwizard.stylesに対応）
const BANQUET_STYLES: [string, string, string][] = [
  ["ceremony", "🎗️", "式典・セレモニー"], ["formal", "🎩", "フォーマル"], ["casual", "🎈", "カジュアル"],
  ["party", "🥂", "パーティ"], ["dinnershow", "🎤", "ディナーショー"], ["night", "🌙", "ナイト"],
];
const GUESTS: [string, string][] = [["20", "〜30名"], ["50", "30〜60名"], ["70", "60〜80名"], ["100", "80名以上"]];
const BUDGETS: [string, string][] = [["150", "〜200万円"], ["300", "200〜350万円"], ["400", "350〜450万円"], ["500", "450万円以上"]];
const SLOTS: [string, string, string][] = [["day", "☀️", "昼"], ["evening", "🌆", "夕方"], ["night", "🌙", "夜"]];

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function CustomerWizard({ caseId, caseType }: { caseId: string; caseType?: string }) {
  const router = useRouter();
  const bridal = isBridal(caseType);
  const stylesList = bridal ? STYLES : BANQUET_STYLES;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [style, setStyle] = useState("");
  const [guests, setGuests] = useState("");
  const [budget, setBudget] = useState("");
  const [slot, setSlot] = useState("");
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [doneMsg, setDoneMsg] = useState("");

  async function loadPacks() {
    setBusy(true); setErr("");
    const qs = new URLSearchParams();
    if (style) qs.set("style", style);
    if (guests) qs.set("guests", guests);
    if (budget) qs.set("budgetMan", budget);
    if (slot) qs.set("timeSlot", slot);
    const res = await fetch(`/api/v1/template-packs?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "プランを読み込めませんでした"); return; }
    // 案件タイプに合わないプラン（ブライダル案件に宴会パック等）は候補から外す
    const all: Pack[] = data.packs ?? [];
    setPacks(all.filter((p) => !p.category || p.category === "other" || p.category === (bridal ? "bridal" : "banquet")));
    setStep(4);
  }

  async function choose(p: Pack) {
    if (!confirm(`「${p.name}」でプランの下書きをつくります。\nお見積り・当日の流れ・お料理の案が用意され、内容は担当プランナーと一緒に調整できます。よろしいですか？`)) return;
    setBusy(true); setErr("");
    const res = await fetch(`/api/v1/cases/${caseId}/apply-pack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: p.id }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "作成に失敗しました"); return; }
    setDoneMsg(`🎉 「${data.name}」でプランの下書きができました！担当プランナーが内容を確認し、次のお打ち合わせでご相談します。`);
    router.refresh();
  }

  if (doneMsg) {
    return (
      <div className="card" style={{ padding: "16px 20px", marginTop: 14, border: "1.5px solid var(--accent)" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{doneMsg}</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>
          「概要」からお見積りや当日の流れをご覧いただけます。ご希望があればチャットでお気軽にどうぞ。
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="card" style={{ padding: "16px 20px", marginTop: 14, border: "1.5px solid var(--accent)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 26 }}>🧭</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <b style={{ fontSize: 14 }}>{bridal ? "おふたりのプランをつくりましょう" : "会のプランをつくりましょう"}</b>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
            4つの質問に答えるだけで、ぴったりのプラン案（お見積り・当日の流れ・お料理）をご用意します。約1分。
          </div>
        </div>
        <button className="btn primary" onClick={() => { setOpen(true); setStep(0); }}>✨ はじめる</button>
      </div>
    );
  }

  const StepPills = ({ items, value, onSelect }: { items: [string, string, string][] | [string, string][]; value: string; onSelect: (v: string) => void }) => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map((it) => {
        const [v, a, b] = it.length === 3 ? it : [it[0], "", it[1]];
        return (
          <button key={v} type="button" onClick={() => onSelect(v)}
            className="card" style={{
              padding: "12px 18px", cursor: "pointer", textAlign: "center",
              border: value === v ? "2px solid var(--accent)" : "1px solid var(--border)", fontWeight: 700, fontSize: 13,
            }}>
            {a && <span style={{ marginRight: 6 }}>{a}</span>}{b}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="card" style={{ padding: "18px 22px", marginTop: 14, border: "1.5px solid var(--accent)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>🧭 プランづくりウィザード</b>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`pill ${i === step ? "accent" : i < step ? "green" : "gray"}`} style={{ fontSize: 10.5 }}>
            {["スタイル", "人数", "予算", "時間帯", "プラン選択"][i]}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setOpen(false)}>閉じる</button>
      </div>
      {err && <div className="form-err" style={{ marginBottom: 10 }}>{err}</div>}

      {step === 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Q1. どんなスタイルにしたいですか？</div>
          <StepPills items={stylesList} value={style} onSelect={(v) => { setStyle(v); setStep(1); }} />
        </>
      )}
      {step === 1 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Q2. ゲストは何名くらいの予定ですか？</div>
          <StepPills items={GUESTS} value={guests} onSelect={(v) => { setGuests(v); setStep(2); }} />
        </>
      )}
      {step === 2 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Q3. ご予算のイメージは？</div>
          <StepPills items={BUDGETS} value={budget} onSelect={(v) => { setBudget(v); setStep(3); }} />
        </>
      )}
      {step === 3 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Q4. 時間帯のご希望は？</div>
          <StepPills items={SLOTS} value={slot} onSelect={(v) => { setSlot(v); loadPacks(); }} />
          {busy && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>プランを探しています…</div>}
        </>
      )}
      {step === 4 && packs && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            {bridal ? "おふたりにおすすめのプラン" : "おすすめのプラン"}{showAll ? "（すべて表示中）" : "（上位3つ）"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 10 }}>
            選ぶと「下書き」ができます。金額・内容はあとから担当プランナーと一緒に自由に調整できます。
          </div>
          {packs.length === 0 && (
            <div className="empty">選べるプランがまだ登録されていません。担当プランナーへご相談ください。</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
            {(showAll ? packs : packs.slice(0, 3)).map((p, i) => (
              <button key={p.id} type="button" className="card" disabled={busy}
                style={{ padding: 14, textAlign: "left", cursor: "pointer", border: i === 0 && !showAll ? "2px solid var(--accent)" : "1px solid var(--border)" }}
                onClick={() => choose(p)}>
                <b style={{ fontSize: 13 }}>{i === 0 && !showAll ? "🎯 " : ""}{p.name}</b>
                {p.description && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{p.description}</div>}
                <div style={{ fontSize: 11, marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.summary.quoteTotal > 0 && <span className="pill gray" style={{ fontSize: 10 }}>目安 {yen(p.summary.quoteTotal)}</span>}
                  {p.summary.rundownCount > 0 && <span className="pill gray" style={{ fontSize: 10 }}>当日の流れ付き</span>}
                  {p.summary.menuCount > 0 && <span className="pill gray" style={{ fontSize: 10 }}>お料理案付き</span>}
                </div>
                {p.reasons.length > 0 && (
                  <div style={{ fontSize: 10.5, color: "var(--accent-text)", marginTop: 5 }}>
                    {p.reasons.slice(0, 2).map((r, k) => <div key={k}>・{r}</div>)}
                  </div>
                )}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {!showAll && packs.length > 3 && (
              <button className="btn sm" onClick={() => setShowAll(true)}>🗂 すべてのプランから自分で選ぶ（{packs.length}件）</button>
            )}
            <button className="btn sm" onClick={() => { setStep(0); setPacks(null); setShowAll(false); }}>← 質問をやり直す</button>
            <button className="btn sm" onClick={() => setOpen(false)}>あとで（プランナーに相談して決める）</button>
          </div>
        </>
      )}
    </div>
  );
}
