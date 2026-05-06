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
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#2563eb");
  const [templateName, setTemplateName] = useState("");
  const [templateStart, setTemplateStart] = useState("09:00");
  const [templateEnd, setTemplateEnd] = useState("18:00");
  const [templateNextDay, setTemplateNextDay] = useState(false);

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

    let categoryId: string | null = null;
    if (categoryName.trim()) {
      const { data: category, error: categoryError } = await supabase
        .from("schedule_categories")
        .insert({
          user_id: user.id,
          name: categoryName.trim(),
          color: categoryColor,
        })
        .select("id")
        .single();

      if (!categoryError) {
        categoryId = category.id;
      }
    }

    if (templateName.trim()) {
      await supabase.from("schedule_patterns").insert({
        user_id: user.id,
        label: templateName.trim(),
        title: templateName.trim(),
        start_time: templateStart,
        end_time: templateEnd,
        next_day_end: templateNextDay,
        category_id: categoryId,
      });
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
          まずはアプリで表示するユーザー名を設定してください。分類やよく使う予定は、必要なものだけ最初に登録できます。
        </p>

      <div className="space-y-3">
        <label className="block space-y-2">
          <span className="text-sm font-bold text-[#334155]">ユーザー名</span>
        <input
          className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
          placeholder="ユーザー名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        </label>

        <div className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-3">
          <p className="text-sm font-black text-[#0f172a]">最初の分類</p>
          <p className="mt-1 text-xs text-[#64748b]">例: 勤務、私用、家族。空欄でも始められます。</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_80px]">
            <input
              className="h-11 min-w-0 rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#99f6e4]/50"
              placeholder="分類名"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
            <input
              className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-2"
              type="color"
              value={categoryColor}
              onChange={(event) => setCategoryColor(event.target.value)}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-3">
          <p className="text-sm font-black text-[#0f172a]">最初の定型予定</p>
          <p className="mt-1 text-xs text-[#64748b]">よく登録する予定があれば作成できます。空欄でも始められます。</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className="h-11 min-w-0 rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#99f6e4]/50 sm:col-span-2"
              placeholder="例: 夜勤"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
            <label className="space-y-1">
              <span className="text-xs font-bold text-[#64748b]">開始</span>
              <input
                className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm"
                type="time"
                value={templateStart}
                onChange={(event) => setTemplateStart(event.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-[#64748b]">終了</span>
              <input
                className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm"
                type="time"
                value={templateEnd}
                onChange={(event) => setTemplateEnd(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-3 py-3 text-sm font-bold text-[#334155] sm:col-span-2">
              <input
                className="h-4 w-4 accent-[#0f766e]"
                type="checkbox"
                checked={templateNextDay}
                onChange={(event) => setTemplateNextDay(event.target.checked)}
              />
              終了時刻を翌日にする
            </label>
          </div>
        </div>

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
