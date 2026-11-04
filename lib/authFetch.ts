// ブラウザから自分のアプリのAPIを呼ぶとき、ログイン情報を付けて送る
import { supabase } from "@/lib/supabase";

export async function authFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  const token = data.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
