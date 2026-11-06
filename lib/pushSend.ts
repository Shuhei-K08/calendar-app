// 通知をスマホ（登録した端末）に送る共通の処理（サーバー専用）
import webpush from "web-push";
import type { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export type Admin = NonNullable<ReturnType<typeof createSupabaseAdmin>>;
export type Payload = { title: string; body: string; url: string; tag: string };
/** 通知の種類（設定でオン／オフできる単位。notification_prefs の列名と同じ） */
export type NoticeKind = "todo_remind" | "event_remind" | "share" | "comment" | "reaction";
export type Message = { userId: string; payload: Payload; kind: NoticeKind };
export const NOTICE_KINDS: NoticeKind[] = ["todo_remind", "event_remind", "share", "comment", "reaction"];

/** データベースがためたお知らせの種類は、tag の頭で見分ける */
const kindOfTag = (tag: string | null): NoticeKind =>
  tag?.startsWith("comment-") ? "comment" : tag?.startsWith("react-") ? "reaction" : "share";

/** 本人が「受け取らない」にした種類を外す（設定の表が無い・読めないときは全部送る） */
async function filterByPrefs(admin: Admin, messages: Message[], problems: string[]) {
  const userIds = [...new Set(messages.map((m) => m.userId))];
  const { data, error } = await admin.from("notification_prefs").select("*").in("user_id", userIds);
  if (error) {
    // 表がまだ無いとき（SQL 未実行）は黙って全部送る。それ以外は原因を残す
    if (error.code !== "42P01" && error.code !== "PGRST205") problems.push(`notification_prefs: ${error.message}`);
    return messages;
  }
  const prefs = new Map(((data ?? []) as Record<string, unknown>[]).map((p) => [p.user_id as string, p]));
  return messages.filter((m) => prefs.get(m.userId)?.[m.kind] !== false);
}
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

const BATCH = 100;

/** VAPID の鍵を設定する。うまくいかなければ理由（鍵の値は含まない）を返す */
export function setupVapid(): { ok: true } | { ok: false; reason: string } {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return { ok: false, reason: "VAPID の鍵がありません" };
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** 届け先ごとの通知を、その人の端末すべてに送る */
export async function deliver(admin: Admin, messages: Message[], problems: string[] = []) {
  if (!messages.length) return { sent: 0, removed: 0 };
  messages = await filterByPrefs(admin, messages, problems);
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

/** データベースがためたお知らせ（共有・コメント・スタンプ）を取り出す。取り出したものは「送った」にする */
export async function queuedMessages(admin: Admin, nowIso: string, staleIso: string, problems: string[] = []): Promise<Message[]> {
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
  // 先に「送った」にする（同時に2回呼ばれても二重に送らない）
  const { data: claimed } = await admin
    .from("notification_queue")
    .update({ sent_at: nowIso })
    .in("id", data.map((q) => q.id))
    .is("sent_at", null)
    .select("id");
  const ids = new Set((claimed ?? []).map((r: { id: string }) => r.id));
  return (data as Q[])
    .filter((q) => ids.has(q.id))
    .map((q) => ({
      userId: q.user_id,
      kind: kindOfTag(q.tag),
      payload: { title: q.title, body: q.body, url: q.url || "/", tag: q.tag || `q-${q.id}` },
    }));
}
