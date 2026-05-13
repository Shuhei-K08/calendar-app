"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

type Pattern = {
  id: string;
  label: string;
  title: string;
  start_time: string;
  end_time: string;
  next_day_end: boolean;
  category_id: string | null;
  event_visibility: EventVisibility | null;
  share_user_ids: string[] | null;
};

type PatternForm = {
  id?: string;
  label: string;
  title: string;
  start_time: string;
  end_time: string;
  next_day_end: boolean;
  category_id: string;
  event_visibility: EventVisibility;
  share_user_ids: string[];
};

type EventVisibility = "private" | "partner" | "together";

type Category = {
  id: string;
  name: string;
  color: string;
};

type ConnectedUser = {
  id: string;
  username: string;
};

const blankForm: PatternForm = {
  label: "",
  title: "",
  start_time: "09:00",
  end_time: "18:00",
  next_day_end: false,
  category_id: "",
  event_visibility: "together",
  share_user_ids: [],
};

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [connections, setConnections] = useState<ConnectedUser[]>([]);
  const [form, setForm] = useState<PatternForm>(blankForm);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#2563eb");
  const [saving, setSaving] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);

  const fetchPatterns = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("schedule_patterns")
      .select("id, label, title, start_time, end_time, next_day_end, category_id, event_visibility, share_user_ids")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      setSchemaReady(false);
      return;
    }

    setSchemaReady(true);
    setPatterns(data ?? []);
  }, []);

  const fetchConnections = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: acceptedConnections } = await supabase
      .from("connections")
      .select("requester_id, receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    const userIds = (acceptedConnections ?? []).map((connection) =>
      connection.requester_id === user.id ? connection.receiver_id : connection.requester_id,
    );

    if (userIds.length === 0) {
      setConnections([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", userIds);

    setConnections(profiles ?? []);
  }, []);

  const fetchCategories = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("schedule_categories")
      .select("id, name, color")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    setCategories(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPatterns();
    void fetchCategories();
    void fetchConnections();
  }, [fetchCategories, fetchConnections, fetchPatterns]);

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("schedule_categories")
      .insert({
        name: newCategoryName.trim(),
        color: newCategoryColor,
        user_id: user.id,
      })
      .select("id, name, color")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setCategories((current) => [...current, data]);
    setForm((current) => ({ ...current, category_id: data.id }));
    setNewCategoryName("");
    setNewCategoryColor("#2563eb");
  };

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
      category_id: form.category_id || null,
      event_visibility:
        form.share_user_ids.length > 0
          ? form.event_visibility === "private"
            ? "together"
            : form.event_visibility
          : "private",
      share_user_ids: form.share_user_ids,
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
          <div className="flex items-center gap-3">
            <ShareCalLogo compact />
            <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Favorite Schedules
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">よく使う予定</h1>
            </div>
          </div>
          <DesktopNavigation />
        </header>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          {!schemaReady && (
            <div className="mb-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-sm text-[#92400e]">
              Supabase SQLをまだ実行していないため、よく使う予定は使えません。
            </div>
          )}
          <h2 className="mb-4 text-base font-semibold text-[#0f172a]">
            {form.id ? "よく使う予定を編集" : "よく使う予定を追加"}
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
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-[#64748b]">分類</span>
              <select
                className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                value={form.category_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, category_id: event.target.value }))
                }
              >
                <option value="">未分類</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-3 sm:col-span-2">
              <p className="text-xs font-bold text-[#64748b]">ここで分類も追加できます</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_96px] sm:items-end">
                <input
                  className="h-10 min-w-0 rounded-lg border border-[#cbd5e1] bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  placeholder="例: 勤務"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                />
                <input
                  className="h-10 w-full rounded-lg border border-[#cbd5e1] bg-white px-2"
                  type="color"
                  value={newCategoryColor}
                  onChange={(event) => setNewCategoryColor(event.target.value)}
                />
                <button
                  className="h-10 rounded-lg border border-[#0f766e] bg-white px-4 text-sm font-bold text-[#0f766e] transition hover:bg-[#ecfdf5]"
                  onClick={addCategory}
                >
                  分類追加
                </button>
              </div>
            </div>
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
            <div className="space-y-3 rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-3 sm:col-span-2">
              <div>
                <p className="text-xs font-bold text-[#64748b]">共有する相手</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {connections.map((connection) => (
                    <label
                      key={connection.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                        form.share_user_ids.includes(connection.id)
                          ? "border-[#0f766e] bg-[#ecfdf5] text-[#0f766e]"
                          : "border-[#cbd5e1] bg-white text-[#334155]"
                      }`}
                    >
                      <input
                        className="h-4 w-4 accent-[#0f766e]"
                        type="checkbox"
                        checked={form.share_user_ids.includes(connection.id)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            share_user_ids: event.target.checked
                              ? [...current.share_user_ids, connection.id]
                              : current.share_user_ids.filter((id) => id !== connection.id),
                            event_visibility:
                              event.target.checked && current.event_visibility === "private"
                                ? "together"
                                : current.event_visibility,
                          }))
                        }
                      />
                      {connection.username}
                    </label>
                  ))}
                  {connections.length === 0 && (
                    <p className="text-sm text-[#64748b]">共有できる相手はいません。</p>
                  )}
                </div>
              </div>
              {form.share_user_ids.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { value: "partner", title: "自分の予定を相手に共有" },
                    { value: "together", title: "私たちの予定" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`cursor-pointer rounded-2xl border p-3 text-sm font-bold ${
                        form.event_visibility === option.value
                          ? "border-[#0f766e] bg-[#ecfdf5] text-[#0f766e]"
                          : "border-[#d9e2ef] bg-white text-[#334155]"
                      }`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="pattern-share-type"
                        value={option.value}
                        checked={form.event_visibility === option.value}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            event_visibility: event.target.value as EventVisibility,
                          }))
                        }
                      />
                      {option.title}
                    </label>
                  ))}
                </div>
              )}
            </div>
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
                <div
                  className="mb-3 h-2 rounded-full"
                  style={{
                    backgroundColor:
                      categories.find((category) => category.id === pattern.category_id)?.color ??
                      "#cbd5e1",
                  }}
                />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#0f172a]">{pattern.label}</p>
                    <p className="mt-1 text-sm text-[#64748b]">
                      {pattern.start_time.slice(0, 5)} -{" "}
                      {pattern.next_day_end && "翌日"}
                      {pattern.end_time.slice(0, 5)}
                    </p>
                    <p className="mt-1 text-xs font-bold text-[#64748b]">
                      {categories.find((category) => category.id === pattern.category_id)?.name ??
                        "未分類"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#334155]"
                      onClick={() =>
                        setForm({
                          id: pattern.id,
                          label: pattern.label,
                          title: pattern.title,
                          start_time: pattern.start_time,
                          end_time: pattern.end_time,
                          next_day_end: pattern.next_day_end,
                          category_id: pattern.category_id ?? "",
                          event_visibility:
                            pattern.event_visibility && pattern.event_visibility !== "private"
                              ? pattern.event_visibility
                              : "together",
                          share_user_ids: pattern.share_user_ids ?? [],
                        })
                      }
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
              <p className="text-sm text-[#64748b]">まだよく使う予定はありません。</p>
            )}
          </div>
        </section>
      </div>
      <MobileNavigation />
    </main>
  );
}
