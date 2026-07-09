import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSetting, SETTING_DEFAULTS } from "@/lib/settings";
import { getMasterOptions } from "@/lib/masters";
import { SettingsAdmin } from "@/components/settings-admin";
import { VendorCatalog } from "@/components/vendor-catalog";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "admin") redirect("/dashboard");

  const entries = await Promise.all(
    Object.keys(SETTING_DEFAULTS).map(async (key) => [key, await getSetting(key)] as const),
  );
  const venues = await prisma.venue.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
  // 式場（自社）カタログ：会場費・自社料理などを登録するとお客様のカタログタブに「式場プラン」として表示
  const [houseItems, quoteCategories] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { vendorId: null },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    getMasterOptions("quote_category"),
  ]);
  const houseImages = await prisma.attachment.findMany({
    where: { parentType: "catalog", parentId: { in: houseItems.map((i) => i.id) } },
  });

  return (
    <>
      <div className="section-h"><h2>設定</h2></div>
      <SettingsAdmin
        settings={Object.fromEntries(entries)}
        venues={venues.map((v) => ({ id: v.id, name: v.name, type: v.type, capacity: v.capacity, widthM: v.widthM, depthM: v.depthM }))}
      />
      <VendorCatalog
        vendorId={null}
        title="🏛 式場カタログ（会場費・自社料理・その他の自社品目）"
        categories={quoteCategories}
        items={houseItems.map((i) => ({
          id: i.id, category: i.category, name: i.name, desc: i.desc, price: i.price,
          isActive: i.isActive, imageId: houseImages.find((a) => a.parentId === i.id)?.id ?? null,
        }))}
      />
    </>
  );
}
