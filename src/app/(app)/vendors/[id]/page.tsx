import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { caseLabel } from "@/lib/case-types";
import { getMasterOptions } from "@/lib/masters";
import { VendorOrdersTable, VendorQuoteItems } from "@/components/vendor-panels";
import { VendorCatalog } from "@/components/vendor-catalog";

export const dynamic = "force-dynamic";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const CATEGORY_LABEL: Record<string, string> = {
  dress: "衣装", florist: "装花", catering: "料理", audio: "音響", mc: "司会",
  photo: "写真", video: "映像", gift: "引出物", print: "印刷", beauty: "美容",
};

// 業者ページ：発注一覧・発注書一括印刷・自社紐付き見積明細の編集・チャット動線
export default async function VendorPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const isOwn = s.vendorId === params.id;
  const isStaff = ["admin", "manager", "planner"].includes(s.role);
  if (!isOwn && !isStaff) redirect("/dashboard");

  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    include: { users: { where: { isActive: true }, select: { name: true, email: true } } },
  });
  if (!vendor) notFound();

  const [orders, quoteItems, catalogItems, quoteCategories] = await Promise.all([
    prisma.order.findMany({
      where: { vendorId: vendor.id },
      include: { case: { select: { id: true, groomName: true, brideName: true, weddingDate: true } } },
      orderBy: { dueAt: "asc" },
    }),
    prisma.quoteItem.findMany({
      where: { vendorId: vendor.id, quote: { status: { in: ["draft", "confirmed"] } } },
      include: { quote: { include: { case: { select: { id: true, groomName: true, brideName: true } } } } },
    }),
    prisma.catalogItem.findMany({
      where: { vendorId: vendor.id },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    getMasterOptions("quote_category"),
  ]);
  const catalogImages = await prisma.attachment.findMany({
    where: { parentType: "catalog", parentId: { in: catalogItems.map((i) => i.id) } },
  });

  // 業者アカウントの場合は自分が参加している案件のみ（リソーススコープ）
  const memberCaseIds = isOwn && !isStaff
    ? new Set((await prisma.caseMember.findMany({ where: { userId: s.userId }, select: { caseId: true } })).map((m) => m.caseId))
    : null;
  const visibleOrders = memberCaseIds ? orders.filter((o) => memberCaseIds.has(o.caseId)) : orders;
  const visibleItems = memberCaseIds ? quoteItems.filter((i) => memberCaseIds.has(i.quote.caseId)) : quoteItems;

  // 業者向け：参加案件の新着チャット
  const recentMessages = isOwn
    ? await prisma.chatMessage.findMany({
        where: { caseId: { in: [...(memberCaseIds ?? new Set(visibleOrders.map((o) => o.caseId)))] }, NOT: { senderId: s.userId } },
        include: {
          sender: { select: { name: true } },
          case: { select: { id: true, groomName: true, brideName: true } },
          reads: { where: { userId: s.userId } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];

  const pending = visibleOrders.filter((o) => o.status === "pending");
  const upcoming = visibleOrders.filter((o) => o.status !== "delivered");

  return (
    <>
      <div className="section-h">
        {isStaff && <Link href="/admin/users" className="btn sm">← 管理</Link>}
        <h2>🏪 {vendor.name}</h2>
        <span className="pill blue">{CATEGORY_LABEL[vendor.category] ?? vendor.category}</span>
        <div style={{ flex: 1 }} />
        <a className="btn" href={`/print/vendor/${vendor.id}`} target="_blank">🖨 発注書 一括印刷</a>
      </div>

      {/* サマリ */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <div className="k-label">未確定の発注</div>
          <div className="k-val" style={{ color: pending.length ? "var(--red)" : undefined }}>{pending.length}<span style={{ fontSize: 14, color: "var(--text3)" }}> 件</span></div>
          <div className="k-sub">確定操作をお願いします</div>
        </div>
        <div className="card kpi">
          <div className="k-label">納品待ち</div>
          <div className="k-val">{upcoming.length}<span style={{ fontSize: 14, color: "var(--text3)" }}> 件</span></div>
          <div className="k-sub">納期順に表示しています</div>
        </div>
        <div className="card kpi">
          <div className="k-label">発注総額</div>
          <div className="k-val" style={{ fontSize: 22 }}>{yen(visibleOrders.reduce((s2, o) => s2 + o.amount, 0))}</div>
          <div className="k-sub">全{visibleOrders.length}件</div>
        </div>
        <div className="card kpi">
          <div className="k-label">担当者</div>
          <div className="k-val" style={{ fontSize: 16 }}>{vendor.users.map((u) => u.name).join("・") || "—"}</div>
          <div className="k-sub">{vendor.users.map((u) => u.email).join(" / ")}</div>
        </div>
      </div>

      {isOwn && recentMessages.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">💬 新着チャット（参加案件）</div>
          <div className="card-b">
            {recentMessages.map((m) => (
              <Link href={`/cases/${m.case.id}?tab=chat`} className="list-row" key={m.id}>
                <div className="avatar" style={{ background: "var(--accent)" }}>{m.sender.name.charAt(0)}</div>
                <div className="t">
                  <b>{m.sender.name}（{caseLabel(m.case)}）</b>
                  <span>{m.body}</span>
                </div>
                <span className={`pill ${m.reads.length === 0 ? "accent" : "gray"}`}>{m.reads.length === 0 ? "未読" : "既読"}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="section-h" style={{ margin: "0 0 12px" }}><h2 style={{ fontSize: 16 }}>📦 発注一覧（納期順）</h2></div>
      <VendorOrdersTable
        canOperate={isOwn || isStaff}
        orders={visibleOrders.map((o) => ({
          id: o.id, caseId: o.caseId, caseLabel: caseLabel(o.case),
          weddingDate: o.case.weddingDate.toISOString(),
          category: o.category, amount: o.amount, status: o.status, note: o.note,
          dueAt: o.dueAt ? o.dueAt.toISOString() : null,
        }))}
      />

      {/* 🛍 自社カタログ：登録した商品はお客様・プランナーの「カタログ」タブに出て、見積へ定価で追加される */}
      <VendorCatalog
        vendorId={vendor.id}
        categories={quoteCategories}
        items={catalogItems.map((i) => ({
          id: i.id, category: i.category, name: i.name, desc: i.desc, price: i.price,
          isActive: i.isActive, imageId: catalogImages.find((a) => a.parentId === i.id)?.id ?? null,
        }))}
      />

      <div className="section-h" style={{ margin: "20px 0 12px" }}><h2 style={{ fontSize: 16 }}>💰 見積明細（自社紐付き・編集可）</h2></div>
      <VendorQuoteItems
        items={visibleItems.map((i) => ({
          id: i.id, caseId: i.quote.caseId, caseLabel: caseLabel(i.quote.case),
          quoteVersion: i.quote.version, quoteStatus: i.quote.status,
          name: i.name, qty: i.qty, unitPrice: i.unitPrice,
        }))}
      />
    </>
  );
}
