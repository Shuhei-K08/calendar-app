"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ShareCalLogo } from "@/app/components/AppNavigation";

const productionUrl = "https://calendar-app-alpha-nine.vercel.app";

const checks = [
  { label: "8文字以上", test: (p: string) => p.length >= 8 },
  { label: "英字を含む", test: (p: string) => /[a-zA-Z]/.test(p) },
  { label: "数字または記号を含む", test: (p: string) => /[\d!@#$%^&*()_+\-=\[\]{}|;':",.<>?/`~\\]/.test(p) },
];

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const metCount = checks.filter((c) => c.test(password)).length;

  const signUp = async () => {
    setError("");

    if (!email || !password || !passwordConfirm) {
      setError("すべて入力してください。");
      return;
    }

    if (password !== passwordConfirm) {
      setError("パスワードが一致しません。");
      return;
    }

    if (metCount < 2) {
      setError("より強いパスワードにしてください。");
      return;
    }

    setLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${productionUrl}/auth/confirmed`,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(
        signUpError.message === "User already registered"
          ? "このメールアドレスはすでに登録されています。"
          : signUpError.message,
      );
      return;
    }

    setDone(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void signUp();
  };

  if (done) {
    return (
      <main className="page-shell flex min-h-screen items-center justify-center px-4 py-8 text-[var(--fg)]">
        <div className="w-full max-w-md rounded-3xl border border-[#d9e2ef] bg-white p-8 text-center shadow-[0_24px_70px_rgb(15_23_42_/_12%)]">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ecfdf5] text-3xl">
            ✉️
          </div>
          <h2 className="text-2xl font-black text-[#0f172a]">確認メールを送信しました</h2>
          <p className="mt-3 text-sm leading-7 text-[#64748b]">
            <span className="font-bold text-[#0f172a]">{email}</span> に確認メールを送りました。<br />
            メール内のリンクをクリックしてアカウントを有効化してください。
          </p>
          <div className="mt-6 rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-4 text-sm text-[#075985]">
            <p className="font-bold">メールが届かない場合</p>
            <p className="mt-1">迷惑メールフォルダをご確認ください。数分経っても届かない場合は再度お試しください。</p>
          </div>
          <button
            className="mt-6 h-12 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 font-bold text-[#334155] transition hover:bg-[#f8fafc]"
            onClick={() => router.push("/login")}
          >
            ログインページへ
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell min-h-screen px-4 py-8 text-[var(--fg)] sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_440px]">

        {/* ── Hero ── */}
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[#bae6fd] bg-white/80 px-4 py-2 text-sm font-bold text-[#075985] shadow-sm">
              <ShareCalLogo compact />
              ShareCal
            </div>
            <h1 className="text-5xl font-black leading-tight tracking-tight text-[#0f172a]">
              共有カレンダーを<br />はじめよう。
            </h1>
            <p className="mt-4 text-lg leading-7 text-[#475569]">
              アカウントを作成して、<br />
              大切な人と予定を共有しましょう。
            </p>

            <div className="mt-8 space-y-3">
              {[
                { color: "#e0f2fe", border: "#22c8d6", text: "自分の予定", sub: "勤務やメモを簡単登録", textColor: "#075985" },
                { color: "#fef3c7", border: "#f59e0b", text: "共有された予定", sub: "必要な相手だけに共有", textColor: "#92400e" },
                { color: "#ede9fe", border: "#8b5cf6", text: "私たちの予定", sub: "二人の共通の予定として表示", textColor: "#5b21b6" },
              ].map(({ color, border, text, sub, textColor }) => (
                <div
                  key={text}
                  className="flex items-center gap-3 rounded-2xl border-l-4 p-4"
                  style={{ background: color, borderLeftColor: border }}
                >
                  <div>
                    <p className="font-black" style={{ color: textColor }}>{text}</p>
                    <p className="mt-0.5 text-sm text-[#475569]">{sub}</p>
                  </div>
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
                  autoComplete="new-password"
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

              {/* Password strength bars */}
              {password.length > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-1.5">
                    {checks.map((c, i) => (
                      <div key={i} className={`pw-strength-bar ${c.test(password) ? "met" : ""}`} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {checks.map((c) => (
                      <span
                        key={c.label}
                        className={`text-xs font-bold ${c.test(password) ? "text-[#0f766e]" : "text-[#94a3b8]"}`}
                      >
                        {c.test(password) ? "✓ " : "· "}{c.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold text-[#334155]">パスワード確認</span>
              <input
                className={`h-12 w-full rounded-xl border bg-[#f8fafc] px-4 text-sm outline-none transition focus:bg-white focus:ring-4 ${
                  passwordConfirm && password !== passwordConfirm
                    ? "border-[#fda4af] focus:border-[#be123c] focus:ring-[#fecdd3]/50"
                    : "border-[#cbd5e1] focus:border-[#0f766e] focus:ring-[#99f6e4]/50"
                }`}
                placeholder="もう一度入力"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                onKeyDown={onKeyDown}
              />
              {passwordConfirm && password !== passwordConfirm && (
                <p className="text-xs font-bold text-[#be123c]">パスワードが一致しません</p>
              )}
            </label>

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-4 font-bold text-white shadow-sm transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!email.trim() || !password.trim() || !passwordConfirm.trim() || loading}
              onClick={signUp}
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  登録中
                </>
              ) : "登録する"}
            </button>

            {error && (
              <div className="rounded-2xl border border-[#fda4af] bg-[#fff1f2] p-3 text-sm font-bold text-[#be123c]">
                {error}
              </div>
            )}

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
