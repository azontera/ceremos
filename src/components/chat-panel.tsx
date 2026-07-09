"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type Msg = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  readByOthers: boolean;
  threadParentId?: string | null;
  parentPreview?: string | null;
  reactions?: { emoji: string; count: number; mine: boolean }[];
  attachments?: { id: string; fileName: string; mime: string | null }[];
};

const EMOJIS = ["👍", "❤️", "🎉", "😂", "🙏", "✅"];

export function ChatPanel({
  caseId, meId, height,
}: { caseId: string; meId: string; height?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const countRef = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/cases/${caseId}/messages`, { cache: "no-store" });
    if (!res.ok) return;
    const { messages: ms } = await res.json();
    setMessages(ms);
    setLoaded(true);
    if (ms.length !== countRef.current) {
      countRef.current = ms.length;
      fetch(`/api/v1/cases/${caseId}/messages/read`, { method: "POST" });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [caseId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000); // 簡易リアルタイム（4秒ポーリング）
    return () => clearInterval(timer);
  }, [load]);

  async function sendFile(file: File) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("parentType", "chat");
    const res = await fetch(`/api/v1/cases/${caseId}/attachments`, { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "アップロードに失敗しました");
    }
    await load();
    setBusy(false);
  }

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const res = await fetch(`/api/v1/cases/${caseId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, threadParentId: replyTo?.id ?? null }),
    });
    if (res.ok) {
      setText("");
      setReplyTo(null);
      await load();
    }
    setBusy(false);
  }

  async function react(msgId: string, emoji: string) {
    setPickerFor(null);
    await fetch(`/api/v1/messages/${msgId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    await load();
  }

  const q = query.trim();
  const visible = q ? messages.filter((m) => m.body.includes(q) || m.senderName.includes(q)) : messages;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: height ?? "calc(100vh - 300px)", minHeight: 380 }}>
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
        <input className="form-input" style={{ flex: 1, padding: "6px 12px" }}
          placeholder="🔍 メッセージを検索…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {q && <span className="pill gray">{visible.length}件ヒット</span>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {!loaded && <div className="empty">読み込み中…</div>}
        {loaded && visible.length === 0 && <div className="empty">{q ? "該当するメッセージがありません" : "メッセージはまだありません"}</div>}
        {visible.map((m) => (
          <div className={`msg ${m.senderId === meId ? "me" : ""}`} key={m.id}>
            <div className="avatar" style={{ background: m.senderId === meId ? "var(--blue)" : "var(--accent)" }}>
              {m.senderName.charAt(0)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="meta">
                {m.senderName} ・{" "}
                {new Date(m.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {m.senderId === meId && m.readByOthers && <span style={{ marginLeft: 6 }}>既読</span>}
              </div>
              {m.parentPreview && (
                <div style={{ fontSize: 11, color: "var(--text3)", borderLeft: "3px solid var(--border)", paddingLeft: 8, marginBottom: 3 }}>
                  ↪ {m.parentPreview}
                </div>
              )}
              <div className="bubble">
                {m.body}
                {(m.attachments ?? []).map((a) =>
                  a.mime?.startsWith("image/") ? (
                    <a key={a.id} href={`/api/v1/attachments/${a.id}`} target="_blank" style={{ display: "block", marginTop: 6 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/v1/attachments/${a.id}`} alt={a.fileName}
                        style={{ maxWidth: 220, maxHeight: 180, borderRadius: 8, display: "block" }} />
                    </a>
                  ) : (
                    <a key={a.id} href={`/api/v1/attachments/${a.id}`} target="_blank"
                      style={{ display: "block", marginTop: 6, textDecoration: "underline", fontSize: 12 }}>
                      📎 {a.fileName}
                    </a>
                  ),
                )}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                {(m.reactions ?? []).map((r) => (
                  <button key={r.emoji}
                    className="pill"
                    style={{
                      cursor: "pointer",
                      background: r.mine ? "var(--accent-soft)" : "var(--surface2)",
                      color: r.mine ? "var(--accent-text)" : "var(--text2)",
                      border: "1px solid var(--border)",
                    }}
                    onClick={() => react(m.id, r.emoji)}>
                    {r.emoji} {r.count}
                  </button>
                ))}
                <button className="pill gray" style={{ cursor: "pointer" }}
                  onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}>＋😊</button>
                <button className="pill gray" style={{ cursor: "pointer" }}
                  onClick={() => setReplyTo(m)}>↪ 返信</button>
              </div>
              {pickerFor === m.id && (
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {EMOJIS.map((e) => (
                    <button key={e} style={{ fontSize: 18, cursor: "pointer" }} onClick={() => react(m.id, e)}>{e}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div style={{ display: "flex", gap: 8, padding: "8px 16px", borderTop: "1px solid var(--border)", background: "var(--surface2)", fontSize: 12, alignItems: "center" }}>
          <span style={{ color: "var(--text3)" }}>↪ {replyTo.senderName} さんへ返信: 「{replyTo.body.slice(0, 30)}…」</span>
          <div style={{ flex: 1 }} />
          <button className="pill gray" style={{ cursor: "pointer" }} onClick={() => setReplyTo(null)}>× 取消</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, padding: "13px 16px", borderTop: "1px solid var(--border)" }}>
        <input ref={fileRef} type="file" style={{ display: "none" }}
          accept="image/*,.pdf,.docx,.xlsx,.pptx,.txt,.csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }} />
        <button className="btn" title="ファイルを添付" onClick={() => fileRef.current?.click()} disabled={busy}>📎</button>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder="メッセージを入力…（Enterで送信）"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
          }}
        />
        <button className="btn primary" onClick={send} disabled={busy || !text.trim()}>
          送信
        </button>
      </div>
    </div>
  );
}
