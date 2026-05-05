"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation } from "@/app/components/AppNavigation";

type Todo = {
  id: string;
  title: string;
  memo: string | null;
  due_at: string | null;
  reminder_at: string | null;
  completed: boolean;
};

const toLocalInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

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
      console.error(error);
      return;
    }

    setTodos(data ?? []);
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
            new Notification("TODOリマインダー", {
              body: todo.title,
            });
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
      alert(error.message);
      return;
    }

    resetForm();
    await fetchTodos();
  };

  const toggleTodo = async (todo: Todo) => {
    const { error } = await supabase
      .from("todos")
      .update({ completed: !todo.completed })
      .eq("id", todo.id);

    if (error) {
      alert(error.message);
      return;
    }

    await fetchTodos();
  };

  const deleteTodo = async (todo: Todo) => {
    const ok = window.confirm(`「${todo.title}」を削除しますか？`);
    if (!ok) return;

    const { error } = await supabase.from("todos").delete().eq("id", todo.id);

    if (error) {
      alert(error.message);
      return;
    }

    await fetchTodos();
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setTitle(todo.title);
    setMemo(todo.memo ?? "");
    setDueAt(toLocalInput(todo.due_at));
    setReminderAt(toLocalInput(todo.reminder_at));
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 pb-24 pt-4 text-[#172033] sm:px-6 sm:pb-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Tasks & Reminders
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">TODO</h1>
          </div>
          <DesktopNavigation />
        </header>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="h-11 rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4] sm:col-span-2"
              placeholder="TODOタイトル"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label className="space-y-1">
              <span className="text-xs font-semibold text-[#64748b]">期限日時</span>
              <input
                className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-[#64748b]">通知日時</span>
              <input
                className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                type="datetime-local"
                value={reminderAt}
                onChange={(event) => setReminderAt(event.target.value)}
              />
            </label>
            <textarea
              className="min-h-24 rounded-lg border border-[#cbd5e1] p-3 text-sm outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4] sm:col-span-2"
              placeholder="メモ"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </div>
          <div className="mt-3 grid gap-2 sm:flex">
            <button
              className="h-11 rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!title.trim()}
              onClick={saveTodo}
            >
              {editingId ? "更新する" : "追加する"}
            </button>
            {editingId && (
              <button
                className="h-11 rounded-lg border border-[#cbd5e1] px-5 text-sm font-semibold text-[#334155]"
                onClick={resetForm}
              >
                キャンセル
              </button>
            )}
          </div>
        </section>

        <section className="grid gap-3">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${
                todo.completed ? "border-[#d9e2ef] opacity-60" : "border-[#bfdbfe]"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  className="mt-1 h-5 w-5 accent-[#0f766e]"
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo)}
                />
                <div className="min-w-0 flex-1">
                  <p className={`font-bold text-[#0f172a] ${todo.completed ? "line-through" : ""}`}>
                    {todo.title}
                  </p>
                  {todo.memo && <p className="mt-1 whitespace-pre-wrap text-sm text-[#475569]">{todo.memo}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[#64748b]">
                    {todo.due_at && (
                      <span className="rounded-full bg-[#eff6ff] px-3 py-1">
                        期限 {format(new Date(todo.due_at), "M/d HH:mm", { locale: ja })}
                      </span>
                    )}
                    {todo.reminder_at && (
                      <span className="rounded-full bg-[#fffbeb] px-3 py-1">
                        通知 {format(new Date(todo.reminder_at), "M/d HH:mm", { locale: ja })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  <button
                    className="rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#334155]"
                    onClick={() => startEdit(todo)}
                  >
                    編集
                  </button>
                  <button
                    className="rounded-lg border border-[#fecdd3] px-3 py-2 text-sm text-[#be123c]"
                    onClick={() => deleteTodo(todo)}
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
          {todos.length === 0 && (
            <p className="rounded-2xl border border-[#d9e2ef] bg-white p-4 text-sm text-[#64748b]">
              TODOはまだありません。
            </p>
          )}
        </section>
      </div>
      <MobileNavigation />
    </main>
  );
}
