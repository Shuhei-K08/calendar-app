"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

type Request = {
  id: string;
  requester_id: string;
  requester_name: string;
};

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: connections, error } = await supabase
      .from("connections")
      .select("id, requester_id")
      .eq("receiver_id", user.id)
      .eq("status", "pending");

    if (error) {
      console.error(error);
      return;
    }

    const pendingConnections = connections ?? [];
    const requesterIds = pendingConnections.map((c) => c.requester_id);

    if (requesterIds.length === 0) {
      setRequests([]);
      return;
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", requesterIds);

    if (profileError) {
      console.error(profileError);
      return;
    }

    const formatted = pendingConnections.map((connection) => {
      const profile = profiles?.find((p) => p.id === connection.requester_id);

      return {
        id: connection.id,
        requester_id: connection.requester_id,
        requester_name: profile?.username ?? "名前未設定",
      };
    });

    setRequests(formatted);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRequests();
  }, [fetchRequests]);

  const approve = async (request: Request) => {
    if (approvingId) return;
    setApprovingId(request.id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
  
    if (!user) {
      alert("ログインしてください");
      setApprovingId(null);
      return;
    }
  
    const { error: updateError } = await supabase
      .from("connections")
      .update({ status: "accepted" })
      .eq("id", request.id)
      .eq("receiver_id", user.id)
      .eq("status", "pending");
    
    if (updateError) {
      console.error(updateError);
      alert(updateError.message);
      setApprovingId(null);
      return;
    }
  
    fetchRequests();
    setApprovingId(null);
    alert("承認しました");
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 pb-24 pt-4 text-[#172033] sm:px-6 sm:pb-4">
      <div className="mx-auto max-w-5xl">
      <header className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ShareCalLogo compact />
          <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
            Connection Requests
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">申請一覧</h1>
          </div>
        </div>
        <DesktopNavigation />
      </header>

      <section className="mb-4 rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-4 shadow-sm">
        <h2 className="text-base font-bold text-[#075985]">共有相手からの申請を確認する画面です</h2>
        <p className="mt-2 text-sm leading-6 text-[#475569]">
          相手があなたの共有IDを入力すると、ここに申請が届きます。承認すると相手とつながり、予定登録や予定編集で共有相手として選べるようになります。
        </p>
      </section>

      <div className="space-y-3 rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded border p-3">
            <span>{r.requester_name}</span>
            <button
              className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
              disabled={approvingId === r.id}
              onClick={() => approve(r)}
            >
              {approvingId === r.id ? "承認中..." : "承認"}
            </button>
          </div>
        ))}

        {requests.length === 0 && (
          <p className="text-gray-500">申請はありません</p>
        )}
      </div>
      </div>
      <MobileNavigation />
    </main>
  );
}
