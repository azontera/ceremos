// カタログ品目の写真を「生成アート（オリジナルSVGイラスト）」に全差し替えする。
// ネット上の写真は使わない（著作権・肖像権フリー）。各業者があとで実写真に差し替える前提の
// 「美しいプレースホルダー写真」。品名・カテゴリからシーンを選び、品目ごとに配色が変わる。
// 使い方: node scripts/generate-catalog-art.cjs        … 全品目を生成アートに差し替え
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");
const W = 1200, H = 900;

// ---------- ユーティリティ ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function seeded(seed) { // 決定的な擬似乱数（同じ品目は同じ絵になる）
  let x = seed % 2147483647; if (x <= 0) x += 2147483646;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}
function hashCode(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; } return Math.abs(h); }
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// 共通の外枠：背景グラデ＋ビネット＋下部の品名ラベル（明朝・上品）
function frame(inner, { bg1, bg2, title, sub }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
  <radialGradient id="vig" cx="0.5" cy="0.42" r="0.9"><stop offset="0.62" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(40,25,15,0.22)"/></radialGradient>
  <radialGradient id="glow" cx="0.5" cy="0.35" r="0.55"><stop offset="0" stop-color="rgba(255,252,240,0.55)"/><stop offset="1" stop-color="rgba(255,252,240,0)"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${inner}
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<rect x="0" y="${H - 148}" width="${W}" height="148" fill="rgba(30,22,16,0.38)"/>
<rect x="0" y="${H - 148}" width="${W}" height="1.5" fill="rgba(255,245,225,0.5)"/>
${sub ? `<text x="${W / 2}" y="${H - 100}" font-size="21" letter-spacing="6" text-anchor="middle" fill="rgba(255,245,225,0.75)" font-family="'Hiragino Mincho ProN','Yu Mincho',serif">${esc(sub)}</text>` : ""}
<text x="${W / 2}" y="${H - 48}" font-size="41" letter-spacing="3" text-anchor="middle" fill="#fdf8ee" font-weight="600" font-family="'Hiragino Mincho ProN','Yu Mincho',serif">${esc(title)}</text>
</svg>`;
}

// 花（一輪）：中心＋花びら
function flower(cx, cy, r, petal, core) {
  let s = "";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s += `<ellipse cx="${cx + Math.cos(a) * r * 0.62}" cy="${cy + Math.sin(a) * r * 0.62}" rx="${r * 0.52}" ry="${r * 0.38}" transform="rotate(${(a * 180) / Math.PI} ${cx + Math.cos(a) * r * 0.62} ${cy + Math.sin(a) * r * 0.62})" fill="${petal}"/>`;
  }
  return s + `<circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="${core}"/>`;
}
// きらめき
function sparkle(cx, cy, r, color = "rgba(255,250,230,0.9)") {
  return `<path d="M ${cx} ${cy - r} Q ${cx + r * 0.12} ${cy - r * 0.12} ${cx + r} ${cy} Q ${cx + r * 0.12} ${cy + r * 0.12} ${cx} ${cy + r} Q ${cx - r * 0.12} ${cy + r * 0.12} ${cx - r} ${cy} Q ${cx - r * 0.12} ${cy - r * 0.12} ${cx} ${cy - r} Z" fill="${color}"/>`;
}
// シャンデリア
function chandelier(cx, cy, sc = 1) {
  let s = `<line x1="${cx}" y1="0" x2="${cx}" y2="${cy - 40 * sc}" stroke="rgba(120,90,50,0.5)" stroke-width="3"/>`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${70 * sc}" ry="${18 * sc}" fill="none" stroke="#caa45a" stroke-width="${5 * sc}"/>`;
  for (let i = 0; i < 5; i++) {
    const x = cx - 60 * sc + i * 30 * sc;
    s += `<circle cx="${x}" cy="${cy - 8 * sc}" r="${7 * sc}" fill="#ffe9b0"/><circle cx="${x}" cy="${cy - 8 * sc}" r="${16 * sc}" fill="rgba(255,225,150,0.25)"/>`;
  }
  return s;
}

