"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation } from "@/app/components/AppNavigation";

type Pattern = {
  id: string;
  label: string;
  title: string;
  start_time: string;
  end_time: string;
  next_day_end: boolean;
};

type PatternForm = {
  id?: string;
  label: string;
  title: string;
  start_time: string;
  end_time: string;
  next_day_end: boolean;
};

const blankForm: PatternForm = {
  label: "",
  title: "",
  start_time: "09:00",
  end_time: "18:00",
  next_day_end: false,
};

const defaultPatterns = [
  { label: "出勤", title: "出勤", start_time: "09:00", end_time: "18:00", next_day_end: false },
  { label: "日勤", title: "日勤", start_time: "08:30", end_time: "17:30", next_day_end: false },
  { label: "夜勤", title: "夜勤", start_time: "16:30", end_time: "09:30", next_day_end: true },
  { label: "明け", title: "明け", start_time: "09:30", end_time: "10:00", next_day_end: false },
  { label: "休み", title: "休み", start_time: "00:00", end_time: "23:59", next_day_end: false },
];

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [form, setForm] = useState<PatternForm>(blankForm);
  const [saving, setSaving] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);

  const fetchPatterns = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("schedule_patterns")
      .select("id, label, title, start_time, end_time, next_day_end")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      setSchemaReady(false);
      return;
    }

    setSchemaReady(true);

    if (!data || data.length === 0) {
      const { error: insertError } = await supabase
        .from("schedule_patterns")
        .insert(defaultPatterns.map((pattern) => ({ ...pattern, user_id: user.id })));

      if (insertError) {
        console.error(insertError);
        return;
      }

      const { data: seededPatterns } = await supabase
        .from("schedule_patterns")
        .select("id, label, title, start_time, end_time, next_day_end")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      setPatterns(seededPatterns ?? []);
      return;
    }

    setPatterns(data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPatterns();
  }, [fetchPatterns]);

  const savePattern = async () => {
    if (!form.label.trim()) {
      alert("予定名を入力してください");
      return;
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("ログインしてください");
      setSaving(false);
      return;
    }

    const payload = {
      label: form.label.trim(),
      title: form.label.trim(),
      start_time: form.start_time,
      end_time: form.end_time,
      next_day_end: form.next_day_end,
      user_id: user.id,
    };

    const { error } = form.id
      ? await supabase.from("schedule_patterns").update(payload).eq("id", form.id)
      : await supabase.from("schedule_patterns").insert(payload);

    setSaving(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setForm(blankForm);
    await fetchPatterns();
  };

  const deletePattern = async (pattern: Pattern) => {
    const ok = window.confirm(`「${pattern.label}」を削除しますか？`);
    if (!ok) return;

    const { error } = await supabase
      .from("schedule_patterns")
      .delete()
      .eq("id", pattern.id);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    if (form.id === pattern.id) {
      setForm(blankForm);
    }

    await fetchPatterns();
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 pb-24 pt-4 text-[#172033] sm:px-6 sm:pb-4 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Schedule Templates
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">定型予定</h1>
          </div>
          <DesktopNavigation />
        </header>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          {!schemaReady && (
            <div className="mb-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-sm text-[#92400e]">
              Supabase SQLをまだ実行していないため、定型予定は使えません。
            </div>
          )}
          <h2 className="mb-4 text-base font-semibold text-[#0f172a]">
            {form.id ? "定型予定を編集" : "定型予定を追加"}
          </h2>
          <p className="mb-4 text-sm text-[#64748b]">
            夜勤や休みなど、よく使う予定名と時間を保存しておくと登録画面でワンタップ入力できます。
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-[#64748b]">予定名</span>
              <input
                className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                placeholder="例: 夜勤、休み、通院"
                value={form.label}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    label: event.target.value,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-[#64748b]">開始</span>
              <input
                className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                type="time"
                value={form.start_time}
                onChange={(event) =>
                  setForm((current) => ({ ...current, start_time: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-[#64748b]">終了</span>
              <input
                className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                type="time"
                value={form.end_time}
                onChange={(event) =>
                  setForm((current) => ({ ...current, end_time: event.target.value }))
                }
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-[#cbd5e1] px-3 py-3 text-sm text-[#334155] sm:col-span-2">
              <input
                className="h-4 w-4 accent-[#0f766e]"
                type="checkbox"
                checked={form.next_day_end}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    next_day_end: event.target.checked,
                  }))
                }
              />
              終了時刻を翌日にする
            </label>
          </div>

          <div className="mt-4 grid gap-2 sm:flex">
            <button
              className="h-11 rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={saving}
              onClick={savePattern}
            >
              {form.id ? "変更を保存" : "登録する"}
            </button>
            {form.id && (
              <button
              className="h-11 rounded-lg border border-[#cbd5e1] px-5 text-sm font-semibold text-[#334155]"
              onClick={() => setForm(blankForm)}
            >
                編集をやめる
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-[#0f172a]">登録済み</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {patterns.map((pattern) => (
              <div key={pattern.id} className="rounded-xl border border-[#d9e2ef] bg-[#f8fafc] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#0f172a]">{pattern.label}</p>
                    <p className="mt-1 text-sm text-[#64748b]">
                      {pattern.start_time.slice(0, 5)} -{" "}
                      {pattern.next_day_end && "翌日"}
                      {pattern.end_time.slice(0, 5)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#334155]"
                      onClick={() => setForm(pattern)}
                    >
                      編集
                    </button>
                    <button
                      className="rounded-lg border border-[#fecdd3] px-3 py-2 text-sm text-[#be123c]"
                      onClick={() => deletePattern(pattern)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {patterns.length === 0 && (
              <p className="text-sm text-[#64748b]">まだ定型予定はありません。</p>
            )}
          </div>
        </section>
      </div>
      <MobileNavigation />
    </main>
  );
}
