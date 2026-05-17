"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ShareCalLogo } from "@/app/components/AppNavigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setLoginError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setLoginError(
        error.message === "Invalid login credentials"
          ? "メールアドレスまたはパスワードが正しくありません。"
          : "ログインできませんでした。入力内容を確認して再度お試しください。",
      );
      return;
    }

    router.push("/");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void signIn();
  };

  return (
    <main className="min-h-screen bg-[#eef7fb] px-4 py-8 text-[#172033] sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_440px]">

        {/* ── Hero (desktop only) ── */}
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[#bae6fd] bg-white/80 px-4 py-2 text-sm font-bold text-[#075985] shadow-sm">
              <ShareCalLogo compact />
              ShareCal
            </div>
            <h1 className="text-5xl font-black leading-tight tracking-tight text-[#0f172a]">
              大切な予定を、<br />ちょうどよく共有。
            </h1>
            <p className="mt-4 text-lg leading-7 text-[#475569]">
              複数人のスケジュールを一画面でひと目確認。<br />
              必要な相手にだけ、必要な予定を共有できます。
            </p>

            {/* Mini calendar mockup */}
            <div className="mt-8 max-w-md rounded-3xl border border-[#d9e2ef] bg-white/90 p-5 shadow-md">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-black text-[#0f172a]">5月のスケジュール</p>
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#bae6fd]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fde68a]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#99f6e4]" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm font-bold">
                <div className="min-h-24 rounded-2xl bg-[#f8fafc] p-2 text-[#64748b]">03</div>
                <div className="min-h-24 rounded-2xl bg-[#eff6ff] p-2">
                  <p className="text-[#64748b]">04</p>
                  <div className="mt-2 rounded-lg border-l-4 border-[#22c8d6] bg-[#e0f2fe] px-2 py-1 text-xs text-[#075985]">日勤</div>
                </div>
                <div className="min-h-24 rounded-2xl bg-[#fffbeb] p-2">
                  <p className="text-[#64748b]">05</p>
                  <div className="mt-2 rounded-lg border-l-4 border-[#f59e0b] bg-[#fef3c7] px-2 py-1 text-xs text-[#92400e]">共有</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { day: "月", color: "#e0f2fe", dot: "#22c8d6" },
                  { day: "火", color: "#fef3c7", dot: "#f59e0b" },
                  { day: "水", color: "#ede9fe", dot: "#8b5cf6" },
                ].map(({ day, color, dot }) => (
                  <div key={day} className="flex items-center gap-2 rounded-xl px-2 py-1.5" style={{ background: color }}>
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                    <span className="text-xs font-bold text-[#475569]">{day}曜日</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center text-sm">
              {[
                { icon: "📅", text: "簡単に予定登録" },
                { icon: "🔗", text: "選んで共有" },
                { icon: "👀", text: "全員の予定一覧" },
              ].map(({ icon, text }) => (
                <div key={text} className="rounded-2xl border border-[#d9e2ef] bg-white/70 py-3">
                  <div className="text-xl">{icon}</div>
                  <p className="mt-1 font-bold text-[#334155]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Auth Card ── */}
        <section className="rounded-3xl border border-[#d9e2ef] bg-white p-5 shadow-[0_24px_70px_rgb(15_23_42_/_12%)] sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e0f2fe] text-[#075985]">
              <ShareCalLogo compact />
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
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold text-[#334155]">パスワード</span>
              <div className="relative">
                <input
                  className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 pr-12 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
                  placeholder="パスワード"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onKeyDown}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#94a3b8] hover:text-[#475569]"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-4 font-bold text-white shadow-sm transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!email.trim() || !password.trim() || loading}
              onClick={signIn}
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ログイン中
                </>
              ) : "ログイン"}
            </button>

            {loginError && (
              <div className="rounded-2xl border border-[#fda4af] bg-[#fff1f2] p-3 text-sm leading-6 text-[#be123c]">
                <p className="font-bold">ログインできませんでした</p>
                <p className="mt-1">{loginError}</p>
              </div>
            )}

            <div className="relative flex items-center gap-3">
              <span className="h-px flex-1 bg-[#e2e8f0]" />
              <span className="text-xs font-bold text-[#94a3b8]">OR</span>
              <span className="h-px flex-1 bg-[#e2e8f0]" />
            </div>

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
