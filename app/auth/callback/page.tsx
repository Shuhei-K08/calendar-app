"use client";

// Google でログインしたあとに戻ってくる場所。受け取ったコードでログインを完了して、カレンダーへ
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ShareCalLogo } from "@/app/components/AppNavigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const done = async () => {
      // すでにログインできていれば（自動で受け取り済みなど）そのまま進む
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/");
        return;
      }
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace("/");
          return;
        }
      }
      setFailed(true);
    };
    // Google 側でキャンセル・エラーになったときは error が付いて戻ってくる
    if (params.get("error")) void Promise.resolve().then(() => setFailed(true));
    else void done();
  }, [router]);

  return (
    <main className="page-shell min-h-screen px-4 py-8 text-[var(--fg)] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-3xl border border-[#d9e2ef] bg-white p-5 text-center shadow-[0_24px_70px_rgb(15_23_42_/_12%)] sm:p-8">
          <div className="mb-6 flex justify-center">
            <ShareCalLogo />
          </div>
          {failed ? (
            <>
              <h1 className="text-xl font-black text-[#0f172a]">ログインできませんでした</h1>
              <p className="mt-3 text-sm leading-6 text-[#475569]">Googleでのログインを完了できませんでした。もう一度お試しください。</p>
              <Link className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0f766e] px-4 font-bold text-white" href="/login">
                ログイン画面へ
              </Link>
            </>
          ) : (
            <>
              <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-[#99f6e4] border-t-[#0f766e]" aria-hidden="true" />
              <p className="mt-4 text-sm font-bold text-[#475569]" role="status">ログインしています…</p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
