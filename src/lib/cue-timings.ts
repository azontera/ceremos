// 音楽を流すタイミングのプリセット（楽曲タブ・再生プレイヤー共通）
// 選択肢に無いものは「✏️ 自由入力」で任意の文言を保存できる
/** シーンから標準的な「流すタイミング」を自動選択（曲枠の新規作成時に適用。後から変更可） */
export function defaultCueForScene(scene: string): string {
  switch (scene) {
    case "chapel": return "キャプテン指示で";
    case "entrance": return "扉オープンと同時";
    case "reentry": return "扉オープンと同時";
    case "toast": return "乾杯の発声と同時";
    case "cake": return "ケーキ入刀と同時";
    case "leave": return "司会コメント終わりで";
    case "bouquet": return "司会コメント終わりで";
    case "farewell": return "時間どおり（進行時刻で）";
    default: return "時間どおり（進行時刻で）";
  }
}

export const CUE_TIMINGS = [
  "時間どおり（進行時刻で）",
  "曲先（曲スタート→動き出し）",
  "板付き（新郎新婦スタンバイ確認後）",
  "扉オープンと同時",
  "入場と同時",
  "キャプテン指示で",
  "司会コメント終わりで",
  "司会紹介にかぶせて",
  "乾杯の発声と同時",
  "ケーキ入刀と同時",
  "照明チェンジと同時",
  "映像終わりで",
];
