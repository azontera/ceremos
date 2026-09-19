import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMasterOptions } from "@/lib/masters";
import { VendorCatalog } from "@/components/vendor-catalog";
import { CatalogDeleteAllButton } from "@/components/catalog-delete-all";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  dress: "ドレス・衣装", florist: "装花", catering: "料理", audio: "音響", mc: "司会",
  photo: "写真", video: "映像", gift: "引出物", print: "印刷", beauty: "美容",
};

// 🛍 カタログ管理 — プランナー・支配人・管理者が式場品目＋全業者の品目を登録・編集できる
export default async function AdminCatalogPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!["admin", "manager", "planner"].includes(s.role)) redirect("/dashboard");

  const [vendors, items, quoteCategories] = await Promise.all([
    prisma.vendor.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.catalogItem.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    getMasterOptions("quote_category"),
  ]);
  const images = await prisma.attachment.findMany({
    where: { parentType: "catalog", parentId: { in: items.map((i) => i.id) } },
  });
  const toProps = (list: typeof items) => list.map((i) => ({
    id: i.id, category: i.category, name: i.name, desc: i.desc, price: i.price,
    isActive: i.isActive, imageId: images.find((a) => a.parentId === i.id)?.id ?? null,
  }));

  return (
    <>
      <div className="section-h" style={{ alignItems: "center", gap: 8 }}>
        <h2>🛍 カタログ管理</h2>
        <span className="pill gray">全{items.length}品目</span>
        <div style={{ flex: 1 }} />
        <CatalogDeleteAllButton count={items.length} />
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 6 }}>
        ここに登録した品目は、お客様・プランナーの案件「🛍 カタログ」タブに表示され、選ぶだけで見積（定価）に反映されます。
        出店は1カテゴリ最大3店舗です。
      </p>

      {/* 式場（自社）品目：会場費・自社料理・その他 */}
      <VendorCatalog
        vendorId={null}
        title="🏛 式場カタログ（会場費・自社料理・その他の自社品目）"
        categories={quoteCategories}
        items={toProps(items.filter((i) => i.vendorId === null))}
      />

      {/* 業者ごとのカタログ */}
      {vendors.map((v) => (
        <VendorCatalog
          key={v.id}
          vendorId={v.id}
          title={`🏪 ${v.name}（${CATEGORY_LABEL[v.category] ?? v.category}）`}
          categories={quoteCategories}
          items={toProps(items.filter((i) => i.vendorId === v.id))}
        />
      ))}
      {vendors.length === 0 && (
        <div className="card" style={{ marginTop: 14 }}><div className="empty">業者が未登録です（管理→ユーザー・権限の業者マスタで追加できます）</div></div>
      )}
    </>
  );
}
