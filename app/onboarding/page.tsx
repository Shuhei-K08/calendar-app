"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-bold">初期設定</h1>
      <p className="mb-6 text-gray-600">
        まずはアプリで表示するユーザー名を設定してください。
      </p>

      <div className="space-y-3">
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="ユーザー名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <button
          className="w-full rounded bg-black px-4 py-2 text-white"
          onClick={saveProfile}
        >
          はじめる
        </button>
      </div>
    </main>
  );
}