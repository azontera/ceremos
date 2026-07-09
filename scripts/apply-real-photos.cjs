// ユーザー提供のAI生成写真（実写風PNG）をカタログ品目に反映する。
// 事前に `storage/photo-import/` へ画像ファイル一式を配置しておくこと（サーバー側で実行）。
// 品目名と完全一致するものだけを差し替える（誤爆防止）。マッチしない品目は既存のSVGのまま。
// 使い方: node scripts/apply-real-photos.cjs
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const SOURCE_DIR = path.join(process.cwd(), "storage", "photo-import");
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

// file → 品目名（完全一致）。同じfileを複数品目に割り当て可（例: チャペル4種で共有）
const MAP = [
  // 会場
  ["01-banquet-hall-rental.png", "披露宴会場A 利用料（4時間）"],
  ["03-garden-dessert-buffet.png", "ガーデン付バンケット 利用料（4時間）"],
  ["07-welcome-space-decoration.png", "ウェルカムスペース装飾基本料"],
  // 挙式（チャペル系4種で共有）
  ["02-chapel-ceremony.png", "チャペル挙式料（キリスト教式）"],
  ["02-chapel-ceremony.png", "チャペル挙式料（ナイト人前式）"],
  ["02-chapel-ceremony.png", "チャペル挙式料（家族式）"],
  ["02-chapel-ceremony.png", "チャペル挙式料（二部制）"],
  // 料理・ドリンク
  ["04-full-course-eclat.png", "コース料理「セレモス・クラシック」"],
  ["05-course-clair.png", "コース料理「ガーデン・シーズン」"],
  ["06-free-drink.png", "フリードリンク「スタンダード」"],
  // 衣装
  ["08-a-line-dress-clair.png", "Aラインドレス「クレール」"],
  ["09-princess-line-rose.png", "ナチュラルドレス「リーフ」"],
  ["10-tuxedo-noble.png", "タキシード「ノーブルブラック」"],
  ["11-colored-dress-mimosa.png", "シンプルドレス「エミリア」"],
  ["12-shiromuku-tsuru.png", "白無垢「瑞雲」"],
  ["19-import-dress-lumiere.png", "インポートドレス「リュミエール」"],
  ["20-classical-dress-vintage-rose.png", "クラシカルドレス「ヴィンテージローズ」"],
  ["21-two-way-dress-papillon.png", "2WAYドレス「パピヨン」"],
  ["22-bolero-accessory-set.png", "ボレロ＆アクセサリーセット"],
  ["47-colored-dress-celeste.png", "カラードレス「セレスト」"],
  ["48-princess-line-fleur.png", "プリンセスライン「フルール」"],
  ["49-empire-dress-soleil.png", "エンパイアドレス「ソレイユ」"],
  ["50-iro-uchikake-hanagasumi.png", "色打掛「花霞」"],
  ["51-long-train-blanche.png", "ロングトレーン「ブランシュ」"],
  ["52-morning-coat-grand.png", "モーニングコート「グラン」"],
  ["53-color-tuxedo-midnight.png", "カラータキシード「ミッドナイト」"],
  ["54-iro-tomesode-matsukaze.png", "色留袖「松風」"],
  ["55-mermaid-dress-adagio.png", "マーメイドドレス「アダージョ」"],
  ["56-baby-dress-ring-pillow.png", "ベビードレス＆リングピロー"],
  // 装花
  ["16-main-table-flowers.png", "メイン装花「ホワイトエレガンス」"],
  // ※17（ゲスト卓装花）はmanifest名がカタログ未登録のため割当なし
  ["23-high-table-flowers.png", "高砂装花（ハイテーブル）"],
  ["24-guest-table-flowers-alt.png", "ゲストテーブル装花（1卓）"],
  ["25-bridal-bouquet-boutonniere.png", "ブライダルブーケ＆ブートニア"],
  ["26-total-floral-coordinate.png", "会場装花トータルコーディネート"],
  ["27-wa-modern-main-flowers.png", "和モダン高砂装花"],
  ["28-mizuhiki-bouquet.png", "水引ブーケ"],
  ["29-seasonal-guest-flowers.png", "装花「四季彩」ゲスト卓（1卓）"],
  ["30-flower-shower-petals.png", "フラワーシャワー花びら（30名分）"],
  // 引出物・ギフト
  // ※13/14/15はmanifest.tsv上の名称（カタログギフト「琥珀」・今治タオルセット・焼菓子詰合せ）が
  //   カタログ未登録のため割当なし（無関係品目への誤爆をfix-photo-mapping.cjsで是正済み）
  ["31-catalog-gift-miyabi.png", "カタログギフト「雅」"],
  ["32-wasanbon-sweets.png", "引菓子「和三盆詰合せ」"],
  ["33-lucky-gift-set.png", "縁起物「鰹節・紅白麺」"],
  ["34-three-piece-gift-set.png", "引出物3点セット"],
  ["35-personalized-gift-yui.png", "名入れギフト「結（ゆい）」"],
  ["36-organic-towel-set.png", "オーガニックタオルセット"],
  ["37-sweets-box-aya.png", "スイーツBOX「彩」"],
  ["38-honey-madeleine-petit-gift.png", "プチギフト「ハニーマドレーヌ」"],
  // 撮影・映像
  ["39-wedding-photo-data.png", "挙式・披露宴 撮影（全データ）"],
  ["40-prewedding-studio.png", "前撮り（スタジオ・1着）"],
  ["41-album-20p.png", "台紙アルバム（20P）"],
  ["42-endroll-movie.png", "エンドロール撮影＆当日上映"],
  // ペーパー
  ["43-invitation.png", "招待状（1部）"],
  ["44-seating-chart.png", "席次表（1部）"],
  ["45-place-card.png", "席札（1枚）"],
  ["46-menu-profile-book.png", "メニュー表＆プロフィールブック"],
  // 送迎
  ["57-shuttle-microbus.png", "送迎マイクロバス（27名・往復）"],
  ["58-large-shuttle-bus.png", "送迎大型バス（45名・往復）"],
  ["59-guest-taxi.png", "ゲスト送迎タクシー手配（1台）"],
  ["60-private-hire-car.png", "新郎新婦ハイヤー（貸切・半日）"],
  // 家族・お子様・ペット衣装（先に scripts/seed-family-attire.cjs の実行が必要）
  ["61-black-tomesode-mother.png", "黒留袖レンタル（母親用）"],
  ["62-iro-tomesode-rental.png", "色留袖レンタル"],
  ["63-father-morning-coat.png", "父親用モーニングレンタル"],
  ["64-child-boy-suit.png", "子どもフォーマル（男の子・スーツ）"],
  ["65-child-girl-onepiece.png", "子どもフォーマル（女の子・ワンピース）"],
  ["66-baby-dress-ringboy-flowergirl.png", "ベビードレス（リングボーイ・フラワーガール）"],
  ["67-pet-tuxedo-small-dog.png", "ペット用タキシード（小型犬）"],
  ["68-pet-dress-small-dog.png", "ペット用ドレス（小型犬）"],
  ["69-pet-attendance-support.png", "ペット参列サポート（お預かり・アテンド）"],
];

