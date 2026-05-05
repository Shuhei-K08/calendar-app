"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ShareCalLogo } from "@/app/components/AppNavigation";

const generateShareCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

export default function OnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");

  const saveProfile = async () => {
    if (!username) {
      alert("ユーザー名を入力してください");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const shareCode = generateShareCode();

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      username,
      share_code: shareCode,
      onboarding_completed: true,
    });

    if (error) {
      console.error(error);
      alert("保存に失敗しました");
      return;
    }

    router.push("/");
  };

  return (
    <main className="min-h-screen bg-[#eef7fb] px-4 py-8 text-[#172033]">
      <div className="mx-auto max-w-md rounded-3xl border border-[#d9e2ef] bg-white p-5 shadow-[0_24px_70px_rgb(15_23_42_/_12%)] sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <ShareCalLogo compact />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748b]">
              ShareCal setup
            </p>
            <h1 className="text-2xl font-black text-[#0f172a]">初期設定</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-[#64748b]">
          まずはアプリで表示するユーザー名を設定してください。
        </p>

      <div className="space-y-3">
        <input
          className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
          placeholder="ユーザー名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <button
          className="h-12 w-full rounded-xl bg-[#0f766e] px-4 font-bold text-white shadow-sm transition hover:bg-[#115e59]"
          onClick={saveProfile}
        >
          はじめる
        </button>
      </div>
      </div>
    </main>
  );
}
