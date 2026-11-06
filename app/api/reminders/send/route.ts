// 通知の送信。Supabase から5分ごとに呼ばれ、次の3つをスマホ（登録した端末）に届ける
//  1) やることのリマインド（担当者へ。どちらでもならふたりへ）
//  2) 予定の前のリマインド（設定した本人へ）
//  3) 相手が予定を共有したお知らせ
import { NextResponse } from "next/server";
import webpush from "web-push";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

type Admin = NonNullable<ReturnType<typeof createSupabaseAdmin>>;
type Payload = { title: string; body: string; url: string; tag: string };
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

const BATCH = 100;
// 途中で起きたエラー（呼び出し結果に入れて、原因を見つけやすくする）
let problems: string[] = [];
const STALE_MS = 24 * 60 * 60 * 1000; // 1日以上前に過ぎたものは送らない（サーバーが止まっていた後などにまとめて届かないように）
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

/** 日本時間の「11/10（月）19:00」 */
const jstLabel = (iso: string, allDay: boolean) => {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${DOW[d.getUTCDay()]}）`;
  return allDay ? md : `${md} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** 届け先ごとの通知を、その人の端末すべてに送る */
async function deliver(admin: Admin, messages: { userId: string; payload: Payload }[]) {
  if (!messages.length) return { sent: 0, removed: 0 };
  const userIds = [...new Set(messages.map((m) => m.userId))];
  const { data, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
  if (error) problems.push(`push_subscriptions: ${error.message}`);
  const subs = (data ?? []) as Sub[];
  let sent = 0;
  const gone = new Set<string>();
  await Promise.all(
    messages.flatMap(({ userId, payload }) =>
      subs
        .filter((s) => s.user_id === userId)
        .map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
              TTL: 60 * 60 * 12,
            });
            sent++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) gone.add(s.id); // 通知をやめた端末は消す
          }
        }),
    ),
  );
  if (gone.size) await admin.from("push_subscriptions").delete().in("id", [...gone]);
  return { sent, removed: gone.size };
}

