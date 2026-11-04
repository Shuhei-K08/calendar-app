// API（サーバー側）で「ログインしている本人か」を確かめる
import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type Result = { user: User; token: string; response?: undefined } | { user?: undefined; token?: undefined; response: NextResponse };

export async function requireUser(request: Request): Promise<Result> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { response: NextResponse.json({ error: "ログインが必要です" }, { status: 401 }) };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { response: NextResponse.json({ error: "サーバーの設定が足りません" }, { status: 500 }) };
  }
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user) {
    return { response: NextResponse.json({ error: "ログイン情報を確認できません" }, { status: 401 }) };
  }
  return { user, token };
}

/** ログインしている本人として Supabase を使う（RLS がそのまま効く） */
export function userClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** 保存している画像のURL（…/event-images/<user_id>/<file>）から、置き場所のパスを取り出す */
export const eventImagePath = (imageUrl: string) => {
  const m = /\/event-images\/([0-9a-f-]{36}\/[^?#]+)/i.exec(imageUrl);
  return m ? decodeURIComponent(m[1]) : null;
};
