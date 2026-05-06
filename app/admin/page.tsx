"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

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
      setLoading(false);
      return;
    }

    setUsers(result.users ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchUsers();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchUsers]);

  const runAction = async (user: AdminUser, action: "suspend" | "restore" | "make_admin" | "remove_admin" | "delete") => {
    const labels = {
      suspend: "停止",
      restore: "停止解除",
      make_admin: "管理者化",
      remove_admin: "管理者解除",
      delete: "削除",
    };
    const ok = window.confirm(`「${user.username}」を${labels[action]}しますか？`);
    if (!ok) return;

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
      alert(result.error ?? "操作に失敗しました");
      return;
    }

    await fetchUsers();
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 pb-24 pt-4 text-[#172033] sm:px-6 sm:pb-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShareCalLogo compact />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                Admin
              </p>
              <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">管理</h1>
            </div>
          </div>
          <DesktopNavigation />
        </header>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-[#0f172a]">ユーザー管理</h2>
          <p className="mt-1 text-sm leading-6 text-[#64748b]">
            管理者だけが利用できます。停止、停止解除、管理者権限の変更、アカウント削除を行えます。
          </p>
          {message && (
            <div className="mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-sm font-semibold text-[#92400e]">
              <p>{message}</p>
              <p className="mt-2 text-xs leading-5">
                管理者登録が完了しているか確認してください。設定後は再デプロイ、または再ログインが必要な場合があります。
              </p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          {loading ? (
            <p className="text-sm text-[#64748b]">読み込み中です。</p>
          ) : (
            <div className="grid gap-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-black text-[#0f172a]">{user.username}</p>
                      <p className="truncate text-sm text-[#64748b]">{user.email}</p>
                      <p className="mt-1 text-xs font-bold text-[#64748b]">
                        {user.role === "admin" ? "管理者" : "ユーザー"}
                        {user.banned_until && " / 停止中"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <button
                        className="h-10 rounded-lg border border-[#cbd5e1] px-3 text-sm font-bold text-[#334155]"
                        onClick={() => runAction(user, user.banned_until ? "restore" : "suspend")}
                      >
                        {user.banned_until ? "停止解除" : "停止"}
                      </button>
                      <button
                        className="h-10 rounded-lg border border-[#cbd5e1] px-3 text-sm font-bold text-[#334155]"
                        onClick={() =>
                          runAction(user, user.role === "admin" ? "remove_admin" : "make_admin")
                        }
                      >
                        {user.role === "admin" ? "管理者解除" : "管理者にする"}
                      </button>
                      <button
                        className="h-10 rounded-lg bg-[#be123c] px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={user.role === "admin"}
                        onClick={() => runAction(user, "delete")}
                      >
                        {user.role === "admin" ? "削除不可" : "削除"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-sm text-[#64748b]">ユーザーはいません。</p>
              )}
            </div>
          )}
        </section>
      </div>
      <MobileNavigation />
    </main>
  );
}
