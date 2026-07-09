// カタログ一括インポート（AI生成JSON「kind: ceremos-catalog」の取り込み）
// テンプレ読み込み（管理→テンプレート）と同じ貼り付け欄で、テンプレ一式と一緒に読み込める。
// ・vendors: 業者を名前で自動作成（既存名は再利用）。出店は1カテゴリ最大3店舗
// ・items: 品目のupsert（同じ業者×品目名は上書き＝最後の反映が正しい）
// ・imageSvg: AIが生成したSVG写真を保存（<script>等は拒否）。無ければ上品なサンプル画像を自動生成
import { randomUUID } from "crypto";
import { prisma } from "./db";
import { saveFile, deleteFile } from "./storage";

const VENDOR_CATEGORIES = ["dress", "florist", "catering", "audio", "mc", "photo", "video", "gift", "print", "beauty"];
const MAX_VENDORS_PER_CATEGORY = 3;
const MAX_SVG_BYTES = 60000;

type ImportItem = {
  vendor?: string | null;      // 業者名（省略 or null = 式場品目）
  category?: string;
  name?: string;
  desc?: string;
  price?: number;
  sortOrder?: number;
  imageSvg?: string;           // 写真（SVGコード）。省略時は自動生成
  emoji?: string;              // 自動生成画像の絵文字
  color1?: string; color2?: string; // 自動生成画像のグラデ色
};
export type CatalogImportResult = { itemCount: number; vendorCount: number; errors: string[] };

