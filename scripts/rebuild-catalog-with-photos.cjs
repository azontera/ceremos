// 🛍 カタログ全69品目を実写真つきで再構築する
// 使い方: node scripts/rebuild-catalog-with-photos.cjs
// ・写真は catalog-photo-assets-all/ の実画像（manifest.tsv の対応表どおり）を storage/uploads にコピーして紐付け
// ・業者が無ければ作成。同名品目が既にあれば品目はスキップ（写真が無ければ写真だけ付ける）
// ・既存データは削除しない（何度実行しても安全）
/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const ASSET_DIR = path.join(process.cwd(), "catalog-photo-assets-all");
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

// 業者マスタ（無ければ作成）
const VENDORS = {
  "ドレスサロン美翔": "dress",
  "ブライダルコスチューム花衣": "dress",
  "Maison Lumiere": "dress",
  "二光": "dress",
  "フローラ武蔵野": "florist",
  "花司アトリエ凛": "florist",
  "ギフト住吉": "gift",
  "ギフト工房結": "gift",
  "スタジオ・ルーチェ": "photo",
  "アルバ堂": "print",
};

// [写真ファイル, 品名, 業者(nullは式場品目), カテゴリ, 価格, 説明]
// 品名・価格・説明は seed-catalog / fill-empty-catalog / restore-dress-catalog / seed-transport / seed-family-attire に準拠
const ITEMS = [
  // ===== 式場品目 =====
  ["01-banquet-hall-rental.png", "披露宴会場A 利用料（4時間）", null, "venue", 200000, "最大120名。音響・照明・プロジェクター含む"],
  ["02-chapel-ceremony.png", "チャペル挙式料", null, "venue", 150000, "牧師・聖歌隊・オルガン奏者・リハーサル含む"],
  ["03-garden-dessert-buffet.png", "ガーデン利用料（デザートビュッフェ会場）", null, "venue", 80000, "屋外音響・ガーデンテーブルセット含む"],
  ["04-full-course-eclat.png", "婚礼フルコース「エクラ」（1名）", null, "catering", 18000, "全9品。オマール海老と国産牛のWメイン"],
  ["05-course-clair.png", "婚礼コース「クレール」（1名）", null, "catering", 14000, "全7品。魚・肉のWメインの定番コース"],
  ["06-free-drink.png", "フリードリンク（1名・3時間）", null, "catering", 3500, "ビール・ワイン・カクテル・ソフトドリンク"],
  ["07-welcome-space-decoration.png", "ウェルカムスペース装飾", null, "other", 20000, "受付まわりの装飾一式（お持込写真の飾り付け含む）"],
  // ===== ドレスサロン美翔 =====
  ["08-a-line-dress-clair.png", "Aラインドレス「クレール」", "ドレスサロン美翔", "dress", 250000, "オフショルダー・チャペル映えするロングトレーン"],
  ["09-princess-line-rose.png", "プリンセスライン「ローズ」", "ドレスサロン美翔", "dress", 280000, "総レース・ボリュームスカートの王道シルエット"],
  ["10-tuxedo-noble.png", "タキシード「ノーブル」", "ドレスサロン美翔", "dress", 120000, "ネイビー・スリーピース。お直し1回含む"],
  // ===== ブライダルコスチューム花衣 =====
  ["11-colored-dress-mimosa.png", "カラードレス「ミモザ」", "ブライダルコスチューム花衣", "dress", 230000, "お色直しに人気のレモンイエロー"],
  ["12-shiromuku-tsuru.png", "白無垢「鶴の舞」", "ブライダルコスチューム花衣", "dress", 190000, "正絹・綿帽子込み。神前式に"],
  // ===== ギフト住吉 =====
  ["13-catalog-gift-kohaku.png", "カタログギフト「琥珀」（1名）", "ギフト住吉", "gift", 5500, "約1,200点から選べる定番カタログ"],
  ["14-imabari-towel-set.png", "今治タオルセット", "ギフト住吉", "gift", 3300, "縁起の良い白タオル・木箱入り"],
  ["15-baked-sweets-gift.png", "焼菓子詰合せ（引菓子）", "ギフト住吉", "gift", 1500, "フィナンシェ＆クッキー12個入り"],
  // ===== フローラ武蔵野 =====
  ["16-main-table-flowers.png", "メインテーブル装花（高砂）", "フローラ武蔵野", "florist", 55000, "季節の花でボリュームたっぷりに"],
  ["17-guest-table-flowers.png", "ゲスト卓装花（1卓）", "フローラ武蔵野", "florist", 8000, "ゲステーブル用アレンジメント"],
  ["18-bouquet-boutonniere-set.png", "ブーケ・ブートニアセット", "フローラ武蔵野", "florist", 38000, "生花。挙式後は押し花加工も可（別料金）"],
  // ===== Maison Lumiere =====
  ["19-import-dress-lumiere.png", "インポートドレス「リュミエール」", "Maison Lumiere", "dress", 380000, "フランス直輸入のクチュールライン"],
  ["20-classical-dress-vintage-rose.png", "クラシカルドレス「ヴィンテージローズ」", "Maison Lumiere", "dress", 330000, "アンティークレースの気品あるドレス"],
  ["21-two-way-dress-papillon.png", "2WAYドレス「パピヨン」", "Maison Lumiere", "dress", 360000, "披露宴〜二次会まで映える2WAY仕様"],
  ["22-bolero-accessory-set.png", "ボレロ＆アクセサリーセット", "Maison Lumiere", "dress", 60000, "羽織りもの・小物一式"],
  // ===== フローラ武蔵野（追加分） =====
  ["23-high-table-flowers.png", "高砂装花（ハイテーブル）", "フローラ武蔵野", "florist", 120000, "メインテーブルの豪華装花"],
  ["24-guest-table-flowers-alt.png", "ゲストテーブル装花（1卓）", "フローラ武蔵野", "florist", 8000, "卓上のコーディネート花"],
  ["25-bridal-bouquet-boutonniere.png", "ブライダルブーケ＆ブートニア", "フローラ武蔵野", "florist", 25000, "生花のブーケ＆ブートニアセット"],
  ["26-total-floral-coordinate.png", "会場装花トータルコーディネート", "フローラ武蔵野", "florist", 200000, "入口〜会場までの装花一式"],
  // ===== 花司アトリエ凛 =====
  ["27-wa-modern-main-flowers.png", "和モダン高砂装花", "花司アトリエ凛", "florist", 130000, "和の花材を活かした高砂装花"],
  ["28-mizuhiki-bouquet.png", "水引ブーケ", "花司アトリエ凛", "florist", 22000, "和婚に映える水引×生花のブーケ"],
  ["29-seasonal-guest-flowers.png", "装花「四季彩」ゲスト卓（1卓）", "花司アトリエ凛", "florist", 9000, "季節の花のテーブル装花"],
  ["30-flower-shower-petals.png", "フラワーシャワー花びら（30名分）", "花司アトリエ凛", "florist", 18000, "退場演出用の花びら"],
  // ===== ギフト住吉（追加分） =====
  ["31-catalog-gift-miyabi.png", "カタログギフト「雅」", "ギフト住吉", "gift", 5500, "人気の選べるカタログギフト"],
  ["32-wasanbon-sweets.png", "引菓子「和三盆詰合せ」", "ギフト住吉", "gift", 1800, "上品な和のお菓子"],
  ["33-lucky-gift-set.png", "縁起物「鰹節・紅白麺」", "ギフト住吉", "gift", 1200, "定番の縁起物"],
  ["34-three-piece-gift-set.png", "引出物3点セット", "ギフト住吉", "gift", 8000, "メイン＋引菓子＋縁起物のセット"],
  // ===== ギフト工房結 =====
  ["35-personalized-gift-yui.png", "名入れギフト「結（ゆい）」", "ギフト工房結", "gift", 4800, "名入れの記念ギフト"],
  ["36-organic-towel-set.png", "オーガニックタオルセット", "ギフト工房結", "gift", 3500, "上質な今治タオルのセット"],
  ["37-sweets-box-aya.png", "スイーツBOX「彩」", "ギフト工房結", "gift", 2200, "焼き菓子アソート"],
  ["38-honey-madeleine-petit-gift.png", "プチギフト「ハニーマドレーヌ」", "ギフト工房結", "gift", 300, "お見送りのプチギフト"],
  // ===== スタジオ・ルーチェ =====
  ["39-wedding-photo-data.png", "挙式・披露宴 撮影（全データ）", "スタジオ・ルーチェ", "photo", 180000, "当日撮影＋全カットデータ納品"],
  ["40-prewedding-studio.png", "前撮り（スタジオ・1着）", "スタジオ・ルーチェ", "photo", 80000, "記念の前撮り撮影"],
  ["41-album-20p.png", "台紙アルバム（20P）", "スタジオ・ルーチェ", "photo", 120000, "高級台紙アルバム"],
  ["42-endroll-movie.png", "エンドロール撮影＆当日上映", "スタジオ・ルーチェ", "photo", 90000, "当日撮影のエンドロールムービー"],
  // ===== アルバ堂 =====
  ["43-invitation.png", "招待状（1部）", "アルバ堂", "print", 400, "印刷・封入込みの招待状"],
  ["44-seating-chart.png", "席次表（1部）", "アルバ堂", "print", 500, "会場レイアウト入りの席次表"],
  ["45-place-card.png", "席札（1枚）", "アルバ堂", "print", 150, "お名前入りの席札"],
  ["46-menu-profile-book.png", "メニュー表＆プロフィールブック", "アルバ堂", "print", 800, "当日の読み物一式"],
  // ===== ブライダルコスチューム花衣（追加分） =====
  ["47-colored-dress-celeste.png", "カラードレス「セレスト」", "ブライダルコスチューム花衣", "dress", 290000, "深いブルーのサテンが映えるロングドレス"],
  ["48-princess-line-fleur.png", "プリンセスライン「フルール」", "ブライダルコスチューム花衣", "dress", 340000, "ボリュームチュールの主役級ドレス"],
  ["49-empire-dress-soleil.png", "エンパイアドレス「ソレイユ」", "ブライダルコスチューム花衣", "dress", 260000, "高めの切り替えで軽やかな印象のドレス"],
  ["50-iro-uchikake-hanagasumi.png", "色打掛「花霞」", "ブライダルコスチューム花衣", "dress", 350000, "桜文様の華やかな色打掛（和装）"],
  ["51-long-train-blanche.png", "ロングトレーン「ブランシュ」", "ブライダルコスチューム花衣", "dress", 310000, "大聖堂式に映える長いトレーンのドレス"],
  // ===== 二光 =====
  ["52-morning-coat-grand.png", "モーニングコート「グラン」", "二光", "dress", 140000, "新郎・親御様の昼の正礼装"],
  ["53-color-tuxedo-midnight.png", "カラータキシード「ミッドナイト」", "二光", "dress", 150000, "濃紺のスタイリッシュなタキシード"],
  ["54-iro-tomesode-matsukaze.png", "色留袖「松風」", "二光", "dress", 180000, "ご親族の和装フォーマル"],
  ["55-mermaid-dress-adagio.png", "マーメイドドレス「アダージョ」", "二光", "dress", 300000, "体のラインを美しく見せるマーメイドライン"],
  ["56-baby-dress-ring-pillow.png", "ベビードレス＆リングピロー", "二光", "dress", 45000, "お子様の衣装・演出小物セット"],
  // ===== 送迎（式場品目） =====
  ["57-shuttle-microbus.png", "送迎マイクロバス（27名・往復）", null, "transport", 66000, "最寄駅〜式場のゲスト送迎。運転手付き・往復"],
  ["58-large-shuttle-bus.png", "送迎大型バス（45名・往復）", null, "transport", 110000, "遠方ゲストの一括送迎に。運転手付き・往復"],
  ["59-guest-taxi.png", "ゲスト送迎タクシー手配（1台）", null, "transport", 8000, "ご年配・お身体の不自由なゲストの個別送迎"],
  ["60-private-hire-car.png", "新郎新婦ハイヤー（貸切・半日）", null, "transport", 38000, "挙式前後の移動・お見送りまで専属"],
  // ===== 親族・お子様・ペット衣装（式場品目） =====
  ["61-black-tomesode-mother.png", "黒留袖レンタル（母親用）", null, "dress", 45000, "ご両親の正礼装。着付け別途"],
  ["62-iro-tomesode-rental.png", "色留袖レンタル", null, "dress", 40000, "母親・親族女性の準礼装。着付け別途"],
  ["63-father-morning-coat.png", "父親用モーニングレンタル", null, "dress", 30000, "父親の正礼装。ベスト・アスコットタイ付き"],
  ["64-child-boy-suit.png", "子どもフォーマル（男の子・スーツ）", null, "dress", 12000, "リングボーイ等に。3〜8歳対応"],
  ["65-child-girl-onepiece.png", "子どもフォーマル（女の子・ワンピース）", null, "dress", 12000, "フラワーガール等に。3〜8歳対応"],
  ["66-baby-dress-ringboy-flowergirl.png", "ベビードレス（リングボーイ・フラワーガール）", null, "dress", 8000, "1〜3歳向けの小さめサイズ"],
  ["67-pet-tuxedo-small-dog.png", "ペット用タキシード（小型犬）", null, "dress", 6000, "チワワ〜Mダックス程度のサイズ"],
  ["68-pet-dress-small-dog.png", "ペット用ドレス（小型犬）", null, "dress", 6000, "チワワ〜Mダックス程度のサイズ"],
  ["69-pet-attendance-support.png", "ペット参列サポート（お預かり・アテンド）", null, "dress", 15000, "式中〜披露宴のお預かり・誘導スタッフ"],
];

