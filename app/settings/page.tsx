"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const defaultSettings = {
  designTheme: "clean",
  background: "#f5f7fb",
  ownEventBackground: "#e0f2fe",
  sharedEventBackground: "#fef3c7",
  unclassifiedEvent: "#22c8d6",
  notificationsEnabled: true,
};

type CalendarSettings = typeof defaultSettings;

const designThemes = [
  {
    id: "clean",
    name: "クリーン",
    description: "今の見た目に近い、明るく見やすい配色",
    background: "#f5f7fb",
    accent: "#0f766e",
    preview: ["#e0f2fe", "#fef3c7", "#ffffff"],
  },
  {
    id: "mint",
    name: "ミント",
    description: "やわらかい緑で落ち着いた雰囲気",
    background: "#f0fdfa",
    accent: "#0d9488",
    preview: ["#ccfbf1", "#fef3c7", "#ffffff"],
  },
  {
    id: "sky",
    name: "スカイ",
    description: "青みを少し強めた、さわやかな配色",
    background: "#eef6ff",
    accent: "#2563eb",
    preview: ["#dbeafe", "#fef9c3", "#ffffff"],
  },
  {
    id: "rose",
    name: "ローズ",
    description: "少しあたたかい、やさしい配色",
    background: "#fff7f7",
    accent: "#e11d48",
    preview: ["#ffe4e6", "#fef3c7", "#ffffff"],
  },
];

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
    const selectedTheme =
      designThemes.find((theme) => theme.id === settings.designTheme) ?? designThemes[0];
    window.localStorage.setItem("calendar_settings", JSON.stringify(settings));
    document.documentElement.style.setProperty("--app-bg", selectedTheme.background);
    document.documentElement.style.setProperty("--app-accent", selectedTheme.accent);
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
            <div>
              <h2 className="mb-3 text-base font-bold text-[#0f172a]">デザイン</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {designThemes.map((theme) => (
                  <button
                    key={theme.id}
                    className={`rounded-2xl border p-3 text-left transition ${
                      settings.designTheme === theme.id
                        ? "border-[#0f766e] bg-[#ecfdf5] shadow-sm"
                        : "border-[#d9e2ef] bg-[#f8fafc]"
                    }`}
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        designTheme: theme.id,
                        background: theme.background,
                      }))
                    }
                  >
                    <span className="font-bold text-[#0f172a]">{theme.name}</span>
                    <span className="mt-1 block text-xs text-[#64748b]">
                      {theme.description}
                    </span>
                    <span className="mt-3 flex gap-2">
                      {theme.preview.map((color) => (
                        <span
                          key={color}
                          className="h-7 flex-1 rounded-lg border border-white shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
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
            <label className="flex items-center justify-between gap-4 rounded-xl bg-[#f8fafc] p-3">
              <span>
                <span className="block font-semibold text-[#334155]">通知</span>
                <span className="text-xs text-[#64748b]">
                  共有予定とTODOリマインダーのブラウザ通知
                </span>
              </span>
              <input
                className="h-5 w-5 accent-[#0f766e]"
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    notificationsEnabled: event.target.checked,
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

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-[#0f172a]">使い方</h2>
          <div className="grid gap-3 text-sm text-[#475569]">
            <p>カレンダーの日付を押すと、その日の予定を登録できます。</p>
            <p>よく使う勤務や休みは「定型予定」に登録しておくと、予定登録時にすぐ入力できます。</p>
            <p>予定ごとに共有相手を選ぶと、相手のカレンダーに共有予定として表示されます。</p>
            <button
              className="h-10 rounded-lg border border-[#cbd5e1] px-4 text-sm font-bold text-[#334155]"
              onClick={() => {
                window.localStorage.removeItem("calendar_tutorial_seen");
                alert("カレンダー画面を開くとチュートリアルを再表示します。");
              }}
            >
              チュートリアルを再表示
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
