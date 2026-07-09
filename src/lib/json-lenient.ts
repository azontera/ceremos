// AI（ChatGPT / Claude / Gemini 等）が出力したJSONを「確実に」読み込むための寛容パーサ。
// AI出力にありがちな以下を自動で吸収してから JSON.parse する：
//  ・```json … ``` などのコードフェンス
//  ・「以下がJSONです：」等の前後の説明文（最初の [ or { 〜 最後の ] or } だけ取り出す）
//  ・// 行コメント / * ブロックコメント * /（スキーマ例のコメントを消し忘れても大丈夫）
//  ・オブジェクト/配列末尾の余分なカンマ（trailing comma）
//  ・先頭のBOM
// ※ 文字列リテラル（"…"）の中身は保護する（URLの // や、SVG属性の ' を壊さない）。
//   JSONの文字列区切りは " のみ。' は区切りとして扱わない（apostrophe / SVGの ' を保持するため）。

function stripCodeFences(s: string): string {
  // ``` や ```json を除去（開始・終了とも）。フェンスが無ければそのまま
  if (s.indexOf("```") === -1) return s;
  return s.replace(/```[a-zA-Z0-9_-]*\s*/g, "").replace(/```/g, "");
}

// 最初の [ か { から、対応する最後の ] か } までを取り出す（前後の説明文を落とす）
function extractJsonSpan(s: string): string {
  const firstBrace = s.indexOf("{");
  const firstBrack = s.indexOf("[");
  const starts = [firstBrace, firstBrack].filter((n) => n >= 0);
  if (starts.length === 0) return s;
  const start = Math.min(...starts);
  const lastBrace = s.lastIndexOf("}");
  const lastBrack = s.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBrack);
  if (end <= start) return s.slice(start);
  return s.slice(start, end + 1);
}

// コメントを除去（文字列リテラルは保護）
function stripComments(s: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = i + 1 < s.length ? s[i + 1] : "";
    if (inStr) {
      out += c;
      if (c === "\\") { out += n; i++; continue; } // エスケープ文字は次の1文字ごと保持
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && n === "/") { // 行コメント
      while (i < s.length && s[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && n === "*") { // ブロックコメント
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 1; // 末尾の '/' 手前まで（forのi++で越える）
      continue;
    }
    out += c;
  }
  return out;
}

// 末尾カンマを除去（文字列リテラルは保護）
function removeTrailingCommas(s: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\") { out += i + 1 < s.length ? s[i + 1] : ""; i++; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === "}" || s[j] === "]") continue; // 末尾カンマ → 出力しない
    }
    out += c;
  }
  return out;
}

// AI出力を寛容にパースする。失敗時は例外（呼び出し側でcatch）
export function parseLenientJson(input: string): unknown {
  let s = String(input ?? "").replace(/^﻿/, "").trim();
  try {
    return JSON.parse(s); // まず素直に。整形済みならこれで通る
  } catch {
    // フォールバック：フェンス→前後文除去→コメント除去→末尾カンマ除去の順で修復
    s = stripCodeFences(s);
    s = extractJsonSpan(s);
    s = stripComments(s);
    s = removeTrailingCommas(s).trim();
    return JSON.parse(s);
  }
}
