"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

/* ── Toast ── */
type ToastItem = { id: number; msg: string; type: "success" | "error" | "info" };

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const show = (msg: string, type: ToastItem["type"] = "success") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, msg, type }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };
  return { toasts, show };
}

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}

/* ── Types ── */
const defaultSettings = {
  designTheme: "clean",
  background: "#f5f7fb",
  calendarWeekStart: "monday",
  ownEventBackground: "#e0f2fe",
  partnerEventBackground: "#e0f2fe",
  incomingEventBackground: "#ede9fe",
  sharedEventBackground: "#fef3c7",
  unclassifiedEvent: "#22c8d6",
  notificationsEnabled: true,
};
type CalendarSettings = typeof defaultSettings;

const designThemes = [
  { id: "clean",  name: "クリーン", description: "明るく見やすい配色", background: "#f5f7fb", accent: "#0f766e", preview: ["#e0f2fe", "#fef3c7", "#ffffff"] },
  { id: "mint",   name: "ミント",   description: "やわらかい緑で落ち着く", background: "#f0fdfa", accent: "#0d9488", preview: ["#ccfbf1", "#fef3c7", "#ffffff"] },
  { id: "sky",    name: "スカイ",   description: "青みのさわやかな配色",  background: "#eef6ff", accent: "#2563eb", preview: ["#dbeafe", "#fef9c3", "#ffffff"] },
  { id: "rose",   name: "ローズ",   description: "やさしいあたたかい配色", background: "#fff7f7", accent: "#e11d48", preview: ["#ffe4e6", "#fef3c7", "#ffffff"] },
];

type Category = { id: string; name: string; color: string };
type RecurrenceRule = "weekly" | "monthly" | "yearly";
type EventVisibility = "private" | "partner" | "together";
type RecurringEvent = {
  id: string; title: string; start_at: string; end_at: string; all_day: boolean | null;
  recurrence_rule: RecurrenceRule; recurrence_until: string | null;
  category_id: string | null; event_visibility: EventVisibility | null;
  sharedWith: { id: string; username: string }[];
};
type RecurringForm = {
  id?: string; title: string; start: string; end: string; allDay: boolean;
  recurrenceRule: RecurrenceRule; recurrenceUntil: string;
  categoryId: string; selectedUserIds: string[]; shareType: EventVisibility;
};
type ConnectedUser = { id: string; username: string };
type SettingsSection = "profile" | "design" | "categories" | "recurring" | "guide";

