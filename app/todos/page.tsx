"use client";

// やること（ふたりで共有／自分だけ・担当・期限・リマインド）
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, OPEN_TODO_ADD, ShareCalLogo } from "@/app/components/AppNavigation";

type Todo = {
  id: string;
  owner_id: string;
  title: string;
  memo: string | null;
  is_shared: boolean;
  assignee_id: string | null;
  due_date: string | null;
  remind_at: string | null;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
};
type Partner = { id: string; name: string };
type Filter = "all" | "shared" | "mine" | "assigned";
type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

const COLS = "id, owner_id, title, memo, is_shared, assignee_id, due_date, remind_at, done_at, done_by, created_at";
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const now = () => new Date(Date.now());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const mdw = (key: string) => {
  const d = parseYmd(key);
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`;
};
/** datetime-local の値（ローカル時刻） */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const remindLabel = (iso: string) => {
  const d = new Date(iso);
  const today = ymd(now());
  const key = ymd(d);
  const day = key === today ? "今日" : key === ymd(addDays(now(), 1)) ? "明日" : `${d.getMonth() + 1}/${d.getDate()}`;
  return `${day} ${d.getHours()}:${pad2(d.getMinutes())}`;
};
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205" || code === "42703";

const BellIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export default function TodosPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [partner, setPartner] = useState<Partner | null>(null);
  const [items, setItems] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [quick, setQuick] = useState("");
  const [quickShared, setQuickShared] = useState(true);
  const [adding, setAdding] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const quickRef = useRef<HTMLInputElement>(null);
  const todayKey = useMemo(() => ymd(now()), []);

  const show = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    setUserId(user.id);
    const [todos, conns] = await Promise.all([
      supabase.from("todo_items").select(COLS).order("created_at", { ascending: false }),
      supabase
        .from("connections")
        .select("requester_id, receiver_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .limit(1),
    ]);
    if (isMissingTable(todos.error?.code)) {
      setMissing(true);
      setLoading(false);
      return;
    }
    setItems((todos.data ?? []) as Todo[]);
    const c = (conns.data ?? [])[0] as { requester_id: string; receiver_id: string } | undefined;
    if (c) {
      const pid = c.requester_id === user.id ? c.receiver_id : c.requester_id;
      const { data: prof } = await supabase.from("profiles").select("username").eq("id", pid).maybeSingle();
      setPartner({ id: pid, name: (prof?.username as string | undefined) || "相手" });
    } else {
      setPartner(null);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // 相手が追加・チェックしたものを、画面に戻ったときに反映
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  // スマホの＋（やることを追加）
  useEffect(() => {
    const focus = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(() => quickRef.current?.focus(), 150);
    };
    window.addEventListener(OPEN_TODO_ADD, focus);
    return () => window.removeEventListener(OPEN_TODO_ADD, focus);
  }, []);

  const whoLabel = (t: Todo) => {
    if (!t.is_shared || !partner) return "自分だけ";
    if (!t.assignee_id) return "ふたり · どちらでも";
    return `ふたり · ${t.assignee_id === userId ? "自分" : partner.name}`;
  };

  const visible = items.filter((t) => {
    if (filter === "shared") return t.is_shared && !!partner;
    if (filter === "mine") return !t.is_shared || !partner;
    if (filter === "assigned") return t.assignee_id === userId || ((!t.is_shared || !partner) && t.owner_id === userId);
    return true;
  });
  const open = visible.filter((t) => !t.done_at);
  const done = visible.filter((t) => t.done_at).sort((a, b) => ((a.done_at ?? "") < (b.done_at ?? "") ? 1 : -1));
  const byDue = (a: Todo, b: Todo) => ((a.due_date ?? "") < (b.due_date ?? "") ? -1 : (a.due_date ?? "") > (b.due_date ?? "") ? 1 : a.created_at < b.created_at ? 1 : -1);
  const sections = [
    { key: "late", title: "期限切れ", tone: "danger", list: open.filter((t) => t.due_date && t.due_date < todayKey).sort(byDue) },
    { key: "today", title: "今日", tone: "", list: open.filter((t) => t.due_date === todayKey).sort(byDue) },
    { key: "soon", title: "これから", tone: "", list: open.filter((t) => t.due_date && t.due_date > todayKey).sort(byDue) },
    { key: "none", title: "期限なし", tone: "", list: open.filter((t) => !t.due_date).sort(byDue) },
  ].filter((s) => s.list.length > 0);

  const addQuick = async () => {
    const title = quick.trim();
    if (!title || adding) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("todo_items")
      .insert({ title, is_shared: !!partner && quickShared })
      .select(COLS)
      .single();
    setAdding(false);
    if (error || !data) {
      show("追加できませんでした", "error");
      return;
    }
    setItems((p) => [data as Todo, ...p]);
    setQuick("");
    quickRef.current?.focus();
  };

  const toggleDone = async (t: Todo) => {
    const patch = t.done_at ? { done_at: null, done_by: null } : { done_at: now().toISOString(), done_by: userId };
    setItems((p) => p.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("todo_items").update(patch).eq("id", t.id);
    if (error) {
      setItems((p) => p.map((x) => (x.id === t.id ? t : x)));
      show("保存できませんでした", "error");
    }
  };

  const clearDone = async () => {
    const ids = done.map((t) => t.id);
    if (!ids.length) return;
    const { error } = await supabase.from("todo_items").delete().in("id", ids);
    setConfirmClear(false);
    if (error) {
      show("消せませんでした", "error");
      return;
    }
    setItems((p) => p.filter((x) => !ids.includes(x.id)));
    show(`完了した${ids.length}件を消しました`, "info");
  };

  const header = (
    <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <ShareCalLogo compact />
        <h1 className="text-2xl font-black">やること</h1>
      </div>
      <DesktopNavigation />
    </header>
  );

  if (missing) {
    return (
      <main className="page-shell min-h-screen px-4 pb-28 pt-4 sm:px-6 sm:pb-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {header}
          <div className="kt-card">
            <p className="kt-plain">
              やることを使うには、Supabase の SQL Editor で <b>supabase-todos.sql</b> を1回実行してください。
            </p>
          </div>
        </div>
        <MobileNavigation />
      </main>
    );
  }

  const filters: { key: Filter; label: string; dot?: string }[] = partner
    ? [
        { key: "all", label: "すべて" },
        { key: "shared", label: "ふたり", dot: "#6d3fd8" },
        { key: "mine", label: "自分だけ", dot: "var(--accent)" },
        { key: "assigned", label: "自分の担当" },
      ]
    : [];

  const renderItem = (t: Todo, late = false) => (
    <li key={t.id} className={`td-item ${late ? "is-late" : ""} ${t.done_at ? "is-done" : ""}`}>
      <button
        type="button"
        className="td-check"
        aria-pressed={!!t.done_at}
        aria-label={t.done_at ? `${t.title}を未完了に戻す` : `${t.title}を完了にする`}
        onClick={() => void toggleDone(t)}
      >
        {t.done_at ? "✓" : ""}
      </button>
      <button type="button" className="td-body" onClick={() => setEditing(t)}>
        <span className="td-title">{t.title}</span>
        {t.memo && !t.done_at && <span className="td-memo">{t.memo}</span>}
        <span className="td-tags">
          {t.due_date && (
            <span className={`td-tag ${late ? "is-danger" : ""}`}>
              {t.due_date === todayKey ? "今日" : late ? `${mdw(t.due_date)}まで` : mdw(t.due_date)}
            </span>
          )}
          {t.remind_at && !t.done_at && (
            <span className="td-tag is-remind">
              <BellIcon />
              {remindLabel(t.remind_at)}
            </span>
          )}
          {partner && <span className={`td-tag ${t.is_shared ? "is-shared" : "is-mine"}`}>{whoLabel(t)}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <main className="page-shell min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {header}

        <section className="td-head">
          {filters.length > 0 && (
            <div className="td-filters" role="radiogroup" aria-label="絞り込み">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.key}
                  className={`kt-chip ${filter === f.key ? "is-on" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.dot && <i className="td-dot" style={{ background: f.dot }} aria-hidden="true" />}
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <form
            className="td-quick"
            onSubmit={(e) => {
              e.preventDefault();
              void addQuick();
            }}
          >
            <span className="td-quick-plus" aria-hidden="true">＋</span>
            <input
              ref={quickRef}
              className="td-quick-input"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder="やることを追加（例：洗剤を買う）"
              aria-label="やることを追加"
              maxLength={200}
              enterKeyHint="done"
            />
            {partner && (
              <button
                type="button"
                className={`td-quick-who ${quickShared ? "is-shared" : "is-mine"}`}
                onClick={() => setQuickShared((v) => !v)}
                aria-label={quickShared ? "ふたりのやることとして追加（押すと自分だけ）" : "自分だけのやることとして追加（押すとふたり）"}
              >
                {quickShared ? "ふたり" : "自分だけ"}
              </button>
            )}
            <button type="submit" className="td-quick-add" disabled={!quick.trim() || adding}>
              追加
            </button>
          </form>
          {!partner && !loading && (
            <p className="kt-muted td-hint">相手とつながると、「ふたり」のやることを共有できます（設定 › ふたり）。</p>
          )}
        </section>

        {loading ? (
          <p className="kt-muted">読み込み中…</p>
        ) : sections.length === 0 && done.length === 0 ? (
          <div className="kt-card td-empty">
            <b>やることはありません</b>
            <p className="kt-muted">上の欄に書いて「追加」を押すと、ここに並びます。</p>
          </div>
        ) : (
          <>
            {sections.length === 0 && <p className="kt-muted td-allclear">残っているやることはありません。</p>}
            {sections.map((s) => (
              <section key={s.key} className="td-section">
                <h2 className={`td-section-title ${s.tone === "danger" ? "is-danger" : ""}`}>
                  {s.title}
                  <span>{s.list.length}</span>
                </h2>
                <ul className="td-list">{s.list.map((t) => renderItem(t, s.key === "late"))}</ul>
              </section>
            ))}

            {done.length > 0 && (
              <section className="td-section">
                <button type="button" className="td-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                  完了した {done.length}件 {showDone ? "▲" : "›"}
                </button>
                {showDone && (
                  <>
                    <ul className="td-list">{done.map((t) => renderItem(t))}</ul>
                    {confirmClear ? (
                      <div className="td-clear">
                        <span>完了した{done.length}件を消しますか？</span>
                        <button type="button" className="kt-link-danger" onClick={() => void clearDone()}>消す</button>
                        <button type="button" className="kt-text-btn" onClick={() => setConfirmClear(false)}>戻る</button>
                      </div>
                    ) : (
                      <button type="button" className="kt-text-btn td-clear-btn" onClick={() => setConfirmClear(true)}>
                        完了したものを消す
                      </button>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {editing && (
        <TodoSheet
          todo={editing}
          userId={userId}
          partner={partner}
          onClose={() => setEditing(null)}
          onSaved={(t) => {
            setItems((p) => p.map((x) => (x.id === t.id ? t : x)));
            setEditing(null);
            show("保存しました");
          }}
          onDeleted={(id) => {
            setItems((p) => p.filter((x) => x.id !== id));
            setEditing(null);
            show("削除しました", "info");
          }}
          show={show}
        />
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
        ))}
      </div>
      <MobileNavigation />
    </main>
  );
}

/* ── 1件の編集（スマホは下から・PCは中央） ── */
function TodoSheet({
  todo,
  userId,
  partner,
  onClose,
  onSaved,
  onDeleted,
  show,
}: {
  todo: Todo;
  userId: string;
  partner: Partner | null;
  onClose: () => void;
  onSaved: (t: Todo) => void;
  onDeleted: (id: string) => void;
  show: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [title, setTitle] = useState(todo.title);
  const [memo, setMemo] = useState(todo.memo ?? "");
  const [shared, setShared] = useState(todo.is_shared);
  const [assignee, setAssignee] = useState<string | null>(todo.assignee_id);
  const [due, setDue] = useState(todo.due_date ?? "");
  const [remind, setRemind] = useState(toLocalInput(todo.remind_at));
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const isOwner = todo.owner_id === userId;
  const today = now();
  const weekend = addDays(today, (6 - today.getDay() + 7) % 7 || 7);
  const dueChoices = [
    { label: "なし", value: "" },
    { label: "今日", value: ymd(today) },
    { label: "明日", value: ymd(addDays(today, 1)) },
    { label: "週末", value: ymd(weekend) },
  ];
  const at = (d: Date, h: number) => `${ymd(d)}T${pad2(h)}:00`;
  const remindChoices = [
    { label: "なし", value: "" },
    { label: "今日 20:00", value: at(today, 20) },
    { label: "明日 9:00", value: at(addDays(today, 1), 9) },
    ...(due ? [{ label: "期限の前日 20:00", value: at(addDays(parseYmd(due), -1), 20) }] : []),
  ];
  const remindPast = remind && new Date(remind).getTime() < now().getTime();

  const save = async () => {
    if (!title.trim()) {
      show("やることを入れてください", "error");
      return;
    }
    setSaving(true);
    const patch = {
      title: title.trim(),
      memo: memo.trim() || null,
      is_shared: !!partner && shared,
      assignee_id: partner && shared ? assignee : null,
      due_date: due || null,
      remind_at: remind ? new Date(remind).toISOString() : null,
    };
    const { data, error } = await supabase.from("todo_items").update(patch).eq("id", todo.id).select(COLS).single();
    setSaving(false);
    if (error || !data) {
      show("保存できませんでした", "error");
      return;
    }
    onSaved(data as Todo);
  };

  const remove = async () => {
    const { error } = await supabase.from("todo_items").delete().eq("id", todo.id);
    if (error) {
      show("削除できませんでした", "error");
      return;
    }
    onDeleted(todo.id);
  };

  const createdBy = todo.owner_id === userId ? "自分" : partner?.name ?? "相手";
  const created = new Date(todo.created_at);

  return (
    <div className="kt-overlay" onClick={onClose}>
      <div className="kt-sheet td-sheet" role="dialog" aria-modal="true" aria-label="やることを編集" onClick={(e) => e.stopPropagation()}>
        <span className="kt-handle" aria-hidden="true" />
        <div className="kt-entry-head">
          <h2>やることを編集</h2>
          <button type="button" className="kt-close" onClick={onClose}>閉じる</button>
        </div>

        <label className="kt-field">
          <span className="kt-label">やること</span>
          <input className="kt-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>

        {partner && (
          <div className="kt-field">
            <span className="kt-label">だれのやること</span>
            <div className="td-who">
              <button type="button" aria-pressed={shared} className={`td-who-btn ${shared ? "is-shared" : ""}`} onClick={() => setShared(true)}>
                ふたり<small>{partner.name}にも見える</small>
              </button>
              <button
                type="button"
                aria-pressed={!shared}
                className={`td-who-btn ${!shared ? "is-mine" : ""}`}
                onClick={() => setShared(false)}
                disabled={!isOwner && todo.is_shared}
                title={!isOwner && todo.is_shared ? "「自分だけ」に変えられるのは作った人だけです" : undefined}
              >
                自分だけ<small>{partner.name}には見えない</small>
              </button>
            </div>
          </div>
        )}

        {partner && shared && (
          <div className="kt-field">
            <span className="kt-label">担当（リマインドが届く人）</span>
            <div className="td-chips">
              {[
                { label: "どちらでも", value: null },
                { label: "自分", value: userId },
                { label: partner.name, value: partner.id },
              ].map((c) => (
                <button key={c.label} type="button" aria-pressed={assignee === c.value} className={`kt-chip ${assignee === c.value ? "is-on" : ""}`} onClick={() => setAssignee(c.value)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="kt-field">
          <span className="kt-label">期限</span>
          <div className="td-chips">
            {dueChoices.map((c) => (
              <button key={c.label} type="button" aria-pressed={due === c.value} className={`kt-chip ${due === c.value ? "is-on" : ""}`} onClick={() => setDue(c.value)}>
                {c.label}
              </button>
            ))}
            <input className="kt-input td-date" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="期限の日付" />
          </div>
        </div>

        <div className="kt-field">
          <span className="kt-label">リマインド（スマホに通知）</span>
          <div className="td-chips">
            {remindChoices.map((c) => (
              <button key={c.label} type="button" aria-pressed={remind === c.value} className={`kt-chip ${remind === c.value ? "is-on" : ""}`} onClick={() => setRemind(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
          <input className="kt-input" type="datetime-local" value={remind} onChange={(e) => setRemind(e.target.value)} aria-label="リマインドの日時" step={300} />
          {remindPast && <small className="td-warn">過ぎた日時です。保存しても通知は届きません。</small>}
          {remind && <small className="kt-muted">通知は設定 › 通知 をオンにした端末に届きます（最大5分ほど遅れることがあります）。</small>}
        </div>

        <label className="kt-field">
          <span className="kt-label">メモ</span>
          <textarea className="kt-input td-memo-input" value={memo} maxLength={2000} onChange={(e) => setMemo(e.target.value)} placeholder="なし" />
        </label>

        <p className="kt-muted td-meta">
          {createdBy}が追加 · {created.getMonth() + 1}/{created.getDate()} {created.getHours()}:{pad2(created.getMinutes())}
        </p>

        <div className="kt-entry-actions">
          {confirmDel ? (
            <button type="button" className="kt-btn td-del is-confirm" onClick={() => void remove()}>本当に削除</button>
          ) : (
            <button type="button" className="kt-btn is-ghost td-del" onClick={() => setConfirmDel(true)}>削除</button>
          )}
          <button type="button" className="kt-btn is-primary" disabled={saving} onClick={() => void save()}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