// ---------- シーン ----------
const SCENES = {
  chapel(rnd) {
    const win = (x) => `<path d="M ${x} 560 L ${x} 300 Q ${x + 55} 220 ${x + 110} 300 L ${x + 110} 560 Z" fill="rgba(255,246,220,0.85)" stroke="rgba(160,130,90,0.5)" stroke-width="4"/>
      <line x1="${x + 55}" y1="238" x2="${x + 55}" y2="560" stroke="rgba(180,150,110,0.5)" stroke-width="3"/>
      <line x1="${x}" y1="400" x2="${x + 110}" y2="400" stroke="rgba(180,150,110,0.5)" stroke-width="3"/>`;
    let pews = "";
    for (let i = 0; i < 4; i++) {
      const y = 620 + i * 42, inset = 90 + i * 55;
      pews += `<rect x="${inset}" y="${y}" width="${330 - i * 32}" height="16" rx="6" fill="rgba(90,60,35,0.55)"/>
               <rect x="${W - inset - 330 + i * 32}" y="${y}" width="${330 - i * 32}" height="16" rx="6" fill="rgba(90,60,35,0.55)"/>`;
    }
    return `
      ${win(210)}${win(490)}${win(770)}
      <path d="M 600 130 L 600 60 M 570 95 L 630 95" stroke="rgba(190,160,110,0.9)" stroke-width="8" stroke-linecap="round"/>
      <path d="M ${W / 2 - 260} ${H} L ${W / 2 - 70} 560 L ${W / 2 + 70} 560 L ${W / 2 + 260} ${H} Z" fill="rgba(250,240,220,0.8)"/>
      <path d="M ${W / 2 - 190} ${H} L ${W / 2 - 52} 560 L ${W / 2 + 52} 560 L ${W / 2 + 190} ${H} Z" fill="rgba(200,60,80,0.28)"/>
      <polygon points="600,180 380,760 820,760" fill="rgba(255,240,200,0.16)"/>
      ${pews}
      ${flower(140, 560, 34, "rgba(240,180,190,0.95)", "#e8c66a")}${flower(1060, 560, 34, "rgba(240,180,190,0.95)", "#e8c66a")}
      ${sparkle(320, 180, 14)}${sparkle(900, 150, 11)}${sparkle(600, 250, 9)}`;
  },
  garden(rnd) {
    const tree = (x, y, sc, g) => `<ellipse cx="${x}" cy="${y}" rx="${95 * sc}" ry="${115 * sc}" fill="${g}"/><rect x="${x - 9 * sc}" y="${y + 70 * sc}" width="${18 * sc}" height="${90 * sc}" rx="8" fill="rgba(110,80,50,0.75)"/>`;
    let petals = "";
    for (let i = 0; i < 26; i++) petals += `<ellipse cx="${rnd() * W}" cy="${rnd() * 550}" rx="7" ry="4" transform="rotate(${rnd() * 90} ${rnd() * W} ${rnd() * 500})" fill="rgba(250,200,210,${0.35 + rnd() * 0.4})"/>`;
    return `
      <circle cx="920" cy="150" r="86" fill="rgba(255,238,180,0.9)"/><circle cx="920" cy="150" r="150" fill="rgba(255,238,180,0.25)"/>
      ${tree(130, 380, 1.15, "rgba(110,150,95,0.9)")}${tree(1075, 350, 1.3, "rgba(95,140,85,0.9)")}${tree(300, 430, 0.7, "rgba(130,165,105,0.85)")}
      <rect x="0" y="600" width="${W}" height="${H - 600}" fill="rgba(125,165,95,0.9)"/>
      <rect x="0" y="600" width="${W}" height="14" fill="rgba(255,255,255,0.18)"/>
      <path d="M 480 600 Q 470 330 600 320 Q 730 330 720 600" fill="none" stroke="rgba(250,248,240,0.95)" stroke-width="16"/>
      ${flower(482, 430, 26, "rgba(245,170,185,0.95)", "#f3d98a")}${flower(716, 400, 26, "rgba(250,205,160,0.95)", "#f3d98a")}${flower(505, 340, 22, "rgba(255,235,240,0.95)", "#e8c66a")}${flower(695, 500, 22, "rgba(240,150,170,0.95)", "#e8c66a")}
      <path d="M 430 ${H} L 560 620 L 640 620 L 770 ${H} Z" fill="rgba(250,246,235,0.85)"/>
      ${petals}`;
  },
  hall(rnd, night) {
    const tbl = (x, y, sc) => `
      <ellipse cx="${x}" cy="${y + 52 * sc}" rx="${105 * sc}" ry="${30 * sc}" fill="rgba(30,20,12,0.25)"/>
      <path d="M ${x - 100 * sc} ${y} Q ${x} ${y - 26 * sc} ${x + 100 * sc} ${y} L ${x + 82 * sc} ${y + 58 * sc} Q ${x} ${y + 76 * sc} ${x - 82 * sc} ${y + 58 * sc} Z" fill="${night ? "rgba(240,235,225,0.92)" : "rgba(253,250,242,0.95)"}"/>
      <ellipse cx="${x}" cy="${y}" rx="${100 * sc}" ry="${24 * sc}" fill="${night ? "#efe6d2" : "#fffdf6"}"/>
      ${flower(x, y - 6 * sc, 15 * sc, "rgba(235,155,170,0.95)", "#e8c66a")}
      <circle cx="${x - 46 * sc}" cy="${y + 2 * sc}" r="${5 * sc}" fill="#d9c9a8"/><circle cx="${x + 46 * sc}" cy="${y + 2 * sc}" r="${5 * sc}" fill="#d9c9a8"/>`;
    let lights = "";
    if (night) for (let i = 0; i < 16; i++) lights += `<circle cx="${40 + i * 75}" cy="${120 + Math.sin(i * 1.2) * 28}" r="5" fill="#ffe9a8"/><circle cx="${40 + i * 75}" cy="${120 + Math.sin(i * 1.2) * 28}" r="12" fill="rgba(255,230,160,0.25)"/>`;
    return `
      ${chandelier(340, 190, 0.9)}${chandelier(860, 170, 1.1)}${lights}
      <rect x="330" y="330" width="540" height="180" rx="10" fill="rgba(255,250,238,0.14)"/>
      <rect x="350" y="350" width="500" height="140" rx="8" fill="rgba(190,140,90,0.30)"/>
      ${flower(600, 415, 30, "rgba(240,175,190,0.9)", "#eecb74")}
      ${tbl(240, 640, 1)}${tbl(600, 690, 1.14)}${tbl(960, 640, 1)}`;
  },
  waitingRoom(rnd) {
    return `
      <rect x="120" y="180" width="300" height="330" rx="10" fill="rgba(255,248,230,0.75)" stroke="rgba(170,140,100,0.6)" stroke-width="5"/>
      <line x1="270" y1="185" x2="270" y2="505" stroke="rgba(190,160,120,0.5)" stroke-width="3"/>
      <ellipse cx="800" cy="700" rx="330" ry="46" fill="rgba(40,26,16,0.22)"/>
      <path d="M 540 700 L 540 540 Q 540 500 585 500 L 1015 500 Q 1060 500 1060 540 L 1060 700 Z" fill="rgba(196,148,120,0.95)"/>
      <path d="M 560 560 Q 640 520 720 560 L 720 640 L 560 640 Z" fill="rgba(230,200,180,0.9)"/>
      <path d="M 740 560 Q 820 520 900 560 L 900 640 L 740 640 Z" fill="rgba(230,200,180,0.9)"/>
      <rect x="530" y="640" width="540" height="26" rx="12" fill="rgba(150,105,80,0.95)"/>
      <ellipse cx="240" cy="640" rx="90" ry="18" fill="rgba(40,26,16,0.18)"/>
      <path d="M 240 640 L 240 560 M 205 640 L 275 640" stroke="rgba(150,110,75,0.9)" stroke-width="8" stroke-linecap="round"/>
      <circle cx="240" cy="530" r="52" fill="none" stroke="#caa45a" stroke-width="6"/>
      ${flower(240, 530, 22, "rgba(240,180,195,0.95)", "#e8c66a")}
      ${sparkle(950, 240, 12)}${sparkle(1050, 330, 9)}`;
  },
  cuisine(rnd, kind) {
    const cx = 600, cy = 480;
    const foods = kind === "wa"
      ? `<rect x="${cx - 120}" y="${cy - 42}" width="110" height="70" rx="8" fill="rgba(60,40,30,0.85)"/>
         <circle cx="${cx - 65}" cy="${cy - 12}" r="24" fill="#f4e6c8"/><circle cx="${cx + 45}" cy="${cy - 20}" r="30" fill="#e8a15c"/>
         <circle cx="${cx + 95}" cy="${cy + 12}" r="18" fill="#c95d52"/><ellipse cx="${cx - 10}" cy="${cy + 26}" rx="34" ry="14" fill="#8fae6a"/>`
      : `<circle cx="${cx}" cy="${cy - 8}" r="56" fill="#c98a52"/><circle cx="${cx}" cy="${cy - 8}" r="56" fill="none" stroke="rgba(140,80,40,0.5)" stroke-width="3"/>
         <ellipse cx="${cx - 48}" cy="${cy + 34}" rx="26" ry="10" fill="#8fae6a"/><ellipse cx="${cx + 52}" cy="${cy + 30}" rx="20" ry="9" fill="#d8b23e"/>
         <circle cx="${cx - 66}" cy="${cy - 44}" r="9" fill="#c95d52"/><circle cx="${cx + 68}" cy="${cy - 40}" r="7" fill="#c95d52"/>
         <path d="M ${cx - 30} ${cy - 60} q 30 -22 60 0" stroke="#7a9a55" stroke-width="5" fill="none"/>`;
    return `
      <rect x="0" y="620" width="${W}" height="${H - 620}" fill="rgba(90,55,35,0.5)"/>
      <rect x="150" y="600" width="900" height="60" rx="8" fill="rgba(252,248,238,0.9)"/>
      <ellipse cx="${cx}" cy="${cy + 90}" rx="260" ry="36" fill="rgba(40,25,12,0.25)"/>
      <circle cx="${cx}" cy="${cy}" r="150" fill="#fdfbf4"/><circle cx="${cx}" cy="${cy}" r="150" fill="none" stroke="#d8c9a8" stroke-width="4"/>
      <circle cx="${cx}" cy="${cy}" r="118" fill="none" stroke="rgba(200,170,120,0.45)" stroke-width="2"/>
      ${foods}
      <g stroke="#b8a888" stroke-width="7" stroke-linecap="round"><line x1="330" y1="400" x2="330" y2="560"/><line x1="316" y1="400" x2="316" y2="452"/><line x1="344" y1="400" x2="344" y2="452"/></g>
      <g stroke="#b8a888" stroke-width="7" stroke-linecap="round"><line x1="872" y1="400" x2="872" y2="560"/><path d="M 872 400 Q 894 428 872 456" fill="none"/></g>
      ${sparkle(760, 300, 11)}${sparkle(430, 280, 9)}`;
  },
  drink(rnd) {
    const glass = (x, tilt) => `<g transform="rotate(${tilt} ${x} 460)">
      <path d="M ${x - 62} 320 Q ${x} 300 ${x + 62} 320 Q ${x + 56} 430 ${x} 448 Q ${x - 56} 430 ${x - 62} 320 Z" fill="rgba(255,252,244,0.35)" stroke="rgba(255,250,235,0.85)" stroke-width="4"/>
      <path d="M ${x - 54} 330 Q ${x} 314 ${x + 54} 330 Q ${x + 50} 398 ${x} 412 Q ${x - 50} 398 ${x - 54} 330 Z" fill="rgba(243,206,110,0.85)"/>
      <line x1="${x}" y1="448" x2="${x}" y2="580" stroke="rgba(255,250,235,0.85)" stroke-width="5"/>
      <ellipse cx="${x}" cy="588" rx="46" ry="10" fill="rgba(255,250,235,0.7)"/>
      <circle cx="${x - 12}" cy="356" r="4" fill="#fff6da"/><circle cx="${x + 10}" cy="378" r="3" fill="#fff6da"/><circle cx="${x - 2}" cy="340" r="3" fill="#fff6da"/></g>`;
    return `
      ${glass(520, -7)}${glass(690, 7)}
      ${sparkle(604, 268, 20)}${sparkle(430, 350, 10)}${sparkle(790, 330, 12)}${sparkle(600, 640, 9)}
      <circle cx="600" cy="300" r="180" fill="rgba(255,240,200,0.12)"/>`;
  },
  cake(rnd) {
    const cx = 600;
    return `
      <ellipse cx="${cx}" cy="700" rx="270" ry="36" fill="rgba(40,25,12,0.22)"/>
      <ellipse cx="${cx}" cy="672" rx="235" ry="26" fill="#fdfaf2"/><rect x="${cx - 235}" y="640" width="470" height="34" fill="#fdfaf2"/>
      <rect x="${cx - 172}" y="520" width="344" height="128" rx="8" fill="#fff9ee"/><path d="M ${cx - 172} 540 q 28 26 56 0 q 28 26 56 0 q 28 26 56 0 q 28 26 56 0 q 28 26 56 0 q 28 26 64 0 L ${cx + 172} 520 L ${cx - 172} 520 Z" fill="#f2d7dc"/>
      <rect x="${cx - 122}" y="404" width="244" height="120" rx="8" fill="#fff9ee"/>
      <rect x="${cx - 78}" y="300" width="156" height="108" rx="8" fill="#fff9ee"/><path d="M ${cx - 78} 316 q 20 20 39 0 q 20 20 39 0 q 20 20 39 0 q 20 20 39 0 L ${cx + 78} 300 L ${cx - 78} 300 Z" fill="#f2d7dc"/>
      ${flower(cx - 130, 522, 20, "rgba(238,160,178,0.95)", "#eecb74")}${flower(cx + 140, 466, 18, "rgba(246,196,150,0.95)", "#eecb74")}${flower(cx - 40, 406, 16, "rgba(255,228,236,0.95)", "#eecb74")}${flower(cx + 58, 300, 15, "rgba(238,160,178,0.95)", "#eecb74")}
      <path d="M ${cx - 12} 258 Q ${cx} 236 ${cx + 12} 258 Q ${cx} 276 ${cx - 12} 258" fill="#caa45a"/>
      ${sparkle(cx - 220, 330, 11)}${sparkle(cx + 230, 380, 13)}`;
  },
  dress(rnd, tone) {
    const cx = 600, c = tone || "#fdfaf3";
    return `
      <ellipse cx="${cx}" cy="742" rx="265" ry="34" fill="rgba(40,25,12,0.2)"/>
      <path d="M ${cx - 46} 260 Q ${cx} 238 ${cx + 46} 260 L ${cx + 58} 380 Q ${cx} 412 ${cx - 58} 380 Z" fill="${c}" stroke="rgba(180,150,110,0.35)" stroke-width="2"/>
      <path d="M ${cx - 58} 380 Q ${cx - 250} 620 ${cx - 210} 742 Q ${cx} 782 ${cx + 210} 742 Q ${cx + 250} 620 ${cx + 58} 380 Q ${cx} 412 ${cx - 58} 380 Z" fill="${c}" stroke="rgba(180,150,110,0.3)" stroke-width="2"/>
      <path d="M ${cx - 30} 430 Q ${cx - 130} 620 ${cx - 110} 730 M ${cx + 30} 430 Q ${cx + 130} 620 ${cx + 110} 730" stroke="rgba(190,160,120,0.28)" stroke-width="3" fill="none"/>
      <path d="M ${cx - 46} 300 Q ${cx} 322 ${cx + 46} 300" stroke="rgba(190,160,120,0.4)" stroke-width="3" fill="none"/>
      ${flower(cx, 388, 17, "rgba(236,168,184,0.9)", "#eecb74")}
      <circle cx="${cx}" cy="212" r="24" fill="none" stroke="#caa45a" stroke-width="4"/>
      ${sparkle(cx - 215, 330, 12)}${sparkle(cx + 225, 300, 14)}${sparkle(cx + 180, 560, 9)}`;
  },
  tuxedo(rnd, c = "#3d3a45") {
    const cx = 600;
    return `
      <ellipse cx="${cx}" cy="742" rx="220" ry="30" fill="rgba(40,25,12,0.2)"/>
      <path d="M ${cx - 130} 330 Q ${cx - 148} 560 ${cx - 118} 720 L ${cx + 118} 720 Q ${cx + 148} 560 ${cx + 130} 330 Q ${cx + 60} 282 ${cx} 280 Q ${cx - 60} 282 ${cx - 130} 330 Z" fill="${c}"/>
      <path d="M ${cx - 60} 292 L ${cx - 20} 420 L ${cx - 60} 560 L ${cx - 96} 420 Z" fill="rgba(255,255,255,0.14)"/>
      <path d="M ${cx + 60} 292 L ${cx + 20} 420 L ${cx + 60} 560 L ${cx + 96} 420 Z" fill="rgba(255,255,255,0.14)"/>
      <path d="M ${cx - 34} 300 L ${cx} 360 L ${cx + 34} 300 L ${cx + 20} 640 L ${cx - 20} 640 Z" fill="#fdfaf3"/>
      <path d="M ${cx - 26} 306 L ${cx - 8} 330 L ${cx - 26} 352 L ${cx - 44} 330 Z M ${cx + 26} 306 L ${cx + 44} 330 L ${cx + 26} 352 L ${cx + 8} 330 Z" fill="#1e1c22"/>
      <circle cx="${cx}" cy="410" r="6" fill="#caa45a"/><circle cx="${cx}" cy="470" r="6" fill="#caa45a"/>
      ${flower(cx - 92, 372, 13, "rgba(238,170,186,0.95)", "#eecb74")}
      <circle cx="${cx}" cy="218" r="24" fill="none" stroke="#caa45a" stroke-width="4"/>
      ${sparkle(cx + 200, 300, 12)}${sparkle(cx - 220, 480, 10)}`;
  },
  kimono(rnd, base = "#f5efe2", pat = "rgba(200,90,110,0.8)") {
    const cx = 600;
    let waves = "";
    for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) {
      const x = cx - 150 + i * 76 + (r % 2) * 38, y = 470 + r * 82;
      waves += `<path d="M ${x - 30} ${y} A 30 30 0 0 1 ${x + 30} ${y}" fill="none" stroke="${pat}" stroke-width="4"/><path d="M ${x - 18} ${y} A 18 18 0 0 1 ${x + 18} ${y}" fill="none" stroke="${pat}" stroke-width="3"/>`;
    }
    return `
      <ellipse cx="${cx}" cy="742" rx="235" ry="30" fill="rgba(40,25,12,0.2)"/>
      <path d="M ${cx - 190} 330 L ${cx - 300} 420 L ${cx - 250} 470 L ${cx - 168} 420 L ${cx - 168} 720 L ${cx + 168} 720 L ${cx + 168} 420 L ${cx + 250} 470 L ${cx + 300} 420 L ${cx + 190} 330 Q ${cx} 268 ${cx - 190} 330 Z" fill="${base}" stroke="rgba(160,120,80,0.35)" stroke-width="3"/>
      <path d="M ${cx - 70} 296 L ${cx + 8} 470 L ${cx + 40} 470 L ${cx - 34} 292 Z" fill="rgba(200,90,110,0.55)"/>
      <path d="M ${cx + 70} 296 L ${cx - 8} 470 L ${cx - 40} 470 L ${cx + 34} 292 Z" fill="rgba(255,255,255,0.7)"/>
      <rect x="${cx - 168}" y="470" width="336" height="64" fill="rgba(190,60,80,0.85)"/>
      <rect x="${cx - 168}" y="470" width="336" height="10" fill="rgba(255,235,200,0.6)"/><rect x="${cx - 168}" y="524" width="336" height="10" fill="rgba(255,235,200,0.6)"/>
      ${waves}
      ${flower(cx - 120, 380, 20, "rgba(240,190,200,0.95)", "#eecb74")}${flower(cx + 128, 620, 22, "rgba(246,205,160,0.9)", "#eecb74")}
      ${sparkle(cx + 230, 320, 12)}`;
  },
  bouquet(rnd, palette) {
    const cx = 600, cy = 400;
    const cols = palette || ["rgba(238,160,178,0.96)", "rgba(248,205,160,0.96)", "rgba(255,232,238,0.96)", "rgba(224,120,140,0.96)"];
    let flowers = "";
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 130;
      flowers += flower(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 26 + rnd() * 22, pick(rnd, cols), "#eecb74");
    }
    let leaves = "";
    for (let i = 0; i < 8; i++) {
      const a = rnd() * Math.PI * 2, d = 120 + rnd() * 70;
      leaves += `<ellipse cx="${cx + Math.cos(a) * d}" cy="${cy + Math.sin(a) * d * 0.8}" rx="34" ry="13" transform="rotate(${(a * 180) / Math.PI} ${cx + Math.cos(a) * d} ${cy + Math.sin(a) * d * 0.8})" fill="rgba(120,155,95,0.85)"/>`;
    }
    return `
      <ellipse cx="${cx}" cy="760" rx="150" ry="22" fill="rgba(40,25,12,0.2)"/>
      <path d="M ${cx - 60} 540 L ${cx - 28} 720 L ${cx + 28} 720 L ${cx + 60} 540 Z" fill="rgba(252,246,232,0.9)"/>
      <path d="M ${cx - 60} 540 L ${cx + 60} 540 L ${cx + 40} 600 L ${cx - 40} 600 Z" fill="rgba(220,190,150,0.5)"/>
      <path d="M ${cx - 20} 620 q -30 24 0 48 q 30 -24 0 -48 M ${cx + 20} 620 q 30 24 0 48 q -30 -24 0 -48" fill="rgba(200,120,140,0.85)"/>
      ${leaves}${flowers}
      ${sparkle(cx + 230, 260, 13)}${sparkle(cx - 240, 330, 10)}`;
  },
  arrangement(rnd) {
    const cx = 600;
    let fl = "";
    for (let i = 0; i < 9; i++) fl += flower(cx - 170 + i * 42, 430 + Math.sin(i * 1.7) * 26, 22 + (i % 3) * 5, pick(rnd, ["rgba(238,160,178,0.95)", "rgba(248,205,160,0.95)", "rgba(255,235,240,0.95)"]), "#eecb74");
    return `
      <rect x="0" y="640" width="${W}" height="${H - 640}" fill="rgba(90,55,35,0.45)"/>
      <rect x="180" y="620" width="840" height="46" rx="8" fill="rgba(252,248,238,0.92)"/>
      <ellipse cx="${cx}" cy="600" rx="230" ry="24" fill="rgba(40,25,12,0.2)"/>
      <path d="M ${cx - 130} 520 Q ${cx} 560 ${cx + 130} 520 L ${cx + 100} 596 L ${cx - 100} 596 Z" fill="rgba(200,170,130,0.85)"/>
      <ellipse cx="${cx - 180}" cy="470" rx="30" ry="12" transform="rotate(-30 ${cx - 180} 470)" fill="rgba(120,155,95,0.9)"/>
      <ellipse cx="${cx + 185}" cy="460" rx="30" ry="12" transform="rotate(28 ${cx + 185} 460)" fill="rgba(120,155,95,0.9)"/>
      ${fl}
      <g stroke="#d8c9a0" stroke-width="4"><line x1="330" y1="480" x2="330" y2="600"/><line x1="870" y1="480" x2="870" y2="600"/></g>
      <circle cx="330" cy="466" r="12" fill="#ffdf9e"/><circle cx="870" cy="466" r="12" fill="#ffdf9e"/>
      <circle cx="330" cy="466" r="24" fill="rgba(255,225,150,0.3)"/><circle cx="870" cy="466" r="24" fill="rgba(255,225,150,0.3)"/>`;
  },
  paper(rnd) {
    return `
      <rect x="300" y="330" width="430" height="300" rx="8" transform="rotate(-6 515 480)" fill="#fdfaf1" stroke="#d8c9a8" stroke-width="3"/>
      <g transform="rotate(-6 515 480)">
        <line x1="360" y1="420" x2="670" y2="420" stroke="rgba(150,120,80,0.5)" stroke-width="3"/>
        <line x1="390" y1="470" x2="640" y2="470" stroke="rgba(150,120,80,0.35)" stroke-width="3"/>
        <line x1="390" y1="510" x2="640" y2="510" stroke="rgba(150,120,80,0.35)" stroke-width="3"/>
        <text x="515" y="386" font-size="34" text-anchor="middle" fill="#8a6a45" font-family="'Hiragino Mincho ProN',serif" letter-spacing="4">Invitation</text>
      </g>
      <rect x="560" y="430" width="380" height="250" rx="8" transform="rotate(5 750 555)" fill="#f6ead8" stroke="#cbb58e" stroke-width="3"/>
      <path d="M 573 452 L 750 570 L 927 452" transform="rotate(5 750 555)" fill="none" stroke="#cbb58e" stroke-width="3"/>
      <circle cx="750" cy="580" r="30" fill="#b8485e"/><circle cx="750" cy="580" r="20" fill="none" stroke="rgba(255,230,220,0.6)" stroke-width="2"/>
      ${flower(330, 300, 22, "rgba(240,185,198,0.9)", "#eecb74")}
      ${sparkle(880, 300, 13)}${sparkle(280, 640, 10)}`;
  },
  gift(rnd, ribbon = "#c46a80") {
    const box = (x, y, w, h, c, r) => `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${c}"/>
      <rect x="${x + w / 2 - 12}" y="${y}" width="24" height="${h}" fill="${r}"/>
      <rect x="${x}" y="${y + h / 2 - 11}" width="${w}" height="22" fill="${r}"/>
      <path d="M ${x + w / 2} ${y} q -34 -40 -58 -14 q -12 22 34 22 q 46 0 34 -22 q -24 -26 -58 14" transform="translate(12 -4)" fill="${r}"/>`;
    return `
      <ellipse cx="600" cy="720" rx="300" ry="34" fill="rgba(40,25,12,0.2)"/>
      ${box(420, 420, 350, 290, "#fbf6ea", ribbon)}
      ${box(300, 540, 200, 170, "#f2e4d0", "#a8845c")}
      ${box(740, 560, 170, 150, "#efe0e2", "#8f5a6a")}
      ${sparkle(370, 350, 13)}${sparkle(850, 420, 15)}${sparkle(620, 320, 10)}`;
  },
  sweets(rnd) {
    return `
      <ellipse cx="600" cy="690" rx="300" ry="34" fill="rgba(40,25,12,0.2)"/>
      <ellipse cx="600" cy="640" rx="280" ry="40" fill="#fdfaf2"/><ellipse cx="600" cy="628" rx="280" ry="38" fill="#fffdf8" stroke="#d8c9a8" stroke-width="3"/>
      <circle cx="470" cy="580" r="44" fill="#e8b4c0"/><circle cx="470" cy="568" r="40" fill="#f2ccd6"/><circle cx="470" cy="556" r="8" fill="#c46a80"/>
      <rect x="560" y="540" width="90" height="66" rx="10" fill="#c9995c"/><rect x="560" y="534" width="90" height="18" rx="9" fill="#e0b87a"/>
      <circle cx="740" cy="580" r="40" fill="#9fbf88"/><circle cx="740" cy="570" r="36" fill="#bcd8a4"/>
      <path d="M 585 470 q 15 -30 30 0 q 15 30 30 0" stroke="#c46a80" stroke-width="5" fill="none"/>
      ${sparkle(360, 420, 12)}${sparkle(830, 440, 14)}${sparkle(600, 380, 10)}`;
  },
  camera(rnd) {
    return `
      <ellipse cx="600" cy="700" rx="250" ry="30" fill="rgba(40,25,12,0.2)"/>
      <rect x="360" y="380" width="480" height="300" rx="26" fill="#4a4440"/>
      <rect x="360" y="380" width="480" height="60" rx="26" fill="#5c554f"/>
      <rect x="530" y="330" width="140" height="70" rx="12" fill="#4a4440"/>
      <circle cx="600" cy="530" r="110" fill="#2c2825"/><circle cx="600" cy="530" r="88" fill="#3c4a58"/><circle cx="600" cy="530" r="60" fill="#22303c"/>
      <circle cx="570" cy="500" r="20" fill="rgba(255,255,255,0.25)"/>
      <circle cx="790" cy="420" r="12" fill="#e8b44a"/>
      <rect x="395" y="405" width="70" height="26" rx="12" fill="#7c736a"/>
      ${sparkle(350, 300, 13)}${sparkle(860, 320, 11)}`;
  },
  film(rnd) {
    return `
      <ellipse cx="600" cy="700" rx="270" ry="30" fill="rgba(40,25,12,0.2)"/>
      <rect x="330" y="420" width="380" height="240" rx="20" fill="#4a4440"/>
      <path d="M 710 490 L 830 430 L 830 650 L 710 590 Z" fill="#5c554f"/>
      <circle cx="450" cy="380" r="66" fill="#4a4440"/><circle cx="450" cy="380" r="30" fill="#2c2825"/>
      <circle cx="590" cy="380" r="52" fill="#4a4440"/><circle cx="590" cy="380" r="22" fill="#2c2825"/>
      <circle cx="470" cy="540" r="54" fill="#3c4a58"/><circle cx="470" cy="540" r="34" fill="#22303c"/>
      <rect x="850" y="330" width="60" height="380" rx="8" fill="rgba(252,248,238,0.85)"/>
      <g fill="#4a4440">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="864" y="${348 + i * 60}" width="32" height="36" rx="4"/>`).join("")}</g>
      ${sparkle(320, 300, 12)}`;
  },
  audio(rnd) {
    let eq = "";
    const hts = [60, 110, 160, 120, 200, 150, 90, 170, 130, 80];
    for (let i = 0; i < 10; i++) eq += `<rect x="${420 + i * 40}" y="${640 - hts[i]}" width="22" height="${hts[i]}" rx="10" fill="rgba(255,220,150,${0.5 + (i % 3) * 0.16})"/>`;
    return `
      <polygon points="240,80 140,420 420,420" fill="rgba(255,235,180,0.14)"/>
      <polygon points="960,80 780,420 1060,420" fill="rgba(255,235,180,0.14)"/>
      <circle cx="240" cy="86" r="26" fill="#5c554f"/><circle cx="960" cy="86" r="26" fill="#5c554f"/>
      <rect x="180" y="360" width="200" height="300" rx="18" fill="#4a4440"/>
      <circle cx="280" cy="450" r="46" fill="#2c2825"/><circle cx="280" cy="450" r="26" fill="#5c554f"/>
      <circle cx="280" cy="580" r="62" fill="#2c2825"/><circle cx="280" cy="580" r="38" fill="#5c554f"/>
      ${eq}
      <path d="M 880 460 q 0 -70 44 -60 l 0 130 q 0 34 -30 34 q -30 0 -30 -26 q 0 -26 30 -26 l 30 0" fill="none" stroke="#f3d98a" stroke-width="10" stroke-linecap="round"/>
      ${sparkle(700, 260, 13)}${sparkle(1020, 550, 10)}`;
  },
  mic(rnd) {
    return `
      <polygon points="600,60 380,560 820,560" fill="rgba(255,240,200,0.16)"/>
      <ellipse cx="600" cy="730" rx="180" ry="24" fill="rgba(40,25,12,0.25)"/>
      <ellipse cx="600" cy="718" rx="130" ry="18" fill="#4a4440"/>
      <rect x="592" y="430" width="16" height="290" fill="#5c554f"/>
      <rect x="576" y="380" width="48" height="80" rx="18" fill="#4a4440"/>
      <circle cx="600" cy="340" r="58" fill="#7c736a"/>
      <g stroke="rgba(40,34,30,0.6)" stroke-width="3">${[-36, -18, 0, 18, 36].map((d) => `<line x1="${600 + d}" y1="292" x2="${600 + d}" y2="388"/>`).join("")}${[-36, -12, 12, 36].map((d) => `<line x1="546" y1="${340 + d}" x2="654" y2="${340 + d}"/>`).join("")}</g>
      ${sparkle(430, 240, 12)}${sparkle(780, 280, 10)}`;
  },
  bus(rnd, taxi) {
    return taxi ? `
      <ellipse cx="600" cy="700" rx="330" ry="34" fill="rgba(40,25,12,0.22)"/>
      <path d="M 300 640 L 300 560 Q 300 530 340 526 L 420 520 L 500 440 Q 512 428 536 428 L 780 428 Q 804 428 818 446 L 880 520 L 940 530 Q 970 536 970 566 L 970 640 Q 970 660 944 660 L 326 660 Q 300 660 300 640 Z" fill="#f2c94c"/>
      <path d="M 520 452 L 620 452 L 620 518 L 470 518 Z M 648 452 L 774 452 Q 788 452 796 464 L 840 518 L 648 518 Z" fill="#dff0f4"/>
      <rect x="560" y="392" width="140" height="44" rx="10" fill="#3c3a36"/><text x="630" y="424" font-size="26" text-anchor="middle" fill="#f2c94c" font-family="sans-serif" font-weight="bold">TAXI</text>
      <circle cx="430" cy="660" r="52" fill="#33302c"/><circle cx="430" cy="660" r="26" fill="#8f8a82"/>
      <circle cx="840" cy="660" r="52" fill="#33302c"/><circle cx="840" cy="660" r="26" fill="#8f8a82"/>
      <rect x="300" y="586" width="670" height="14" fill="rgba(60,56,50,0.35)"/>
      ${sparkle(330, 330, 12)}${sparkle(900, 300, 13)}`
      : `
      <ellipse cx="600" cy="712" rx="380" ry="36" fill="rgba(40,25,12,0.22)"/>
      <rect x="230" y="380" width="740" height="290" rx="34" fill="#fbf6ea"/>
      <rect x="230" y="380" width="740" height="80" rx="34" fill="#c46a80"/>
      <g fill="#dff0f4" stroke="#b8ccd4" stroke-width="3">${[0, 1, 2, 3, 4].map((i) => `<rect x="${268 + i * 140}" y="470" width="104" height="86" rx="12"/>`).join("")}</g>
      <rect x="230" y="590" width="740" height="16" fill="#caa45a"/>
      <circle cx="380" cy="680" r="54" fill="#33302c"/><circle cx="380" cy="680" r="26" fill="#8f8a82"/>
      <circle cx="820" cy="680" r="54" fill="#33302c"/><circle cx="820" cy="680" r="26" fill="#8f8a82"/>
      ${flower(940, 420, 20, "rgba(255,235,240,0.95)", "#eecb74")}
      <text x="600" y="435" font-size="30" text-anchor="middle" fill="#fdf8ee" letter-spacing="6" font-family="'Hiragino Mincho ProN',serif">WEDDING</text>
      ${sparkle(290, 300, 12)}${sparkle(920, 320, 11)}`;
  },
  beauty(rnd) {
    return `
      <ellipse cx="600" cy="720" rx="260" ry="28" fill="rgba(40,25,12,0.2)"/>
      <ellipse cx="530" cy="420" rx="150" ry="190" fill="rgba(255,250,238,0.85)" stroke="#caa45a" stroke-width="6"/>
      <ellipse cx="530" cy="420" rx="120" ry="158" fill="rgba(220,235,240,0.6)"/>
      <path d="M 505 700 L 555 700 L 545 610 L 515 610 Z" fill="#caa45a"/>
      <rect x="740" y="520" width="44" height="130" rx="10" fill="#b8485e"/>
      <path d="M 744 520 L 780 520 L 776 470 Q 762 452 748 470 Z" fill="#d87890"/>
      <rect x="830" y="560" width="90" height="90" rx="14" fill="#f2e4d0"/><circle cx="875" cy="605" r="28" fill="#e8b4c0"/>
      ${flower(430, 260, 20, "rgba(240,185,198,0.9)", "#eecb74")}
      ${sparkle(560, 400, 16)}${sparkle(800, 380, 11)}${sparkle(940, 480, 9)}`;
  },
  misc(rnd) {
    return `
      ${flower(380, 360, 42, "rgba(238,170,186,0.9)", "#eecb74")}${flower(680, 300, 34, "rgba(248,208,164,0.9)", "#eecb74")}${flower(830, 440, 38, "rgba(255,232,238,0.9)", "#eecb74")}
      <path d="M 300 560 Q 600 470 900 560" stroke="rgba(202,164,90,0.7)" stroke-width="5" fill="none"/>
      ${sparkle(600, 200, 18)}${sparkle(320, 240, 12)}${sparkle(880, 250, 13)}${sparkle(500, 640, 10)}`;
  },
};

// ---------- 品名・カテゴリ → シーン＆配色 ----------
const PALETTES = {
  cream:  { bg1: "#f6ead6", bg2: "#c9a06a" },
  rose:   { bg1: "#f8e6ea", bg2: "#c98a9c" },
  sage:   { bg1: "#e9f0e2", bg2: "#8aab7c" },
  sky:    { bg1: "#dfeef4", bg2: "#8fb0c4" },
  night:  { bg1: "#3c3450", bg2: "#181426" },
  wine:   { bg1: "#e8d6d8", bg2: "#8c4a56" },
  charcoal:{ bg1: "#57505c", bg2: "#26222c" },
  wa:     { bg1: "#f2e8d8", bg2: "#a8845c" },
};
function sceneFor(category, name, rnd) {
  const n = name;
  const t = (scene, pal, sub, arg) => ({ scene, pal, sub, arg });
  if (/ナイト|夜/.test(n) && /会場|バンケット|ホール|挙式|チャペル/.test(n)) return t("hall", "night", "NIGHT WEDDING", true);
  if (/チャペル|人前式|挙式/.test(n)) return t("chapel", "cream", "CHAPEL");
  if (/神前|和婚/.test(n)) return t("chapel", "wa", "SHINTO CEREMONY");
  if (/ガーデン/.test(n)) return t("garden", "sage", "GARDEN");
  if (/控室|ブライズルーム|会食室/.test(n)) return t("waitingRoom", "cream", "PRIVATE ROOM");
  if (/会場|バンケット|ホール|貸切|披露宴|ウェルカム|コーディネート料|設営/.test(n)) return t("hall", "cream", "BANQUET");
  if (/白無垢|色打掛|打掛|振袖|留袖|着物|和装/.test(n)) return t("kimono", "wa", "KIMONO");
  if (/紋付|袴/.test(n)) return t("kimono", "charcoal", "MONTSUKI", "#efe8dc");
  if (/タキシード|モーニング|スーツ/.test(n)) return t("tuxedo", "charcoal", "TUXEDO");
  if (/ドレス|ガウン|トレーン|ライン/.test(n)) return t("dress", "rose", "WEDDING DRESS");
  if (/ボレロ|ベール|ティアラ|アクセサリー|小物|ネックレス|リングピロー/.test(n)) return t("beauty", "rose", "ACCESSORY");
  if (/ブーケ|ブートニア|花束/.test(n)) return t("bouquet", "rose", "BOUQUET");
  if (/フラワーシャワー|花びら/.test(n)) return t("garden", "rose", "FLOWER SHOWER");
  if (/装花|高砂|生花|フラワー/.test(n)) return t("arrangement", "sage", "FLOWERS");
  if (/ケーキ/.test(n)) return t("cake", "rose", "WEDDING CAKE");
  if (/ドリンク|乾杯|シャンパン|ワイン|酒/.test(n)) return t("drink", "night", "TOAST");
  if (/和食|会席|和三盆|和菓子/.test(n)) return t("cuisine", "wa", "JAPANESE CUISINE", "wa");
  if (/コース|料理|ビュッフェ|フレンチ|グリル|ディナー|メニュー(?!表)/.test(n)) return t("cuisine", "cream", "CUISINE");
  if (/引菓子|スイーツ|菓子|マドレーヌ|デザート/.test(n)) return t("sweets", "rose", "SWEETS");
  if (/タオル|カタログギフト|引出物|縁起物|名入れ|ギフト|セット/.test(n) && category === "gift") return t("gift", "cream", "GIFT");
  if (/招待状|席次|席札|メニュー表|プロフィール|ペーパー|印刷/.test(n)) return t("paper", "cream", "STATIONERY");
  if (/アルバム|写真|フォト|前撮り|撮影(?!.*映像)/.test(n)) return t("camera", "charcoal", "PHOTOGRAPHY");
  if (/エンドロール|ムービー|映像|ビデオ|上映|プロジェクター|スクリーン/.test(n)) return t("film", "charcoal", "CINEMA");
  if (/タクシー|ハイヤー/.test(n)) return t("bus", "cream", "TAXI", true);
  if (/バス|送迎/.test(n)) return t("bus", "sky", "SHUTTLE BUS");
  if (/司会/.test(n)) return t("mic", "night", "MASTER OF CEREMONY");
  if (/音響|照明|オペレーター|ライト|マイク(?!ロ)|スピーカー|BGM/.test(n)) return t("audio", "night", "SOUND & LIGHT");
  if (/ヘアメイク|メイク|エステ|ネイル|着付|美容/.test(n)) return t("beauty", "rose", "BEAUTY");
  const byCat = {
    venue: t("hall", "cream", "BANQUET"), ceremony: t("chapel", "cream", "CEREMONY"),
    catering: t("cuisine", "cream", "CUISINE"), dress: t("dress", "rose", "DRESS"),
    beauty: t("beauty", "rose", "BEAUTY"), florist: t("bouquet", "sage", "FLOWERS"),
    photo: t("camera", "charcoal", "PHOTOGRAPHY"), video: t("film", "charcoal", "CINEMA"),
    mc: t("mic", "night", "MC"), audio: t("audio", "night", "SOUND & LIGHT"),
    print: t("paper", "cream", "STATIONERY"), gift: t("gift", "cream", "GIFT"),
    transport: t("bus", "sky", "TRANSPORT"),
  };
  return byCat[category] || t("misc", "cream", "WEDDING");
}

// ---------- メイン ----------
module.exports = { SCENES, PALETTES, sceneFor, frame, seeded, hashCode }; // テスト・プレビュー用

if (require.main === module) (async () => {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const items = await prisma.catalogItem.findMany({
    include: { vendor: { select: { name: true } } },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
  let done = 0;
  for (const it of items) {
    const rnd = seeded(hashCode(it.id + it.name));
    const { scene, pal, sub, arg } = sceneFor(it.category, it.name, rnd);
    const palette = PALETTES[pal] || PALETTES.cream;
    const inner = SCENES[scene](rnd, arg);
    const svg = frame(inner, { ...palette, title: it.name, sub });

    const key = `${randomUUID()}.svg`;
    fs.writeFileSync(path.join(UPLOAD_DIR, key), svg, "utf8");
    const olds = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: it.id } });
    for (const o of olds) {
      try { fs.rmSync(path.join(UPLOAD_DIR, o.fileKey), { force: true }); } catch { /* ignore */ }
      await prisma.attachment.delete({ where: { id: o.id } });
    }
    await prisma.attachment.create({
      data: { parentType: "catalog", parentId: it.id, fileKey: key, fileName: `${it.name}.svg`, mime: "image/svg+xml" },
    });
    done++;
    console.log(`🎨 ${done}/${items.length} ${it.vendor?.name ?? "式場"} / ${it.name} → ${scene}(${pal})`);
  }
  console.log(`\n完了：生成アートに差替 ${done}件`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
