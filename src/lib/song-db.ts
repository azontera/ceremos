// シーン別・定番BGMデータベース（おすすめ10曲のソース）
// ここに追記すれば候補が増えます。将来的に外部DB（数千曲）やAI検索への差し替えを想定した構造。
// memo は音響オペレーション上の定番の使い方。

export type SuggestSong = {
  scene: string;   // entrance / toast / cake / leave / reentry / bouquet / farewell / party / ceremony
  title: string;
  artist: string;
  memo?: string;
  variant?: boolean; // アレンジ版（ピアノver.等。検索では出すが、おすすめでは原曲を優先）
};

// ===== 大規模DB（約2万曲）：scripts/generate-song-db.cjs で生成 =====
// 邦楽・洋楽の定番＋映画/ディズニー/ジブリ＋ジャズ＋クラシック＋婚礼BGM定番アレンジ
import LARGE_RAW from "./song-db-large.json";
const SONG_DB_LARGE: SuggestSong[] = (LARGE_RAW as { s: string; t: string; a: string; v?: number }[])
  .map((x) => ({ scene: x.s, title: x.t, artist: x.a, variant: !!x.v }));
export const SONG_DB_SIZE_TOTAL = SONG_DB_LARGE.length; // +curated（下のSONG_DB）

export const SCENE_LABELS: Record<string, string> = {
  chapel: "チャペル挙式", entrance: "入場", toast: "乾杯", cake: "ケーキ入刀", leave: "中座",
  reentry: "再入場", bouquet: "花束・手紙", farewell: "送賓",
  party: "宴会・パーティ", ceremony: "式典",
};

