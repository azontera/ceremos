import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, canAccessCase, audit } from "@/lib/rbac";
import { resolveCoupleSide } from "@/lib/couple-side";

// 席次表：新郎新婦とプランナーが共同編集する（seating 権限）

// GET: 卓・ゲストの現在状態（共同編集用に5秒ポーリングで取得される）
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessCase(s, params.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [tables, guests, objects, c] = await Promise.all([
    prisma.seatingTable.findMany({ where: { caseId: params.id }, orderBy: { sortOrder: "asc" } }),
    prisma.guest.findMany({ where: { caseId: params.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.floorObject.findMany({ where: { caseId: params.id } }),
    prisma.case.findUnique({
      where: { id: params.id },
      select: { hallWidth: true, hallHeight: true, banquetVenue: { select: { name: true, widthM: true, depthM: true } } },
    }),
  ]);
  // 会場マスタに実寸（m）が登録されていれば、席次表キャンバスを実寸比で表示（1m＝80px）
  // 案件側で会場サイズを手動変更している場合（既定値以外）はそちらを優先
  const PX_PER_M = 80;
  let hall = { w: c?.hallWidth ?? 1240, h: c?.hallHeight ?? 720 };
  let hallMeters: { w: number; h: number } | null = null;
  const v = c?.banquetVenue;
  const isDefault = (c?.hallWidth ?? 1240) === 1240 && (c?.hallHeight ?? 720) === 720;
  if (v?.widthM && v?.depthM) {
    hallMeters = { w: v.widthM, h: v.depthM };
    if (isDefault) {
      hall = {
        w: Math.max(700, Math.min(2400, Math.round(v.widthM * PX_PER_M))),
        h: Math.max(480, Math.min(1600, Math.round(v.depthM * PX_PER_M))),
      };
    }
  }
  return NextResponse.json({
    tables, guests, objects, hall, hallMeters, venueName: v?.name ?? null,
  });
}

// POST: 操作（op で分岐）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(s.role, "seating", "edit") || !(await canAccessCase(s, params.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const caseId = params.id;

  // 担当分担の強制（docs/仕様_現行.md 3章）：お客様は自分の側（新郎側/新婦側）のゲストのみ操作可
  let coupleSide: "groom" | "bride" | null = null;
  if (s.role === "couple") {
    const [u, cs, m] = await Promise.all([
      prisma.user.findUnique({ where: { id: s.userId }, select: { name: true, profileJson: true } }),
      prisma.case.findUnique({ where: { id: caseId }, select: { groomName: true, brideName: true, caseType: true } }),
      prisma.caseMember.findFirst({ where: { caseId, userId: s.userId }, select: { roleInCase: true } }),
    ]);
    if (u && cs && (cs.caseType === "wedding" || !cs.caseType)) coupleSide = resolveCoupleSide(u, cs, m?.roleInCase);
  }
  const sideForbidden = async (guestId: string | undefined): Promise<boolean> => {
    if (!coupleSide || !guestId) return false;
    const g = await prisma.guest.findFirst({ where: { id: guestId, caseId }, select: { side: true } });
    return !!g && g.side !== coupleSide;
  };

  try {
    switch (b.op) {
      case "addTable": {
        const count = await prisma.seatingTable.count({ where: { caseId } });
        const t = await prisma.seatingTable.create({
          data: {
            caseId,
            name: b.name?.trim() || `卓${String.fromCharCode(65 + (count % 26))}`,
            capacity: Number(b.capacity ?? 8),
            sizeCm: b.sizeCm !== undefined ? Math.max(120, Math.min(300, Math.round(Number(b.sizeCm) || 200))) : 200,
            sortOrder: count + 1,
            posX: Number.isFinite(Number(b.posX)) ? Number(b.posX) : -1,
            posY: Number.isFinite(Number(b.posY)) ? Number(b.posY) : -1,
          },
        });
        await audit(s.userId, "create", "seating_table", t.id);
        return NextResponse.json({ table: t }, { status: 201 });
      }
      case "moveTable": {
        // 円卓のフロアプラン上の移動（後からいつでも動かせる）
        if (!b.tableId) return NextResponse.json({ error: "tableId が必要です" }, { status: 400 });
        const px = Math.max(0, Math.min(2000, Math.round(Number(b.posX) || 0)));
        const py = Math.max(0, Math.min(1400, Math.round(Number(b.posY) || 0)));
        await prisma.seatingTable.updateMany({
          where: { id: b.tableId, caseId },
          data: { posX: px, posY: py },
        });
        return NextResponse.json({ ok: true });
      }
      case "renameTable": {
        // 名前・定員・サイズのどれか1つだけでも変更可（定員3〜10名／直径120〜300cm）
        if (!b.tableId) return NextResponse.json({ error: "tableId が必要です" }, { status: 400 });
        const data: Record<string, unknown> = {};
        if (b.name?.trim()) data.name = b.name.trim();
        if (b.capacity !== undefined && b.capacity !== null && b.capacity !== "") {
          data.capacity = Math.max(3, Math.min(10, Math.round(Number(b.capacity) || 8)));
        }
        if (b.sizeCm !== undefined && b.sizeCm !== null && b.sizeCm !== "") {
          data.sizeCm = Math.max(120, Math.min(300, Math.round(Number(b.sizeCm) || 200)));
        }
        if (Object.keys(data).length === 0) return NextResponse.json({ error: "変更内容がありません" }, { status: 400 });
        const t = await prisma.seatingTable.updateMany({ where: { id: b.tableId, caseId }, data });
        return NextResponse.json({ updated: t.count });
      }
      case "deleteTable": {
        // 卓を消すと所属ゲストは未割当に戻る（onDelete: SetNull）
        await prisma.seatingTable.deleteMany({ where: { id: b.tableId, caseId } });
        await audit(s.userId, "delete", "seating_table", b.tableId);
        return NextResponse.json({ ok: true });
      }
      case "addGuest": {
        if (!b.name?.trim()) return NextResponse.json({ error: "お名前を入力してください" }, { status: 400 });
        // 椅子・長机への直接追加（椅子は1脚=1名、長机は席番号ごとに1名）
        if (b.seatObjectId) {
          const seatObj = await prisma.floorObject.findFirst({
            where: { id: b.seatObjectId, caseId, kind: { in: ["chair", "longtable"] } },
          });
          if (!seatObj) return NextResponse.json({ error: "椅子が見つかりません" }, { status: 404 });
          if (seatObj.kind === "chair") {
            const occupied = await prisma.guest.findFirst({ where: { seatObjectId: b.seatObjectId } });
            if (occupied) return NextResponse.json({ error: `この椅子には既に ${occupied.name} 様が割当済みです` }, { status: 409 });
          }
        }
        // 席番号（＋を押した席）— 既に他のゲストが座っていれば自動配置に落とす
        let seatNo: number | null = Number.isInteger(Number(b.seatNo)) && b.seatNo !== null && b.seatNo !== undefined && b.seatNo !== "" ? Number(b.seatNo) : null;
        if (seatNo !== null && b.tableId && !b.seatObjectId) {
          const taken = await prisma.guest.findFirst({ where: { tableId: b.tableId, seatNo } });
          if (taken) seatNo = null;
        }
        if (seatNo !== null && b.seatObjectId) {
          const taken = await prisma.guest.findFirst({ where: { seatObjectId: b.seatObjectId, seatNo } });
          if (taken) seatNo = null;
        }
        const g = await prisma.guest.create({
          data: {
            caseId,
            name: b.name.trim(),
            title: b.title?.trim() || null,
            side: coupleSide ?? (b.side === "bride" ? "bride" : "groom"),
            relation: b.relation?.trim() || "友人",
            tableId: b.seatObjectId ? null : (b.tableId || null),
            seatNo,
            seatObjectId: b.seatObjectId || null,
            allergy: b.allergy?.trim() || null,
          },
        });
        await audit(s.userId, "create", "guest", g.id);
        return NextResponse.json({ guest: g }, { status: 201 });
      }
      case "updateGuest": {
        if (!b.guestId) return NextResponse.json({ error: "guestId が必要です" }, { status: 400 });
        if (await sideForbidden(b.guestId)) {
          return NextResponse.json({ error: "お相手さまの担当ゲストは編集できません（閲覧のみ）" }, { status: 403 });
        }
        if (coupleSide && b.side !== undefined && b.side !== coupleSide) {
          return NextResponse.json({ error: "側の変更はプランナーにご相談ください" }, { status: 403 });
        }
        // 卓の定員チェック
        if (b.tableId) {
          const [table, count] = await Promise.all([
            prisma.seatingTable.findFirst({ where: { id: b.tableId, caseId } }),
            prisma.guest.count({ where: { tableId: b.tableId, NOT: { id: b.guestId } } }),
          ]);
          if (!table) return NextResponse.json({ error: "卓が見つかりません" }, { status: 404 });
          if (count >= table.capacity) {
            return NextResponse.json({ error: `${table.name} は満席です（定員${table.capacity}名）` }, { status: 409 });
          }
        }
        // 椅子・長机への割当チェック（椅子は1脚=1名、長机は席番号ごとに1名）
        if (b.seatObjectId) {
          const seatObj = await prisma.floorObject.findFirst({
            where: { id: b.seatObjectId, caseId, kind: { in: ["chair", "longtable"] } },
          });
          if (!seatObj) return NextResponse.json({ error: "椅子が見つかりません" }, { status: 404 });
          if (seatObj.kind === "chair") {
            const occupied = await prisma.guest.findFirst({ where: { seatObjectId: b.seatObjectId, NOT: { id: b.guestId } } });
            if (occupied) return NextResponse.json({ error: `この椅子には既に ${occupied.name} 様が割当済みです` }, { status: 409 });
          }
        }
        const data: Record<string, unknown> = {};
        if (b.name !== undefined) data.name = String(b.name).trim();
        if (b.title !== undefined) data.title = String(b.title).trim() || null;
        if (b.side !== undefined) data.side = b.side === "bride" ? "bride" : "groom";
        if (b.relation !== undefined) data.relation = String(b.relation).trim();
        if (b.allergy !== undefined) data.allergy = String(b.allergy).trim() || null;
        // 卓と椅子は排他：どちらかを設定したらもう一方はクリア
        if (b.tableId !== undefined) { data.tableId = b.tableId || null; if (b.tableId) data.seatObjectId = null; }
        if (b.seatObjectId !== undefined) { data.seatObjectId = b.seatObjectId || null; if (b.seatObjectId) { data.tableId = null; data.seatNo = null; } }
        // 席番号（指定席へ移動。占有済みなら自動配置に落とす）※円卓・長机どちらも対応
        if (b.seatNo !== undefined) {
          let sn: number | null = Number.isInteger(Number(b.seatNo)) && b.seatNo !== null && b.seatNo !== "" ? Number(b.seatNo) : null;
          const targetTable = (b.tableId !== undefined ? b.tableId : null) || null;
          const targetObj = (b.seatObjectId !== undefined ? b.seatObjectId : null) || null;
          if (sn !== null && targetTable) {
            const taken = await prisma.guest.findFirst({ where: { tableId: targetTable, seatNo: sn, NOT: { id: b.guestId } } });
            if (taken) sn = null;
          }
          if (sn !== null && targetObj) {
            const taken = await prisma.guest.findFirst({ where: { seatObjectId: targetObj, seatNo: sn, NOT: { id: b.guestId } } });
            if (taken) sn = null;
          }
          data.seatNo = sn;
        }
        await prisma.guest.updateMany({ where: { id: b.guestId, caseId }, data });
        return NextResponse.json({ ok: true });
      }
      case "deleteGuest": {
        if (await sideForbidden(b.guestId)) {
          return NextResponse.json({ error: "お相手さまの担当ゲストは削除できません（閲覧のみ）" }, { status: 403 });
        }
        await prisma.guest.deleteMany({ where: { id: b.guestId, caseId } });
        await audit(s.userId, "delete", "guest", b.guestId);
        return NextResponse.json({ ok: true });
      }
      // ===== 会場オブジェクト（高砂・ステージ・司会台・自由設置物） =====
      case "addObject": {
        // サイズは実寸比（1m＝80px）：長机=180cm×45cm、椅子=45cm角、高砂=3.5m×1.1m
        const KINDS: Record<string, { label: string; w: number; h: number }> = {
          takasago: { label: "高砂", w: 280, h: 90 },
          stage: { label: "ステージ", w: 240, h: 150 },
          mc: { label: "司会台", w: 72, h: 48 },
          longtable: { label: "長机", w: 144, h: 36 },
          chair: { label: "椅子", w: 36, h: 36 }, // 固定サイズ（リサイズ不可）
          custom: { label: "オブジェクト", w: 160, h: 100 },
        };
        const k = KINDS[b.kind] ? b.kind : "custom";
        const o = await prisma.floorObject.create({
          data: {
            caseId,
            kind: k,
            label: b.label?.trim() || KINDS[k].label,
            posX: Number.isFinite(Number(b.posX)) ? Number(b.posX) : 60,
            posY: Number.isFinite(Number(b.posY)) ? Number(b.posY) : 60,
            width: KINDS[k].w,
            height: KINDS[k].h,
          },
        });
        await audit(s.userId, "create", "floor_object", o.id, { kind: k });
        return NextResponse.json({ object: o }, { status: 201 });
      }
      case "updateObject": {
        if (!b.objectId) return NextResponse.json({ error: "objectId が必要です" }, { status: 400 });
        const target = await prisma.floorObject.findFirst({ where: { id: b.objectId, caseId } });
        if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
        const data: Record<string, unknown> = {};
        if (b.label !== undefined && String(b.label).trim()) data.label = String(b.label).trim();
        if (b.posX !== undefined) data.posX = Math.max(0, Math.round(Number(b.posX) || 0));
        if (b.posY !== undefined) data.posY = Math.max(0, Math.round(Number(b.posY) || 0));
        // 椅子は固定サイズ（リサイズ不可）
        if (target.kind !== "chair") {
          if (b.width !== undefined) data.width = Math.max(24, Math.min(1200, Math.round(Number(b.width) || 0)));
          if (b.height !== undefined) data.height = Math.max(24, Math.min(900, Math.round(Number(b.height) || 0)));
        }
        // 長机の席数（席＋/席−）：0〜6席（片側3席まで）
        if (target.kind === "longtable" && b.capacity !== undefined) {
          data.capacity = Math.max(0, Math.min(6, Math.round(Number(b.capacity) || 0)));
        }
        // 長机の回転（0⇄90）
        if (target.kind === "longtable" && b.rotation !== undefined) {
          data.rotation = Number(b.rotation) === 90 ? 90 : 0;
        }
        await prisma.floorObject.updateMany({ where: { id: b.objectId, caseId }, data });
        return NextResponse.json({ ok: true });
      }
      // ===== 「元に戻す」：スナップショット復元（卓・ゲスト・オブジェクトを一括置換） =====
      case "restore": {
        const tables: { id: string; name: string; capacity: number; sizeCm?: number; sortOrder: number; posX: number; posY: number }[] = Array.isArray(b.tables) ? b.tables : [];
        const guests: { id: string; name: string; title?: string | null; side: string; relation: string; tableId: string | null; seatNo?: number | null; seatObjectId?: string | null; allergy?: string | null; sortOrder?: number }[] = Array.isArray(b.guests) ? b.guests : [];
        const objects: { id: string; kind: string; label: string; posX: number; posY: number; width: number; height: number; capacity?: number; rotation?: number }[] = Array.isArray(b.objects) ? b.objects : [];
        const tableIds = new Set(tables.map((t) => t.id));
        const objectIds = new Set(objects.map((o) => o.id));
        await prisma.$transaction([
          prisma.floorObject.deleteMany({ where: { caseId } }),
          prisma.guest.deleteMany({ where: { caseId } }),
          prisma.seatingTable.deleteMany({ where: { caseId } }),
          prisma.seatingTable.createMany({
            data: tables.map((t, i) => ({
              id: t.id, caseId, name: String(t.name), capacity: Number(t.capacity ?? 8),
              sizeCm: Number(t.sizeCm ?? 200),
              sortOrder: Number(t.sortOrder ?? i + 1), posX: Number(t.posX ?? -1), posY: Number(t.posY ?? -1),
            })),
          }),
          prisma.floorObject.createMany({
            data: objects.map((o) => ({
              id: o.id, caseId, kind: String(o.kind ?? "custom"), label: String(o.label),
              posX: Number(o.posX ?? 40), posY: Number(o.posY ?? 40),
              width: Number(o.width ?? 200), height: Number(o.height ?? 90),
              capacity: Number(o.capacity ?? 0), rotation: Number(o.rotation ?? 0),
            })),
          }),
          // ゲストは卓・椅子のFK参照のため最後に復元
          prisma.guest.createMany({
            data: guests.map((g, i) => ({
              id: g.id, caseId, name: String(g.name), title: g.title ?? null,
              side: g.side === "bride" ? "bride" : "groom",
              relation: String(g.relation ?? "友人"),
              tableId: g.tableId && tableIds.has(g.tableId) ? g.tableId : null,
              seatNo: g.seatNo ?? null,
              seatObjectId: g.seatObjectId && objectIds.has(g.seatObjectId) ? g.seatObjectId : null,
              allergy: g.allergy ?? null,
              sortOrder: Number(g.sortOrder ?? i),
            })),
          }),
        ]);
        await audit(s.userId, "restore", "seating", caseId, { tables: tables.length, guests: guests.length });
        return NextResponse.json({ ok: true });
      }
      case "deleteObject": {
        await prisma.floorObject.deleteMany({ where: { id: b.objectId, caseId } });
        await audit(s.userId, "delete", "floor_object", b.objectId);
        return NextResponse.json({ ok: true });
      }
      // ===== CSV一括登録（氏名,肩書,側,間柄,卓名） =====
      case "importGuests": {
        const rows: { name?: string; title?: string; side?: string; relation?: string; tableName?: string; allergy?: string }[] =
          Array.isArray(b.rows) ? b.rows : [];
        const valid = rows.filter((r) => r.name?.trim());
        if (valid.length === 0) return NextResponse.json({ error: "取り込める行がありません（氏名列は必須）" }, { status: 400 });
        if (valid.length > 500) return NextResponse.json({ error: "一度に取り込めるのは500名までです" }, { status: 400 });
        const caseTables = await prisma.seatingTable.findMany({ where: { caseId } });
        const tableByName = new Map(caseTables.map((t) => [t.name, t.id]));
        const last = await prisma.guest.findFirst({ where: { caseId }, orderBy: { sortOrder: "desc" } });
        let order = (last?.sortOrder ?? 0) + 1;
        await prisma.guest.createMany({
          data: valid.map((r) => ({
            caseId,
            name: r.name!.trim(),
            title: r.title?.trim() || null,
            side: ["bride", "新婦", "新婦側"].includes(r.side?.trim() ?? "") ? "bride" : "groom",
            relation: r.relation?.trim() || "友人",
            tableId: r.tableName?.trim() ? tableByName.get(r.tableName.trim()) ?? null : null,
            allergy: r.allergy?.trim() || null,
            sortOrder: order++,
          })),
        });
        await audit(s.userId, "import", "guest", caseId, { rows: valid.length });
        return NextResponse.json({ ok: true, imported: valid.length });
      }

      // ===== 宴会場サイズ =====
      case "setHall": {
        if (!can(s.role, "cases", "edit")) {
          return NextResponse.json({ error: "会場サイズの変更はスタッフのみ可能です" }, { status: 403 });
        }
        const w = Math.max(700, Math.min(2400, Math.round(Number(b.w) || 1240)));
        const h = Math.max(480, Math.min(1600, Math.round(Number(b.h) || 720)));
        await prisma.case.update({ where: { id: caseId }, data: { hallWidth: w, hallHeight: h } });
        await audit(s.userId, "update", "hall_size", caseId, { w, h });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "不正な操作です" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `サーバーエラー：${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