(async () => {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`画像フォルダが見つかりません: ${SOURCE_DIR}`);
    console.error(`先に catalog-photo-assets-all/ の中身をこのパスへ配置してください。`);
    process.exit(1);
  }
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  let matched = 0, missingFile = 0, missingItem = 0;
  for (const [file, name] of MAP) {
    const src = path.join(SOURCE_DIR, file);
    if (!fs.existsSync(src)) { console.warn(`⚠ 画像ファイルなし: ${file}`); missingFile++; continue; }

    const item = await prisma.catalogItem.findFirst({ where: { name } });
    if (!item) { console.warn(`⚠ 品目が見つかりません: 「${name}」（seed-family-attire.cjs 未実行の可能性）`); missingItem++; continue; }

    const key = `${randomUUID()}.png`;
    fs.copyFileSync(src, path.join(UPLOAD_DIR, key));

    const olds = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: item.id } });
    for (const o of olds) {
      try { fs.rmSync(path.join(UPLOAD_DIR, o.fileKey), { force: true }); } catch { /* ignore */ }
      await prisma.attachment.delete({ where: { id: o.id } });
    }
    await prisma.attachment.create({
      data: { parentType: "catalog", parentId: item.id, fileKey: key, fileName: `${item.name}.png`, mime: "image/png" },
    });
    matched++;
    console.log(`📷 ${name} ← ${file}`);
  }
  console.log(`\n完了：反映${matched}件・画像なし${missingFile}件・品目未検出${missingItem}件`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
