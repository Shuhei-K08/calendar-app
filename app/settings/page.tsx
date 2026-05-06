"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

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
  const router = useRouter();
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

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

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const deleteAccount = async () => {
    setDeleteError("");
    if (!deletePassword || deleteConfirmText !== "削除する") {
      setDeleteError("パスワードを入力し、確認欄に「削除する」と入力してください。");
      return;
    }

    setDeletingAccount(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setDeleteError("ログイン情報がありません。");
      setDeletingAccount(false);
      return;
    }

    const email = session.user.email;
    if (!email) {
      setDeleteError("メールアドレスを確認できません。");
      setDeletingAccount(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: deletePassword,
    });

    if (signInError) {
      setDeleteError("パスワードが正しくありません。");
      setDeletingAccount(false);
      return;
    }

    const {
      data: { session: refreshedSession },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${(refreshedSession ?? session).access_token}`,
      },
    });
    const result = await response.json();

    if (!response.ok) {
      setDeleteError(result.error ?? "アカウント削除に失敗しました");
      setDeletingAccount(false);
      return;
    }

    await supabase.auth.signOut();
    router.push("/signup");
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 pb-24 pt-4 text-[#172033] sm:px-6 sm:pb-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShareCalLogo compact />
            <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Settings
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">設定</h1>
            </div>
          </div>
          <DesktopNavigation />
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
          <div className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-3">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-[#0f172a]">新しい分類を追加</h3>
              <p className="mt-1 text-xs text-[#64748b]">
                予定の左端に表示する色を登録できます。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_112px_96px] sm:items-end">
              <label className="min-w-0 space-y-1">
                <span className="text-xs font-bold text-[#64748b]">分類名</span>
                <input
                  className="h-11 w-full min-w-0 rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  placeholder="例: 勤務"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[#64748b]">色</span>
                <input
                  className="h-11 w-full rounded-lg border border-[#cbd5e1] bg-white px-2"
                  type="color"
                  value={categoryColor}
                  onChange={(event) => setCategoryColor(event.target.value)}
                />
              </label>
              <button
                className="h-11 rounded-lg bg-[#0f766e] px-4 font-semibold text-white"
                onClick={addCategory}
              >
                追加
              </button>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-[#0f172a]">登録済みの分類</h3>
              <p className="mt-1 text-xs text-[#64748b]">
                名前や色を変更できます。不要な分類は削除できます。
              </p>
            </div>
          <div className="grid gap-3">
            {categories.map((category) => (
              <div key={category.id} className="rounded-2xl border border-[#d9e2ef] bg-white p-3 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_112px_96px] sm:items-end">
                  <label className="min-w-0 space-y-1">
                    <span className="text-xs font-bold text-[#64748b]">分類名</span>
                    <input
                      className="h-10 w-full min-w-0 rounded-lg border border-[#cbd5e1] px-3 text-sm"
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
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-bold text-[#64748b]">色</span>
                    <input
                      className="h-10 w-full rounded-lg border border-[#cbd5e1] bg-white px-2"
                      type="color"
                      value={category.color}
                      onChange={(event) =>
                        updateCategory(category, { color: event.target.value })
                      }
                    />
                  </label>
                  <button
                    className="h-10 rounded-lg border border-[#fecdd3] px-3 py-2 text-sm font-semibold text-[#be123c]"
                    onClick={() => deleteCategory(category)}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-[#64748b]">
                分類はまだありません。SQL実行後に追加できます。
              </p>
            )}
          </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-[#0f172a]">使い方</h2>
          <div className="grid gap-3 text-sm text-[#475569] sm:grid-cols-2">
            <p className="rounded-xl bg-[#f8fafc] p-3">カレンダーの日付を押すと、その日の予定を登録できます。</p>
            <p className="rounded-xl bg-[#f8fafc] p-3">予定を押すと詳細を確認でき、作成した予定はタイトル・時間・メモ・分類を編集できます。</p>
            <p className="rounded-xl bg-[#f8fafc] p-3">よく使う勤務や休みは「定型予定」に登録しておくと、登録画面でワンタップ入力できます。</p>
            <p className="rounded-xl bg-[#f8fafc] p-3">「つながる」で共有IDを使って接続すると、予定ごとに共有相手を選べます。</p>
            <p className="rounded-xl bg-[#f8fafc] p-3">共有された予定は色と共有元の名前で見分けられます。自分が共有している相手も詳細で確認できます。</p>
            <p className="rounded-xl bg-[#f8fafc] p-3">TODOでは期限日時と通知日時を設定できます。通知はこの設定画面でオン/オフできます。</p>
            <p className="rounded-xl bg-[#f8fafc] p-3">分類を作ると、予定の左端の色で勤務・私用・重要などを見分けられます。</p>
            <p className="rounded-xl bg-[#f8fafc] p-3">デザインテーマや予定色は設定画面からいつでも変更できます。</p>
            <button
              className="h-10 rounded-lg border border-[#cbd5e1] px-4 text-sm font-bold text-[#334155] sm:col-span-2"
              onClick={() => {
                window.localStorage.removeItem("calendar_tutorial_seen");
                alert("カレンダー画面を開くとチュートリアルを再表示します。");
              }}
            >
              チュートリアルを再表示
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#fecdd3] bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-[#0f172a]">アカウント</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            ログアウトやアカウント削除を行えます。アカウント削除は元に戻せません。
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              className="h-11 rounded-lg border border-[#cbd5e1] px-4 font-semibold text-[#334155]"
              onClick={logout}
            >
              ログアウト
            </button>
            <button
              className="h-11 rounded-lg bg-[#be123c] px-4 font-semibold text-white"
              onClick={() => {
                setDeletePassword("");
                setDeleteConfirmText("");
                setDeleteError("");
                setDeleteModalOpen(true);
              }}
            >
              アカウント削除
            </button>
          </div>
        </section>
      </div>
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f172a]/45 p-4 pt-8 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-[#fecdd3] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[#fee2e2] pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#be123c]">
                  Delete Account
                </p>
                <h2 className="mt-1 text-2xl font-black text-[#0f172a]">
                  アカウント削除の確認
                </h2>
              </div>
              <button
                className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-sm font-bold text-[#334155]"
                disabled={deletingAccount}
                onClick={() => setDeleteModalOpen(false)}
              >
                閉じる
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-[#fecdd3] bg-[#fff1f2] p-4 text-sm leading-6 text-[#9f1239]">
              <p className="font-black">この操作は元に戻せません。</p>
              <p className="mt-1">
                予定、TODO、分類、共有情報、プロフィールが削除されます。本人確認のため、現在のパスワードを入力してください。
              </p>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-bold text-[#334155]">現在のパスワード</span>
                <input
                  className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#be123c] focus:bg-white focus:ring-4 focus:ring-[#fecdd3]/70"
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-bold text-[#334155]">
                  確認のため「削除する」と入力
                </span>
                <input
                  className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#be123c] focus:bg-white focus:ring-4 focus:ring-[#fecdd3]/70"
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                />
              </label>

              {deleteError && (
                <p className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] p-3 text-sm font-bold text-[#be123c]">
                  {deleteError}
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  className="h-12 rounded-xl border border-[#cbd5e1] px-4 font-bold text-[#334155]"
                  disabled={deletingAccount}
                  onClick={() => setDeleteModalOpen(false)}
                >
                  キャンセル
                </button>
                <button
                  className="h-12 rounded-xl bg-[#be123c] px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    deletingAccount ||
                    !deletePassword ||
                    deleteConfirmText !== "削除する"
                  }
                  onClick={deleteAccount}
                >
                  {deletingAccount ? "削除中" : "完全に削除する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <MobileNavigation />
    </main>
  );
}
