"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";
import { supabase } from "@/lib/supabase";

type AdminUser = {
  id: string;
  email: string | null;
  username: string;
  role: "admin" | "user";
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

type AdminDebug = {
  email?: string;
  userId?: string;
  profileRole?: string | null;
  adminEmailsConfigured?: boolean;
  canClaim?: boolean;
};

type ToastItem = { id: number; message: string; type: "success" | "error" | "info" };

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [debug, setDebug] = useState<AdminDebug | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [claiming, setClaiming] = useState(false);
  const [query, setQuery] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "user" | "banned">("all");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmAction, setConfirmAction] = useState<{
    user: AdminUser;
    action: "suspend" | "restore" | "make_admin" | "remove_admin" | "delete";
  } | null>(null);

  const showToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/admin/users", {
      headers: {
        authorization: `Bearer ${session.access_token}`,
      },
    });
    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error ?? "管理者情報を取得できませんでした。");
      setDebug(result.debug ?? null);
      setLoading(false);
      return;
    }

    setMessage("");
    setDebug(null);
    setUsers(result.users ?? []);
    setCurrentUserId(result.currentUserId ?? "");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUsers();
  }, [fetchUsers]);

  const claimFirstAdmin = async () => {
    setClaiming(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    const result = await response.json();
    setClaiming(false);
    if (!response.ok) {
      showToast(result.error ?? "管理者登録に失敗しました", "error");
      return;
    }
    showToast("管理者として登録しました", "success");
    await fetchUsers();
  };

  const runAction = async (
    user: AdminUser,
    action: "suspend" | "restore" | "make_admin" | "remove_admin" | "delete",
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ userId: user.id, action }),
    });
    const result = await response.json();

    if (!response.ok) {
      showToast(result.error ?? "操作に失敗しました", "error");
      return;
    }

    showToast("操作を実行しました", "success");
    await fetchUsers();
  };

  const [nowRef] = useState(() => Date.now());

  // 相対時間表示
  const relativeTime = (dateStr: string | null): string => {
    if (!dateStr) return "未ログイン";
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    const hour = Math.floor(diff / 3600000);
    const day = Math.floor(diff / 86400000);
    if (min < 1) return "たった今";
    if (min < 60) return `${min}分前`;
    if (hour < 24) return `${hour}時間前`;
    if (day < 30) return `${day}日前`;
    return new Date(dateStr).toLocaleDateString("ja-JP");
  };

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === "admin").length;
    const banned = users.filter((u) => u.banned_until).length;
    const dayMs = 86400000;
    const recentLogin = users.filter((u) => {
      if (!u.last_sign_in_at) return false;
      return Date.now() - new Date(u.last_sign_in_at).getTime() < 7 * dayMs;
    }).length;
    return { total, admins, banned, recentLogin };
  }, [users]);

  // 直近30日のユーザー登録グラフ用データ
  const registrationChart = useMemo(() => {
    const days = 30;
    const now = new Date();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      const dateStr = d.toISOString().slice(0, 10);
      const count = users.filter((u) => u.created_at.slice(0, 10) === dateStr).length;
      return { label, count, dateStr };
    });
  }, [users]);

  // ログイン状況分布
  const loginDistribution = useMemo(() => {
    const now = Date.now();
    const today   = users.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 86400000).length;
    const week    = users.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 7 * 86400000).length - today;
    const month   = users.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 30 * 86400000).length - today - week;
    const older   = users.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() >= 30 * 86400000).length;
    const never   = users.filter((u) => !u.last_sign_in_at).length;
    return [
      { label: "今日", count: today, color: "#0f766e" },
      { label: "今週", count: week,  color: "#38bdf8" },
      { label: "今月", count: month, color: "#a78bfa" },
      { label: "1ヶ月以上前", count: older, color: "#fb923c" },
      { label: "未ログイン", count: never, color: "#94a3b8" },
    ];
  }, [users]);

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filterRole === "admin" && u.role !== "admin") return false;
      if (filterRole === "user" && u.role !== "user") return false;
      if (filterRole === "banned" && !u.banned_until) return false;
      if (!q) return true;
      return (
        (u.username ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, query, filterRole]);

  const labels: Record<
    "suspend" | "restore" | "make_admin" | "remove_admin" | "delete",
    { title: string; description: string; danger?: boolean }
  > = {
    suspend: {
      title: "アカウントを停止しますか？",
      description: "停止中のユーザーはログインできなくなります。後から解除できます。",
    },
    restore: {
      title: "停止を解除しますか？",
      description: "再度ログインできるようになります。",
    },
    make_admin: {
      title: "管理者として登録しますか？",
      description: "ユーザー管理を含むすべての管理機能を利用できるようになります。",
    },
    remove_admin: {
      title: "管理者権限を解除しますか？",
      description: "通常ユーザーに戻します。後から再度付与できます。",
    },
    delete: {
      title: "アカウントを削除しますか？",
      description: "この操作は元に戻せません。データが完全に削除されます。",
      danger: true,
    },
  };

  const canClaim = Boolean(debug?.canClaim);
  const serviceKeyMissing = !!message && message.includes("SUPABASE_SERVICE_ROLE_KEY");

  return (
    <main className="page-shell min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShareCalLogo compact />
            <div>
              <p className="eyebrow">Admin Console</p>
              <h1 className="mt-1 text-2xl font-black text-[var(--fg-strong)]">管理画面</h1>
            </div>
          </div>
          <DesktopNavigation />
        </header>

        {message && (
          <section className="glass-card border border-[var(--amber-200)] bg-[var(--amber-50)] p-4 text-[var(--amber-900)]">
            <p className="text-sm font-bold">{message}</p>
            {canClaim && (
              <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm">
                <p className="font-bold text-[var(--fg-strong)]">
                  まだ管理者が登録されていません。最初の管理者として登録しますか？
                </p>
                <p className="mt-1 text-xs text-[var(--fg-muted)]">
                  最初の1人目だけは、自分で登録できます。以降は既存の管理者に依頼してください。
                </p>
                <button
                  className="btn btn-primary mt-3"
                  disabled={claiming}
                  onClick={claimFirstAdmin}
                >
                  {claiming ? "登録中…" : "最初の管理者として登録"}
                </button>
              </div>
            )}
            {serviceKeyMissing && (
              <p className="mt-2 text-xs">
                サーバー環境変数 SUPABASE_SERVICE_ROLE_KEY が必要です。
                プロジェクト設定でキーを追加し再デプロイしてください。
              </p>
            )}
            {debug && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-[var(--fg-muted)]">
                  詳細を表示
                </summary>
                <div className="mt-2 rounded-lg bg-white/70 p-3 text-xs leading-6 text-[var(--fg-muted)]">
                  <p>ログイン中: {debug.email ?? "不明"}</p>
                  <p>ユーザーID: {debug.userId ?? "不明"}</p>
                  <p>profiles.role: {debug.profileRole ?? "未取得"}</p>
                  <p>ADMIN_EMAILS: {debug.adminEmailsConfigured ? "設定あり" : "未設定"}</p>
                </div>
              </details>
            )}
          </section>
        )}

        {!message && (
          <>
          <section className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "総ユーザー", value: stats.total, accent: "var(--accent)" },
              { label: "管理者", value: stats.admins, accent: "var(--violet)" },
              { label: "停止中", value: stats.banned, accent: "var(--rose)" },
              { label: "7日以内にログイン", value: stats.recentLogin, accent: "var(--amber-500)" },
            ].map((stat) => (
              <div key={stat.label} className="stat-card glass-card p-4" style={{ borderTopColor: stat.accent }}>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg-muted)]">{stat.label}</p>
                <p className="mt-1 text-3xl font-black text-[var(--fg-strong)]">{stat.value}</p>
              </div>
            ))}
          </section>

          {/* ── グラフ ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* 直近30日 ユーザー登録推移 */}
            <section className="glass-card p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg-muted)]">直近30日 ユーザー登録推移</p>
              {(() => {
                const max = Math.max(...registrationChart.map((d) => d.count), 1);
                return (
                  <div className="flex h-32 items-end gap-px">
                    {registrationChart.map((d) => (
                      <div key={d.dateStr} className="group relative flex flex-1 flex-col items-center justify-end h-full">
                        <div
                          className="w-full rounded-t-sm bg-[var(--accent)] opacity-80 transition-all group-hover:opacity-100"
                          style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? "3px" : "0" }}
                        />
                        {d.count > 0 && (
                          <span className="absolute -top-5 text-[9px] font-bold text-[var(--accent)]">{d.count}</span>
                        )}
                        <span className="absolute -bottom-4 text-[8px] text-[var(--fg-muted)] opacity-0 group-hover:opacity-100">
                          {d.label}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="mt-5 flex justify-between text-[9px] text-[var(--fg-muted)]">
                <span>{registrationChart[0]?.label}</span>
                <span>{registrationChart[registrationChart.length - 1]?.label}</span>
              </div>
            </section>

            {/* ログイン状況分布 */}
            <section className="glass-card p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg-muted)]">ログイン状況</p>
              <div className="flex flex-col gap-2">
                {loginDistribution.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs font-semibold text-[var(--fg-muted)]">{item.label}</span>
                    <div className="relative flex-1 h-5 rounded-full bg-[var(--surface-alt)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: stats.total > 0 ? `${(item.count / stats.total) * 100}%` : "0%",
                          backgroundColor: item.color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-xs font-black" style={{ color: item.color }}>
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          </>
        )}

        {!message && (
          <section className="glass-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 items-center gap-2">
                <div className="search-input flex h-11 flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--fg-muted)]" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
                    placeholder="名前・メールで検索"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      className="text-xs font-bold text-[var(--fg-muted)] hover:text-[var(--fg-strong)]"
                      onClick={() => setQuery("")}
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {([
                  { id: "all", label: "すべて" },
                  { id: "admin", label: "管理者" },
                  { id: "user", label: "ユーザー" },
                  { id: "banned", label: "停止中" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    className={`chip ${filterRole === opt.id ? "chip-active" : ""}`}
                    onClick={() => setFilterRole(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {!message && (
          <section className="glass-card p-2 sm:p-3">
            {loading ? (
              <div className="grid gap-2 p-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton-row" />
                ))}
              </div>
            ) : (
              <div className="grid gap-2">
                {visibleUsers.map((user) => {
                  const initial = (user.username || user.email || "?").charAt(0).toUpperCase();
                  const isSelf = user.id === currentUserId;
                  return (
                    <div
                      key={user.id}
                      className="user-row rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:border-[var(--accent)]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="avatar flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-black text-white"
                            style={{
                              background:
                                user.role === "admin"
                                  ? "linear-gradient(135deg, var(--violet), var(--violet-strong))"
                                  : "linear-gradient(135deg, var(--accent), var(--accent-strong))",
                            }}
                          >
                            {initial}
                          </span>
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-black text-[var(--fg-strong)]">
                                {user.username}
                              </span>
                              {user.role === "admin" && (
                                <span className="badge badge-violet">管理者</span>
                              )}
                              {user.banned_until && (
                                <span className="badge badge-rose">停止中</span>
                              )}
                              {isSelf && <span className="badge badge-slate">あなた</span>}
                            </p>
                            <p className="truncate text-sm text-[var(--fg-muted)]">
                              {user.email}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-[var(--fg-muted)]">
                              最終ログイン: {relativeTime(user.last_sign_in_at)}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex">
                          <button
                            className="btn btn-soft"
                            onClick={() =>
                              setConfirmAction({
                                user,
                                action: user.banned_until ? "restore" : "suspend",
                              })
                            }
                            disabled={isSelf}
                          >
                            {user.banned_until ? "停止解除" : "停止"}
                          </button>
                          <button
                            className="btn btn-soft"
                            onClick={() =>
                              setConfirmAction({
                                user,
                                action: user.role === "admin" ? "remove_admin" : "make_admin",
                              })
                            }
                            disabled={isSelf && user.role === "admin"}
                          >
                            {user.role === "admin" ? "管理者解除" : "管理者にする"}
                          </button>
                          <button
                            className="btn btn-danger"
                            disabled={user.role === "admin" || isSelf}
                            onClick={() => setConfirmAction({ user, action: "delete" })}
                          >
                            {user.role === "admin" ? "削除不可" : "削除"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {visibleUsers.length === 0 && (
                  <p className="empty-state p-6 text-center">
                    条件に一致するユーザーがいません。
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {confirmAction && (
        <div className="confirm-overlay">
          <div className="confirm-card">
            <p className="eyebrow">確認</p>
            <h3 className="mt-1 text-lg font-black text-[var(--fg-strong)]">
              {labels[confirmAction.action].title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">
              対象: <span className="font-bold text-[var(--fg-strong)]">{confirmAction.user.username}</span>
              <br />
              {labels[confirmAction.action].description}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="btn btn-soft"
                onClick={() => setConfirmAction(null)}
              >
                キャンセル
              </button>
              <button
                className={`btn ${labels[confirmAction.action].danger ? "btn-danger" : "btn-primary"}`}
                onClick={async () => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  await runAction(action.user, action.action);
                }}
              >
                実行
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      <MobileNavigation />
    </main>
  );
}
