"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ShareCalLogo } from "@/app/components/AppNavigation";

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
    <main className="min-h-screen bg-[#eef7fb] px-4 py-8 text-[#172033] sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[#bae6fd] bg-white/80 px-4 py-2 text-sm font-bold text-[#075985] shadow-sm">
              <ShareCalLogo compact />
              ShareCal
            </div>
            <h1 className="text-5xl font-black leading-tight tracking-tight text-[#0f172a]">
              共有カレンダーをはじめよう。
            </h1>
            <div className="mt-8 max-w-md rounded-3xl border border-[#d9e2ef] bg-white/80 p-4 shadow-sm">
              <div className="rounded-2xl border-l-4 border-[#22c8d6] bg-[#e0f2fe] p-4">
                <p className="font-black text-[#075985]">自分の予定</p>
                <p className="mt-1 text-sm text-[#475569]">勤務やメモを登録</p>
              </div>
              <div className="mt-3 rounded-2xl border-l-4 border-[#f59e0b] bg-[#fef3c7] p-4">
                <p className="font-black text-[#92400e]">共有された予定</p>
                <p className="mt-1 text-sm text-[#475569]">必要な相手だけに共有</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#d9e2ef] bg-white p-5 shadow-[0_24px_70px_rgb(15_23_42_/_12%)] sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e0f2fe] text-[#075985]">
              <ShareCalLogo compact />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748b]">
                Create account
              </p>
              <h1 className="text-2xl font-black text-[#0f172a]">新規登録</h1>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-bold text-[#334155]">メールアドレス</span>
              <input
                className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
                placeholder="name@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold text-[#334155]">パスワード</span>
              <input
                className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
                placeholder="パスワード"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold text-[#334155]">パスワード確認</span>
              <input
                className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
                placeholder="もう一度入力"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </label>

            <button
              className="h-12 w-full rounded-xl bg-[#0f766e] px-4 font-bold text-white shadow-sm transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!email.trim() || !password.trim() || !passwordConfirm.trim()}
              onClick={signUp}
            >
              登録
            </button>

            <button
              className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 font-bold text-[#334155] transition hover:bg-[#f8fafc]"
              onClick={() => router.push("/login")}
            >
              ログインへ戻る
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
