"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const signUp = async () => {
    if (!email || !password || !passwordConfirm) {
      alert("すべて入力してください");
      return;
    }

    if (password !== passwordConfirm) {
      alert("パスワードが一致しません");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("確認メールを送信しました。メール認証後にログインしてください。");
    router.push("/login");
  };

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">新規登録</h1>

      <div className="space-y-3">
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="メールアドレス"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full rounded border px-3 py-2"
          placeholder="パスワード"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <input
          className="w-full rounded border px-3 py-2"
          placeholder="パスワード確認"
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
        />

        <button
          className="w-full rounded bg-black px-4 py-2 text-white"
          onClick={signUp}
        >
          登録
        </button>

        <button
          className="w-full rounded border px-4 py-2"
          onClick={() => router.push("/login")}
        >
          ログインへ戻る
        </button>
      </div>
    </main>
  );
}