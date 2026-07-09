// 総合スモークテスト（W8）
// 使い方: 1) npm run db:setup で初期化 2) npm run dev でサーバー起動 3) 別ターミナルで npm run test:smoke
/* eslint-disable */
let BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0, fail = 0;

// CEREMOS が動いているポートを自動検出（3000〜3004）
async function detectBase() {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  for (const port of [3000, 3001, 3002, 3003, 3004]) {
    const base = `http://localhost:${port}`;
    try {
      const res = await fetch(`${base}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      // CEREMOS のログインAPIは空ボディに 400＋日本語エラーを返す
      if (res.status === 400 && String(data.error ?? "").includes("メールアドレス")) return base;
    } catch { /* このポートには居ない */ }
  }
  return null;
}

function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

async function api(path, { method = "GET", cookie, body } = {}) {
  const res = await fetch(BASE + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}

async function login(email, password = "wedding2026") {
  const r = await api("/auth/login", { method: "POST", body: { email, password } });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  return { ...r, cookie };
}

async function main() {
  const detected = await detectBase();
  if (!detected) {
    console.error("\n⚠ CEREMOS のサーバーが見つかりません（ポート3000〜3004を確認しました）。");
    console.error("  手順：");
    console.error("  1) ターミナルを開いて:  cd ~/Desktop/wedding-erp && npm run dev");
    console.error("     →「Ready」と出たら、そのウインドウは開いたまま触らない（Ctrl+Cで止めない）");
    console.error("  2) Cmd+N で新しいターミナルを開いて:  cd ~/Desktop/wedding-erp && npm run test:smoke\n");
    process.exit(1);
  }
  BASE = detected;
  console.log(`\nWedding ERP スモークテスト（${BASE} を自動検出）\n`);

  // --- 認証 ---
  console.log("■ 認証");
  const tera = await login("tera@azon.jp");
  ok("プランナーがログインできる", tera.status === 200 && tera.cookie.length > 10, `status=${tera.status}`);
  if (tera.status !== 200) {
    console.error(`\n⚠ 最初のログインが status=${tera.status} で失敗しました。以降のテストは全滅します。`);
    console.error(`  ・${BASE} に CEREMOS の dev サーバーが起動していますか？（別アプリが同じポートを使っていませんか）`);
    console.error("  ・「Port 3000 is in use, trying 3001 instead.」と出た場合は、");
    console.error("      lsof -ti:3000 | xargs kill -9   で古いプロセスを止めて npm run dev をやり直すか、");
    console.error("      BASE_URL=http://localhost:3001 npm run test:smoke   で実際のポートを指定してください。");
    console.error("  ・DB作り直し直後は npm run db:setup 済みか、dev サーバーを再起動したかも確認してください。\n");
    process.exit(1);
  }
  const bad = await login("tera@azon.jp", "wrong-password");
  ok("誤ったパスワードは401", bad.status === 401);
  const noauth = await api("/cases");
  ok("未ログインのAPIアクセスは401", noauth.status === 401);

  // --- 案件スコープ ---
  console.log("■ 案件・権限スコープ");
  const casesR = await api("/cases", { cookie: tera.cookie });
  ok("案件一覧が取得できる", casesR.status === 200 && casesR.data.cases?.length >= 3);
  const takahashi = casesR.data.cases?.find((c) => c.groomName.includes("高橋"));
  const ito = casesR.data.cases?.find((c) => c.groomName.includes("伊藤"));
  ok("シード案件（高橋様・伊藤様）が存在する", !!takahashi && !!ito);

  const ren = await login("ren.t@example.com");
  const renCases = await api("/cases", { cookie: ren.cookie });
  ok("新郎新婦は自分の案件のみ閲覧できる", renCases.status === 200 && renCases.data.cases?.length === 1);

  const florist = await login("florist@example.com");
  const floristIto = await api(`/cases/${ito?.id}`, { cookie: florist.cookie });
  ok("業者は参加案件を閲覧できる", floristIto.status === 200);
  const floristOrders = floristIto.data.case?.orders ?? [];
  ok("業者には自社宛の発注のみ表示される",
    floristOrders.length > 0 && floristOrders.every((o) => o.vendorId === floristIto.data.case.orders[0].vendorId));
  const renCreate = await api("/cases", { method: "POST", cookie: ren.cookie, body: { groomName: "x", brideName: "y", weddingDate: "2027-01-01" } });
  ok("新郎新婦は案件を作成できない（403）", renCreate.status === 403);

  // --- 案件作成・バンケット重複 ---
  console.log("■ 案件作成・重複チェック");
  const venueId = ito?.banquetVenue?.id;
  const mk = (startTime, endTime) => api("/cases", {
    method: "POST", cookie: tera.cookie,
    body: { groomName: "テスト 太郎", brideName: "テスト 花子", weddingDate: "2027-03-20", startTime, endTime, banquetVenueId: venueId, guestCount: 50 },
  });
  const created = await mk("11:30", "15:30");
  ok("案件を作成できる（201）", created.status === 201, `status=${created.status} ${JSON.stringify(created.data)}`);
  const dup = await mk("14:00", "18:00");
  ok("同一会場で時間帯が重なる予約は409で拒否", dup.status === 409);
  const other = await mk("16:00", "20:00");
  ok("同一日でも時間帯が重ならなければ作成できる", other.status === 201);
  const testCaseId = created.data.case?.id;

  // --- チャット ---
  console.log("■ チャット");
  const sent = await api(`/cases/${takahashi?.id}/messages`, { method: "POST", cookie: tera.cookie, body: { body: "[TEST] スモークテスト送信" } });
  ok("メッセージを送信できる", sent.status === 201);
  const msgs = await api(`/cases/${takahashi?.id}/messages`, { cookie: ren.cookie });
  ok("相手側にメッセージが見える", msgs.data.messages?.some((m) => m.body.includes("[TEST]")));
  const read = await api(`/cases/${takahashi?.id}/messages/read`, { method: "POST", cookie: ren.cookie });
  ok("既読を付けられる", read.status === 200);
  const msgs2 = await api(`/cases/${takahashi?.id}/messages`, { cookie: tera.cookie });
  ok("送信者に既読が反映される", msgs2.data.messages?.find((m) => m.body.includes("[TEST]"))?.readByOthers === true);

  // --- 見積フロー ---
  console.log("■ 見積（版管理・承認フロー）");
  const q = await api(`/cases/${testCaseId}/quotes`, {
    method: "POST", cookie: tera.cookie,
    body: { items: [{ name: "テストコース", qty: 50, unitPrice: 20000 }], note: "[TEST]" },
  });
  ok("見積を作成できる（合計自動計算）", q.status === 201 && q.data.quote?.total === 1000000);
  const qid = q.data.quote?.id;
  const confirm = await api(`/quotes/${qid}/status`, { method: "POST", cookie: tera.cookie, body: { status: "confirmed" } });
  ok("確認済にできる", confirm.status === 200);
  const approveByPlanner = await api(`/quotes/${qid}/status`, { method: "POST", cookie: tera.cookie, body: { status: "approved" } });
  ok("プランナーは承認できない（403）", approveByPlanner.status === 403);
  const manager = await login("manager@example.com");
  const approve = await api(`/quotes/${qid}/status`, { method: "POST", cookie: manager.cookie, body: { status: "approved" } });
  ok("支配人は承認できる", approve.status === 200);

  // --- 発注 ---
  console.log("■ 発注");
  const order = await api(`/cases/${testCaseId}/orders`, { method: "POST", cookie: tera.cookie, body: { category: "gift", note: "[TEST] 引出物", amount: 10000 } });
  ok("発注を追加できる", order.status === 201);
  const confirmOrder = await api(`/orders/${order.data.order?.id}`, { method: "PATCH", cookie: tera.cookie, body: { status: "confirmed" } });
  ok("発注を確定できる", confirmOrder.status === 200);

  // --- 進行表・当日運営 ---
  console.log("■ 進行表・当日運営");
  const rd = await api(`/cases/${testCaseId}/rundown`, { cookie: tera.cookie });
  ok("案件作成時に進行表テンプレートがコピーされる", rd.data.items?.length >= 5);
  const first = rd.data.items?.[0];
  const start = await api(`/rundown-items/${first?.id}`, { method: "PATCH", cookie: tera.cookie, body: { status: "now" } });
  ok("演目を開始できる", start.status === 200);
  const delay = await api(`/rundown-items/${first?.id}`, { method: "PATCH", cookie: tera.cookie, body: { delayMin: 5 } });
  ok("遅延を記録できる", delay.status === 200 && delay.data.item?.delayMin === 5);
  const renPatch = await api(`/rundown-items/${first?.id}`, { method: "PATCH", cookie: ren.cookie, body: { status: "done" } });
  ok("新郎新婦は当日操作できない（403）", renPatch.status === 403);

  // --- 料理 ---
  console.log("■ 料理");
  const chef = await login("chef@example.com");
  const meal = await api(`/cases/${ito?.id}/meal-requirements`, { method: "POST", cookie: chef.cookie, body: { guestLabel: "[TEST]", type: "allergy", detail: "テスト" } });
  ok("料理長が配慮事項を追加できる", meal.status === 201);
  const mealDel = await api(`/cases/${ito?.id}/meal-requirements?reqId=${meal.data.req?.id}`, { method: "DELETE", cookie: chef.cookie });
  ok("配慮事項を削除できる", mealDel.status === 200);

  // --- 管理者 ---
  console.log("■ 管理者機能");
  const admin = await login("admin@example.com");
  const newUser = await api("/admin/users", { method: "POST", cookie: admin.cookie, body: { name: "[TEST] 新人", email: `test-${Date.now()}@example.com`, role: "service", password: "wedding2026" } });
  ok("管理者はユーザーを作成できる", newUser.status === 201);
  const denied = await api("/admin/users", { method: "POST", cookie: tera.cookie, body: { name: "x", email: "x@x.com", role: "service", password: "wedding2026" } });
  ok("プランナーはユーザーを作成できない（403）", denied.status === 403);

  // --- 見積の削除・承認取り消し ---
  console.log("■ 見積（削除・承認取り消し）");
  const qDelDenied = await api(`/quotes/${qid}`, { method: "DELETE", cookie: tera.cookie });
  ok("承認済みの見積は削除できない（400）", qDelDenied.status === 400);
  const revoke = await api(`/quotes/${qid}/status`, { method: "POST", cookie: manager.cookie, body: { status: "confirmed" } });
  ok("支配人は承認を取り消せる", revoke.status === 200);
  const revokeByPlanner = await api(`/quotes/${qid}/status`, { method: "POST", cookie: manager.cookie, body: { status: "approved" } })
    .then(() => api(`/quotes/${qid}/status`, { method: "POST", cookie: tera.cookie, body: { status: "confirmed" } }));
  ok("プランナーは承認を取り消せない（403）", revokeByPlanner.status === 403);
  await api(`/quotes/${qid}/status`, { method: "POST", cookie: manager.cookie, body: { status: "confirmed" } });
  const qDel = await api(`/quotes/${qid}`, { method: "DELETE", cookie: tera.cookie });
  ok("差し戻し後は削除できる", qDel.status === 200);

  // --- 請求・入金 ---
  console.log("■ 請求・入金");
  const plan = await api(`/cases/${testCaseId}/payment-plan`, {
    method: "PUT", cookie: tera.cookie,
    body: { plans: [{ label: "内金", amount: 100000, dueAt: "2027-01-15" }, { label: "残金", amount: 900000, dueAt: "2027-03-15" }] },
  });
  ok("支払予定を設定できる（複数行）", plan.status === 200 && plan.data.plans?.length === 2);
  const inv = await api(`/cases/${testCaseId}/invoices`, { method: "POST", cookie: tera.cookie, body: { amount: 100000, note: "[TEST] 内金", dueAt: "2027-01-15" } });
  ok("請求書を発行できる（請求番号自動採番）", inv.status === 201 && /^INV-\d{4}-\d{4}$/.test(inv.data.invoice?.number ?? ""));
  const invSent = await api(`/invoices/${inv.data.invoice?.id}`, { method: "PATCH", cookie: tera.cookie, body: { status: "sent" } });
  ok("請求済にできる", invSent.status === 200);
  const invPaid = await api(`/invoices/${inv.data.invoice?.id}`, { method: "PATCH", cookie: tera.cookie, body: { status: "paid" } });
  ok("入金済にできる（入金日記録）", invPaid.status === 200 && !!invPaid.data.invoice?.paidAt);

  // --- アフター記録 ---
  console.log("■ アフター記録");
  const fu = await api(`/cases/${testCaseId}/followups`, { method: "POST", cookie: tera.cookie, body: { type: "claim", body: "[TEST] クレームテスト" } });
  ok("クレームを記録できる", fu.status === 201);
  const fuDone = await api(`/followups/${fu.data.followup?.id}`, { method: "PATCH", cookie: tera.cookie, body: { status: "done" } });
  ok("対応完了にできる", fuDone.status === 200);
  const fuByCouple = await api(`/cases/${testCaseId}/followups`, { cookie: ren.cookie });
  ok("顧客はアフター記録を閲覧できない（403）", fuByCouple.status === 403);

  // --- 進行表マスター（楽曲連動） ---
  console.log("■ 進行表と楽曲の連動");
  const second = rd.data.items?.[1];
  const withSong = await api(`/rundown-items/${second?.id}`, {
    method: "PATCH", cookie: tera.cookie,
    body: { song: { use: true, title: "[TEST] Song", artist: "Tester", durationSec: 90 } },
  });
  ok("進行行に楽曲を付けられる", withSong.status === 200);
  const rd2 = await api(`/cases/${testCaseId}/rundown`, { cookie: tera.cookie });
  const linked = rd2.data.items?.find((x) => x.id === second?.id);
  ok("楽曲が行に紐付いている（songId）", !!linked?.songId);
  const songEdit = await api(`/songs/${linked?.songId}`, { method: "PATCH", cookie: tera.cookie, body: { title: "[TEST] Song v2" } });
  ok("楽曲の内容を変更できる", songEdit.status === 200 && songEdit.data.song?.title === "[TEST] Song v2");
  const unlink = await api(`/rundown-items/${second?.id}`, { method: "PATCH", cookie: tera.cookie, body: { song: { use: false } } });
  ok("チェック解除で楽曲が削除される", unlink.status === 200);

  // --- マスタ・通知・パスワード ---
  console.log("■ マスタ・通知・パスワード");
  const masters = await api("/admin/masters?group=case_type", { cookie: admin.cookie });
  ok("選択肢マスタを取得できる", masters.status === 200);
  const notif = await api("/me/notifications", { cookie: tera.cookie });
  ok("通知APIが応答する", notif.status === 200 && typeof notif.data.count === "number");
  const weakPw = await api("/me/password", { method: "POST", cookie: tera.cookie, body: { currentPassword: "wedding2026", newPassword: "aaaaaaaa" } });
  ok("英字のみのパスワードは拒否される", weakPw.status === 400);
  const pwChange = await api("/me/password", { method: "POST", cookie: tera.cookie, body: { currentPassword: "wedding2026", newPassword: "temp-Pass1234" } });
  ok("自分のパスワードを変更できる", pwChange.status === 200);
  const pwBack = await api("/me/password", { method: "POST", cookie: tera.cookie, body: { currentPassword: "temp-Pass1234", newPassword: "wedding2026" } });
  ok("パスワードを元に戻せる", pwBack.status === 200);

  console.log(`\n結果: ${pass} 成功 / ${fail} 失敗`);
  console.log("※ [TEST] 付きのデータが作成されています。きれいに戻すには npm run db:setup を実行してください。\n");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("実行エラー:", e.message); console.error("サーバー（npm run dev）が起動しているか確認してください。"); process.exit(1); });