export const SONG_DB: SuggestSong[] = [
  // ===== チャペル挙式（chapel） =====
  { scene: "chapel", title: "Canon in D（カノン）", artist: "Pachelbel", memo: "新婦入場の最定番" },
  { scene: "chapel", title: "Ave Maria", artist: "Schubert", memo: "厳かな入場に" },
  { scene: "chapel", title: "結婚行進曲（真夏の夜の夢）", artist: "Mendelssohn", memo: "退場の定番" },
  { scene: "chapel", title: "婚礼合唱（ローエングリン）", artist: "Wagner", memo: "新婦入場のクラシック" },
  { scene: "chapel", title: "主よ、人の望みの喜びよ", artist: "Bach", memo: "参列者入場・キャンドル点火" },
  { scene: "chapel", title: "Amazing Grace", artist: "讃美歌", memo: "聖歌隊・ソリスト向き" },
  { scene: "chapel", title: "A Whole New World", artist: "Alan Menken", memo: "カジュアルな人前式に" },
  { scene: "chapel", title: "Can You Feel the Love Tonight", artist: "Elton John", memo: "人前式の入退場" },
  { scene: "chapel", title: "オー・ハッピー・デー", artist: "ゴスペル", memo: "退場を明るく" },
  { scene: "chapel", title: "威風堂々", artist: "Elgar", memo: "格調高い退場" },
  { scene: "chapel", title: "花のワルツ（くるみ割り人形）", artist: "Tchaikovsky", memo: "参列者入場BGM" },
  { scene: "chapel", title: "Gabriel's Oboe", artist: "Ennio Morricone", memo: "指輪交換・誓約に" },

  // ===== 入場（entrance） =====
  { scene: "entrance", title: "Marry You", artist: "Bruno Mars", memo: "扉オープンと同時にサビ" },
  { scene: "entrance", title: "Can't Stop the Feeling!", artist: "Justin Timberlake", memo: "イントロからテンポよく" },
  { scene: "entrance", title: "Sugar", artist: "Maroon 5", memo: "サビ頭から" },
  { scene: "entrance", title: "愛をこめて花束を", artist: "Superfly", memo: "Aメロから" },
  { scene: "entrance", title: "CHE.R.RY", artist: "YUI", memo: "明るくカジュアルに" },
  { scene: "entrance", title: "Butterfly", artist: "木村カエラ", memo: "王道の入場曲" },
  { scene: "entrance", title: "A Thousand Miles", artist: "Vanessa Carlton", memo: "ピアノイントロから" },
  { scene: "entrance", title: "Beauty and the Beast", artist: "Ariana Grande & John Legend", memo: "ゆったり歩く演出向き" },
  { scene: "entrance", title: "Everything", artist: "MISIA", memo: "サビで扉オープン" },
  { scene: "entrance", title: "ありがとう", artist: "いきものがかり", memo: "あたたかい雰囲気に" },
  { scene: "entrance", title: "Paradise", artist: "Coldplay", memo: "壮大な入場に" },
  { scene: "entrance", title: "Love so sweet", artist: "嵐", memo: "サビ頭から" },
  { scene: "entrance", title: "君は薔薇より美しい", artist: "布施明", memo: "再入場のネタ枠にも" },
  { scene: "entrance", title: "Dear Bride", artist: "西野カナ", memo: "花嫁テーマの定番" },
  { scene: "entrance", title: "SUN", artist: "星野源", memo: "軽快に" },
  { scene: "entrance", title: "Wherever you are", artist: "ONE OK ROCK", memo: "サビで扉オープン" },
  { scene: "entrance", title: "アイノカタチ", artist: "MISIA feat. HIDE", memo: "感動系の入場に" },
  { scene: "entrance", title: "Wedding March（結婚行進曲）", artist: "Mendelssohn", memo: "挙式退場・クラシック演出" },
  { scene: "entrance", title: "Canon in D", artist: "Pachelbel", memo: "挙式入場のクラシック定番" },
  { scene: "entrance", title: "オールドファッション", artist: "back number", memo: "しっとり入場" },

  // ===== 乾杯（toast） =====
  { scene: "toast", title: "Sugar", artist: "Maroon 5", memo: "発声と同時に頭から30秒" },
  { scene: "toast", title: "ハピネス", artist: "AI", memo: "サビから" },
  { scene: "toast", title: "Paradise Has No Border", artist: "東京スカパラダイスオーケストラ", memo: "ホーンで華やかに" },
  { scene: "toast", title: "乾杯", artist: "長渕剛", memo: "ベタだが世代に刺さる" },
  { scene: "toast", title: "Celebration", artist: "Kool & The Gang", memo: "発声→頭から" },
  { scene: "toast", title: "I Gotta Feeling", artist: "The Black Eyed Peas", memo: "サビから30秒" },
  { scene: "toast", title: "ultra soul", artist: "B'z", memo: "「ウルトラソウル！」で発声" },
  { scene: "toast", title: "何なんw", artist: "藤井風", memo: "カジュアルな会に" },
  { scene: "toast", title: "Happy", artist: "Pharrell Williams", memo: "サビから" },
  { scene: "toast", title: "君と作る未来", artist: "ケツメイシ", memo: "サビから" },
  { scene: "toast", title: "小さな恋のうた", artist: "MONGOL800", memo: "サビ頭で乾杯" },
  { scene: "toast", title: "Uptown Funk", artist: "Mark Ronson ft. Bruno Mars", memo: "ノリ重視" },
  { scene: "toast", title: "ようこそ日本へ", artist: "掛け声のみ・SEなし", memo: "和婚は太鼓SEも定番" },
  { scene: "toast", title: "宴", artist: "湘南乃風", memo: "盛り上げ枠" },
  { scene: "toast", title: "Shake It Off", artist: "Taylor Swift", memo: "サビから" },

  // ===== ケーキ入刀（cake） =====
  { scene: "cake", title: "I Was Born To Love You", artist: "Queen", memo: "入刀の瞬間にサビ・最定番" },
  { scene: "cake", title: "君って", artist: "西野カナ", memo: "サビから" },
  { scene: "cake", title: "Kiss Me", artist: "Sixpence None The Richer", memo: "ファーストバイトに" },
  { scene: "cake", title: "チョコレイト・ディスコ", artist: "Perfume", memo: "ポップに" },
  { scene: "cake", title: "Sugar Sugar", artist: "The Archies", memo: "レトロ可愛く" },
  { scene: "cake", title: "How Sweet It Is", artist: "James Taylor", memo: "洋楽で軽快に" },
  { scene: "cake", title: "恋", artist: "星野源", memo: "入刀→フォトラウンドまで" },
  { scene: "cake", title: "Love Never Felt So Good", artist: "Michael Jackson", memo: "軽快・上品" },
  { scene: "cake", title: "世界に一つだけの花", artist: "SMAP", memo: "世代広く" },
  { scene: "cake", title: "Marshmallow day", artist: "Mr.Children", memo: "甘い演出に" },
  { scene: "cake", title: "Candy", artist: "Robbie Williams", memo: "ポップに" },
  { scene: "cake", title: "バンザイ〜好きでよかった〜", artist: "ウルフルズ", memo: "入刀でサビ" },

  // ===== 中座（leave） =====
  { scene: "leave", title: "やさしさで溢れるように", artist: "JUJU", memo: "母親エスコートの定番" },
  { scene: "leave", title: "ハナミズキ", artist: "一青窈", memo: "しっとりと" },
  { scene: "leave", title: "糸", artist: "中島みゆき", memo: "家族エスコートに" },
  { scene: "leave", title: "365日", artist: "Mr.Children", memo: "ゆったり退場" },
  { scene: "leave", title: "Story", artist: "AI", memo: "友人エスコートにも" },
  { scene: "leave", title: "にじいろ", artist: "絢香", memo: "明るめの中座" },
  { scene: "leave", title: "ひまわりの約束", artist: "秦基博", memo: "兄弟姉妹エスコート" },
  { scene: "leave", title: "未来へ", artist: "Kiroro", memo: "母親テーマの王道" },
  { scene: "leave", title: "Just the Way You Are", artist: "Bruno Mars", memo: "軽やかに" },
  { scene: "leave", title: "family song", artist: "星野源", memo: "家族エスコート" },
  { scene: "leave", title: "キセキ", artist: "GReeeeN", memo: "友人と退場も可" },
  { scene: "leave", title: "Have a nice day", artist: "西野カナ", memo: "ポップな中座" },

  // ===== 再入場（reentry） =====
  { scene: "reentry", title: "Viva La Vida", artist: "Coldplay", memo: "照明演出と同期・要リハ" },
  { scene: "reentry", title: "Beautiful Day", artist: "U2", memo: "扉オープンでサビ" },
  { scene: "reentry", title: "前前前世", artist: "RADWIMPS", memo: "キャンドル点灯と同時" },
  { scene: "reentry", title: "Runner", artist: "サンボマスター", memo: "熱量高めに" },
  { scene: "reentry", title: "花火", artist: "三代目 J SOUL BROTHERS", memo: "キャンドルサービスに" },
  { scene: "reentry", title: "Best Day Of My Life", artist: "American Authors", memo: "軽快に回遊" },
  { scene: "reentry", title: "GONG", artist: "WANIMA", memo: "ガーデン再入場向き" },
  { scene: "reentry", title: "Lovers", artist: "sumika", memo: "ポップな再入場" },
  { scene: "reentry", title: "On Top Of The World", artist: "Imagine Dragons", memo: "扉オープンでサビ" },
  { scene: "reentry", title: "青と夏", artist: "Mrs. GREEN APPLE", memo: "夏婚に" },
  { scene: "reentry", title: "怪獣の花唄", artist: "Vaundy", memo: "若い世代に人気" },
  { scene: "reentry", title: "Magic", artist: "Mrs. GREEN APPLE", memo: "テーブルラウンドに" },

  // ===== 花束・手紙（bouquet） =====
  { scene: "bouquet", title: "365日", artist: "Mr.Children", memo: "朗読はBGM -10dB" },
  { scene: "bouquet", title: "家族になろうよ", artist: "福山雅治", memo: "朗読前奏から・王道" },
  { scene: "bouquet", title: "ありがとう", artist: "いきものがかり", memo: "花束贈呈でサビ" },
  { scene: "bouquet", title: "手紙〜拝啓 十五の君へ〜", artist: "アンジェラ・アキ", memo: "手紙シーンに" },
  { scene: "bouquet", title: "永遠にともに", artist: "コブクロ", memo: "両親への感謝" },
  { scene: "bouquet", title: "ママへ", artist: "AI", memo: "母への手紙に" },
  { scene: "bouquet", title: "The Rose", artist: "Bette Midler", memo: "静かな朗読BGM" },
  { scene: "bouquet", title: "Letter Song", artist: "doriko", memo: "手紙テーマ" },
  { scene: "bouquet", title: "道", artist: "EXILE", memo: "感謝のシーンに" },
  { scene: "bouquet", title: "いのちの歌", artist: "竹内まりや", memo: "涙腺枠の定番" },
  { scene: "bouquet", title: "You Raise Me Up", artist: "Westlife", memo: "贈呈でサビ" },
  { scene: "bouquet", title: "オレンジ", artist: "SMAP", memo: "しっとり" },

  // ===== 送賓（farewell） =====
  { scene: "farewell", title: "One Love", artist: "嵐", memo: "ループ再生" },
  { scene: "farewell", title: "Wherever you are", artist: "ONE OK ROCK", memo: "ループ再生" },
  { scene: "farewell", title: "ありがとう", artist: "FUNKY MONKEY BABYS", memo: "明るく見送り" },
  { scene: "farewell", title: "What a Wonderful World", artist: "Louis Armstrong", memo: "上品に" },
  { scene: "farewell", title: "Thank you, Love", artist: "西野カナ", memo: "感謝テーマ" },
  { scene: "farewell", title: "ベストフレンド", artist: "Kiroro", memo: "ゲストへの感謝" },
  { scene: "farewell", title: "All You Need Is Love", artist: "The Beatles", memo: "ループ向き" },
  { scene: "farewell", title: "ハッピーエンド", artist: "back number", memo: "余韻を残す" },
  { scene: "farewell", title: "Time of Our Lives", artist: "Pitbull & Ne-Yo", memo: "パーティ感のまま" },
  { scene: "farewell", title: "感謝カンゲキ雨嵐", artist: "嵐", memo: "明るい見送り" },

  // ===== 宴会・パーティ汎用（party） =====
  { scene: "party", title: "Dancing Queen", artist: "ABBA", memo: "世代を問わず" },
  { scene: "party", title: "September", artist: "Earth, Wind & Fire", memo: "歓談BGMにも" },
  { scene: "party", title: "Don't Stop Me Now", artist: "Queen", memo: "盛り上げ" },
  { scene: "party", title: "TT", artist: "TWICE", memo: "若年層向け" },
  { scene: "party", title: "残酷な天使のテーゼ", artist: "高橋洋子", memo: "余興・カラオケ枠" },
  { scene: "party", title: "Y.M.C.A.", artist: "Village People", memo: "全員参加系" },
  { scene: "party", title: "夜に駆ける", artist: "YOASOBI", memo: "歓談〜余興" },
  { scene: "party", title: "Bling-Bang-Bang-Born", artist: "Creepy Nuts", memo: "余興に" },
  { scene: "party", title: "Mela!", artist: "緑黄色社会", memo: "歓談BGM" },
  { scene: "party", title: "彌勒（オープニングSE）", artist: "和太鼓・箏 音源", memo: "和風宴会の開宴SE" },

  // ===== 式典（ceremony） =====
  { scene: "ceremony", title: "威風堂々", artist: "Elgar", memo: "表彰・入場の定番" },
  { scene: "ceremony", title: "Fanfare（式典ファンファーレ）", artist: "SE音源", memo: "表彰の発表時" },
  { scene: "ceremony", title: "木星（Jupiter）", artist: "Holst", memo: "壮大な開式" },
  { scene: "ceremony", title: "オリンピック・ファンファーレ", artist: "John Williams", memo: "表彰式に" },
  { scene: "ceremony", title: "新世界より 第4楽章", artist: "Dvořák", memo: "格調高い入場" },
  { scene: "ceremony", title: "栄光の架橋", artist: "ゆず", memo: "功労者表彰に" },
  { scene: "ceremony", title: "Time to Say Goodbye", artist: "Sarah Brightman & Andrea Bocelli", memo: "閉式・退場" },
];

