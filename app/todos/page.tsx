"use client";

// やること（ふたりで共有／自分だけ・担当・期限・リマインド）
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
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

const CalIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M8 3v4M16 3v4M4 10h16" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
const PeopleIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="9" cy="9" r="3" />
    <circle cx="17" cy="10" r="2.5" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 18.5a4 4 0 0 1 6.5-2.5" />
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
  const [editing, setEditing] = useState<Todo | "new" | null>(null); // "new" は新しく追加
  const [newTitle, setNewTitle] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
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
  }, [load]);
  // 相手が追加・チェックしたものを、開いている画面にもすぐ反映する
  useLiveRefresh("todos", ["todo_items", "connections"], load);

  // スマホの＋（やることを追加）→ 追加の画面を開く
  useEffect(() => {
    const open = () => {
      setNewTitle("");
      setEditing("new");
    };
    window.addEventListener(OPEN_TODO_ADD, open);
    return () => window.removeEventListener(OPEN_TODO_ADD, open);
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

  const lateCount = open.filter((t) => t.due_date && t.due_date < todayKey).length;
  const todayCount = open.filter((t) => t.due_date === todayKey).length;
  const openAll = items.filter((t) => !t.done_at);
  const countOf = (f: Filter) =>
    openAll.filter((t) =>
      f === "shared"
        ? t.is_shared && !!partner
        : f === "mine"
          ? !t.is_shared || !partner
          : f === "assigned"
            ? t.assignee_id === userId || ((!t.is_shared || !partner) && t.owner_id === userId)
            : true,
    ).length;
  const filters: { key: Filter; label: string }[] = partner
    ? [
        { key: "all", label: "すべて" },
        { key: "shared", label: "ふたり" },
        { key: "mine", label: "自分だけ" },
        { key: "assigned", label: "自分の担当" },
      ]
    : [];
  const openNew = () => {
    setNewTitle("");
    setEditing("new");
  };

  // 右端の「だれの」印
  const whoBadge = (t: Todo) => {
    if (!partner) return null;
    if (!t.is_shared) return <span className="td-who-badge is-mine" title="自分だけ" aria-label="自分だけ"><LockIcon /></span>;
    if (!t.assignee_id) return <span className="td-who-badge is-both" title="ふたり・どちらでも" aria-label="ふたり・どちらでも"><PeopleIcon /></span>;
    const me = t.assignee_id === userId;
    return (
      <span className={`td-who-badge ${me ? "is-me" : "is-partner"}`} title={`担当：${me ? "自分" : partner.name}`} aria-label={`担当：${me ? "自分" : partner.name}`}>
        {me ? "自" : partner.name.slice(0, 1)}
      </span>
    );
  };

  const renderItem = (t: Todo, late = false) => {
    const isToday = t.due_date === todayKey;
    return (
      <li key={t.id} className={`td-card ${late ? "is-late" : ""} ${t.done_at ? "is-done" : ""}`}>
        <button
          type="button"
          className="td-circle"
          aria-pressed={!!t.done_at}
          aria-label={t.done_at ? `${t.title}を未完了に戻す` : `${t.title}を完了にする`}
          onClick={() => void toggleDone(t)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 12.5 4 4 8-9" />
          </svg>
        </button>
        <button type="button" className="td-card-body" onClick={() => setEditing(t)}>
          <span className="td-card-title">{t.title}</span>
          {t.memo && !t.done_at && <span className="td-card-memo">{t.memo}</span>}
          {(t.due_date || (t.remind_at && !t.done_at)) && (
            <span className="td-card-meta">
              {t.due_date && (
                <span className={`td-meta ${late ? "is-danger" : isToday ? "is-today" : ""}`}>
                  <CalIcon />
                  {isToday ? "今日まで" : late ? `${mdw(t.due_date)}まで` : mdw(t.due_date)}
                </span>
              )}
              {t.remind_at && !t.done_at && (
                <span className="td-meta is-remind">
                  <BellIcon />
                  {remindLabel(t.remind_at)}
                </span>
              )}
            </span>
          )}
        </button>
        {whoBadge(t)}
      </li>
    );
  };

  return (
    <main className="page-shell min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {header}

        {!loading && (
          <section className="td-hero" aria-label="やることのまとめ">
            <div className="td-hero-main">
              <span className="td-hero-label">残りのやること</span>
              <b className="td-hero-num">
                {openAll.length}
                <small>件</small>
              </b>
            </div>
            <div className="td-hero-stats">
              <span className={`td-stat ${lateCount ? "is-danger" : ""}`}>
                <b>{lateCount}</b>期限切れ
              </span>
              <span className={`td-stat ${todayCount ? "is-today" : ""}`}>
                <b>{todayCount}</b>今日まで
              </span>
              <span className="td-stat">
                <b>{items.length - openAll.length}</b>完了
              </span>
            </div>
            <button type="button" className="td-hero-add" onClick={openNew}>
              ＋ やることを追加
            </button>
          </section>
        )}

        {filters.length > 0 && (
          <div className="td-tabs" role="radiogroup" aria-label="絞り込み">
            {filters.map((f) => (
              <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
                <span>{countOf(f.key)}</span>
              </button>
            ))}
          </div>
        )}
        {!partner && !loading && <p className="kt-muted td-hint">相手とつながると、「ふたり」のやることを共有できます（設定 › ふたり）。</p>}

        {loading ? (
          <p className="kt-muted">読み込み中…</p>
        ) : sections.length === 0 && done.length === 0 ? (
          <div className="td-empty-card">
            <span className="td-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="4" />
                <path d="m8.5 12 2.5 2.5 4.5-5" />
              </svg>
            </span>
            <b>やることはありません</b>
            <p>＋ボタンから、ふたりのやることや自分のやることを追加できます。</p>
            <button type="button" className="kt-btn is-primary" onClick={openNew}>
              ＋ やることを追加
            </button>
          </div>
        ) : (
          <>
            {sections.length === 0 && (
              <div className="td-allclear">
                <b>すべて完了しました</b>
                <span>残っているやることはありません。</span>
              </div>
            )}
            {sections.map((s) => (
              <section key={s.key} className="td-section">
                <h2 className={`td-section-title is-${s.key}`}>
                  {s.title}
                  <span className="td-count">{s.list.length}</span>
                </h2>
                <ul className="td-list">{s.list.map((t) => renderItem(t, s.key === "late"))}</ul>
              </section>
            ))}

            {done.length > 0 && (
              <section className="td-done">
                <button type="button" className="td-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                  <span>
                    完了した<span className="td-count">{done.length}</span>
                  </span>
                  <span aria-hidden="true" className={`td-chev ${showDone ? "is-open" : ""}`}>›</span>
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
          todo={editing === "new" ? null : editing}
          initialTitle={newTitle}
          defaultShared={true}
          userId={userId}
          partner={partner}
          onClose={() => setEditing(null)}
          onSaved={(t, isNew) => {
            setItems((p) => (isNew ? [t, ...p] : p.map((x) => (x.id === t.id ? t : x))));
            setEditing(null);
            show(isNew ? "追加しました" : "保存しました");
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


/* ── 小さなカレンダー（期限・リマインドの日を選ぶ） ── */
function MiniCalendar({
  value,
  onPick,
  minKey,
  label,
}: {
  value: string;
  onPick: (key: string) => void;
  minKey?: string; // これより前は選べない
  label: string;
}) {
  const base = value ? parseYmd(value) : now();
  const [view, setView] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const todayKey = ymd(now());
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1)),
  ];
  const move = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
  return (
    <div className="td-cal" role="group" aria-label={label}>
      <div className="td-cal-head">
        <button type="button" onClick={() => move(-1)} aria-label="前の月">‹</button>
        <b>
          {view.getFullYear()}年{view.getMonth() + 1}月
        </b>
        <button type="button" onClick={() => move(1)} aria-label="次の月">›</button>
      </div>
      <div className="td-cal-grid">
        {DOW.map((d, i) => (
          <span key={d} className={`td-cal-dow ${i === 0 ? "is-sun" : i === 6 ? "is-sat" : ""}`}>{d}</span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const key = ymd(d);
          const disabled = !!minKey && key < minKey;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={key === value}
              aria-label={`${d.getMonth() + 1}月${d.getDate()}日`}
              className={`td-cal-day ${key === todayKey ? "is-today" : ""} ${d.getDay() === 0 ? "is-sun" : d.getDay() === 6 ? "is-sat" : ""}`}
              onClick={() => onPick(key)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TIME_CHOICES = ["08:00", "09:00", "12:00", "18:00", "20:00", "21:00"];
// 通知の確認は10分ごとなので、時刻も10分刻みにする（その時刻ちょうどに届く）
const ALL_TIMES = Array.from({ length: 144 }, (_, i) => `${pad2(Math.floor(i / 6))}:${pad2((i % 6) * 10)}`);
const fmtTime = (t: string) => `${Number(t.slice(0, 2))}:${t.slice(3, 5)}`;

/* ── やることの追加・編集（スマホは下から・PCは中央） ── */
function TodoSheet({
  todo,
  initialTitle,
  defaultShared,
  userId,
  partner,
  onClose,
  onSaved,
  onDeleted,
  show,
}: {
  todo: Todo | null; // null なら新しく追加
  initialTitle: string;
  defaultShared: boolean;
  userId: string;
  partner: Partner | null;
  onClose: () => void;
  onSaved: (t: Todo, isNew: boolean) => void;
  onDeleted: (id: string) => void;
  show: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const isNew = !todo;
  const today = now();
  const todayKey = ymd(today);
  const initialRemind = todo?.remind_at ? new Date(todo.remind_at) : null;

  const [title, setTitle] = useState(todo?.title ?? initialTitle);
  const [memo, setMemo] = useState(todo?.memo ?? "");
  const [shared, setShared] = useState(todo ? todo.is_shared : defaultShared);
  const [assignee, setAssignee] = useState<string | null>(todo?.assignee_id ?? null);
  const [due, setDue] = useState(todo?.due_date ?? "");
  const [dueCal, setDueCal] = useState(false);
  const [remindOn, setRemindOn] = useState(!!initialRemind);
  const [remindDay, setRemindDay] = useState(initialRemind ? ymd(initialRemind) : "");
  const [remindTime, setRemindTime] = useState(
    initialRemind ? `${pad2(initialRemind.getHours())}:${pad2(Math.floor(initialRemind.getMinutes() / 10) * 10)}` : "20:00",
  );
  const [remindCal, setRemindCal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const isOwner = !todo || todo.owner_id === userId;

  // 新しく追加するときは、やることの欄にすぐ書けるように
  useEffect(() => {
    if (isNew) titleRef.current?.focus();
  }, [isNew]);

  // 期限の選択肢
  const satOffset = (6 - today.getDay() + 7) % 7 || 7;
  const monOffset = (8 - today.getDay()) % 7 || 7;
  const dueChoices = [
    { label: "今日", value: todayKey },
    { label: "明日", value: ymd(addDays(today, 1)) },
    { label: "明後日", value: ymd(addDays(today, 2)) },
    { label: "今週末", value: ymd(addDays(today, satOffset)) },
    { label: "来週月曜", value: ymd(addDays(today, monOffset)) },
  ];
  const dueIsCustom = !!due && !dueChoices.some((c) => c.value === due);

  // リマインドの日の選択肢（期限があれば「期限の日」「期限の前日」）
  const dayChoices = [
    ...(due && due >= todayKey ? [{ label: "期限の日", value: due }] : []),
    ...(due && ymd(addDays(parseYmd(due), -1)) >= todayKey ? [{ label: "期限の前日", value: ymd(addDays(parseYmd(due), -1)) }] : []),
    { label: "今日", value: todayKey },
    { label: "明日", value: ymd(addDays(today, 1)) },
  ].filter((c, i, a) => a.findIndex((x) => x.value === c.value) === i);
  const dayIsCustom = !!remindDay && !dayChoices.some((c) => c.value === remindDay);

  const remindDate = remindOn && remindDay ? new Date(`${remindDay}T${remindTime}:00`) : null;
  const remindPast = !!remindDate && remindDate.getTime() <= now().getTime();

  // 通知をオンにしたときの最初の日時：期限があれば前日20時、なければ今日20時（過ぎていれば明日9時）
  const turnOnRemind = () => {
    setRemindOn(true);
    if (remindDay) return;
    const prev = due ? ymd(addDays(parseYmd(due), -1)) : "";
    if (prev && new Date(`${prev}T20:00:00`).getTime() > now().getTime()) {
      setRemindDay(prev);
      setRemindTime("20:00");
    } else if (now().getHours() < 19) {
      setRemindDay(todayKey);
      setRemindTime("20:00");
    } else {
      setRemindDay(ymd(addDays(today, 1)));
      setRemindTime("09:00");
    }
  };
  const inOneHour = () => {
    const d = new Date(now().getTime() + 60 * 60 * 1000);
    const m = Math.ceil(d.getMinutes() / 10) * 10;
    d.setMinutes(m, 0, 0);
    setRemindOn(true);
    setRemindDay(ymd(d));
    setRemindTime(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  };

  const save = async () => {
    if (!title.trim()) {
      show("やることを入れてください", "error");
      titleRef.current?.focus();
      return;
    }
    if (remindPast) {
      show("リマインドの日時が過ぎています。未来の日時にしてください", "error");
      return;
    }
    setSaving(true);
    const body = {
      title: title.trim(),
      memo: memo.trim() || null,
      is_shared: !!partner && shared,
      assignee_id: partner && shared ? assignee : null,
      due_date: due || null,
      remind_at: remindDate ? remindDate.toISOString() : null,
    };
    const res = todo
      ? await supabase.from("todo_items").update(body).eq("id", todo.id).select(COLS).single()
      : await supabase.from("todo_items").insert(body).select(COLS).single();
    setSaving(false);
    if (res.error || !res.data) {
      show("保存できませんでした", "error");
      return;
    }
    onSaved(res.data as Todo, isNew);
  };

  const remove = async () => {
    if (!todo) return;
    const { error } = await supabase.from("todo_items").delete().eq("id", todo.id);
    if (error) {
      show("削除できませんでした", "error");
      return;
    }
    onDeleted(todo.id);
  };

  const created = todo ? new Date(todo.created_at) : null;
  const createdBy = todo ? (todo.owner_id === userId ? "自分" : partner?.name ?? "相手") : "";

  return (
    <div className="kt-overlay" onClick={onClose}>
      <form
        className="kt-sheet td-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "やることを追加" : "やることを編集"}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <span className="kt-handle" aria-hidden="true" />
        <div className="kt-entry-head">
          <h2>{isNew ? "やることを追加" : "やることを編集"}</h2>
          <button type="button" className="kt-close" onClick={onClose}>閉じる</button>
        </div>

        <input
          ref={titleRef}
          className="td-title-input"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="やること（例：洗剤を買う）"
          aria-label="やること"
          enterKeyHint="done"
        />

        {partner && (
          <section className="td-sec">
            <h3 className="td-sec-title">だれのやること</h3>
            <div className="td-who">
              <button type="button" aria-pressed={shared} className={`td-who-btn ${shared ? "is-shared" : ""}`} onClick={() => setShared(true)}>
                ふたり<small>{partner.name}にも見える</small>
              </button>
              <button
                type="button"
                aria-pressed={!shared}
                className={`td-who-btn ${!shared ? "is-mine" : ""}`}
                onClick={() => setShared(false)}
                disabled={!isOwner && !!todo?.is_shared}
                title={!isOwner && todo?.is_shared ? "「自分だけ」に変えられるのは作った人だけです" : undefined}
              >
                自分だけ<small>{partner.name}には見えない</small>
              </button>
            </div>
            {shared && (
              <div className="td-row">
                <span className="td-row-label">担当</span>
                <div className="td-seg" role="radiogroup" aria-label="担当">
                  {[
                    { label: "どちらでも", value: null },
                    { label: "自分", value: userId },
                    { label: partner.name, value: partner.id },
                  ].map((c) => (
                    <button key={c.label} type="button" role="radio" aria-checked={assignee === c.value} onClick={() => setAssignee(c.value)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="td-sec">
          <div className="td-sec-head">
            <h3 className="td-sec-title">期限</h3>
            {due ? (
              <span className="td-pick">
                {mdw(due)}
                <button type="button" className="td-clear-x" onClick={() => setDue("")} aria-label="期限をなしにする">×</button>
              </span>
            ) : (
              <span className="td-pick is-none">なし</span>
            )}
          </div>
          <div className="td-chips">
            {dueChoices.map((c) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={due === c.value}
                className={`kt-chip ${due === c.value ? "is-on" : ""}`}
                onClick={() => {
                  setDue(due === c.value ? "" : c.value);
                  setDueCal(false);
                }}
              >
                {c.label}
              </button>
            ))}
            <button type="button" aria-expanded={dueCal} className={`kt-chip ${dueIsCustom || dueCal ? "is-on" : ""}`} onClick={() => setDueCal((v) => !v)}>
              日付を選ぶ
            </button>
          </div>
          {dueCal && (
            <MiniCalendar
              label="期限の日"
              value={due}
              onPick={(k) => {
                setDue(k);
                setDueCal(false);
              }}
            />
          )}
        </section>

        <section className="td-sec">
          <div className="td-sec-head">
            <h3 className="td-sec-title">リマインド</h3>
            <input
              type="checkbox"
              className="st-switch"
              aria-label="リマインドを使う"
              checked={remindOn}
              onChange={(e) => (e.target.checked ? turnOnRemind() : setRemindOn(false))}
            />
          </div>
          {!remindOn ? (
            <div className="td-chips">
              <button type="button" className="kt-chip" onClick={turnOnRemind}>
                通知する
              </button>
              <button type="button" className="kt-chip" onClick={inOneHour}>
                1時間後に通知
              </button>
            </div>
          ) : (
            <>
              <div className="td-row">
                <span className="td-row-label">日</span>
                <div className="td-chips">
                  {dayChoices.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      aria-pressed={remindDay === c.value}
                      className={`kt-chip ${remindDay === c.value ? "is-on" : ""}`}
                      onClick={() => {
                        setRemindDay(c.value);
                        setRemindCal(false);
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                  <button type="button" aria-expanded={remindCal} className={`kt-chip ${dayIsCustom || remindCal ? "is-on" : ""}`} onClick={() => setRemindCal((v) => !v)}>
                    {dayIsCustom ? mdw(remindDay) : "日付を選ぶ"}
                  </button>
                </div>
              </div>
              {remindCal && (
                <MiniCalendar
                  label="リマインドの日"
                  value={remindDay}
                  minKey={todayKey}
                  onPick={(k) => {
                    setRemindDay(k);
                    setRemindCal(false);
                  }}
                />
              )}
              <div className="td-row">
                <span className="td-row-label">時刻</span>
                <div className="td-chips">
                  {TIME_CHOICES.map((t) => (
                    <button key={t} type="button" aria-pressed={remindTime === t} className={`kt-chip ${remindTime === t ? "is-on" : ""}`} onClick={() => setRemindTime(t)}>
                      {fmtTime(t)}
                    </button>
                  ))}
                  <select
                    className={`td-time-select ${TIME_CHOICES.includes(remindTime) ? "" : "is-on"}`}
                    value={remindTime}
                    onChange={(e) => setRemindTime(e.target.value)}
                    aria-label="時刻を選ぶ"
                  >
                    {ALL_TIMES.map((t) => (
                      <option key={t} value={t}>
                        {fmtTime(t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className={`td-remind-summary ${remindPast ? "is-warn" : ""}`}>
                {remindDay
                  ? remindPast
                    ? `${mdw(remindDay)} ${fmtTime(remindTime)} は過ぎています`
                    : `${mdw(remindDay)} ${fmtTime(remindTime)} に通知します${partner && shared ? `（${assignee === null ? "ふたり" : assignee === userId ? "自分" : partner.name}に届きます）` : ""}`
                  : "日を選んでください"}
              </p>
            </>
          )}
        </section>

        <section className="td-sec">
          <h3 className="td-sec-title">メモ</h3>
          <textarea className="kt-input td-memo-input" value={memo} maxLength={2000} onChange={(e) => setMemo(e.target.value)} placeholder="なし" />
        </section>

        {todo && created && (
          <p className="kt-muted td-meta">
            {createdBy}が追加 · {created.getMonth() + 1}/{created.getDate()} {created.getHours()}:{pad2(created.getMinutes())}
          </p>
        )}

        <div className="kt-entry-actions td-actions">
          {todo &&
            (confirmDel ? (
              <button type="button" className="kt-btn td-del is-confirm" onClick={() => void remove()}>本当に削除</button>
            ) : (
              <button type="button" className="kt-btn is-ghost td-del" onClick={() => setConfirmDel(true)}>削除</button>
            ))}
          <button type="submit" className="kt-btn is-primary" disabled={saving || !title.trim()}>
            {saving ? "保存中…" : isNew ? "追加する" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
