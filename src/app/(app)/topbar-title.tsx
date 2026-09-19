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

// 案件詳細（および席次編集などその配下ページ）は
// ページ内に独自の大きな見出し（新郎新婦名など）を持つため、
// トップバー側の汎用タイトル「案件詳細」＋日付は重複でしかない → 非表示にする
const SUPPRESS_ON = [/^\/cases\/[^/]+/];

// トップバー全体（タイトル＋日付＋右側の子要素＝通知ベル等）をここで組み立てる。
// タイトルを非表示にするページでは、余白ごと消して細いバーにする（空白だけ残るのを防ぐ）。
export function Topbar({ couple = false, dateText, children }: { couple?: boolean; dateText: string; children?: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const suppressed = SUPPRESS_ON.some((re) => re.test(pathname));
  const list = couple ? COUPLE_TITLES : TITLES;
  const title = list.find(([re]) => re.test(pathname))?.[1] ?? "ホーム";
  return (
    <header className={`topbar${suppressed ? " topbar-slim" : ""}`}>
      {!suppressed && (
        <div>
          <h1>{title}</h1>
          <div className="date">{dateText}</div>
        </div>
      )}
      <div className="grow" />
      {children}
    </header>
  );
}
