"use client";

// Google アカウントでログイン／新規登録（Supabase の Google ログイン）
//  - Google で認証したあと /auth/callback に戻り、そこでログインを完了する
//  - はじめての人は、そのあとカレンダーを開くと最初の設定（ニックネームなど）に進む
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function GoogleSignInButton({ label = "Googleでログイン" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const signIn = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" }, // 複数の Google アカウントから選べるように
      },
    });
    // 成功したときは Google の画面へ移るので、ここに来るのは失敗したときだけ
    if (error) {
      setLoading(false);
      setError(
        /provider is not enabled|Unsupported provider/i.test(error.message)
          ? "Googleでのログインはまだ準備中です。"
          : "Googleでログインできませんでした。時間をおいてお試しください。",
      );
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#cbd5e1] bg-white px-4 font-bold text-[#1f1f1f] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        onClick={() => void signIn()}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
        </svg>
        {loading ? "Googleへ移動中…" : label}
      </button>
      {error && <p className="text-sm font-bold text-[#be123c]" role="alert">{error}</p>}
    </div>
  );
}
