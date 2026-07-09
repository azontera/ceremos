import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { recalcRundownTimes, syncItemSong } from "@/lib/rundown";
import { deleteAttachmentsFor } from "@/lib/attachments";

async function guard(s: Awaited<ReturnType<typeof getSession>>, id: string, needEdit: boolean) {
  if (!s) return { err: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const item = await prisma.rundownItem.findUnique({ where: { id } });
  if (!item) return { err: NextResponse.json({ error: "not found" }, { status: 404 }) };
  if (!(await canAccessCase(s, item.caseId))) {
    return { err: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  // 当日運営の状態変更は live 権限、編集は rundown 権限
  if (needEdit && !can(s.role, "rundown", "edit")) {
    return { err: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { item };
}

// PATCH: 行の編集・並び替え・当日ステータス変更
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  const b = await req.json().catch(() => ({}));
  const isLiveOp = ["status", "delayMin"].some((k) => b[k] !== undefined)
    && !["time", "title", "note", "roles", "move", "toIndex", "durationMin", "mcScript"].some((k) => b[k] !== undefined);

  const g = await guard(s, params.id, !isLiveOp);
  if ("err" in g) return g.err;
  if (isLiveOp && s && !can(s.role, "live", "edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const item = g.item!;

  // 並び替え（ドラッグ＆ドロップ：指定位置へ挿入）
  if (b.toIndex !== undefined) {
    const all = await prisma.rundownItem.findMany({
      where: { caseId: item.caseId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    const ids = all.map((x) => x.id).filter((id) => id !== item.id);
    const to = Math.max(0, Math.min(ids.length, Number(b.toIndex)));
    ids.splice(to, 0, item.id);
    await prisma.$transaction(
      ids.map((id, i) => prisma.rundownItem.update({ where: { id }, data: { sortOrder: i + 1 } })),
    );
    await recalcRundownTimes(item.caseId); // 並び替え後にタイム自動計算
    return NextResponse.json({ ok: true });
  }

  // 並び替え（上下移動）
  if (b.move === "up" || b.move === "down") {
    const dir = b.move === "up" ? "desc" : "asc";
    const neighbor = await prisma.rundownItem.findFirst({
      where: {
        caseId: item.caseId,
        sortOrder: b.move === "up" ? { lt: item.sortOrder } : { gt: item.sortOrder },
      },
      orderBy: { sortOrder: dir },
    });
    if (neighbor) {
      await prisma.$transaction([
        prisma.rundownItem.update({ where: { id: item.id }, data: { sortOrder: neighbor.sortOrder } }),
        prisma.rundownItem.update({ where: { id: neighbor.id }, data: { sortOrder: item.sortOrder } }),
      ]);
      await recalcRundownTimes(item.caseId);
    }
    return NextResponse.json({ ok: true });
  }

  const data: Record<string, unknown> = {};
  if (b.time !== undefined) data.time = String(b.time).trim();
  if (b.title !== undefined) data.title = String(b.title).trim();
  if (b.note !== undefined) data.note = b.note ? String(b.note).trim() : null;
  if (b.mcScript !== undefined) data.mcScript = b.mcScript ? String(b.mcScript).trim() : null;
  if (b.durationMin !== undefined) data.durationMin = Math.max(1, Math.min(600, Number(b.durationMin) || 10));
  if (b.roles !== undefined) data.roles = String(b.roles);
  if (b.status !== undefined) {
    if (!["todo", "now", "done", "hold"].includes(b.status)) {
      return NextResponse.json({ error: "不正なステータスです" }, { status: 400 });
    }
    data.status = b.status;
    if (b.status === "done" || b.status === "now") data.actualAt = new Date();
  }
  if (b.delayMin !== undefined) data.delayMin = Number(b.delayMin) || 0;

  const updated = await prisma.rundownItem.update({ where: { id: item.id }, data });

  // 時刻・所要分の変更は以降の行へ波及（タイム自動再計算）
  if (b.time !== undefined || b.durationMin !== undefined) {
    await recalcRundownTimes(item.caseId);
  }

  // 楽曲の同期（進行表がマスター：ここから楽曲を作成・更新・削除）
  if (b.song !== undefined) {
    const r = await syncItemSong(item.id, item.caseId, item.songId, b.song ?? {});
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (s) await audit(s.userId, "update", "rundown_item", item.id, { ...data, song: b.song ? b.song.title : undefined });
  return NextResponse.json({ item: updated });
}

// DELETE: 行の削除（紐付き楽曲も削除：楽曲は進行表からのみ管理）
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  const g = await guard(s, params.id, true);
  if ("err" in g) return g.err;
  const item = g.item!;
  await prisma.rundownItem.delete({ where: { id: params.id } });
  if (item.songId) {
    await deleteAttachmentsFor("song", [item.songId]);
    await prisma.song.delete({ where: { id: item.songId } }).catch(() => {});
  }
  await recalcRundownTimes(item.caseId); // 削除後にタイム自動再計算
  // 復元できるよう削除内容をスナップショットとして記録
  if (s) await audit(s.userId, "delete", "rundown_item", params.id, {
    time: item.time, title: item.title, note: item.note, mcScript: item.mcScript,
    durationMin: item.durationMin, roles: item.roles,
  });
  return NextResponse.json({ ok: true });
}
