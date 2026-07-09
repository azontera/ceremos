// 🖼 フル画面カタログ（公開）— URL共有で誰でも閲覧できる、動きのあるショーケース
// 会場→料理→衣装→…→見積もり の流れで品目を選び、ログイン中のお客様はそのまま見積へ反映できる。
// 業務画面（(app)配下）とは別アプリ。データは同じカタログ・見積APIと同期する。
import type { Metadata } from "next";
import "./catalog.css";
import { CatalogShowcase } from "@/components/catalog-showcase";

export const metadata: Metadata = {
  title: "Wedding Collection｜カタログ",
  description: "会場・料理・衣装・装花・演出 — ふたりの一日を、選ぶたのしさから。",
};
export const dynamic = "force-dynamic";

export default function CatalogShowcasePage() {
  return <CatalogShowcase />;
}
