"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Att = { id: string; fileName: string; mime: string | null };

export function AttachmentsPanel({
  caseId, parentType, parentId, attachments, canEdit,
}: { caseId: string; parentType: "case" | "meeting"; parentId?: string; attachments: Att[]; canEdit: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("parentType", parentType);
    if (parentId) fd.append("parentId", parentId);
    const res = await fetch(`/api/v1/cases/${caseId}/attachments`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error ?? `アップロードに失敗しました（HTTP ${res.status}）`);
    else router.refresh();
    setBusy(false);
  }

  async function del(id: string) {
    await fetch(`/api/v1/attachments/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      {err && <div className="form-err" style={{ marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {attachments.length === 0 && <span style={{ fontSize: 12, color: "var(--text3)" }}>添付なし</span>}
        {attachments.map((a) =>
          a.mime?.startsWith("image/") ? (
            <span key={a.id} style={{ position: "relative", display: "inline-block" }}>
              <a href={`/api/v1/attachments/${a.id}`} target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/attachments/${a.id}`} alt={a.fileName}
                  style={{ height: 72, borderRadius: 8, border: "1px solid var(--border)", display: "block" }} />
              </a>
              {canEdit && (
                <button className="pill red" style={{ position: "absolute", top: -6, right: -6, cursor: "pointer" }}
                  onClick={() => del(a.id)} title="削除">×</button>
              )}
            </span>
          ) : (
            <span key={a.id} className="pill gray" style={{ padding: "5px 10px" }}>
              <a href={`/api/v1/attachments/${a.id}`} target="_blank">📎 {a.fileName}</a>
              {canEdit && (
                <button style={{ marginLeft: 6, color: "var(--red)", cursor: "pointer" }} onClick={() => del(a.id)}>×</button>
              )}
            </span>
          ),
        )}
      </div>
      {canEdit && (
        <>
          <input ref={inputRef} type="file" style={{ display: "none" }}
            accept="image/*,.pdf,.docx,.xlsx,.pptx,.txt,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <button className="btn sm" style={{ marginTop: 8 }} disabled={busy}
            onClick={() => inputRef.current?.click()}>
            {busy ? "アップロード中…" : "＋ ファイルを添付（画像 / PDF など・10MBまで）"}
          </button>
        </>
      )}
    </div>
  );
}
