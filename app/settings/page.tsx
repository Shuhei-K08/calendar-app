"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const defaultSettings = {
  background: "#f5f7fb",
  ownEventBackground: "#e0f2fe",
  sharedEventBackground: "#fef3c7",
  unclassifiedEvent: "#22c8d6",
};

type CalendarSettings = typeof defaultSettings;

type Category = {
  id: string;
  name: string;
  color: string;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<CalendarSettings>(() => {
    if (typeof window === "undefined") return defaultSettings;
    const saved = window.localStorage.getItem("calendar_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaultSettings,
        ...parsed,
        ownEventBackground:
          parsed.ownEventBackground ?? parsed.ownEvent ?? defaultSettings.ownEventBackground,
        sharedEventBackground:
          parsed.sharedEventBackground ?? parsed.sharedEvent ?? defaultSettings.sharedEventBackground,
        unclassifiedEvent:
          parsed.unclassifiedEvent ?? parsed.ownEvent ?? defaultSettings.unclassifiedEvent,
      };
    }
    return defaultSettings;
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#2563eb");

  const fetchCategories = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("schedule_categories")
      .select("id, name, color")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) return;

    setCategories(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCategories();
  }, [fetchCategories]);

  const save = () => {
    window.localStorage.setItem("calendar_settings", JSON.stringify(settings));
    document.documentElement.style.setProperty("--app-bg", settings.background);
    document.documentElement.style.setProperty("--own-event-bg", settings.ownEventBackground);
    document.documentElement.style.setProperty("--shared-event-bg", settings.sharedEventBackground);
    document.documentElement.style.setProperty(
      "--uncategorized-event",
      settings.unclassifiedEvent,
    );
    alert("設定を保存しました");
  };

  const addCategory = async () => {
    if (!categoryName.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase.from("schedule_categories").insert({
      name: categoryName.trim(),
      color: categoryColor,
      user_id: user.id,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setCategoryName("");
    setCategoryColor("#2563eb");
    await fetchCategories();
  };

  const updateCategory = async (category: Category, patch: Partial<Category>) => {
    const { error } = await supabase
      .from("schedule_categories")
      .update(patch)
      .eq("id", category.id);

    if (error) {
      alert(error.message);
      return;
    }

    await fetchCategories();
  };

  const deleteCategory = async (category: Category) => {
    const ok = window.confirm(`「${category.name}」を削除しますか？`);
    if (!ok) return;

    const { error } = await supabase
      .from("schedule_categories")
      .delete()
      .eq("id", category.id);

    if (error) {
      alert(error.message);
      return;
    }

    await fetchCategories();
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-4 text-[#172033] sm:px-6">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Settings
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">設定</h1>
          </div>
          <Link className="rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#334155]" href="/">
            戻る
          </Link>
        </header>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <div className="grid gap-4">
            <label className="flex items-center justify-between gap-4 rounded-xl bg-[#f8fafc] p-3">
              <span className="font-semibold text-[#334155]">背景色</span>
              <input
                type="color"
                value={settings.background}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, background: event.target.value }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-xl bg-[#f8fafc] p-3">
              <span className="font-semibold text-[#334155]">自分の予定の塗り色</span>
              <input
                type="color"
                value={settings.ownEventBackground}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    ownEventBackground: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-xl bg-[#f8fafc] p-3">
              <span className="font-semibold text-[#334155]">共有予定の塗り色</span>
              <input
                type="color"
                value={settings.sharedEventBackground}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    sharedEventBackground: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-xl bg-[#f8fafc] p-3">
              <span className="font-semibold text-[#334155]">未分類の予定色</span>
              <input
                type="color"
                value={settings.unclassifiedEvent}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    unclassifiedEvent: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <button
            className="mt-5 h-11 w-full rounded-lg bg-[#0f766e] px-4 font-semibold text-white"
            onClick={save}
          >
            保存する
          </button>
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-[#0f172a]">分類</h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              className="h-11 rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
              placeholder="分類名 例: 勤務"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
            <input
              className="h-11 w-full rounded-lg border border-[#cbd5e1] bg-white px-2 sm:w-20"
              type="color"
              value={categoryColor}
              onChange={(event) => setCategoryColor(event.target.value)}
            />
            <button
              className="h-11 rounded-lg bg-[#0f766e] px-4 font-semibold text-white"
              onClick={addCategory}
            >
              追加
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {categories.map((category) => (
              <div key={category.id} className="grid gap-2 rounded-xl bg-[#f8fafc] p-3 sm:grid-cols-[1fr_auto_auto]">
                <input
                  className="h-10 rounded-lg border border-[#cbd5e1] px-3 text-sm"
                  value={category.name}
                  onChange={(event) =>
                    setCategories((current) =>
                      current.map((item) =>
                        item.id === category.id
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    )
                  }
                  onBlur={(event) => updateCategory(category, { name: event.target.value })}
                />
                <input
                  className="h-10 w-full rounded-lg border border-[#cbd5e1] bg-white px-2 sm:w-20"
                  type="color"
                  value={category.color}
                  onChange={(event) =>
                    updateCategory(category, { color: event.target.value })
                  }
                />
                <button
                  className="rounded-lg border border-[#fecdd3] px-3 py-2 text-sm font-semibold text-[#be123c]"
                  onClick={() => deleteCategory(category)}
                >
                  削除
                </button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-[#64748b]">
                分類はまだありません。SQL実行後に追加できます。
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