async function attachPhoto(itemId, assetFile, itemName) {
  const src = path.join(ASSET_DIR, assetFile);
  if (!fs.existsSync(src)) { console.log(`  ⚠ 写真なし: ${assetFile}`); return false; }
  const olds = await prisma.attachment.findMany({ where: { parentType: "catalog", parentId: itemId } });
  for (const o of olds) {
    try { fs.rmSync(path.join(UPLOAD_DIR, o.fileKey), { force: true }); } catch {}
    await prisma.attachment.delete({ where: { id: o.id } });
  }
  const key = `${randomUUID()}.png`;
  fs.copyFileSync(src, path.join(UPLOAD_DIR, key));
  const stat = fs.statSync(path.join(UPLOAD_DIR, key));
  await prisma.attachment.create({
    data: { parentType: "catalog", parentId: itemId, fileKey: key, fileName: `${itemName}.png`, mime: "image/png", size: stat.size },
  });
  return true;
}

async function main() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const vendorIds = {};
  for (const [name, category] of Object.entries(VENDORS)) {
    let v = await prisma.vendor.findFirst({ where: { name } });
    if (!v) { v = await prisma.vendor.create({ data: { name, category } }); console.log(`＋ 業者を作成: ${name}（${category}）`); }
    vendorIds[name] = v.id;
  }

  let created = 0, photoOnly = 0, skipped = 0;
  const sortCounter = {};
  for (const [file, name, vendorName, category, price, desc] of ITEMS) {
    const vendorId = vendorName ? vendorIds[vendorName] : null;
    const sortKey = `${vendorName ?? "venue"}:${category}`;
    sortCounter[sortKey] = (sortCounter[sortKey] ?? 0) + 1;

    let item = await prisma.catalogItem.findFirst({ where: { name, vendorId } });
    if (!item) {
      item = await prisma.catalogItem.create({
        data: { vendorId, category, name, desc, price, sortOrder: sortCounter[sortKey] },
      });
      await attachPhoto(item.id, file, name);
      created++;
      console.log(`＋ ${vendorName ?? "式場"} / ${name}（¥${price.toLocaleString("ja-JP")}・写真つき）`);
    } else {
      const hasPhoto = await prisma.attachment.findFirst({ where: { parentType: "catalog", parentId: item.id } });
      if (!hasPhoto) { await attachPhoto(item.id, file, name); photoOnly++; console.log(`📷 写真のみ追加: ${name}`); }
      else { skipped++; }
    }
  }

  const total = await prisma.catalogItem.count();
  const active = await prisma.catalogItem.count({ where: { isActive: true } });
  const photos = await prisma.attachment.count({ where: { parentType: "catalog" } });
  console.log(`\n完了 🎉 新規${created}件・写真追加${photoOnly}件・スキップ${skipped}件`);
  console.log(`カタログ品目: 合計${total}件（公開${active}件）／ 写真${photos}枚`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
