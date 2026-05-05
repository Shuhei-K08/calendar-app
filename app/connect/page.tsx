"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation } from "@/app/components/AppNavigation";

export default function ConnectPage() {
  const [code, setCode] = useState("");
  const [shareCode, setShareCode] = useState("");

  useEffect(() => {
    const fetchMyShareCode = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("share_code")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error(error);
        return;
      }

      setShareCode(data.share_code);
    };

    fetchMyShareCode();
  }, []);

  const sendRequest = async () => {
    if (!code) {
      alert("IDを入力してください");
      return;
    }

    // 自分のユーザー取得
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("ログインしてください");
      return;
    }

    // 相手のIDからユーザー取得
    const { data: target, error: findError } = await supabase
      .from("profiles")
      .select("id")
      .eq("share_code", code)
      .single();

    if (findError || !target) {
      alert("ユーザーが見つかりません");
      return;
    }

    if (target.id === user.id) {
      alert("自分自身には申請できません");
      return;
    }

    // 申請作成
    const { error } = await supabase.from("connections").insert({
      requester_id: user.id,
      receiver_id: target.id,
      status: "pending",
    });

    if (error) {
      console.error("connection error:", error);
      alert(error.message);
      return;
    }

    alert("申請を送信しました");
    setCode("");
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 pb-24 pt-4 text-[#172033] sm:px-6 sm:pb-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold text-[#0f172a]">つながる</h1>
            <DesktopNavigation />
          </div>
        </header>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-[#64748b]">あなたの共有ID</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 rounded-lg bg-[#f8fafc] px-3 py-3 text-xl font-bold tracking-[0.12em] text-[#0f172a]">
              {shareCode || "読み込み中"}
            </p>
            <button
              className="rounded-lg bg-[#0f766e] px-3 py-3 text-sm font-semibold text-white"
              disabled={!shareCode}
              onClick={async () => {
                await navigator.clipboard.writeText(shareCode);
                alert("コピーしました");
              }}
            >
              コピー
            </button>
          </div>
        </section>

      <section className="space-y-3 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-[#64748b]">相手の共有ID</p>
        <input
          className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
          placeholder="共有IDを入力"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />

        <button
          className="h-11 w-full rounded-lg bg-[#0f766e] px-4 py-2 font-semibold text-white"
          onClick={sendRequest}
        >
          申請する
        </button>
      </section>
      </div>
      <MobileNavigation />
    </main>
  );
}