/** 1) やること */
async function todoMessages(admin: Admin, nowIso: string, staleIso: string) {
  type Todo = { id: string; owner_id: string; title: string; is_shared: boolean; assignee_id: string | null; due_date: string | null };
  const { data, error } = await admin
    .from("todo_items")
    .select("id, owner_id, title, is_shared, assignee_id, due_date")
    .lte("remind_at", nowIso)
    .gte("remind_at", staleIso)
    .is("reminded_at", null)
    .is("done_at", null)
    .order("remind_at")
    .limit(BATCH);
  if (error) problems.push(`todo_items: ${error.message}`);
  if (error || !data?.length) return [];
  // 先に「知らせ済み」にする（同時に2回呼ばれても二重に送らない）
  const { data: claimed } = await admin
    .from("todo_items")
    .update({ reminded_at: nowIso })
    .in("id", data.map((t) => t.id))
    .is("reminded_at", null)
    .select("id");
  const ids = new Set((claimed ?? []).map((r: { id: string }) => r.id));
  const todos = (data as Todo[]).filter((t) => ids.has(t.id));

  const owners = [...new Set(todos.filter((t) => t.is_shared && !t.assignee_id).map((t) => t.owner_id))];
  const partnersOf = new Map<string, string[]>();
  if (owners.length) {
    const list = owners.join(",");
    const { data: conns, error: connError } = await admin
      .from("connections")
      .select("requester_id, receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.in.(${list}),receiver_id.in.(${list})`);
    if (connError) problems.push(`connections: ${connError.message}`);
    for (const c of (conns ?? []) as { requester_id: string; receiver_id: string }[]) {
      for (const [me, other] of [
        [c.requester_id, c.receiver_id],
        [c.receiver_id, c.requester_id],
      ]) {
        if (owners.includes(me)) partnersOf.set(me, [...(partnersOf.get(me) ?? []), other]);
      }
    }
  }
  return todos.flatMap((t) => {
    const to = !t.is_shared ? [t.owner_id] : t.assignee_id ? [t.assignee_id] : [t.owner_id, ...(partnersOf.get(t.owner_id) ?? [])];
    const payload: Payload = {
      title: "やることのリマインド",
      body: t.due_date ? `${t.title}（期限 ${Number(t.due_date.slice(5, 7))}/${Number(t.due_date.slice(8, 10))}）` : t.title,
      url: "/todos",
      tag: `todo-${t.id}`,
    };
    return [...new Set(to)].map((userId) => ({ userId, payload }));
  });
}

/** 2) 予定の前のリマインド */
async function eventMessages(admin: Admin, nowIso: string, staleIso: string) {
  type Rem = { event_id: string; user_id: string };
  const { data, error } = await admin
    .from("event_reminders")
    .select("event_id, user_id")
    .lte("remind_at", nowIso)
    .gte("remind_at", staleIso)
    .is("reminded_at", null)
    .order("remind_at")
    .limit(BATCH);
  if (error) problems.push(`event_reminders: ${error.message}`);
  if (error || !data?.length) return [];
  const rems = data as Rem[];
  const claimedKeys = new Set<string>();
  for (const r of rems) {
    const { data: ok } = await admin
      .from("event_reminders")
      .update({ reminded_at: nowIso })
      .eq("event_id", r.event_id)
      .eq("user_id", r.user_id)
      .is("reminded_at", null)
      .select("event_id");
    if (ok?.length) claimedKeys.add(`${r.event_id}:${r.user_id}`);
  }
  const targets = rems.filter((r) => claimedKeys.has(`${r.event_id}:${r.user_id}`));
  if (!targets.length) return [];
  const { data: evs, error: evError } = await admin
    .from("events")
    .select("id, title, start_at, all_day")
    .in("id", [...new Set(targets.map((r) => r.event_id))]);
  if (evError) {
    // 予定を読めなかったら「送った扱い」を戻して、次の確認でもう一度送る
    problems.push(`events: ${evError.message}`);
    for (const r of targets) {
      await admin.from("event_reminders").update({ reminded_at: null }).eq("event_id", r.event_id).eq("user_id", r.user_id);
    }
    return [];
  }
  const byId = new Map(((evs ?? []) as { id: string; title: string; start_at: string; all_day: boolean | null }[]).map((e) => [e.id, e]));
  return targets.flatMap((r) => {
    const e = byId.get(r.event_id);
    if (!e) return [];
    const payload: Payload = {
      title: "予定のお知らせ",
      body: `${e.title}（${jstLabel(e.start_at, !!e.all_day)}）`,
      url: "/",
      tag: `event-${e.id}`,
    };
    return [{ userId: r.user_id, payload }];
  });
}

/** 3) 共有のお知らせ（データベースがためたもの） */
async function queuedMessages(admin: Admin, nowIso: string, staleIso: string) {
  type Q = { id: string; user_id: string; title: string; body: string; url: string; tag: string | null };
  const { data, error } = await admin
    .from("notification_queue")
    .select("id, user_id, title, body, url, tag")
    .is("sent_at", null)
    .gte("created_at", staleIso)
    .order("created_at")
    .limit(BATCH);
  if (error) problems.push(`notification_queue: ${error.message}`);
  if (error || !data?.length) return [];
  const { data: claimed } = await admin
    .from("notification_queue")
    .update({ sent_at: nowIso })
    .in("id", data.map((q) => q.id))
    .is("sent_at", null)
    .select("id");
  const ids = new Set((claimed ?? []).map((r: { id: string }) => r.id));
  return (data as Q[])
    .filter((q) => ids.has(q.id))
    .map((q) => ({ userId: q.user_id, payload: { title: q.title, body: q.body, url: q.url || "/", tag: q.tag || `q-${q.id}` } }));
}

export async function POST(request: Request) {
  // 合言葉（CRON_SECRET）を知っている呼び出しだけ受け付ける
  // 貼り付けたときの前後の空白・改行は無視する
  const secret = process.env.CRON_SECRET?.trim();
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!secret) {
    // 値そのものは返さない。原因がわかる言葉だけ返す
    return NextResponse.json({ error: "unauthorized", reason: "サーバーに CRON_SECRET がありません（Vercel に入れたあと Redeploy してください）" }, { status: 401 });
  }
  if (got !== secret) {
    return NextResponse.json({ error: "unauthorized", reason: "合言葉が Vercel の CRON_SECRET と一致しません" }, { status: 401 });
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";
  const admin = createSupabaseAdmin();
  if (!publicKey || !privateKey || !admin) {
    return NextResponse.json({ error: "サーバーの設定（VAPIDの鍵・管理用の鍵）が足りません" }, { status: 500 });
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (e) {
    // 鍵の形が正しくないとき（< > が付いたまま・公開鍵と秘密鍵が逆・mailto: が無い など）。鍵の値は返さない
    return NextResponse.json(
      {
        error: "VAPID の設定が正しくありません",
        reason: e instanceof Error ? e.message : String(e),
        hint: "NEXT_PUBLIC_VAPID_PUBLIC_KEY（B で始まる長い方）・VAPID_PRIVATE_KEY・VAPID_SUBJECT（mailto:メールアドレス）を確認して Redeploy してください",
      },
      { status: 500 },
    );
  }

  try {
    return await run(admin);
  } catch (e) {
    return NextResponse.json({ error: "送信中にエラーが起きました", reason: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** 管理用の鍵の種類（値は出さない）。anon の鍵だと、ほかの人のデータが読めず 0件 になる */
const adminKeyKind = () => {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable（公開用の鍵です。service_role / secret の鍵に替えてください）";
  try {
    const role = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")).role;
    return role === "service_role" ? "service_role" : `${role}（service_role の鍵に替えてください）`;
  } catch {
    return "不明（鍵の形が正しくないかもしれません）";
  }
};

async function run(admin: Admin) {
  problems = [];
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const staleIso = new Date(now - STALE_MS).toISOString();

  // 表がまだ無いものは飛ばす（SQL を順番に実行している途中でも動くように）
  const [todos, events, queued] = await Promise.all([
    todoMessages(admin, nowIso, staleIso).catch((e) => (problems.push(`todo: ${String(e)}`), [])),
    eventMessages(admin, nowIso, staleIso).catch((e) => (problems.push(`event: ${String(e)}`), [])),
    queuedMessages(admin, nowIso, staleIso).catch((e) => (problems.push(`queue: ${String(e)}`), [])),
  ]);
  const result = await deliver(admin, [...todos, ...events, ...queued]);

  // 送り終えて30日たった共有のお知らせを掃除
  await admin
    .from("notification_queue")
    .delete()
    .lt("created_at", new Date(now - 30 * STALE_MS).toISOString())
    .then(
      () => undefined,
      () => undefined,
    );

  return NextResponse.json({
    todos: todos.length,
    events: events.length,
    shares: queued.length,
    ...result,
    adminKey: adminKeyKind(),
    ...(problems.length ? { problems } : {}),
  });
}
