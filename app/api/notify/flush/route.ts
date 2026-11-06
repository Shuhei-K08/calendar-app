// コメント・スタンプ・予定の共有をしたあと、アプリから呼んで「たまっているお知らせ」をすぐ送る
// （呼ばれなくても、10分ごとの確認で送られます）
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/serverAuth";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { deliver, queuedMessages, setupVapid } from "@/lib/pushSend";

const STALE_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const admin = createSupabaseAdmin();
  if (!admin || !setupVapid().ok) return NextResponse.json({ sent: 0 });
  const now = Date.now();
  const messages = await queuedMessages(admin, new Date(now).toISOString(), new Date(now - STALE_MS).toISOString()).catch(() => []);
  const { sent } = await deliver(admin, messages);
  return NextResponse.json({ sent });
}
