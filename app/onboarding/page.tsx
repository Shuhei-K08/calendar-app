"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ShareCalLogo } from "@/app/components/AppNavigation";

const generateShareCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();

const PRESET_COLORS = [
  "#2563eb", "#0891b2", "#0f766e", "#16a34a",
  "#ca8a04", "#ea580c", "#dc2626", "#9333ea",
  "#db2777", "#475569",
];

const PATTERN_COLORS = [
  "#0f766e", "#2563eb", "#9333ea", "#ea580c",
  "#16a34a", "#dc2626", "#ca8a04", "#475569",
];

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1 — username
  const [username, setUsername] = useState("");

  // Step 2 — first category (optional)
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState(PRESET_COLORS[0]);
  const [skipCategory, setSkipCategory] = useState(false);

  // Step 3 — first schedule pattern (optional)
  const [templateName, setTemplateName] = useState("");
  const [templateStart, setTemplateStart] = useState("09:00");
  const [templateEnd, setTemplateEnd] = useState("18:00");
  const [templateNextDay, setTemplateNextDay] = useState(false);
  const [skipPattern, setSkipPattern] = useState(false);

  const goNext = () => {
    if (step === 1) {
      if (!username.trim()) {
        setError("ユーザー名を入力してください。");
        return;
      }
      setError("");
      setStep(2);
    } else if (step === 2) {
      setError("");
      setStep(3);
    }
  };

  const goBack = () => {
    setError("");
    setStep((s) => (s - 1) as Step);
  };

  const finish = async () => {
    setSaving(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const shareCode = generateShareCode();

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      username: username.trim(),
      share_code: shareCode,
      onboarding_completed: true,
    });

    if (profileError) {
      setError("保存に失敗しました。もう一度お試しください。");
      setSaving(false);
      return;
    }

    let categoryId: string | null = null;

    if (!skipCategory && categoryName.trim()) {
      const { data: category, error: categoryError } = await supabase
        .from("schedule_categories")
        .insert({ user_id: user.id, name: categoryName.trim(), color: categoryColor })
        .select("id")
        .single();

      if (!categoryError) {
        categoryId = category.id;
      }
    }

    if (!skipPattern && templateName.trim()) {
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

  const stepLabels = ["ユーザー名", "分類", "よく使う予定"];

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef7fb] px-4 py-8 text-[#172033]">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <ShareCalLogo compact />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748b]">ShareCal setup</p>
            <h1 className="text-xl font-black text-[#0f172a]">初期設定</h1>
          </div>
        </div>

        {/* Step indicator */}
        <div className="mb-6 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-0">
            {stepLabels.map((label, i) => {
              const n = i + 1;
              const done = step > n;
              const current = step === n;
              return (
                <div key={n} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex items-center w-full">
                    {i > 0 && (
                      <div className={`h-0.5 flex-1 ${done || current ? "bg-[#0f766e]" : "bg-[#e2e8f0]"}`} />
                    )}
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-black transition ${
                        done
                          ? "bg-[#0f766e] text-white"
                          : current
                          ? "bg-[#ecfdf5] border-2 border-[#0f766e] text-[#0f766e]"
                          : "bg-[#f1f5f9] text-[#94a3b8]"
                      }`}
                    >
                      {done ? "✓" : n}
                    </div>
                    {i < stepLabels.length - 1 && (
                      <div className={`h-0.5 flex-1 ${step > n + 1 ? "bg-[#0f766e]" : "bg-[#e2e8f0]"}`} />
                    )}
                  </div>
                  <span className={`text-xs font-bold ${current ? "text-[#0f766e]" : "text-[#94a3b8]"}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-[#d9e2ef] bg-white p-5 shadow-[0_24px_70px_rgb(15_23_42_/_12%)] sm:p-7">

          {/* Step 1: Username */}
          {step === 1 && (
            <div className="onboarding-step space-y-5">
              <div>
                <h2 className="text-xl font-black text-[#0f172a]">ユーザー名を設定</h2>
                <p className="mt-1 text-sm leading-6 text-[#64748b]">
                  カレンダー上で表示される名前です。相手にも見えます。
                </p>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-bold text-[#334155]">ユーザー名</span>
                <input
                  className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
                  placeholder="例：たろう"
                  value={username}
                  autoFocus
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && goNext()}
                />
              </label>

              <div className="rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-3 text-sm text-[#075985]">
                <p className="font-bold">共有IDについて</p>
                <p className="mt-1">ランダムな共有IDが発行されます。相手に教えると「つながる」機能でつながれます。</p>
              </div>

              {error && <p className="text-sm font-bold text-[#be123c]">{error}</p>}
            </div>
          )}

          {/* Step 2: Category */}
          {step === 2 && (
            <div className="onboarding-step space-y-5">
              <div>
                <h2 className="text-xl font-black text-[#0f172a]">最初の分類を作成</h2>
                <p className="mt-1 text-sm leading-6 text-[#64748b]">
                  予定の左端に色をつけて区別できます。例：勤務、プライベート、家族。<br />
                  あとでいつでも変更できます。
                </p>
              </div>

              {!skipCategory ? (
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-bold text-[#334155]">分類名</span>
                    <input
                      className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
                      placeholder="例：勤務"
                      value={categoryName}
                      autoFocus
                      onChange={(e) => setCategoryName(e.target.value)}
                    />
                  </label>

                  <div className="space-y-2">
                    <span className="text-sm font-bold text-[#334155]">分類の色</span>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`color-swatch ${categoryColor === c ? "selected" : ""}`}
                          style={{ background: c }}
                          onClick={() => setCategoryColor(c)}
                          aria-label={`色 ${c}`}
                        />
                      ))}
                    </div>
                    {/* Preview */}
                    {categoryName && (
                      <div
                        className="mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold"
                        style={{ background: `${categoryColor}22`, borderLeft: `4px solid ${categoryColor}`, color: categoryColor }}
                      >
                        {categoryName}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="text-sm font-bold text-[#94a3b8] hover:text-[#64748b]"
                    onClick={() => { setSkipCategory(true); setCategoryName(""); }}
                  >
                    スキップして次へ →
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl bg-[#f8fafc] p-4 text-sm text-[#64748b]">
                  <p className="font-bold text-[#334155]">スキップしました</p>
                  <p className="mt-1">設定画面からいつでも分類を追加できます。</p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-bold text-[#0f766e]"
                    onClick={() => setSkipCategory(false)}
                  >
                    やっぱり設定する
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Pattern */}
          {step === 3 && (
            <div className="onboarding-step space-y-5">
              <div>
                <h2 className="text-xl font-black text-[#0f172a]">よく使う予定を登録</h2>
                <p className="mt-1 text-sm leading-6 text-[#64748b]">
                  勤務や休みなど、よく使う予定パターンを登録しておくとワンタップで入力できます。<br />
                  あとでいつでも追加できます。
                </p>
              </div>

              {!skipPattern ? (
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-bold text-[#334155]">予定名</span>
                    <input
                      className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
                      placeholder="例：日勤、夜勤、休み"
                      value={templateName}
                      autoFocus
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-bold text-[#64748b]">開始</span>
                      <input
                        className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                        type="time"
                        value={templateStart}
                        onChange={(e) => setTemplateStart(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-bold text-[#64748b]">終了</span>
                      <input
                        className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                        type="time"
                        value={templateEnd}
                        onChange={(e) => setTemplateEnd(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#d9e2ef] bg-[#f8fafc] px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#0f766e]"
                      checked={templateNextDay}
                      onChange={(e) => setTemplateNextDay(e.target.checked)}
                    />
                    <span className="text-sm font-bold text-[#334155]">終了時刻を翌日にする（夜勤など）</span>
                  </label>
                  <button
                    type="button"
                    className="text-sm font-bold text-[#94a3b8] hover:text-[#64748b]"
                    onClick={() => { setSkipPattern(true); setTemplateName(""); }}
                  >
                    スキップして完了 →
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl bg-[#f8fafc] p-4 text-sm text-[#64748b]">
                  <p className="font-bold text-[#334155]">スキップしました</p>
                  <p className="mt-1">「よく使う予定」ページからいつでも追加できます。</p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-bold text-[#0f766e]"
                    onClick={() => setSkipPattern(false)}
                  >
                    やっぱり設定する
                  </button>
                </div>
              )}

              {error && <p className="text-sm font-bold text-[#be123c]">{error}</p>}
            </div>
          )}

          {/* Footer buttons */}
          <div className={`mt-7 grid gap-2 ${step > 1 ? "grid-cols-2" : ""}`}>
            {step > 1 && (
              <button
                className="h-12 rounded-xl border border-[#cbd5e1] px-4 font-bold text-[#334155] transition hover:bg-[#f8fafc]"
                onClick={goBack}
                disabled={saving}
              >
                ← 戻る
              </button>
            )}
            {step < 3 ? (
              <button
                className="h-12 rounded-xl bg-[#0f766e] px-4 font-bold text-white shadow-sm transition hover:bg-[#115e59] disabled:opacity-50"
                onClick={goNext}
                disabled={step === 1 && !username.trim()}
              >
                次へ →
              </button>
            ) : (
              <button
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-4 font-bold text-white shadow-sm transition hover:bg-[#115e59] disabled:opacity-50"
                onClick={finish}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    保存中
                  </>
                ) : "はじめる 🎉"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
