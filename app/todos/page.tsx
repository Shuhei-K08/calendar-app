"use client";

// やること（ふたりで共有／自分だけ・担当・期限・優先度・カテゴリー・何回でもリマインド）
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { DesktopNavigation, MobileNavigation, OPEN_TODO_ADD, ShareCalLogo } from "@/app/components/AppNavigation";

type Reminder = { id: string; remind_at: string; reminded_at: string | null };
type Todo = {
  id: string;
  owner_id: string;
  title: string;
  memo: string | null;
  is_shared: boolean;
  assignee_id: string | null;
  due_date: string | null;
  due_time: string | null; // "18:00:00"（null = 時刻なし）
  priority: number; // 0 なし／1 低／2 中／3 高
  category_id: string | null;
  todo_reminders: Reminder[];
  done_at: string | null;
  done_by: string | null;
  created_at: string;
};
type Category = { id: string; owner_id: string; name: string; color: string };
type Partner = { id: string; name: string };
type Filter = "all" | "shared" | "mine" | "assigned";
type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

const COLS =
  "id, owner_id, title, memo, is_shared, assignee_id, due_date, due_time, priority, category_id, done_at, done_by, created_at, todo_reminders(id, remind_at, reminded_at)";
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_REMINDERS = 5;

// カテゴリーの色
const COLORS: { key: string; hex: string; label: string }[] = [
  { key: "teal", hex: "#0f766e", label: "みどり" },
  { key: "blue", hex: "#2563eb", label: "あお" },
  { key: "purple", hex: "#7c3aed", label: "むらさき" },
  { key: "pink", hex: "#db2777", label: "ピンク" },
  { key: "red", hex: "#dc2626", label: "あか" },
  { key: "orange", hex: "#ea580c", label: "オレンジ" },
  { key: "yellow", hex: "#b7791f", label: "きいろ" },
  { key: "gray", hex: "#64748b", label: "グレー" },
];
const colorHex = (key: string) => COLORS.find((c) => c.key === key)?.hex ?? COLORS[0].hex;

// 優先度（高いものから）
const PRIORITIES = [
  { value: 3, label: "高", cls: "is-high" },
  { value: 2, label: "中", cls: "is-mid" },
  { value: 1, label: "低", cls: "is-low" },
];
const priorityOf = (v: number) => PRIORITIES.find((p) => p.value === v);

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
const hm = (t?: string | null) => (t ? t.slice(0, 5) : "");
const fmtTime = (t: string) => `${Number(t.slice(0, 2))}:${t.slice(3, 5)}`;
// 通知の確認は10分ごとなので、時刻も10分刻みにする（その時刻ちょうどに届く）
const ALL_TIMES = Array.from({ length: 144 }, (_, i) => `${pad2(Math.floor(i / 6))}:${pad2((i % 6) * 10)}`);
const remindLabel = (iso: string) => {
  const d = new Date(iso);
  const key = ymd(d);
  const day = key === ymd(now()) ? "今日" : key === ymd(addDays(now(), 1)) ? "明日" : `${d.getMonth() + 1}/${d.getDate()}`;
  return `${day} ${d.getHours()}:${pad2(d.getMinutes())}`;
};
/** まだ届いていないリマインド（早い順） */
const pendingReminders = (t: Todo) =>
  (t.todo_reminders ?? []).filter((r) => !r.reminded_at && new Date(r.remind_at).getTime() > Date.now()).sort((a, b) => (a.remind_at < b.remind_at ? -1 : 1));
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";
const isMissingColumn = (code?: string) => code === "42703" || code === "PGRST204" || code === "PGRST200";

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
const FlagIcon = () => (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
    <path d="M5 3h2v18H5zM8 4h10l-2.5 4L18 12H8z" />
  </svg>
);

