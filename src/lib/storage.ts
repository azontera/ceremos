// 添付ファイルのローカルストレージ（本番では S3 / Supabase Storage に差し替え）
import fs from "fs/promises";
import path from "path";

const DIR = path.join(process.cwd(), "storage", "uploads");

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 通常添付 10MB
export const MAX_MEDIA_SIZE = 200 * 1024 * 1024; // 本番音源・映像 200MB
export const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
];
// 本番用メディア（WAV / MP3 / MP4 / M4A / AAC）
export const MEDIA_MIME = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave",
  "audio/mp4", "audio/x-m4a", "audio/aac", "audio/flac",
  "video/mp4", "video/quicktime",
];

export async function saveFile(key: string, buf: Buffer) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, key), buf);
}

export async function deleteFile(key: string) {
  try {
    await fs.unlink(path.join(DIR, path.basename(key)));
  } catch { /* 既に無ければ無視 */ }
}

export async function readFile(key: string): Promise<Buffer | null> {
  try {
    // パストラバーサル防止
    const p = path.join(DIR, path.basename(key));
    return await fs.readFile(p);
  } catch {
    return null;
  }
}

/** ファイルの実パスとサイズ（動画・音源のストリーミング配信用） */
export async function statFile(key: string): Promise<{ path: string; size: number } | null> {
  try {
    const p = path.join(DIR, path.basename(key)); // パストラバーサル防止
    const st = await fs.stat(p);
    return st.isFile() ? { path: p, size: st.size } : null;
  } catch {
    return null;
  }
}

export function safeKey(id: string, fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  return `${id}${ext}`;
}
