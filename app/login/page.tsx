"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LoginCalendarIcon = () => (
  <svg className="h-7 w-7" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/");
  };

  return (
    <main className="min-h-screen bg-[#eef7fb] px-4 py-8 text-[#172033] sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[#bae6fd] bg-white/80 px-4 py-2 text-sm font-bold text-[#075985] shadow-sm">
              <LoginCalendarIcon />
              Shared Schedule
            </div>
            <h1 className="text-5xl font-black leading-tight tracking-tight text-[#0f172a]">
              大切な予定を、ちょうどよく共有。
            </h1>
            <div className="mt-8 max-w-md rounded-3xl border border-[#d9e2ef] bg-white/80 p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-black text-[#0f172a]">5月</p>
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#bae6fd]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fde68a]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#99f6e4]" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm font-bold">
                <div className="min-h-24 rounded-2xl bg-[#f8fafc] p-2 text-[#64748b]">03</div>
                <div className="min-h-24 rounded-2xl bg-[#eff6ff] p-2 text-[#075985]">
                  <p className="text-[#64748b]">04</p>
                  <div className="mt-2 rounded-lg border-l-4 border-[#22c8d6] bg-[#e0f2fe] px-2 py-1">日勤</div>
                </div>
                <div className="min-h-24 rounded-2xl bg-[#fffbeb] p-2 text-[#92400e]">
                  <p className="text-[#64748b]">05</p>
                  <div className="mt-2 rounded-lg border-l-4 border-[#f59e0b] bg-[#fef3c7] px-2 py-1">共有</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#d9e2ef] bg-white p-5 shadow-[0_24px_70px_rgb(15_23_42_/_12%)] sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e0f2fe] text-[#075985]">
              <LoginCalendarIcon />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748b]">
                Welcome back
              </p>
              <h1 className="text-2xl font-black text-[#0f172a]">ログイン</h1>
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

            <button
              className="h-12 w-full rounded-xl bg-[#0f766e] px-4 font-bold text-white shadow-sm transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!email.trim() || !password.trim()}
              onClick={signIn}
            >
              ログイン
            </button>

            <button
              className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 font-bold text-[#334155] transition hover:bg-[#f8fafc]"
              onClick={() => router.push("/signup")}
            >
              新規登録へ
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