const formatDateTimeLocal = (date: Date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

const createBlankRecurring = (): RecurringForm => {
  const s = new Date(); s.setHours(9, 0, 0, 0);
  const e = new Date(); e.setHours(10, 0, 0, 0);
  return { title: "", start: formatDateTimeLocal(s), end: formatDateTimeLocal(e), allDay: false, recurrenceRule: "weekly", recurrenceUntil: "", categoryId: "", selectedUserIds: [], shareType: "together" };
};

/* ── Confirm modal ── */
function ConfirmModal({ title, description, confirmLabel, onConfirm, onCancel, danger = true }: {
  title: string; description: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-card">
        <h3 className="text-lg font-black text-[#0f172a]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#475569]">{description}</p>
        <div className="mt-5 flex gap-2 justify-end">
          <button className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-sm font-bold text-[#475569]" onClick={onCancel}>キャンセル</button>
          <button className={`h-10 rounded-xl px-4 text-sm font-bold text-white ${danger ? "bg-[#be123c] hover:bg-[#9f1239]" : "bg-[#0f766e] hover:bg-[#115e59]"}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { toasts, show } = useToast();

  const [settings, setSettings] = useState<CalendarSettings>(() => {
    if (typeof window === "undefined") return defaultSettings;
    const saved = window.localStorage.getItem("calendar_settings");
    if (saved) {
      const p = JSON.parse(saved);
      return {
        ...defaultSettings, ...p,
        ownEventBackground: p.ownEventBackground ?? p.ownEvent ?? defaultSettings.ownEventBackground,
        sharedEventBackground: p.sharedEventBackground ?? p.sharedEvent ?? defaultSettings.sharedEventBackground,
        partnerEventBackground: p.partnerEventBackground ?? p.ownEventBackground ?? defaultSettings.partnerEventBackground,
        incomingEventBackground: p.incomingEventBackground ?? defaultSettings.incomingEventBackground,
        unclassifiedEvent: p.unclassifiedEvent ?? p.ownEvent ?? defaultSettings.unclassifiedEvent,
        calendarWeekStart: p.calendarWeekStart === "sunday" ? "sunday" : "monday",
      };
    }
    return defaultSettings;
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [connections, setConnections] = useState<ConnectedUser[]>([]);
  const [recurringEvents, setRecurringEvents] = useState<RecurringEvent[]>([]);
  const [recurringForm, setRecurringForm] = useState<RecurringForm>(createBlankRecurring);
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#2563eb");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<Category | null>(null);
  const normalizedDeleteConfirmText = deleteConfirmText.replace(/\s/g, "");

  const fetchCategories = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("schedule_categories").select("id, name, color").eq("user_id", user.id).order("created_at", { ascending: true });
    setCategories(data ?? []);
  }, []);

  const fetchRecurringEvents = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from("recurring_events")
      .select("id, title, start_at, end_at, all_day, recurrence_rule, recurrence_until, category_id, event_visibility")
      .eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) return;
    const rows = (data ?? []) as Omit<RecurringEvent, "sharedWith">[];
    const ids = rows.map((r) => r.id);
    let shareRows: { recurring_event_id: string; shared_with: string }[] = [];
    if (ids.length > 0) {
      const { data: shares } = await supabase.from("recurring_event_shares")
        .select("recurring_event_id, shared_with").in("recurring_event_id", ids);
      shareRows = (shares ?? []) as { recurring_event_id: string; shared_with: string }[];
    }
    const userIds = Array.from(new Set(shareRows.map((s) => s.shared_with)));
    let profileMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", userIds);
      profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));
    }
    setRecurringEvents(rows.map((r) => ({
      ...r,
      sharedWith: shareRows.filter((s) => s.recurring_event_id === r.id)
        .map((s) => ({ id: s.shared_with, username: profileMap.get(s.shared_with) ?? "共有先" })),
    })));
  }, []);

  const fetchConnections = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: conns } = await supabase.from("connections")
      .select("requester_id, receiver_id").eq("status", "accepted")
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
    const ids = (conns ?? []).map((c) => c.requester_id === user.id ? c.receiver_id : c.requester_id);
    if (ids.length === 0) { setConnections([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", ids);
    setConnections(profiles ?? []);
  }, []);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? "");
    const { data } = await supabase.from("profiles").select("username, share_code").eq("id", user.id).maybeSingle();
    setUsername(data?.username ?? "");
    setShareCode(data?.share_code ?? "");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProfile();
    void fetchCategories();
    void fetchRecurringEvents();
    void fetchConnections();
  }, [fetchCategories, fetchConnections, fetchProfile, fetchRecurringEvents]);

  const saveDesign = () => {
    const theme = designThemes.find((t) => t.id === settings.designTheme) ?? designThemes[0];
    window.localStorage.setItem("calendar_settings", JSON.stringify(settings));
    window.localStorage.removeItem("sharecal_theme");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "light";
    document.documentElement.style.setProperty("--app-bg", theme.background);
    document.documentElement.style.setProperty("--background", theme.background);
    document.documentElement.style.setProperty("--app-accent", theme.accent);
    document.documentElement.style.setProperty("--accent", theme.accent);
    document.documentElement.style.setProperty("--own-event-bg", settings.ownEventBackground);
    document.documentElement.style.setProperty("--partner-event-bg", settings.partnerEventBackground);
    document.documentElement.style.setProperty("--incoming-event-bg", settings.incomingEventBackground);
    document.documentElement.style.setProperty("--shared-event-bg", settings.sharedEventBackground);
    document.documentElement.style.setProperty("--uncategorized-event", settings.unclassifiedEvent);
    show("デザイン設定を保存しました");
  };

  const addCategory = async () => {
    if (!categoryName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("schedule_categories").insert({ name: categoryName.trim(), color: categoryColor, user_id: user.id });
    if (error) { show(error.message, "error"); return; }
    setCategoryName(""); setCategoryColor("#2563eb");
    await fetchCategories();
    show("分類を追加しました");
  };

  const updateCategory = async (category: Category, patch: Partial<Category>) => {
    const { error } = await supabase.from("schedule_categories").update(patch).eq("id", category.id);
    if (error) { show(error.message, "error"); return; }
    await fetchCategories();
  };

  const deleteCategory = async (category: Category) => {
    const { error } = await supabase.from("schedule_categories").delete().eq("id", category.id);
    if (error) { show(error.message, "error"); return; }
    setConfirmDeleteCategory(null);
    await fetchCategories();
    show(`「${category.name}」を削除しました`, "info");
  };

  const copyShareCode = async () => {
    if (!shareCode) return;
    await navigator.clipboard.writeText(shareCode);
    show("共有IDをコピーしました", "info");
  };

  const saveUsername = async () => {
    if (!username.trim()) return;
    setSavingProfile(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingProfile(false); return; }
    const { error } = await supabase.from("profiles").update({ username: username.trim() }).eq("id", user.id);
    setSavingProfile(false);
    if (error) { show(error.message, "error"); return; }
    show("ユーザー名を更新しました");
  };

  const updatePassword = async () => {
    if (newPassword.length < 6) { show("パスワードは6文字以上にしてください", "error"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { show(error.message, "error"); return; }
    setNewPassword("");
    show("パスワードを更新しました");
  };

  const saveRecurringEvent = async () => {
    if (!recurringForm.title.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const startAt = new Date(recurringForm.start).toISOString();
    const endAt = new Date(recurringForm.end).toISOString();
    if (new Date(endAt) <= new Date(startAt)) { show("終了は開始より後にしてください", "error"); return; }
    const payload = {
      user_id: user.id, title: recurringForm.title.trim(), start_at: startAt, end_at: endAt,
      note: null, all_day: recurringForm.allDay, category_id: recurringForm.categoryId || null,
      event_visibility: recurringForm.selectedUserIds.length > 0 ? recurringForm.shareType : "private",
      recurrence_rule: recurringForm.recurrenceRule,
      recurrence_until: recurringForm.recurrenceUntil ? new Date(`${recurringForm.recurrenceUntil}T23:59:59`).toISOString() : null,
    };
    const result = recurringForm.id
      ? await supabase.from("recurring_events").update(payload).eq("id", recurringForm.id).select("id").single()
      : await supabase.from("recurring_events").insert(payload).select("id").single();
    const { data: saved, error } = result;
    if (error) { show(error.code === "PGRST205" ? "SQLを再実行してください" : error.message, "error"); return; }
    const rid = recurringForm.id ?? saved.id;
    await supabase.from("recurring_event_shares").delete().eq("recurring_event_id", rid);
    if (recurringForm.selectedUserIds.length > 0) {
      const { error: se } = await supabase.from("recurring_event_shares").insert(
        recurringForm.selectedUserIds.map((uid) => ({ recurring_event_id: rid, shared_with: uid })),
      );
      if (se) { show(se.message, "error"); return; }
    }
    setRecurringForm(createBlankRecurring());
    await fetchRecurringEvents();
    show(recurringForm.id ? "繰り返し予定を更新しました" : "繰り返し予定を追加しました");
  };

  const editRecurring = (ev: RecurringEvent) => {
    setRecurringForm({
      id: ev.id, title: ev.title,
      start: formatDateTimeLocal(new Date(ev.start_at)),
      end: formatDateTimeLocal(new Date(ev.end_at)),
      allDay: ev.all_day ?? false,
      recurrenceRule: ev.recurrence_rule,
      recurrenceUntil: ev.recurrence_until ? ev.recurrence_until.slice(0, 10) : "",
      categoryId: ev.category_id ?? "",
      selectedUserIds: ev.sharedWith.map((u) => u.id),
      shareType: ev.event_visibility && ev.event_visibility !== "private" ? ev.event_visibility : "together",
    });
  };

  const deleteRecurring = async (ev: RecurringEvent) => {
    const { error } = await supabase.from("recurring_events").delete().eq("id", ev.id);
    if (error) { show(error.message, "error"); return; }
    await fetchRecurringEvents();
    show(`「${ev.title}」を削除しました`, "info");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const deleteAccount = async () => {
    setDeleteError("");
    if (!deletePassword || normalizedDeleteConfirmText !== "削除する") {
      setDeleteError("パスワードを入力し、確認欄に「削除する」と入力してください。"); return;
    }
    setDeletingAccount(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setDeleteError("ログイン情報がありません。"); setDeletingAccount(false); return; }
    const em = session.user.email;
    if (!em) { setDeleteError("メールアドレスを確認できません。"); setDeletingAccount(false); return; }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: em, password: deletePassword });
    if (signInError) { setDeleteError("パスワードが正しくありません。"); setDeletingAccount(false); return; }
    const { data: { session: refreshed } } = await supabase.auth.getSession();
    const resp = await fetch("/api/account/delete", {
      method: "POST",
      headers: { authorization: `Bearer ${(refreshed ?? session).access_token}` },
    });
    const result = await resp.json();
    if (!resp.ok) { setDeleteError(result.error ?? "アカウント削除に失敗しました"); setDeletingAccount(false); return; }
    await supabase.auth.signOut();
    router.push("/account-deleted");
  };

  const sections: { id: SettingsSection; label: string; emoji: string }[] = [
    { id: "profile",   label: "プロフィール",     emoji: "👤" },
    { id: "design",    label: "デザイン",          emoji: "🎨" },
    { id: "categories",label: "分類",              emoji: "🏷️" },
    { id: "recurring", label: "くり返し予定",      emoji: "🔄" },
    { id: "guide",     label: "使い方",            emoji: "📖" },
  ];

  return (
    <main className="page-shell min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-6">
      <ToastStack toasts={toasts} />

      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {/* Header */}
        <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShareCalLogo compact />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Settings</p>
              <h1 className="mt-0.5 text-2xl font-black text-[#0f172a]">設定</h1>
            </div>
          </div>
          <DesktopNavigation />
        </header>

        {/* Section tabs */}
        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-3 shadow-sm">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {sections.map(({ id, label, emoji }) => (
              <button
                key={id}
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs font-bold transition ${
                  activeSection === id
                    ? "bg-[#0f766e] text-white shadow-sm"
                    : "bg-[#f8fafc] text-[#334155] hover:bg-[#e0f2fe] hover:text-[#0f766e]"
                }`}
                onClick={() => setActiveSection(id)}
              >
                <span className="text-base">{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Profile ── */}
        {activeSection === "profile" && (
          <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
            <h2 className="mb-5 text-lg font-black text-[#0f172a]">プロフィール</h2>
            <div className="grid gap-4">

              {/* Email */}
              <div className="rounded-2xl bg-[#f8fafc] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#94a3b8]">メールアドレス</p>
                <p className="mt-1.5 break-all font-bold text-[#0f172a]">{email || "読み込み中"}</p>
              </div>

              {/* Username */}
              <div className="rounded-2xl border border-[#d9e2ef] p-4">
                <p className="mb-2 text-sm font-bold text-[#0f172a]">ユーザー名</p>
                <div className="flex gap-2">
                  <input
                    className="h-11 flex-1 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-2 focus:ring-[#99f6e4]"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveUsername()}
                  />
                  <button
                    className="h-11 rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white transition hover:bg-[#115e59] disabled:opacity-50"
                    disabled={savingProfile || !username.trim()}
                    onClick={saveUsername}
                  >
                    {savingProfile ? "保存中" : "保存"}
                  </button>
                </div>
              </div>

              {/* Share code */}
              <div className="rounded-2xl border border-[#d9e2ef] p-4">
                <p className="mb-1 text-sm font-bold text-[#0f172a]">あなたの共有ID</p>
                <p className="mb-3 text-xs text-[#64748b]">この ID を相手に教えると「つながる」で申請を送れます</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-xl border border-[#d9e2ef] bg-[#f8fafc] px-4 py-3">
                    <p className="text-lg font-black tracking-[0.14em] text-[#0f172a]">{shareCode || "読み込み中"}</p>
                  </div>
                  <button
                    className="h-12 rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white transition hover:bg-[#115e59]"
                    onClick={copyShareCode}
                  >
                    コピー
                  </button>
                </div>
              </div>

              {/* Password */}
              <div className="rounded-2xl border border-[#d9e2ef] p-4">
                <p className="mb-2 text-sm font-bold text-[#0f172a]">パスワード変更</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-3 pr-10 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-2 focus:ring-[#99f6e4]"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="新しいパスワード（6文字以上）"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#94a3b8]"
                      onClick={() => setShowNewPassword((v) => !v)}
                    >
                      {showNewPassword ? (
                        <svg viewBox="0 0 24 24" className="h-4 w-4" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-4 w-4" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <button
                    className="h-11 rounded-xl border border-[#0f766e] px-4 text-sm font-bold text-[#0f766e] transition hover:bg-[#ecfdf5] disabled:opacity-50"
                    disabled={newPassword.length < 6}
                    onClick={updatePassword}
                  >
                    変更
                  </button>
                </div>
              </div>

              {/* Danger zone */}
              <div className="rounded-2xl border border-[#fecdd3] p-4">
                <p className="text-sm font-bold text-[#be123c]">アカウント削除</p>
                <p className="mt-1 text-xs leading-5 text-[#94a3b8]">
                  予定・分類・共有情報が削除され、元に戻せません。
                </p>
                <button
                  className="mt-3 h-10 rounded-xl border border-[#fecdd3] px-4 text-sm font-semibold text-[#be123c] transition hover:bg-[#fff1f2]"
                  onClick={() => { setDeletePassword(""); setDeleteConfirmText(""); setDeleteError(""); setDeleteModalOpen(true); }}
                >
                  アカウントを削除
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Design ── */}
        {activeSection === "design" && (
          <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
            <h2 className="mb-5 text-lg font-black text-[#0f172a]">デザイン</h2>
            <div className="grid gap-4">
              <div>
                <p className="mb-3 text-sm font-bold text-[#475569]">テーマカラー</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {designThemes.map((theme) => (
                    <button
                      key={theme.id}
                      className={`rounded-2xl border p-4 text-left transition ${
                        settings.designTheme === theme.id
                          ? "border-[#0f766e] bg-[#ecfdf5] shadow-sm"
                          : "border-[#d9e2ef] bg-[#f8fafc] hover:border-[#94a3b8]"
                      }`}
                      onClick={() => setSettings((s) => ({ ...s, designTheme: theme.id, background: theme.background }))}
                    >
                      <span className="font-bold text-[#0f172a]">{theme.name}</span>
                      <span className="mt-0.5 block text-xs text-[#64748b]">{theme.description}</span>
                      <span className="mt-3 flex gap-2">
                        {theme.preview.map((c) => (
                          <span key={c} className="h-7 flex-1 rounded-lg border border-white shadow-sm" style={{ background: c }} />
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-4">
                <p className="mb-3 text-sm font-bold text-[#475569]">予定の色カスタマイズ</p>
                <div className="grid gap-2">
                  {[
                    { label: "自分の予定", key: "ownEventBackground" as keyof CalendarSettings },
                    { label: "相手に共有した予定", key: "partnerEventBackground" as keyof CalendarSettings },
                    { label: "相手から共有された予定", key: "incomingEventBackground" as keyof CalendarSettings },
                    { label: "私たちの予定", key: "sharedEventBackground" as keyof CalendarSettings },
                    { label: "未分類の予定の枠色", key: "unclassifiedEvent" as keyof CalendarSettings },
                  ].map(({ label, key }) => (
                    <label key={key} className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
                      <span className="text-sm font-semibold text-[#334155]">{label}</span>
                      <input
                        type="color"
                        className="h-9 w-14 cursor-pointer rounded-lg border border-[#d9e2ef] bg-white px-1"
                        value={settings[key] as string}
                        onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                  <label className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
                    <span>
                      <span className="block text-sm font-semibold text-[#334155]">ブラウザ通知</span>
                      <span className="text-xs text-[#64748b]">共有予定のブラウザ通知</span>
                    </span>
                    <input className="h-5 w-5 accent-[#0f766e]" type="checkbox"
                      checked={settings.notificationsEnabled}
                      onChange={(e) => setSettings((s) => ({ ...s, notificationsEnabled: e.target.checked }))}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-4">
                <p className="mb-3 text-sm font-bold text-[#475569]">カレンダー表示</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    {
                      value: "monday",
                      label: "月曜始まり",
                      description: "勤務表や週単位の予定を見やすくします",
                    },
                    {
                      value: "sunday",
                      label: "日曜始まり",
                      description: "一般的な月間カレンダーに近い並びです",
                    },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`rounded-2xl border p-4 text-left transition ${
                        settings.calendarWeekStart === option.value
                          ? "border-[#0f766e] bg-[#ecfdf5] shadow-sm"
                          : "border-[#d9e2ef] bg-white hover:border-[#94a3b8]"
                      }`}
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          calendarWeekStart: option.value,
                        }))
                      }
                    >
                      <span className="block text-sm font-black text-[#0f172a]">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-[#64748b]">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <button className="h-12 w-full rounded-xl bg-[#0f766e] px-4 font-bold text-white shadow-sm transition hover:bg-[#115e59]" onClick={saveDesign}>
                デザインを保存
              </button>
            </div>
          </section>
        )}

        {/* ── Categories ── */}
        {activeSection === "categories" && (
          <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
            <h2 className="mb-5 text-lg font-black text-[#0f172a]">分類管理</h2>

            <div className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-4">
              <p className="mb-3 text-sm font-bold text-[#0f172a]">新しい分類を追加</p>
              <div className="flex gap-2">
                <input
                  className="h-11 flex-1 rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  placeholder="例：勤務、プライベート"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCategory()}
                />
                <input
                  className="h-11 w-14 rounded-xl border border-[#cbd5e1] bg-white px-2 cursor-pointer"
                  type="color"
                  value={categoryColor}
                  onChange={(e) => setCategoryColor(e.target.value)}
                />
                <button
                  className="h-11 rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white transition hover:bg-[#115e59] disabled:opacity-50"
                  disabled={!categoryName.trim()}
                  onClick={addCategory}
                >
                  追加
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-3 rounded-2xl border border-[#d9e2ef] bg-white p-3 shadow-sm">
                  <span className="h-5 w-5 flex-shrink-0 rounded-full" style={{ background: cat.color }} />
                  <input
                    className="h-10 flex-1 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:bg-white focus:ring-2 focus:ring-[#99f6e4]"
                    value={cat.name}
                    onChange={(e) => setCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, name: e.target.value } : c))}
                    onBlur={(e) => updateCategory(cat, { name: e.target.value })}
                  />
                  <input
                    className="h-10 w-12 cursor-pointer rounded-lg border border-[#e2e8f0] bg-white px-1"
                    type="color"
                    value={cat.color}
                    onChange={(e) => updateCategory(cat, { color: e.target.value })}
                  />
                  {confirmDeleteCategory?.id === cat.id ? (
                    <div className="flex gap-1.5">
                      <button className="h-9 rounded-lg bg-[#be123c] px-3 text-xs font-bold text-white" onClick={() => deleteCategory(cat)}>削除</button>
                      <button className="h-9 rounded-lg border border-[#cbd5e1] px-3 text-xs font-bold text-[#475569]" onClick={() => setConfirmDeleteCategory(null)}>戻る</button>
                    </div>
                  ) : (
                    <button className="h-9 rounded-lg border border-[#fecdd3] px-3 text-xs font-bold text-[#be123c]" onClick={() => setConfirmDeleteCategory(cat)}>削除</button>
                  )}
                </div>
              ))}
              {categories.length === 0 && (
                <p className="rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-5 text-sm text-[#64748b]">
                  分類はまだありません。上から追加できます。
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Recurring ── */}
        {activeSection === "recurring" && (
          <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-black text-[#0f172a]">くり返し予定</h2>
            <p className="mb-5 text-sm text-[#64748b]">誕生日・週次ミーティングなど定期的な予定を登録できます。</p>

            <div className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-4">
              <h3 className="mb-3 text-sm font-bold text-[#0f172a]">
                {recurringForm.id ? "くり返し予定を編集" : "新しいくり返し予定"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-bold text-[#64748b]">予定名</span>
                  <input
                    className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                    placeholder="例：週次ミーティング"
                    value={recurringForm.title}
                    onChange={(e) => setRecurringForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-[#64748b]">開始時刻</span>
                  <input className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm" type={recurringForm.allDay ? "date" : "datetime-local"} value={recurringForm.allDay ? recurringForm.start.slice(0, 10) : recurringForm.start} onChange={(e) => setRecurringForm((f) => ({ ...f, start: recurringForm.allDay ? `${e.target.value}T00:00` : e.target.value }))} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-[#64748b]">終了時刻</span>
                  <input className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm" type={recurringForm.allDay ? "date" : "datetime-local"} value={recurringForm.allDay ? recurringForm.end.slice(0, 10) : recurringForm.end} onChange={(e) => setRecurringForm((f) => ({ ...f, end: recurringForm.allDay ? `${e.target.value}T23:59` : e.target.value }))} />
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-[#cbd5e1] bg-white px-3 py-3 text-sm text-[#334155] sm:col-span-2">
                  <input
                    className="h-4 w-4 accent-[#0f766e]"
                    type="checkbox"
                    checked={recurringForm.allDay}
                    onChange={(e) => setRecurringForm((f) => ({ ...f, allDay: e.target.checked }))}
                  />
                  終日の予定にする
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-[#64748b]">繰り返し</span>
                  <select className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm" value={recurringForm.recurrenceRule} onChange={(e) => setRecurringForm((f) => ({ ...f, recurrenceRule: e.target.value as RecurrenceRule }))}>
                    <option value="weekly">毎週</option>
                    <option value="monthly">毎月</option>
                    <option value="yearly">毎年</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-[#64748b]">繰り返し終了日（任意）</span>
                  <input className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm" type="date" value={recurringForm.recurrenceUntil} onChange={(e) => setRecurringForm((f) => ({ ...f, recurrenceUntil: e.target.value }))} />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-bold text-[#64748b]">分類</span>
                  <select className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm" value={recurringForm.categoryId} onChange={(e) => setRecurringForm((f) => ({ ...f, categoryId: e.target.value }))}>
                    <option value="">未分類</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-xs font-bold text-[#64748b]">共有する相手</p>
                  <div className="flex flex-wrap gap-2">
                    {connections.map((conn) => (
                      <label key={conn.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${recurringForm.selectedUserIds.includes(conn.id) ? "border-[#0f766e] bg-[#ecfdf5] text-[#0f766e]" : "border-[#cbd5e1] bg-white text-[#334155]"}`}>
                        <input className="h-4 w-4 accent-[#0f766e]" type="checkbox" checked={recurringForm.selectedUserIds.includes(conn.id)}
                          onChange={(e) => setRecurringForm((f) => ({
                            ...f,
                            selectedUserIds: e.target.checked ? [...f.selectedUserIds, conn.id] : f.selectedUserIds.filter((id) => id !== conn.id),
                          }))}
                        />
                        {conn.username}
                      </label>
                    ))}
                    {connections.length === 0 && <p className="text-sm text-[#64748b]">共有できる相手はいません。</p>}
                  </div>
                  {recurringForm.selectedUserIds.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {[
                        { value: "partner", title: "自分の予定を相手に共有", desc: "自分の予定として持ったまま共有" },
                        { value: "together", title: "私たちの予定", desc: "共通の予定として表示" },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className={`cursor-pointer rounded-2xl border p-3 transition ${recurringForm.shareType === option.value ? "border-[#0f766e] bg-[#ecfdf5]" : "border-[#d9e2ef] bg-white"}`}
                        >
                          <input className="sr-only" type="radio" name="recurring-share-type" value={option.value} checked={recurringForm.shareType === option.value}
                            onChange={(e) => setRecurringForm((f) => ({ ...f, shareType: e.target.value as EventVisibility }))}
                          />
                          <span className="block text-sm font-black text-[#0f172a]">{option.title}</span>
                          <span className="mt-0.5 block text-xs font-semibold text-[#64748b]">{option.desc}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className={`mt-4 grid gap-2 ${recurringForm.id ? "sm:grid-cols-2" : ""}`}>
                {recurringForm.id && (
                  <button className="h-11 rounded-xl border border-[#cbd5e1] px-4 font-bold text-[#334155]" onClick={() => setRecurringForm(createBlankRecurring())}>編集をやめる</button>
                )}
                <button
                  className="h-11 rounded-xl bg-[#0f766e] px-4 font-bold text-white transition hover:bg-[#115e59] disabled:opacity-50"
                  disabled={!recurringForm.title.trim()}
                  onClick={saveRecurringEvent}
                >
                  {recurringForm.id ? "変更を保存" : "追加する"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {recurringEvents.map((ev) => (
                <div key={ev.id} className="flex flex-col gap-3 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-black text-[#0f172a]">{ev.title}</p>
                    <p className="mt-0.5 text-sm text-[#64748b]">
                      {ev.recurrence_rule === "weekly" ? "毎週" : ev.recurrence_rule === "monthly" ? "毎月" : "毎年"}
                      {" / "}{new Date(ev.start_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-sm font-bold text-[#334155]" onClick={() => editRecurring(ev)}>編集</button>
                    <button className="h-10 rounded-xl border border-[#fecdd3] px-4 text-sm font-bold text-[#be123c]" onClick={() => deleteRecurring(ev)}>削除</button>
                  </div>
                </div>
              ))}
              {recurringEvents.length === 0 && (
                <p className="rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-5 text-sm text-[#64748b]">繰り返し予定はまだありません。</p>
              )}
            </div>
          </section>
        )}

        {/* ── Guide ── */}
        {activeSection === "guide" && (
          <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-black text-[#0f172a]">使い方</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { emoji: "📅", title: "予定を登録", desc: "カレンダーの日付を押すとその日の予定登録画面が開きます。" },
                { emoji: "✏️", title: "予定を編集", desc: "予定を押すと詳細が表示され、タイトル・時間・メモを編集できます。" },
                { emoji: "⚡", title: "よく使う予定", desc: "登録しておくと予定追加画面でワンタップ入力できます。" },
                { emoji: "🔗", title: "予定を共有", desc: "「つながる」で接続後、予定ごとに共有する相手を選べます。" },
                { emoji: "🎨", title: "色で見分ける", desc: "分類を作ると予定の左端に色が付き、種類をひと目で確認できます。" },
                { emoji: "🔗", title: "リンク集", desc: "予定に登録したURLをカテゴリー別に一覧でき、行ったお店を後から探せます。" },
                { emoji: "🔔", title: "通知", desc: "共有予定をブラウザ通知で受け取れます。" },
                { emoji: "🔄", title: "繰り返し予定", desc: "誕生日・週次予定はここで登録するとカレンダーに自動表示されます。" },
                { emoji: "📱", title: "フィルター", desc: "カレンダー上部のフィルターで自分・相手・みんなの予定に絞れます。" },
              ].map(({ emoji, title, desc }) => (
                <div key={title} className="rounded-2xl bg-[#f8fafc] p-4">
                  <p className="flex items-center gap-2 font-bold text-[#0f172a]">
                    <span>{emoji}</span>{title}
                  </p>
                  <p className="mt-1 text-sm text-[#475569]">{desc}</p>
                </div>
              ))}
            </div>
            <button
              className="mt-4 h-11 w-full rounded-xl border border-[#cbd5e1] px-4 text-sm font-bold text-[#334155] transition hover:bg-[#f8fafc]"
              onClick={() => { window.localStorage.removeItem("calendar_tutorial_seen"); show("カレンダー画面を開くとチュートリアルが表示されます", "info"); }}
            >
              チュートリアルを再表示
            </button>
          </section>
        )}

        {/* Logout */}
        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-[#0f172a]">ログアウト</h2>
              <p className="mt-0.5 text-sm text-[#64748b]">この端末からログアウトします。</p>
            </div>
            <button className="h-11 rounded-xl border border-[#cbd5e1] px-6 font-semibold text-[#334155] transition hover:bg-[#f8fafc]" onClick={logout}>
              ログアウト
            </button>
          </div>
        </section>
      </div>

      {/* Delete Account Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f172a]/45 p-4 pt-8 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-[#fecdd3] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[#fee2e2] pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#be123c]">Delete Account</p>
                <h2 className="mt-1 text-2xl font-black text-[#0f172a]">アカウント削除の確認</h2>
              </div>
              <button className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-sm font-bold text-[#334155]" disabled={deletingAccount} onClick={() => setDeleteModalOpen(false)}>閉じる</button>
            </div>
            <div className="mt-4 rounded-2xl border border-[#fecdd3] bg-[#fff1f2] p-4 text-sm leading-6 text-[#9f1239]">
              <p className="font-black">この操作は元に戻せません。</p>
              <p className="mt-1">予定・分類・共有情報・プロフィールが削除されます。本人確認のため現在のパスワードを入力してください。</p>
            </div>
            <div className="mt-4 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-bold text-[#334155]">現在のパスワード</span>
                <input className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#be123c] focus:bg-white focus:ring-4 focus:ring-[#fecdd3]/70" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-bold text-[#334155]">確認のため「削除する」と入力</span>
                <input className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm outline-none transition focus:border-[#be123c] focus:bg-white focus:ring-4 focus:ring-[#fecdd3]/70" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
              </label>
              {deleteError && <p className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] p-3 text-sm font-bold text-[#be123c]">{deleteError}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="h-12 rounded-xl border border-[#cbd5e1] px-4 font-bold text-[#334155]" disabled={deletingAccount} onClick={() => setDeleteModalOpen(false)}>キャンセル</button>
                <button
                  className="h-12 rounded-xl bg-[#be123c] px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={deletingAccount || !deletePassword || normalizedDeleteConfirmText !== "削除する"}
                  onClick={deleteAccount}
                >
                  {deletingAccount ? "削除中…" : "完全に削除する"}
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
