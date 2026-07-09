"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Task = { id: string; title: string; dueAt: string | null; status: string };

export function TaskList({ caseId, tasks }: { caseId: string; tasks: Task[] }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const now = new Date();

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const res = await fetch(`/api/v1/cases/${caseId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueAt: due || null }),
    });
    if (res.ok) { setTitle(""); setDue(""); router.refresh(); }
    setBusy(false);
  }

  async function toggle(t: Task) {
    await fetch(`/api/v1/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: t.status === "open" ? "done" : "open" }),
    });
    router.refresh();
  }

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <>
      {open.length === 0 && done.length === 0 && <div className="empty">タスクはありません</div>}
      {open.map((t) => {
        const overdue = t.dueAt && new Date(t.dueAt) < now;
        return (
          <div className="list-row" key={t.id}>
            <input type="checkbox" onChange={() => toggle(t)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
            <div className="t">
              <b>{t.title}</b>
              <span>
                {t.dueAt
                  ? `期限：${new Date(t.dueAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}${overdue ? "（超過）" : ""}`
                  : "期限なし"}
              </span>
            </div>
            {overdue && <span className="pill red">要対応</span>}
          </div>
        );
      })}
      {done.map((t) => (
        <div className="list-row" key={t.id} style={{ opacity: 0.5 }}>
          <input type="checkbox" checked onChange={() => toggle(t)} style={{ width: 16, height: 16, accentColor: "var(--green)" }} />
          <div className="t">
            <b style={{ textDecoration: "line-through" }}>{t.title}</b>
          </div>
          <span className="pill green">完了</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="タスクを追加…"
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }} />
        <input className="form-input" type="date" style={{ width: 150 }} value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn" onClick={add} disabled={busy || !title.trim()}>追加</button>
      </div>
    </>
  );
}
