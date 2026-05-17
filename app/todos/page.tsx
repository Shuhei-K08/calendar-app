"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

type Todo = {
  id: string;
  title: string;
  memo: string | null;
  due_at: string | null;
  reminder_at: string | null;
  completed: boolean;
};

type ToastItem = { id: number; msg: string; type: "success" | "error" | "info" };
type Filter = "active" | "completed" | "all";

const toLocalInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

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

export default function TodosPage() {
  const { toasts, show } = useToast();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Todo | null>(null);
  const [showFormOnMobile, setShowFormOnMobile] = useState(false);

  const fetchTodos = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("todos")
      .select("id, title, memo, due_at, reminder_at, completed")
      .eq("user_id", user.id)
      .order("completed", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false });

    if (error) {
      show("TODOの取得に失敗しました", "error");
      return;
    }

    setTodos(data ?? []);
    // `show` is a stable callback created in this scope; deliberately excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTodos();
  }, [fetchTodos]);

  useEffect(() => {
    const savedSettings = window.localStorage.getItem("calendar_settings");
    const notificationsEnabled = savedSettings
      ? JSON.parse(savedSettings).notificationsEnabled ?? true
      : true;

    if (!notificationsEnabled || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }

    const timers = todos
      .filter((todo) => todo.reminder_at && !todo.completed)
      .map((todo) => {
        const delay = new Date(todo.reminder_at as string).getTime() - Date.now();
        if (delay <= 0 || delay > 2147483647) return null;
        return window.setTimeout(() => {
          if (Notification.permission === "granted") {
            new Notification("TODOリマインダー", { body: todo.title });
          }
        }, delay);
      })
      .filter((timer): timer is number => timer !== null);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [todos]);

  const resetForm = () => {
    setTitle("");
    setMemo("");
    setDueAt("");
    setReminderAt("");
    setEditingId(null);
  };

  const saveTodo = async () => {
    if (!title.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (dueAt && reminderAt && new Date(reminderAt).getTime() > new Date(dueAt).getTime()) {
      show("通知日時は期限より前にしてください", "error");
      return;
    }

    const payload = {
      title: title.trim(),
      memo: memo.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null,
      user_id: user.id,
    };

    const { error } = editingId
      ? await supabase.from("todos").update(payload).eq("id", editingId)
      : await supabase.from("todos").insert(payload);

    if (error) {
      show(error.message, "error");
      return;
    }

    show(editingId ? "TODOを更新しました" : "TODOを追加しました", "success");
    resetForm();
    setShowFormOnMobile(false);
    await fetchTodos();
  };

  const toggleTodo = async (todo: Todo) => {
    const next = !todo.completed;
    // Optimistic update for snappiness
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, completed: next } : t)));
    const { error } = await supabase.from("todos").update({ completed: next }).eq("id", todo.id);
    if (error) {
      show(error.message, "error");
      await fetchTodos();
      return;
    }
    show(next ? "完了にしました" : "未完了に戻しました", "info");
  };

  const deleteTodo = async (todo: Todo) => {
    setConfirmDelete(null);
    const { error } = await supabase.from("todos").delete().eq("id", todo.id);
    if (error) {
      show(error.message, "error");
      return;
    }
    show(`「${todo.title}」を削除しました`, "info");
    await fetchTodos();
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setTitle(todo.title);
    setMemo(todo.memo ?? "");
    setDueAt(toLocalInput(todo.due_at));
    setReminderAt(toLocalInput(todo.reminder_at));
    setShowFormOnMobile(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [nowRef] = useState(() => Date.now());
  const stats = useMemo(() => {
    const total = todos.length;
    const active = todos.filter((t) => !t.completed).length;
    const completed = total - active;
    const overdue = todos.filter(
      (t) => !t.completed && t.due_at && new Date(t.due_at).getTime() < nowRef,
    ).length;
    return { total, active, completed, overdue };
  }, [todos, nowRef]);

  const visibleTodos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return todos.filter((t) => {
      if (filter === "active" && t.completed) return false;
      if (filter === "completed" && !t.completed) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.memo ?? "").toLowerCase().includes(q)
      );
    });
  }, [todos, filter, query]);

  const renderDueLabel = (todo: Todo) => {
    if (!todo.due_at) return null;
    const due = new Date(todo.due_at);
    const isPast = !todo.completed && due.getTime() < nowRef;
    const today = new Date();
    const sameDay = due.toDateString() === today.toDateString();
    return (
      <span
        className={`badge ${isPast ? "badge-rose" : sameDay ? "badge-accent" : "badge-slate"}`}
      >
        {isPast ? "期限切れ" : sameDay ? "今日まで" : "期限"} {format(due, "M/d HH:mm", { locale: ja })}
      </span>
    );
  };

  return (
    <main className="page-shell min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-6">
      <ToastStack toasts={toasts} />

      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShareCalLogo compact />
            <div>
              <p className="eyebrow">Tasks & Reminders</p>
              <h1 className="mt-1 text-2xl font-black text-[var(--fg-strong)]">TODO</h1>
            </div>
          </div>
          <DesktopNavigation />
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "全件", value: stats.total },
            { label: "未完了", value: stats.active },
            { label: "完了", value: stats.completed },
            { label: "期限切れ", value: stats.overdue, danger: true },
          ].map((s) => (
            <div key={s.label} className="glass-card p-3 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg-muted)]">
                {s.label}
              </p>
              <p
                className="mt-1 text-2xl font-black"
                style={{ color: s.danger ? "var(--rose-strong)" : "var(--fg-strong)" }}
              >
                {s.value}
              </p>
            </div>
          ))}
        </section>

        {/* New / Edit form */}
        <section className={`glass-card p-4 ${!showFormOnMobile ? "hidden sm:block" : "block"}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black text-[var(--fg-strong)]">
              {editingId ? "TODOを編集" : "新しいTODO"}
            </h2>
            {editingId && (
              <button className="chip" onClick={resetForm}>
                編集をやめる
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="field-input sm:col-span-2"
              placeholder="例: 洗濯物を取り込む"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveTodo();
                }
              }}
            />
            <label className="min-w-0 space-y-1">
              <span className="text-xs font-bold text-[var(--fg-muted)]">期限日時</span>
              <input
                className="field-input"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="text-xs font-bold text-[var(--fg-muted)]">通知日時</span>
              <input
                className="field-input"
                type="datetime-local"
                value={reminderAt}
                onChange={(event) => setReminderAt(event.target.value)}
              />
            </label>
            <textarea
              className="field-input sm:col-span-2"
              placeholder="メモ"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={!title.trim()} onClick={saveTodo}>
              {editingId ? "更新する" : "追加する"}
            </button>
            {editingId && (
              <button className="btn btn-soft" onClick={resetForm}>
                キャンセル
              </button>
            )}
            <button
              type="button"
              className="btn btn-soft sm:hidden"
              onClick={() => {
                setShowFormOnMobile(false);
                resetForm();
              }}
            >
              閉じる
            </button>
          </div>
        </section>

        {/* Controls */}
        <section className="glass-card p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="search-input flex h-11 flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-3">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--fg-muted)]" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
                placeholder="TODOを検索"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {([
                { id: "active" as Filter, label: "未完了" },
                { id: "completed" as Filter, label: "完了" },
                { id: "all" as Filter, label: "すべて" },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  className={`chip ${filter === opt.id ? "chip-active" : ""}`}
                  onClick={() => setFilter(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* List */}
        <section className="grid gap-3">
          {visibleTodos.map((todo) => (
            <div
              key={todo.id}
              className="glass-card group p-3 transition hover:border-[var(--accent)]"
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={todo.completed ? "未完了に戻す" : "完了にする"}
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    todo.completed
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border-strong)] hover:border-[var(--accent)]"
                  }`}
                  onClick={() => toggleTodo(todo)}
                >
                  {todo.completed && (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" stroke="currentColor" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-black text-[var(--fg-strong)] ${
                      todo.completed ? "line-through opacity-60" : ""
                    }`}
                  >
                    {todo.title}
                  </p>
                  {todo.memo && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--fg-muted)]">
                      {todo.memo}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {renderDueLabel(todo)}
                    {todo.reminder_at && (
                      <span className="badge badge-slate">
                        通知 {format(new Date(todo.reminder_at), "M/d HH:mm", { locale: ja })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <button className="btn btn-soft" onClick={() => startEdit(todo)}>編集</button>
                  <button className="btn btn-danger" onClick={() => setConfirmDelete(todo)}>削除</button>
                </div>
              </div>
            </div>
          ))}
          {visibleTodos.length === 0 && (
            <div className="empty-state p-8 text-center">
              <p className="text-base">
                {filter === "completed"
                  ? "完了したTODOはまだありません。"
                  : filter === "active"
                  ? "未完了のTODOはありません。お疲れさまでした！"
                  : "TODOはまだありません。"}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* FAB: open add form on mobile */}
      <button
        className="fab sm:hidden"
        aria-label="TODOを追加"
        onClick={() => {
          resetForm();
          setShowFormOnMobile(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        新規
      </button>

      {confirmDelete && (
        <div className="confirm-overlay">
          <div className="confirm-card">
            <p className="eyebrow">確認</p>
            <h3 className="mt-1 text-lg font-black text-[var(--fg-strong)]">
              「{confirmDelete.title}」を削除しますか？
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">
              この操作は元に戻せません。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-soft" onClick={() => setConfirmDelete(null)}>キャンセル</button>
              <button className="btn btn-danger" onClick={() => void deleteTodo(confirmDelete)}>削除する</button>
            </div>
          </div>
        </div>
      )}

      <MobileNavigation />
    </main>
  );
}
