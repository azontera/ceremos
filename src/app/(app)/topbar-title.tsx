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

// 案件詳細（および進め方・ヒヤリング・席次編集などその配下ページ）は
// ページ内に独自の大きな見出し（新郎新婦名など）を持つため、
// トップバー側の汎用タイトル「案件詳細」＋日付は重複でしかない → 非表示にする
const SUPPRESS_ON = [/^\/cases\/[^/]+/];

export function TopbarTitle({ couple = false, dateText }: { couple?: boolean; dateText: string }) {
  const pathname = usePathname() ?? "";
  if (SUPPRESS_ON.some((re) => re.test(pathname))) return null;
  const list = couple ? COUPLE_TITLES : TITLES;
  const title = list.find(([re]) => re.test(pathname))?.[1] ?? "ホーム";
  return (
    <div>
      <h1>{title}</h1>
      <div className="date">{dateText}</div>
    </div>
  );
}
