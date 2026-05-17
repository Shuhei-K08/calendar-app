import Link from "next/link";
import { ShareCalLogo } from "@/app/components/AppNavigation";

export default function AccountDeletedPage() {
  return (
    <main className="page-shell min-h-screen px-4 py-8 text-[var(--fg)]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-3xl border border-[#d9e2ef] bg-white p-6 text-center shadow-[0_24px_70px_rgb(15_23_42_/_12%)] sm:p-8">
          <div className="mb-5 flex justify-center">
            <ShareCalLogo compact />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748b]">
            Account Deleted
          </p>
          <h1 className="mt-2 text-2xl font-black text-[#0f172a]">
            削除が完了しました
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#475569]">
            ShareCalをご利用いただきありがとうございました。
            また必要になった時は、いつでも新しく始められます。
          </p>
          <Link
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#0f766e] px-5 text-sm font-bold text-white"
            href="/signup"
          >
            新規登録へ
          </Link>
        </section>
      </div>
    </main>
  );
}

