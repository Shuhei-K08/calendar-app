"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

export default function ProfilePage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setEmail(user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select("username, share_code")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error(error);
        return;
      }

      setUsername(data.username ?? "");
      setShareCode(data.share_code ?? "");
    };

    fetchProfile();
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(shareCode);
    alert("コピーしました");
  };

  const saveUsername = async () => {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ username })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("ユーザー名を更新しました");
  };

  const updatePassword = async () => {
    if (newPassword.length < 6) {
      alert("パスワードは6文字以上にしてください");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setNewPassword("");
    alert("パスワードを更新しました");
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 pb-24 pt-4 text-[#172033] sm:px-6 sm:pb-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShareCalLogo compact />
            <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Profile
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">プロフィール</h1>
            </div>
          </div>
          <DesktopNavigation />
        </header>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-[#64748b]">メールアドレス</p>
          <p className="mt-2 rounded-lg bg-[#f8fafc] px-3 py-3 text-[#0f172a]">{email}</p>
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#64748b]">ユーザー名</span>
            <input
              className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <button
            className="mt-3 h-11 w-full rounded-lg bg-[#0f766e] px-4 font-semibold text-white disabled:opacity-50"
            disabled={saving || !username.trim()}
            onClick={saveUsername}
          >
            ユーザー名を保存
          </button>
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-[#64748b]">あなたの共有ID</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 rounded-lg bg-[#f8fafc] px-3 py-3 text-xl font-bold tracking-[0.12em] text-[#0f172a]">
              {shareCode}
            </p>
            <button className="rounded-lg bg-[#0f766e] px-3 py-3 text-sm font-semibold text-white" onClick={copy}>
              コピー
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#64748b]">新しいパスワード</span>
            <input
              className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <button
            className="mt-3 h-11 w-full rounded-lg border border-[#0f766e] px-4 font-semibold text-[#0f766e]"
            onClick={updatePassword}
          >
            パスワードを変更
          </button>
        </section>
      </div>
      <MobileNavigation />
    </main>
  );
}