// ===== 好み診断（10問）によるスコアリング =====
export type MusicPrefs = {
  mood?: string;       // formal / casual / natural / gorgeous
  lang?: string;       // jp / en / mix
  generation?: string; // teen20 / 30s / 40s / wide
  standard?: string;   // teiban / balance / unique
  tempo?: string;      // up / ballad / balance
  classic?: string;    // yes / chapel_only / no
  genre?: string;      // jpop / rock / rnb / jazz_classic
  dupArtist?: string;  // ok / avoid
  lyrics?: string;     // jp_lyrics / any
  flashy?: string;     // ok / avoid
  groomArtists?: string; // 新郎の好きなアーティスト・曲（自由記入。選曲を強くブースト）
  brideArtists?: string; // 新婦の好きなアーティスト・曲（自由記入。選曲を強くブースト）
};

// クラシック・讃美歌系（作曲家・音源）
const CLASSIC_ARTISTS = new Set([
  "Pachelbel", "Schubert", "Mendelssohn", "Wagner", "Bach", "Elgar", "Holst",
  "Tchaikovsky", "Dvořák", "Ennio Morricone", "讃美歌", "ゴスペル", "John Williams",
  "Sarah Brightman & Andrea Bocelli", "SE音源", "和太鼓・箏 音源",
]);
// 「ど定番」タイトル
const STANDARD_TITLES = new Set([
  "Marry You", "I Was Born To Love You", "Canon in D（カノン）", "結婚行進曲（真夏の夜の夢）",
  "ハナミズキ", "糸", "家族になろうよ", "ありがとう", "Sugar", "ultra soul", "乾杯",
  "Dancing Queen", "September", "Butterfly", "やさしさで溢れるように", "365日", "One Love",
  "Amazing Grace", "Ave Maria", "未来へ", "Celebration", "Happy", "世界に一つだけの花",
  "Kiss Me", "キセキ", "威風堂々", "婚礼合唱（ローエングリン）",
]);
// アーティスト → 世代タグ（掲載外は wide 扱い）
const ERA: Record<string, string> = {
  "YOASOBI": "teen20", "Vaundy": "teen20", "Mrs. GREEN APPLE": "teen20", "Creepy Nuts": "teen20",
  "藤井風": "teen20", "sumika": "teen20", "WANIMA": "teen20", "TWICE": "teen20",
  "RADWIMPS": "teen20", "緑黄色社会": "teen20", "ONE OK ROCK": "teen20",
  "西野カナ": "30s", "GReeeeN": "30s", "星野源": "30s", "back number": "30s", "AI": "30s",
  "JUJU": "30s", "三代目 J SOUL BROTHERS": "30s", "Superfly": "30s", "嵐": "30s", "Perfume": "30s",
  "ケツメイシ": "30s", "湘南乃風": "30s", "Taylor Swift": "30s", "Bruno Mars": "30s",
  "Justin Timberlake": "30s", "Maroon 5": "30s", "Imagine Dragons": "30s", "American Authors": "30s",
  "Pitbull & Ne-Yo": "30s", "絢香": "30s", "秦基博": "30s", "コブクロ": "30s", "EXILE": "30s",
  "Mr.Children": "40s", "福山雅治": "40s", "中島みゆき": "40s", "一青窈": "40s", "Kiroro": "40s",
  "竹内まりや": "40s", "ウルフルズ": "40s", "B'z": "40s", "長渕剛": "40s", "SMAP": "40s",
  "サンボマスター": "40s", "MONGOL800": "40s", "アンジェラ・アキ": "40s", "いきものがかり": "40s",
  "FUNKY MONKEY BABYS": "40s", "高橋洋子": "40s", "布施明": "40s", "東京スカパラダイスオーケストラ": "40s",
  "YUI": "40s", "木村カエラ": "40s", "MISIA": "40s", "MISIA feat. HIDE": "30s", "ゆず": "40s",
};
const isJapanese = (s: SuggestSong) => /[぀-ヿ㐀-䶿一-鿿]/.test(s.title + s.artist);
const isClassic = (s: SuggestSong) => CLASSIC_ARTISTS.has(s.artist);

