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

type LimitMetric = { used: number; limit: number };

type OcrUsage = {
  model: string;
  rpm: LimitMetric;
  tpm: LimitMetric;
  rpd: LimitMetric;
  rpdResetAt: string | null;
  todayLimitHits: number;
  lastLimitAt: string | null;
  error?: string;
  code?: string | null;
  detail?: string;
};

function UsageBar({
  label,
  used,
  limit,
  unit,
  sub,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
  sub?: string;
}) {
  const ratio = limit > 0 ? used / limit : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const color = ratio >= 1 ? "var(--rose, #e11d48)" : ratio >= 0.7 ? "#f59e0b" : "var(--accent)";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-[var(--fg-strong)]">{label}</span>
        <span className="text-sm font-black text-[var(--fg-strong)]">
          {used.toLocaleString("ja-JP")}
          <span className="text-xs font-semibold text-[var(--fg-muted)]">
            {" "}
            / {limit.toLocaleString("ja-JP")} {unit}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-alt)]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct, used > 0 ? 3 : 0)}%`, backgroundColor: color }}
        />
      </div>
      <div className="mt-1 flex justify-between gap-2 text-xs text-[var(--fg-muted)]">
        <span>{sub ?? ""}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

const formatJstDateTime = (iso: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [debug, setDebug] = useState<AdminDebug | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [ocrUsage, setOcrUsage] = useState<OcrUsage | null>(null);
  const [showOcr, setShowOcr] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
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

  const fetchOcrUsage = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const response = await fetch("/api/admin/ocr-usage", {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    const result = await response.json();
    if (!response.ok) return;
    setOcrUsage(result as OcrUsage);
  }, []);

  const toggleOcr = () => {
    setShowOcr((open) => {
      const next = !open;
      if (next && !ocrUsage) void fetchOcrUsage();
      return next;
    });
  };

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
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === "admin").length;
    const banned = users.filter((u) => u.banned_until).length;
    const dayMs = 86400000;
    const recentLogin = users.filter((u) => {
      if (!u.last_sign_in_at) return false;
      return nowRef - new Date(u.last_sign_in_at).getTime() < 7 * dayMs;
    }).length;
    return { total, admins, banned, recentLogin };
  }, [users, nowRef]);

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
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "総ユーザー", value: stats.total, accent: "var(--accent)" },
              { label: "管理者", value: stats.admins, accent: "var(--violet)" },
              { label: "停止中", value: stats.banned, accent: "var(--rose)" },
            ].map((stat) => (
              <div key={stat.label} className="stat-card glass-card p-4" style={{ borderTopColor: stat.accent }}>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg-muted)]">{stat.label}</p>
                <p className="mt-1 text-3xl font-black text-[var(--fg-strong)]">{stat.value}</p>
              </div>
            ))}
          </section>
        )}

        {!message && (
          <section className="glass-card p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={toggleOcr}
            >
              <div>
                <p className="eyebrow">AI読み取り（OCR）</p>
                <h2 className="mt-1 text-lg font-black text-[var(--fg-strong)]">今日の利用状況</h2>
              </div>
              <svg
                viewBox="0 0 24 24"
                className={`h-5 w-5 shrink-0 text-[var(--fg-muted)] transition-transform ${showOcr ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {showOcr && (!ocrUsage ? (
              <p className="mt-4 text-sm text-[var(--fg-muted)]">読み込み中…</p>
            ) : ocrUsage.error ? (
              <div className="mt-4 rounded-xl bg-[var(--amber-50)] p-3 text-sm text-[var(--amber-900)]">
                <p>{ocrUsage.error}</p>
                {ocrUsage.code && (
                  <p className="mt-1 text-xs opacity-70">エラーコード: {ocrUsage.code}</p>
                )}
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="text-xs text-[var(--fg-muted)]">モデル: {ocrUsage.model}</p>
                  <button className="btn btn-soft" onClick={() => void fetchOcrUsage()}>
                    更新
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <UsageBar
                    label="1分あたりのリクエスト数（RPM）"
                    used={ocrUsage.rpm.used}
                    limit={ocrUsage.rpm.limit}
                    unit="回"
                    sub="直近1分間の実績。毎分リセットされます。"
                  />
                  <UsageBar
                    label="1分あたりのトークン数（TPM）"
                    used={ocrUsage.tpm.used}
                    limit={ocrUsage.tpm.limit}
                    unit="tokens"
                    sub="直近1分間の実績。毎分リセットされます。"
                  />
                  <UsageBar
                    label="1日あたりのリクエスト数（RPD）"
                    used={ocrUsage.rpd.used}
                    limit={ocrUsage.rpd.limit}
                    unit="回"
                    sub={
                      ocrUsage.rpdResetAt
                        ? `次のリセット: ${formatJstDateTime(ocrUsage.rpdResetAt)}頃（日本時間）`
                        : undefined
                    }
                  />
                </div>

                {ocrUsage.todayLimitHits > 0 && (
                  <div className="mt-4 rounded-xl bg-[var(--rose-50,#fff1f2)] p-3 text-sm font-bold text-[var(--rose,#e11d48)]">
                    本日 {ocrUsage.todayLimitHits} 回 上限に達しました
                    {ocrUsage.lastLimitAt ? `（直近: ${formatJstDateTime(ocrUsage.lastLimitAt)}）` : ""}。
                  </div>
                )}

                <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">
                  ※ RPM/TPMは「直近1分間」の実績スナップショットです（毎分ゼロに戻るため、見た時点では0のことが多いです）。
                  RPDは太平洋時間0時にリセットされます。上限値は {ocrUsage.model} 無料枠の目安（RPM 10 / TPM 25万 / RPD 250）で、
                  実際の値はGoogle側の変更やアカウントにより異なります。
                </p>
              </>
            ))}
          </section>
        )}

        {!message && (
          <section className="glass-card p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => setShowUsers((v) => !v)}
            >
              <div>
                <p className="eyebrow">ユーザー管理</p>
                <h2 className="mt-1 text-lg font-black text-[var(--fg-strong)]">
                  ユーザー一覧（{stats.total}人）
                </h2>
              </div>
              <svg
                viewBox="0 0 24 24"
                className={`h-5 w-5 shrink-0 text-[var(--fg-muted)] transition-transform ${showUsers ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {showUsers && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            )}
          </section>
        )}

        {!message && showUsers && (
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
                              登録日: {new Date(user.created_at).toLocaleDateString("ja-JP")}
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
