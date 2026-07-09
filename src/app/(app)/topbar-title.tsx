"use client";
import { usePathname } from "next/navigation";

const TITLES: [RegExp, string][] = [
  [/^\/dashboard/, "ダッシュボード"],
  [/^\/cases\/new/, "新規案件の作成"],
  [/^\/cases\/[^/]+/, "案件詳細"],
  [/^\/cases/, "案件・顧客"],
  [/^\/calendar/, "カレンダー"],
  [/^\/admin\/templates/, "テンプレート管理"],
  [/^\/admin\/users/, "ユーザー・権限管理"],
  [/^\/admin\/audit/, "操作履歴"],
];

// お客様には業務用語（案件・ダッシュボード）を見せない
const COUPLE_TITLES: [RegExp, string][] = [
  [/^\/dashboard/, "ホーム"],
  [/^\/cases\/[^/]+/, "マイページ"],
  [/^\/survey/, "ヒヤリングシート"],
  [/^\/me\/password/, "パスワード変更"],
];

export function TopbarTitle({ couple = false }: { couple?: boolean }) {
  const pathname = usePathname() ?? "";
  const list = couple ? COUPLE_TITLES : TITLES;
  const title = list.find(([re]) => re.test(pathname))?.[1] ?? "ホーム";
  return <h1>{title}</h1>;
}