/** 好みに基づくスコア（高いほど優先） */
function scoreSong(s: SuggestSong, p: MusicPrefs, scene: string | null): number {
  let sc = 0;
  if (s.memo) sc += 2; // 厳選DB（オペレーションメモ付き）を少し優先
  const jp = isJapanese(s);
  const classic = isClassic(s);
  const std = STANDARD_TITLES.has(s.title);
  const era = ERA[s.artist] ?? "wide";
  // 邦楽・洋楽
  if (p.lang === "jp") sc += jp ? 3 : -2;
  if (p.lang === "en") sc += jp ? -2 : 3;
  // 世代
  if (p.generation && p.generation !== "wide") {
    if (era === p.generation) sc += 3;
    else if (era === "wide") sc += 1;
    else sc -= 1;
  }
  // 定番度
  if (p.standard === "teiban") sc += std ? 3 : 0;
  if (p.standard === "balance") sc += std ? 1 : 1;
  if (p.standard === "unique") sc += std ? -3 : 2;
  // クラシック
  if (p.classic === "no") sc += classic ? -6 : 0;
  if (p.classic === "chapel_only") sc += classic ? (scene === "chapel" || scene === "ceremony" ? 2 : -5) : 0;
  if (p.classic === "yes") sc += classic ? 2 : 0;
  // 雰囲気
  if (p.mood === "formal") sc += (classic || std) ? 1 : 0;
  if (p.mood === "casual") sc += classic ? -2 : 1;
  // 歌詞
  if (p.lyrics === "jp_lyrics" && (scene === "bouquet" || scene === "leave")) sc += jp ? 2 : -1;
  // 新郎新婦の好きなアーティスト・曲（自由記入）に一致 → 大きくブースト
  const fav = `${p.groomArtists ?? ""}　${p.brideArtists ?? ""}`.toLowerCase();
  if (fav.trim()) {
    if (s.artist && fav.includes(s.artist.toLowerCase())) sc += 30;
    if (s.title && fav.includes(s.title.toLowerCase())) sc += 30;
  }
  return sc;
}

