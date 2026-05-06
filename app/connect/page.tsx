"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

type Request = {
  id: string;
  requester_id: string;
  requester_name: string;
};

type ConnectedUser = {
  connection_id: string;
  user_id: string;
  username: string;
};

export default function ConnectPage() {
  const [code, setCode] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
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
    const requesterIds = pendingConnections.map((connection) => connection.requester_id);

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

    setRequests(
      pendingConnections.map((connection) => {
        const profile = profiles?.find((item) => item.id === connection.requester_id);

        return {
          id: connection.id,
          requester_id: connection.requester_id,
          requester_name: profile?.username ?? "名前未設定",
        };
      }),
    );
  }, []);

  const fetchConnectedUsers = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: connections, error } = await supabase
      .from("connections")
      .select("id, requester_id, receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (error) {
      console.error(error);
      return;
    }

    const acceptedConnections = connections ?? [];
    const userIds = acceptedConnections.map((connection) =>
      connection.requester_id === user.id ? connection.receiver_id : connection.requester_id,
    );

    if (userIds.length === 0) {
      setConnectedUsers([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", userIds);

    setConnectedUsers(
      acceptedConnections.map((connection) => {
        const targetId =
          connection.requester_id === user.id ? connection.receiver_id : connection.requester_id;
        const profile = profiles?.find((item) => item.id === targetId);

        return {
          connection_id: connection.id,
          user_id: targetId,
          username: profile?.username ?? "名前未設定",
        };
      }),
    );
  }, []);

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

    void fetchMyShareCode();
    const timer = window.setTimeout(() => {
      void fetchRequests();
      void fetchConnectedUsers();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchConnectedUsers, fetchRequests]);

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

    const { error } = await supabase
      .from("connections")
      .update({ status: "accepted" })
      .eq("id", request.id)
      .eq("receiver_id", user.id)
      .eq("status", "pending");

    setApprovingId(null);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    await fetchRequests();
    await fetchConnectedUsers();
    alert("承認しました");
  };

  const reject = async (request: Request) => {
    const ok = window.confirm(`「${request.requester_name}」さんの申請を却下しますか？`);
    if (!ok) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("id", request.id)
      .eq("receiver_id", user.id)
      .eq("status", "pending");

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    await fetchRequests();
  };

  const disconnect = async (connectedUser: ConnectedUser) => {
    const ok = window.confirm(
      `「${connectedUser.username}」さんとのつながりを解除しますか？\n今後、新しく予定を共有できなくなります。`,
    );
    if (!ok) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: myEvents } = await supabase
        .from("events")
        .select("id")
        .eq("user_id", user.id);

      const myEventIds = (myEvents ?? []).map((event) => event.id);
      if (myEventIds.length > 0) {
        await supabase
          .from("event_shares")
          .delete()
          .eq("shared_with", connectedUser.user_id)
          .in("event_id", myEventIds);
      }
    }

    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("id", connectedUser.connection_id);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    await fetchConnectedUsers();
  };

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
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <ShareCalLogo compact />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                  Connect
                </p>
                <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">つながる</h1>
              </div>
            </div>
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
          <div>
            <p className="text-sm font-semibold text-[#64748b]">相手の共有ID</p>
            <p className="mt-1 text-sm text-[#64748b]">
              相手から教えてもらった共有IDを入力すると、つながり申請を送れます。
            </p>
          </div>
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

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-bold text-[#0f172a]">共有できるユーザー</h2>
            <p className="mt-1 text-sm leading-6 text-[#64748b]">
              ここに表示されている相手は、予定登録や予定編集で共有先として選べます。解除すると共有先として選べなくなります。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {connectedUsers.map((connectedUser) => (
              <div
                key={connectedUser.connection_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#d9e2ef] bg-[#f8fafc] p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#64748b]">ユーザー</p>
                  <p className="truncate font-bold text-[#0f172a]">{connectedUser.username}</p>
                </div>
                <button
                  className="h-10 rounded-lg border border-[#fecdd3] px-3 text-sm font-bold text-[#be123c]"
                  onClick={() => disconnect(connectedUser)}
                >
                  解除
                </button>
              </div>
            ))}
            {connectedUsers.length === 0 && (
              <p className="rounded-xl bg-[#f8fafc] p-4 text-sm text-[#64748b] sm:col-span-2">
                まだ共有できるユーザーはいません。共有IDで申請するか、届いた申請を承認してください。
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <div className="mb-4 rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-4">
            <h2 className="text-base font-bold text-[#075985]">届いた申請</h2>
            <p className="mt-2 text-sm leading-6 text-[#475569]">
              相手があなたの共有IDを入力すると、ここに申請が届きます。承認すると予定登録や予定編集で共有相手として選べます。
            </p>
          </div>

          <div className="grid gap-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#d9e2ef] bg-[#f8fafc] p-3"
              >
                <div>
                  <p className="text-xs font-bold text-[#64748b]">申請者</p>
                  <p className="font-bold text-[#0f172a]">{request.requester_name}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="h-10 rounded-lg bg-[#0f766e] px-4 text-sm font-bold text-white disabled:opacity-50"
                    disabled={approvingId === request.id}
                    onClick={() => approve(request)}
                  >
                    {approvingId === request.id ? "承認中" : "承認"}
                  </button>
                  <button
                    className="h-10 rounded-lg border border-[#fecdd3] px-4 text-sm font-bold text-[#be123c]"
                    onClick={() => reject(request)}
                  >
                    却下
                  </button>
                </div>
              </div>
            ))}
            {requests.length === 0 && (
              <p className="rounded-xl bg-[#f8fafc] p-4 text-sm text-[#64748b]">
                届いている申請はありません。
              </p>
            )}
          </div>
        </section>
      </div>
      <MobileNavigation />
    </main>
  );
}