export default function TodosPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [partner, setPartner] = useState<Partner | null>(null);
  const [items, setItems] = useState<Todo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<"" | "todos" | "extras">("");
  const [filter, setFilter] = useState<Filter>("all");
  const [catFilter, setCatFilter] = useState<string>("all"); // "all" | "none" | カテゴリーの id
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<Todo | "new" | null>(null); // "new" は新しく追加
  const [managing, setManaging] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const todayKey = useMemo(() => ymd(now()), []);
  const nowHM = useMemo(() => `${pad2(now().getHours())}:${pad2(now().getMinutes())}`, []);
  // 期限切れ：日が過ぎた／今日で時刻が過ぎた
  const isLate = (t: Todo) => !!t.due_date && (t.due_date < todayKey || (t.due_date === todayKey && !!t.due_time && hm(t.due_time) < nowHM));

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
    const [todos, cats, conns] = await Promise.all([
      supabase.from("todo_items").select(COLS).order("created_at", { ascending: false }),
      supabase.from("todo_categories").select("id, owner_id, name, color").order("created_at"),
      supabase
        .from("connections")
        .select("requester_id, receiver_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .limit(1),
    ]);
    if (todos.error) {
      // やることの表がない／新しい列・表（supabase-todo-extras.sql）がない
      const base = await supabase.from("todo_items").select("id").limit(1);
      if (isMissingTable(base.error?.code)) setMissing("todos");
      else if (isMissingColumn(todos.error.code) || isMissingTable(todos.error.code) || isMissingTable(cats.error?.code)) setMissing("extras");
      else show("読み込めませんでした", "error");
      setLoading(false);
      return;
    }
    setMissing("");
    setItems((todos.data ?? []) as unknown as Todo[]);
    setCategories((cats.data ?? []) as Category[]);
    const c = (conns.data ?? [])[0] as { requester_id: string; receiver_id: string } | undefined;
    if (c) {
      const pid = c.requester_id === user.id ? c.receiver_id : c.requester_id;
      const { data: prof } = await supabase.from("profiles").select("username").eq("id", pid).maybeSingle();
      setPartner({ id: pid, name: (prof?.username as string | undefined) || "相手" });
    } else {
      setPartner(null);
    }
    setLoading(false);
  }, [router, show]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  // 相手が追加・チェックしたものを、開いている画面にもすぐ反映する
  useLiveRefresh("todos", ["todo_items", "todo_reminders", "todo_categories", "connections"], load);

  // スマホの＋（やることを追加）→ 追加の画面を開く
  useEffect(() => {
    const open = () => setEditing("new");
    window.addEventListener(OPEN_TODO_ADD, open);
    return () => window.removeEventListener(OPEN_TODO_ADD, open);
  }, []);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const whoOk = (t: Todo, f: Filter) => {
    if (f === "shared") return t.is_shared && !!partner;
    if (f === "mine") return !t.is_shared || !partner;
    if (f === "assigned") return t.assignee_id === userId || ((!t.is_shared || !partner) && t.owner_id === userId);
    return true;
  };
  const catOk = (t: Todo, c: string) => {
    const cid = t.category_id && catById.has(t.category_id) ? t.category_id : null;
    return c === "all" ? true : c === "none" ? !cid : cid === c;
  };
  const visible = items.filter((t) => whoOk(t, filter) && catOk(t, catFilter));
  const open = visible.filter((t) => !t.done_at);
  const done = visible.filter((t) => t.done_at).sort((a, b) => ((a.done_at ?? "") < (b.done_at ?? "") ? 1 : -1));
  // 優先度の高い順 → 期限の早い順（同じ日なら時刻のあるものが先）→ 新しい順
  const dueKey = (t: Todo) => `${t.due_date ?? "9999"} ${hm(t.due_time) || "99"}`;
  const order = (a: Todo, b: Todo) =>
    (b.priority ?? 0) - (a.priority ?? 0) || (dueKey(a) < dueKey(b) ? -1 : dueKey(a) > dueKey(b) ? 1 : a.created_at < b.created_at ? 1 : -1);
  const sections = [
    { key: "late", title: "期限切れ", list: open.filter(isLate).sort(order) },
    { key: "today", title: "今日", list: open.filter((t) => t.due_date === todayKey && !isLate(t)).sort(order) },
    { key: "soon", title: "これから", list: open.filter((t) => t.due_date && t.due_date > todayKey).sort(order) },
    { key: "none", title: "期限なし", list: open.filter((t) => !t.due_date).sort(order) },
  ].filter((s) => s.list.length > 0);

  const toggleDone = async (t: Todo) => {
    const patch = t.done_at ? { done_at: null, done_by: null } : { done_at: now().toISOString(), done_by: userId };
    setItems((p) => p.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("todo_items").update(patch).eq("id", t.id);
    if (error) {
      setItems((p) => p.map((x) => (x.id === t.id ? t : x)));
      show("保存できませんでした", "error");
      return;
    }
    if (!t.done_at && pendingReminders(t).length) show("完了にしました。残りのリマインドは届きません", "info");
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
              {missing === "todos" ? (
                <>
                  やることを使うには、Supabase の SQL Editor で <b>supabase-todos.sql</b> を1回実行してください。
                </>
              ) : (
                <>
                  優先度・カテゴリー・リマインドを使うには、Supabase の SQL Editor で <b>supabase-todo-due-time.sql</b> と <b>supabase-todo-extras.sql</b> を1回実行してください。
                </>
              )}
            </p>
          </div>
        </div>
        <MobileNavigation />
      </main>
    );
  }

  const lateCount = open.filter(isLate).length;
  const todayCount = open.filter((t) => t.due_date === todayKey && !isLate(t)).length;
  const highCount = open.filter((t) => t.priority === 3).length;
  const openAll = items.filter((t) => !t.done_at);
  const countWho = (f: Filter) => openAll.filter((t) => whoOk(t, f)).length;
  const countCat = (c: string) => openAll.filter((t) => whoOk(t, filter) && catOk(t, c)).length;
  const filters: { key: Filter; label: string }[] = partner
    ? [
        { key: "all", label: "すべて" },
        { key: "shared", label: "ふたり" },
        { key: "mine", label: "自分だけ" },
        { key: "assigned", label: "自分の担当" },
      ]
    : [];
  const hasUncategorized = openAll.some((t) => !t.category_id || !catById.has(t.category_id));

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
    const pri = priorityOf(t.priority ?? 0);
    const cat = t.category_id ? catById.get(t.category_id) : undefined;
    const rems = t.done_at ? [] : pendingReminders(t);
    return (
      <li key={t.id} className={`td-card ${late ? "is-late" : ""} ${t.done_at ? "is-done" : ""} ${pri && !t.done_at ? `td-pri-${pri.cls.slice(3)}` : ""}`}>
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
          {(cat || (pri && !t.done_at)) && (
            <span className="td-card-top">
              {pri && !t.done_at && (
                <span className={`td-pri-tag ${pri.cls}`}>
                  <FlagIcon />
                  {pri.label}
                </span>
              )}
              {cat && (
                <span className="td-cat-tag" style={{ ["--cat" as string]: colorHex(cat.color) }}>
                  {cat.name}
                </span>
              )}
            </span>
          )}
          <span className="td-card-title">{t.title}</span>
          {t.memo && !t.done_at && <span className="td-card-memo">{t.memo}</span>}
          {(t.due_date || rems.length > 0) && (
            <span className="td-card-meta">
              {t.due_date && (
                <span className={`td-meta ${late ? "is-danger" : isToday ? "is-today" : ""}`}>
                  <CalIcon />
                  {isToday ? "今日" : mdw(t.due_date)}
                  {t.due_time ? ` ${fmtTime(hm(t.due_time))}` : ""}
                  {isToday || late ? "まで" : ""}
                </span>
              )}
              {rems.length > 0 && (
                <span className="td-meta is-remind">
                  <BellIcon />
                  {remindLabel(rems[0].remind_at)}
                  {rems.length > 1 && <small className="td-meta-more">ほか{rems.length - 1}回</small>}
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
              <span className={`td-stat ${highCount ? "is-today" : ""}`}>
                <b>{highCount}</b>優先度・高
              </span>
            </div>
            <button type="button" className="td-hero-add" onClick={() => setEditing("new")}>
              ＋ やることを追加
            </button>
          </section>
        )}

        {!loading && (
          <div className="td-filterbar">
            {filters.length > 0 && (
              <div className="td-tabs" role="radiogroup" aria-label="だれのやることで絞り込む">
                {filters.map((f) => (
                  <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}>
                    {f.label}
                    <span>{countWho(f.key)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="td-catbar" role="radiogroup" aria-label="カテゴリーで絞り込む">
              {categories.length > 0 && (
                <>
                  <button type="button" role="radio" aria-checked={catFilter === "all"} className="td-catchip" onClick={() => setCatFilter("all")}>
                    すべて
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={catFilter === c.id}
                      className="td-catchip"
                      style={{ ["--cat" as string]: colorHex(c.color) }}
                      onClick={() => setCatFilter(catFilter === c.id ? "all" : c.id)}
                    >
                      <i className="td-cat-dot" aria-hidden="true" />
                      {c.name}
                      <span>{countCat(c.id)}</span>
                    </button>
                  ))}
                  {hasUncategorized && (
                    <button type="button" role="radio" aria-checked={catFilter === "none"} className="td-catchip" onClick={() => setCatFilter(catFilter === "none" ? "all" : "none")}>
                      なし
                      <span>{countCat("none")}</span>
                    </button>
                  )}
                </>
              )}
              <button type="button" className="td-catchip is-manage" onClick={() => setManaging(true)}>
                {categories.length ? "カテゴリーを編集" : "＋ カテゴリーを作る"}
              </button>
            </div>
          </div>
        )}
        {!partner && !loading && <p className="kt-muted td-hint">相手とつながると、「ふたり」のやることを共有できます（設定 › ふたり）。</p>}

        {loading ? (
          <p className="kt-muted">読み込み中…</p>
        ) : items.length === 0 ? (
          <div className="td-empty-card">
            <span className="td-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="4" />
                <path d="m8.5 12 2.5 2.5 4.5-5" />
              </svg>
            </span>
            <b>やることはありません</b>
            <p>＋ボタンから、ふたりのやることや自分のやることを追加できます。</p>
            <button type="button" className="kt-btn is-primary" onClick={() => setEditing("new")}>
              ＋ やることを追加
            </button>
          </div>
        ) : (
          <>
            {sections.length === 0 && (
              <div className="td-allclear">
                <b>{visible.length === 0 ? "あてはまるやることはありません" : "すべて完了しました"}</b>
                <span>{visible.length === 0 ? "絞り込みを変えてみてください。" : "残っているやることはありません。"}</span>
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
          defaultCategory={editing === "new" && catFilter !== "all" && catFilter !== "none" ? catFilter : null}
          userId={userId}
          partner={partner}
          categories={categories}
          onCategoryAdded={(c) => setCategories((p) => [...p, c])}
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

      {managing && (
        <CategoryManager
          categories={categories}
          usage={(id) => items.filter((t) => t.category_id === id).length}
          onChange={(next) => setCategories(next)}
          onDeleted={(id) => {
            setItems((p) => p.map((t) => (t.category_id === id ? { ...t, category_id: null } : t)));
            if (catFilter === id) setCatFilter("all");
          }}
          onClose={() => setManaging(false)}
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

/* ── 色を選ぶ ── */
function ColorPicker({ value, onPick }: { value: string; onPick: (key: string) => void }) {
  return (
    <div className="td-colors" role="radiogroup" aria-label="色">
      {COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={value === c.key}
          aria-label={c.label}
          className="td-color"
          style={{ ["--cat" as string]: c.hex }}
          onClick={() => onPick(c.key)}
        />
      ))}
    </div>
  );
}

/* ── カテゴリーを作る（名前＋色） ── */
function CategoryForm({
  onCreated,
  onCancel,
  show,
  usedColors,
}: {
  onCreated: (c: Category) => void;
  onCancel?: () => void;
  show: (m: string, t?: "success" | "error" | "info") => void;
  usedColors: string[];
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS.find((c) => !usedColors.includes(c.key))?.key ?? COLORS[0].key);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    const { data, error } = await supabase.from("todo_categories").insert({ name: n, color }).select("id, owner_id, name, color").single();
    setSaving(false);
    if (error || !data) {
      show("カテゴリーを作れませんでした", "error");
      return;
    }
    setName("");
    onCreated(data as Category);
  };
  return (
    <div className="td-catform">
      <div className="td-catform-row">
        <input
          ref={inputRef}
          className="kt-input td-catform-input"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="カテゴリー名（例：買い物）"
          aria-label="新しいカテゴリーの名前"
          style={{ ["--cat" as string]: colorHex(color) }}
        />
        <button type="button" className="kt-btn is-primary td-catform-add" disabled={!name.trim() || saving} onClick={() => void add()}>
          作る
        </button>
        {onCancel && (
          <button type="button" className="kt-text-btn" onClick={onCancel}>
            やめる
          </button>
        )}
      </div>
      <ColorPicker value={color} onPick={setColor} />
    </div>
  );
}

/* ── カテゴリーの編集（名前・色・削除） ── */
function CategoryManager({
  categories,
  usage,
  onChange,
  onDeleted,
  onClose,
  show,
}: {
  categories: Category[];
  usage: (id: string) => number;
  onChange: (next: Category[]) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
  show: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [colorOpen, setColorOpen] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const patch = async (c: Category, p: Partial<Pick<Category, "name" | "color">>) => {
    const next = { ...c, ...p };
    onChange(categories.map((x) => (x.id === c.id ? next : x)));
    const { error } = await supabase.from("todo_categories").update(p).eq("id", c.id);
    if (error) {
      onChange(categories);
      show("保存できませんでした", "error");
    }
  };
  const remove = async (c: Category) => {
    const { error } = await supabase.from("todo_categories").delete().eq("id", c.id);
    setConfirmDel(null);
    if (error) {
      show("削除できませんでした", "error");
      return;
    }
    onChange(categories.filter((x) => x.id !== c.id));
    onDeleted(c.id);
    show(`「${c.name}」を削除しました`, "info");
  };

  return (
    <div className="kt-overlay" onClick={onClose}>
      <section className="kt-sheet td-sheet" role="dialog" aria-modal="true" aria-label="カテゴリーの編集" onClick={(e) => e.stopPropagation()}>
        <span className="kt-handle" aria-hidden="true" />
        <div className="kt-entry-head">
          <h2>カテゴリー</h2>
          <button type="button" className="kt-close" onClick={onClose}>閉じる</button>
        </div>
        <p className="kt-muted td-hint">つながっている相手とは、同じカテゴリーを使います。</p>
        {categories.length > 0 && (
          <ul className="td-catlist">
            {categories.map((c) => (
              <li key={c.id} className="td-catlist-item">
                <div className="td-catlist-row">
                  <button
                    type="button"
                    className="td-color is-current"
                    style={{ ["--cat" as string]: colorHex(c.color) }}
                    aria-label={`「${c.name}」の色を変える`}
                    aria-expanded={colorOpen === c.id}
                    onClick={() => setColorOpen(colorOpen === c.id ? null : c.id)}
                  />
                  <input
                    className="kt-input td-catlist-name"
                    defaultValue={c.name}
                    maxLength={20}
                    aria-label="カテゴリーの名前"
                    onBlur={(e) => {
                      const n = e.target.value.trim();
                      if (!n) e.target.value = c.name;
                      else if (n !== c.name) void patch(c, { name: n });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <span className="td-catlist-count">{usage(c.id)}件</span>
                  {confirmDel === c.id ? (
                    <button type="button" className="kt-btn td-del is-confirm td-catlist-del" onClick={() => void remove(c)}>
                      削除する
                    </button>
                  ) : (
                    <button type="button" className="kt-text-btn td-del td-catlist-del" onClick={() => setConfirmDel(c.id)}>
                      削除
                    </button>
                  )}
                </div>
                {confirmDel === c.id && usage(c.id) > 0 && <p className="td-catlist-note">このカテゴリーのやること{usage(c.id)}件は「なし」になります。</p>}
                {colorOpen === c.id && (
                  <ColorPicker
                    value={c.color}
                    onPick={(k) => {
                      setColorOpen(null);
                      if (k !== c.color) void patch(c, { color: k });
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <section className="td-sec">
          <h3 className="td-sec-title">新しく作る</h3>
          <CategoryForm show={show} usedColors={categories.map((c) => c.color)} onCreated={(c) => onChange([...categories, c])} />
        </section>
      </section>
    </div>
  );
}

type RemRow = { key: number; id?: string; day: string; time: string; orig?: string };
const rowIso = (r: RemRow) => (r.day ? new Date(`${r.day}T${r.time}:00`).toISOString() : "");

/* ── やることの追加・編集（スマホは下から・PCは中央） ── */
function TodoSheet({
  todo,
  defaultCategory,
  userId,
  partner,
  categories,
  onCategoryAdded,
  onClose,
  onSaved,
  onDeleted,
  show,
}: {
  todo: Todo | null; // null なら新しく追加
  defaultCategory: string | null;
  userId: string;
  partner: Partner | null;
  categories: Category[];
  onCategoryAdded: (c: Category) => void;
  onClose: () => void;
  onSaved: (t: Todo, isNew: boolean) => void;
  onDeleted: (id: string) => void;
  show: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const isNew = !todo;
  const today = now();
  const todayKey = ymd(today);
  const keySeq = useRef(0);
  const nextKey = () => ++keySeq.current;

  const [title, setTitle] = useState(todo?.title ?? "");
  const [memo, setMemo] = useState(todo?.memo ?? "");
  const [shared, setShared] = useState(todo ? todo.is_shared : true);
  const [assignee, setAssignee] = useState<string | null>(todo?.assignee_id ?? null);
  const [priority, setPriority] = useState(todo?.priority ?? 0);
  const [category, setCategory] = useState<string | null>(
    todo ? (todo.category_id && categories.some((c) => c.id === todo.category_id) ? todo.category_id : null) : defaultCategory,
  );
  const [catForm, setCatForm] = useState(false);
  const [due, setDue] = useState(todo?.due_date ?? "");
  const [dueTime, setDueTime] = useState(hm(todo?.due_time)); // "" = 時刻なし
  const [dueCal, setDueCal] = useState(false);
  // まだ届いていないリマインドだけを並べる（届いたものはそのまま残す）
  const [rems, setRems] = useState<RemRow[]>(() =>
    (todo?.todo_reminders ?? [])
      .filter((r) => !r.reminded_at)
      .sort((a, b) => (a.remind_at < b.remind_at ? -1 : 1))
      .map((r, i) => {
        const d = new Date(r.remind_at);
        return { key: -(i + 1), id: r.id, day: ymd(d), time: `${pad2(d.getHours())}:${pad2(Math.floor(d.getMinutes() / 10) * 10)}`, orig: r.remind_at };
      }),
  );
  const [remCal, setRemCal] = useState<number | null>(null); // カレンダーを開いているリマインドの key
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const isOwner = !todo || todo.owner_id === userId;

  // 新しく追加するときは、やることの欄にすぐ書けるように
  useEffect(() => {
    if (isNew) titleRef.current?.focus();
  }, [isNew]);

  const changed = (r: RemRow) => !r.id || (!!r.orig && new Date(r.orig).getTime() !== new Date(rowIso(r)).getTime());
  const isPast = (r: RemRow) => !!r.day && new Date(`${r.day}T${r.time}:00`).getTime() <= now().getTime();
  const pastRow = rems.find((r) => isPast(r) && changed(r));

  // リマインドを1つ足す：1つ目は「期限の前日20時」→「今日20時」→「明日9時」、2つ目からは最後の1日後の同じ時刻
  const addReminder = () => {
    let day: string;
    let time: string;
    const last = rems[rems.length - 1];
    if (last?.day) {
      day = ymd(addDays(parseYmd(last.day), 1));
      time = last.time;
    } else {
      const prev = due ? ymd(addDays(parseYmd(due), -1)) : "";
      if (prev && new Date(`${prev}T20:00:00`).getTime() > now().getTime()) [day, time] = [prev, "20:00"];
      else if (now().getHours() < 19) [day, time] = [todayKey, "20:00"];
      else [day, time] = [ymd(addDays(today, 1)), "09:00"];
    }
    const key = nextKey();
    setRems((p) => [...p, { key, day, time }]);
    setRemCal(null);
  };
  const updateRem = (key: number, p: Partial<RemRow>) => setRems((list) => list.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = async () => {
    if (!title.trim()) {
      show("やることを入れてください", "error");
      titleRef.current?.focus();
      return;
    }
    if (pastRow) {
      show(`リマインド ${mdw(pastRow.day)} ${fmtTime(pastRow.time)} は過ぎています。未来の日時にしてください`, "error");
      return;
    }
    setSaving(true);
    const body = {
      title: title.trim(),
      memo: memo.trim() || null,
      is_shared: !!partner && shared,
      assignee_id: partner && shared ? assignee : null,
      due_date: due || null,
      due_time: due && dueTime ? dueTime : null,
      priority,
      category_id: category,
    };
    const res = todo
      ? await supabase.from("todo_items").update(body).eq("id", todo.id).select("id").single()
      : await supabase.from("todo_items").insert(body).select("id").single();
    if (res.error || !res.data) {
      setSaving(false);
      show("保存できませんでした", "error");
      return;
    }
    const todoId = (res.data as { id: string }).id;

    // リマインド：消したもの・変えたもの・足したもの（同じ日時は1つにまとめる）
    const seen = new Set<string>();
    const rows = rems.filter((r) => {
      const iso = rowIso(r);
      if (!iso || seen.has(iso)) return false;
      seen.add(iso);
      return true;
    });
    const keepIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
    const removed = (todo?.todo_reminders ?? []).filter((r) => !r.reminded_at && !keepIds.has(r.id)).map((r) => r.id);
    const ops: PromiseLike<{ error: unknown }>[] = [];
    if (removed.length) ops.push(supabase.from("todo_reminders").delete().in("id", removed));
    for (const r of rows.filter((x) => x.id && changed(x))) ops.push(supabase.from("todo_reminders").update({ remind_at: rowIso(r) }).eq("id", r.id as string));
    const added = rows.filter((r) => !r.id).map((r) => ({ todo_id: todoId, remind_at: rowIso(r) }));
    if (added.length) ops.push(supabase.from("todo_reminders").insert(added));
    const results = await Promise.all(ops);
    const fresh = await supabase.from("todo_items").select(COLS).eq("id", todoId).single();
    setSaving(false);
    if (results.some((r) => r.error)) show("リマインドの一部を保存できませんでした", "error");
    if (fresh.error || !fresh.data) {
      show("保存しましたが、読み込み直せませんでした", "error");
      return;
    }
    onSaved(fresh.data as unknown as Todo, isNew);
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
  const sentCount = (todo?.todo_reminders ?? []).filter((r) => r.reminded_at).length;
  const deliverTo = partner && shared ? (assignee === null ? "ふたり" : assignee === userId ? "自分" : partner.name) : "";

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

        {/* 優先度 */}
        <section className="td-sec">
          <div className="td-row is-center">
            <span className="td-row-label">優先度</span>
            <div className="td-seg td-pri-seg" role="radiogroup" aria-label="優先度">
              {[{ value: 0, label: "なし", cls: "is-none" }, ...[...PRIORITIES].reverse()].map((p) => (
                <button key={p.value} type="button" role="radio" aria-checked={priority === p.value} className={p.cls} onClick={() => setPriority(p.value)}>
                  {p.value > 0 && <FlagIcon />}
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* カテゴリー */}
          <div className="td-row">
            <span className="td-row-label">カテゴリー</span>
            <div className="td-chips">
              <button type="button" aria-pressed={category === null} className={`td-catchip ${category === null ? "is-on" : ""}`} onClick={() => setCategory(null)}>
                なし
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={category === c.id}
                  className={`td-catchip ${category === c.id ? "is-on" : ""}`}
                  style={{ ["--cat" as string]: colorHex(c.color) }}
                  onClick={() => setCategory(c.id)}
                >
                  <i className="td-cat-dot" aria-hidden="true" />
                  {c.name}
                </button>
              ))}
              {!catForm && (
                <button type="button" className="td-catchip is-manage" onClick={() => setCatForm(true)}>
                  ＋ 新しく作る
                </button>
              )}
            </div>
          </div>
          {catForm && (
            <CategoryForm
              show={show}
              usedColors={categories.map((c) => c.color)}
              onCancel={() => setCatForm(false)}
              onCreated={(c) => {
                onCategoryAdded(c);
                setCategory(c.id);
                setCatForm(false);
              }}
            />
          )}
        </section>

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
              <div className="td-row is-center">
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

        {/* 期限 */}
        <section className="td-sec">
          <div className="td-sec-head">
            <h3 className="td-sec-title">期限</h3>
            {due && (
              <button
                type="button"
                className="kt-text-btn td-sec-action"
                onClick={() => {
                  setDue("");
                  setDueTime("");
                  setDueCal(false);
                }}
              >
                期限をなしにする
              </button>
            )}
          </div>
          <div className="td-when">
            <button type="button" aria-expanded={dueCal} className={`td-when-day ${due ? "is-on" : ""}`} onClick={() => setDueCal((v) => !v)}>
              <CalIcon />
              {due ? mdw(due) : "日付を選ぶ"}
            </button>
            <select className="td-time-select" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!due} aria-label="期限の時刻">
              <option value="">時刻なし</option>
              {ALL_TIMES.map((t) => (
                <option key={t} value={t}>
                  {fmtTime(t)}
                </option>
              ))}
            </select>
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

        {/* リマインド */}
        <section className="td-sec">
          <div className="td-sec-head">
            <h3 className="td-sec-title">
              リマインド{rems.length > 0 && <span className="td-count">{rems.length}</span>}
            </h3>
            {sentCount > 0 && <span className="kt-muted td-sec-note">通知済み {sentCount}回</span>}
          </div>
          {rems.length > 0 && (
            <ol className="td-remlist">
              {rems.map((r, i) => {
                const warn = isPast(r) && changed(r);
                return (
                  <li key={r.key} className={`td-remrow ${warn ? "is-warn" : ""}`}>
                    <div className="td-when">
                      <span className="td-rem-no" aria-hidden="true">{i + 1}</span>
                      <button
                        type="button"
                        aria-expanded={remCal === r.key}
                        aria-label={`${i + 1}回目の日付`}
                        className="td-when-day is-on"
                        onClick={() => setRemCal(remCal === r.key ? null : r.key)}
                      >
                        <BellIcon />
                        {mdw(r.day)}
                      </button>
                      <select className="td-time-select" value={r.time} onChange={(e) => updateRem(r.key, { time: e.target.value })} aria-label={`${i + 1}回目の時刻`}>
                        {ALL_TIMES.map((t) => (
                          <option key={t} value={t}>
                            {fmtTime(t)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="td-clear-x td-rem-del"
                        aria-label={`${i + 1}回目のリマインドを消す`}
                        onClick={() => {
                          setRems((p) => p.filter((x) => x.key !== r.key));
                          if (remCal === r.key) setRemCal(null);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    {warn && <p className="td-rem-warn">この日時は過ぎています</p>}
                    {remCal === r.key && (
                      <MiniCalendar
                        label={`${i + 1}回目のリマインドの日`}
                        value={r.day}
                        minKey={todayKey}
                        onPick={(k) => {
                          updateRem(r.key, { day: k });
                          setRemCal(null);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {rems.length < MAX_REMINDERS && (
            <button type="button" className="td-rem-add" onClick={addReminder}>
              ＋ {rems.length ? "リマインドをもう1つ追加" : "リマインドを追加"}
            </button>
          )}
          <p className="kt-muted td-hint">
            {rems.length ? `完了にすると、残りのリマインドは届きません。${deliverTo ? `（${deliverTo}に届きます）` : ""}` : `${MAX_REMINDERS}回まで登録できます。完了していないときだけ届きます。`}
          </p>
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