/** シーン別おすすめ（好み診断があればスコア重み付け＋ランダム性で count 件） */
export function suggestSongs(
  scene: string | null,
  q: string,
  count = 10,
  prefs?: MusicPrefs | null,
  excludeArtists?: Set<string>,
): SuggestSong[] {
  let pool: SuggestSong[];
  if (q.trim()) {
    // キーワード検索：厳選DB＋大規模DB（約2万曲）の全体から。原曲を先に、アレンジ版を後に
    const k = q.trim().toLowerCase();
    const hit = (s: SuggestSong) =>
      s.title.toLowerCase().includes(k) || s.artist.toLowerCase().includes(k) || (s.memo ?? "").includes(q.trim());
    const curatedHits = SONG_DB.filter(hit);
    const seen = new Set(curatedHits.map((s) => `${s.title}|${s.artist}`));
    const largeHits = SONG_DB_LARGE.filter((s) => hit(s) && !seen.has(`${s.title}|${s.artist}`))
      .sort((a, b) => Number(a.variant) - Number(b.variant));
    pool = [...curatedHits, ...largeHits];
    if (scene) {
      // シーン一致を先頭へ（他シーンの曲も検索では出す）
      pool = [...pool.filter((s) => s.scene === scene), ...pool.filter((s) => s.scene !== scene)];
    }
    return pool.slice(0, Math.max(count, 30));
  }
  // おすすめ（検索なし）：厳選DBのシーン曲＋大規模DBの原曲（アレンジ版は除く）
  pool = SONG_DB;
  if (scene && SONG_DB.some((s) => s.scene === scene)) pool = SONG_DB.filter((s) => s.scene === scene);
  if (scene) {
    const extra = SONG_DB_LARGE.filter((s) => s.scene === scene && !s.variant);
    if (extra.length > 0) pool = [...pool, ...extra];
  }
  // 同一アーティスト回避（好み診断で「避けたい」の場合、既に採用済みのアーティストを除外）
  if (prefs?.dupArtist === "avoid" && excludeArtists && excludeArtists.size > 0) {
    const filtered = pool.filter((s) => !excludeArtists.has(s.artist));
    if (filtered.length >= Math.min(count, 5)) pool = filtered;
  }
  if (!prefs) {
    // 診断なし：純粋シャッフル
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
  }
  // 診断あり：スコア＋乱数で重み付け抽選（毎回少し変わる＝再更新で引き直せる）
  return [...pool]
    .map((s) => ({ s, w: scoreSong(s, prefs, scene) + Math.random() * 4 }))
    .sort((a, b) => b.w - a.w)
    .slice(0, count)
    .map((x) => x.s);
}