function autoSvg(emoji: string, title: string, c1: string, c2: string): string {
  const esc = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <circle cx="400" cy="252" r="150" fill="rgba(255,255,255,.35)"/>
  <text x="400" y="310" font-size="170" text-anchor="middle">${emoji}</text>
  <rect x="60" y="452" width="680" height="92" rx="14" fill="rgba(255,255,255,.88)"/>
  <text x="400" y="512" font-size="36" text-anchor="middle" font-weight="bold" font-family="'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif" fill="#4a3f36">${esc}</text>
</svg>`;
}

// カテゴリ既定の絵文字＆上品なグラデ色（AIがemoji/colorを省略しても品目に合った写真を自動生成）
const CATEGORY_ART: Record<string, { emoji: string; c1: string; c2: string }> = {
  venue:    { emoji: "🏛", c1: "#e8d9c4", c2: "#b9976d" },
  ceremony: { emoji: "⛪", c1: "#efe7f2", c2: "#b79bc4" },
  catering: { emoji: "🍽", c1: "#f4e7d6", c2: "#c99b63" },
  dress:    { emoji: "👗", c1: "#fbeef2", c2: "#d99bb2" },
  beauty:   { emoji: "💄", c1: "#fce9ee", c2: "#d38aa4" },
  florist:  { emoji: "💐", c1: "#eef6e8", c2: "#8fbf7a" },
  photo:    { emoji: "📷", c1: "#e7edf3", c2: "#7f9bb8" },
  video:    { emoji: "🎬", c1: "#e6e9f2", c2: "#7b83b8" },
  mc:       { emoji: "🎤", c1: "#efe9f5", c2: "#9d86c0" },
  audio:    { emoji: "🎵", c1: "#e6eff2", c2: "#6fa3b0" },
  print:    { emoji: "💌", c1: "#f5efe4", c2: "#c2a878" },
  gift:     { emoji: "🎁", c1: "#f6ece6", c2: "#cc9377" },
  drink:    { emoji: "🥂", c1: "#f3ecd8", c2: "#c9b25f" },
  cake:     { emoji: "🎂", c1: "#fceef0", c2: "#dc9aa8" },
  ring:     { emoji: "💍", c1: "#f1eee6", c2: "#c9b48a" },
  service:  { emoji: "🤵", c1: "#eceff2", c2: "#8f9bab" },
  other:    { emoji: "🛍", c1: "#efe6da", c2: "#b9976d" },
};

// 品名から中身をより正確に推定（カテゴリ既定より優先）。日本語・英語キーワード対応
const NAME_HINTS: { re: RegExp; art: { emoji: string; c1: string; c2: string } }[] = [
  { re: /ケーキ|cake|ウェディングケーキ/i, art: CATEGORY_ART.cake },
  { re: /指輪|リング|ring|マリッジ|エンゲージ/i, art: CATEGORY_ART.ring },
  { re: /ドリンク|drink|飲み放題|フリードリンク|乾杯|シャンパン|ワイン|beverage/i, art: CATEGORY_ART.drink },
  { re: /ブーケ|花束|装花|フラワー|flower|bouquet|生花/i, art: CATEGORY_ART.florist },
  { re: /引出物|引き出物|引菓子|gift|プチギフト|お土産/i, art: CATEGORY_ART.gift },
  { re: /ドレス|dress|タキシード|tuxedo|白無垢|色打掛|和装|衣装|衣裳/i, art: CATEGORY_ART.dress },
  { re: /ヘアメイク|メイク|エステ|ネイル|beauty|着付/i, art: CATEGORY_ART.beauty },
  { re: /写真|フォト|photo|アルバム|前撮り/i, art: CATEGORY_ART.photo },
  { re: /映像|ビデオ|video|ムービー|movie|エンドロール/i, art: CATEGORY_ART.video },
  { re: /司会|mc|進行/i, art: CATEGORY_ART.mc },
  { re: /音響|audio|bgm|演出|照明|ライト/i, art: CATEGORY_ART.audio },
  { re: /招待状|席次|ペーパー|print|席札|メニュー表/i, art: CATEGORY_ART.print },
  { re: /挙式|チャペル|神前|人前式|式典|ceremony/i, art: CATEGORY_ART.ceremony },
  { re: /会場|披露宴|バンケット|ホール|room|venue|会場費|貸切/i, art: CATEGORY_ART.venue },
  { re: /コース|料理|ビュッフェ|フルコース|会席|catering|menu|前菜|メイン/i, art: CATEGORY_ART.catering },
];

// 品目に合った写真の見た目を決める（優先: 品名キーワード > カテゴリ > その他）
function pickArt(category: string, name: string): { emoji: string; c1: string; c2: string } {
  for (const h of NAME_HINTS) if (h.re.test(name)) return h.art;
  return CATEGORY_ART[category] ?? CATEGORY_ART.other;
}

// SVGの安全チェック（<img>経由の表示が前提だが、直リンクでも危険がないように）
function validSvg(svg: string): boolean {
  const s = svg.trim();
  if (!s.startsWith("<svg") || Buffer.byteLength(s, "utf8") > MAX_SVG_BYTES) return false;
  if (/<script|javascript:|\son\w+\s*=|<foreignObject/i.test(s)) return false;
  if (/(?:xlink:href|href)\s*=\s*["'](?!#)/i.test(s)) return false; // 外部参照は不可（#内部参照はOK）
  return true;
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;

export async function importCatalog(obj: unknown): Promise<CatalogImportResult> {
  const errors: string[] = [];
  const o = (obj ?? {}) as { vendors?: unknown; items?: unknown };
  const vendorsIn = Array.isArray(o.vendors) ? o.vendors as { name?: string; category?: string }[] : [];
  const itemsIn = Array.isArray(o.items) ? o.items as ImportItem[] : [];
  if (itemsIn.length === 0) return { itemCount: 0, vendorCount: 0, errors: ["catalog: items がありません"] };

  // ===== 業者の解決（宣言分＋品目で使われている名前） =====
  const vendorNames = new Set<string>();
  for (const v of vendorsIn) if (v?.name?.trim()) vendorNames.add(v.name.trim());
  for (const i of itemsIn) if (typeof i?.vendor === "string" && i.vendor.trim()) vendorNames.add(i.vendor.trim());

  const vendorIdByName = new Map<string, string>();
  let newVendors = 0;
  for (const name of vendorNames) {
    const declared = vendorsIn.find((v) => v?.name?.trim() === name);
    const itemOfVendor = itemsIn.find((i) => i?.vendor?.trim() === name);
    const catRaw = declared?.category ?? itemOfVendor?.category ?? "gift";
    const category = VENDOR_CATEGORIES.includes(String(catRaw)) ? String(catRaw) : "gift";
    const existing = await prisma.vendor.findFirst({ where: { name } });
    if (existing) { vendorIdByName.set(name, existing.id); continue; }
    const created = await prisma.vendor.create({ data: { name, category } });
    vendorIdByName.set(name, created.id);
    newVendors++;
  }

  // ===== 品目のupsert =====
  let count = 0;
  for (let i = 0; i < itemsIn.length; i++) {
    const it = itemsIn[i] ?? {};
    const name = String(it.name ?? "").trim();
    if (!name) { errors.push(`catalog items ${i + 1}件目：nameがありません`); continue; }
    const category = String(it.category ?? "other").trim() || "other";
    const price = Math.max(0, Math.round(Number(it.price ?? 0) || 0));
    const vendorId = it.vendor?.trim() ? vendorIdByName.get(it.vendor.trim()) ?? null : null;

    // 出店制限（1カテゴリ3店舗）：新規参入のみチェック
    if (vendorId) {
      const rows = await prisma.catalogItem.findMany({
        where: { category, isActive: true, vendorId: { not: null } },
        select: { vendorId: true }, distinct: ["vendorId"],
      });
      const ids = new Set(rows.map((r) => r.vendorId));
      if (!ids.has(vendorId) && ids.size >= MAX_VENDORS_PER_CATEGORY) {
        errors.push(`「${name}」：カテゴリ${category}の出店は${MAX_VENDORS_PER_CATEGORY}店舗までのためスキップ`);
        continue;
      }
    }

    const existing = await prisma.catalogItem.findFirst({ where: { name, vendorId } });
    const item = existing
      ? await prisma.catalogItem.update({
          where: { id: existing.id },
          data: { category, price, desc: it.desc ? String(it.desc) : null, isActive: true, sortOrder: Number(it.sortOrder ?? existing.sortOrder) || 0 },
        })
      : await prisma.catalogItem.create({
          data: { name, category, price, desc: it.desc ? String(it.desc) : null, vendorId, sortOrder: Number(it.sortOrder ?? 0) || 0 },
        });
    count++;

    // ===== 写真：imageSvg があれば差し替え。無ければ（未設定のときだけ）自動生成 =====
    const hasImage = (await prisma.attachment.count({ where: { parentType: "catalog", parentId: item.id } })) > 0;
    let svg: string | null = null;
    if (typeof it.imageSvg === "string" && it.imageSvg.trim()) {
      if (validSvg(it.imageSvg)) svg = it.imageSvg.trim();
      else errors.push(`「${name}」：imageSvgが不正のため自動生成画像を使用`);
    }
    if (!svg && !hasImage) {
      // AIが emoji/color を省略しても、カテゴリ・品名から品目に合った写真を必ず自動生成
      const art = pickArt(category, name);
      const emoji = String(it.emoji ?? "").trim() || art.emoji;
      const c1 = HEX.test(String(it.color1 ?? "")) ? String(it.color1) : art.c1;
      const c2 = HEX.test(String(it.color2 ?? "")) ? String(it.color2) : art.c2;
      svg = autoSvg(emoji.slice(0, 8), name, c1, c2);
    }
    if (svg) {
      const olds = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: item.id } });
      for (const oAtt of olds) {
        await prisma.attachment.delete({ where: { id: oAtt.id } });
        await deleteFile(oAtt.fileKey);
      }
      const key = `${randomUUID()}.svg`;
      await saveFile(key, Buffer.from(svg, "utf8"));
      await prisma.attachment.create({
        data: { parentType: "catalog", parentId: item.id, fileKey: key, fileName: `${name}.svg`, mime: "image/svg+xml" },
      });
    }
  }
  return { itemCount: count, vendorCount: newVendors, errors };
}
