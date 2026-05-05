import Link from "next/link";
import { ShareCalLogo } from "@/app/components/AppNavigation";

export default function AuthConfirmedPage() {
  return (
    <main className="min-h-screen bg-[#eef7fb] px-4 py-8 text-[#172033] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-3xl border border-[#d9e2ef] bg-white p-5 text-center shadow-[0_24px_70px_rgb(15_23_42_/_12%)] sm:p-8">
          <div className="mb-6 flex justify-center">
            <ShareCalLogo />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748b]">
            Email confirmed
          </p>
          <h1 className="mt-2 text-2xl font-black text-[#0f172a]">
            登録が完了しました
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#475569]">
            メール認証が完了しました。この画面を閉じて、ShareCalにログインしてください。
          </p>
          <Link
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0f766e] px-4 font-bold text-white"
            href="/login"
          >
            ログイン画面へ
          </Link>
        </section>
      </div>
    </main>
  );
}
