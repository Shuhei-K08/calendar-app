"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

/* ── Toast ── */
type ToastItem = { id: number; msg: string; type: "success" | "error" | "info" };

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = (msg: string, type: ToastItem["type"] = "success") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, msg, type }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  return { toasts, show };
}

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ── Types ── */
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

/* ── Confirm Inline ── */
type ConfirmState = { type: "disconnect"; user: ConnectedUser } | { type: "reject"; request: Request } | null;

export default function ConnectPage() {
  const [code, setCode] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const { toasts, show } = useToast();

  const fetchRequests = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: connections, error } = await supabase
      .from("connections")
      .select("id, requester_id")
      .eq("receiver_id", user.id)
      .eq("status", "pending");

    if (error) { console.error(error); return; }

    const pendingConnections = connections ?? [];
    const requesterIds = pendingConnections.map((c) => c.requester_id);

    if (requesterIds.length === 0) { setRequests([]); return; }

    const { data: profiles } = await supabase
      .from("profiles").select("id, username").in("id", requesterIds);

    setRequests(pendingConnections.map((c) => ({
      id: c.id,
      requester_id: c.requester_id,
      requester_name: profiles?.find((p) => p.id === c.requester_id)?.username ?? "名前未設定",
    })));
  }, []);

  const fetchConnectedUsers = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: connections, error } = await supabase
      .from("connections")
      .select("id, requester_id, receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (error) { console.error(error); return; }

    const accepted = connections ?? [];
    const userIds = accepted.map((c) =>
      c.requester_id === user.id ? c.receiver_id : c.requester_id,
    );

    if (userIds.length === 0) { setConnectedUsers([]); return; }

    const { data: profiles } = await supabase
      .from("profiles").select("id, username").in("id", userIds);

    setConnectedUsers(accepted.map((c) => {
      const targetId = c.requester_id === user.id ? c.receiver_id : c.requester_id;
      return {
        connection_id: c.id,
        user_id: targetId,
        username: profiles?.find((p) => p.id === targetId)?.username ?? "名前未設定",
      };
    }));
  }, []);

  useEffect(() => {
    const fetchMyShareCode = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles").select("share_code").eq("id", user.id).single();
      setShareCode(data?.share_code ?? "");
    };
    void fetchMyShareCode();
    void fetchRequests();
    void fetchConnectedUsers();
  }, [fetchConnectedUsers, fetchRequests]);

  const copyShareCode = async () => {
    if (!shareCode) return;
    await navigator.clipboard.writeText(shareCode);
    show("共有IDをコピーしました", "info");
  };

  const sendRequest = async () => {
    if (!code.trim()) { show("IDを入力してください", "error"); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { show("ログインしてください", "error"); return; }

    setSendingRequest(true);

    const { data: target, error: findError } = await supabase
      .from("profiles").select("id").eq("share_code", code.trim().toUpperCase()).single();

    if (findError || !target) {
      show("ユーザーが見つかりません", "error");
      setSendingRequest(false);
      return;
    }

    if (target.id === user.id) {
      show("自分自身には申請できません", "error");
      setSendingRequest(false);
      return;
    }

    const { error } = await supabase.from("connections").insert({
      requester_id: user.id,
      receiver_id: target.id,
      status: "pending",
    });

    setSendingRequest(false);

    if (error) {
      show(error.message.includes("duplicate") ? "すでに申請済みです" : error.message, "error");
      return;
    }

    show("申請を送信しました", "success");
    setCode("");
  };

  const approve = async (request: Request) => {
    if (approvingId) return;
    setApprovingId(request.id);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { show("ログインしてください", "error"); setApprovingId(null); return; }

    const { error } = await supabase
      .from("connections")
      .update({ status: "accepted" })
      .eq("id", request.id)
      .eq("receiver_id", user.id)
      .eq("status", "pending");

    setApprovingId(null);

    if (error) { show(error.message, "error"); return; }

    show(`${request.requester_name}さんの申請を承認しました`, "success");
    await fetchRequests();
    await fetchConnectedUsers();
  };

  const reject = async (request: Request) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("connections").delete()
      .eq("id", request.id).eq("receiver_id", user.id).eq("status", "pending");

    if (error) { show(error.message, "error"); return; }

    show(`${request.requester_name}さんの申請を却下しました`, "info");
    setConfirm(null);
    await fetchRequests();
  };

  const disconnect = async (connectedUser: ConnectedUser) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Remove shared events
    const { data: myEvents } = await supabase.from("events").select("id").eq("user_id", user.id);
    const myEventIds = (myEvents ?? []).map((e) => e.id);
    if (myEventIds.length > 0) {
      await supabase.from("event_shares").delete()
        .eq("shared_with", connectedUser.user_id).in("event_id", myEventIds);
    }
    const { data: otherEvents } = await supabase.from("events").select("id").eq("user_id", connectedUser.user_id);
    const otherEventIds = (otherEvents ?? []).map((e) => e.id);
    if (otherEventIds.length > 0) {
      await supabase.from("event_shares").delete()
        .eq("shared_with", user.id).in("event_id", otherEventIds);
    }

    const { error } = await supabase.from("connections").delete().eq("id", connectedUser.connection_id);
    if (error) { show(error.message, "error"); return; }

    show(`${connectedUser.username}さんとのつながりを解除しました`, "info");
    setConfirm(null);
    await fetchConnectedUsers();
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 pb-24 pt-4 text-[#172033] sm:px-6 sm:pb-4">
      <ToastStack toasts={toasts} />

      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="rounded-2xl border border-[#d9e2ef] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <ShareCalLogo compact />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Connect</p>
                <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">つながる</h1>
              </div>
            </div>
            <DesktopNavigation />
          </div>
        </header>

        {/* My Share Code */}
        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#64748b]">Your ID</p>
          <h2 className="mt-1 text-sm font-bold text-[#0f172a]">あなたの共有ID</h2>
          <p className="mt-1 text-xs text-[#64748b]">このIDを相手に教えると、つながり申請を受け取れます。</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 rounded-xl border border-[#d9e2ef] bg-[#f8fafc] px-4 py-3">
              <p className="text-xl font-black tracking-[0.16em] text-[#0f172a]">
                {shareCode || <span className="text-[#94a3b8]">読み込み中</span>}
              </p>
            </div>
            <button
              className="flex h-12 items-center gap-2 rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white transition hover:bg-[#115e59] disabled:opacity-50"
              disabled={!shareCode}
              onClick={copyShareCode}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              コピー
            </button>
          </div>
        </section>

        {/* Send Request */}
        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#64748b]">Add</p>
          <h2 className="mt-1 text-sm font-bold text-[#0f172a]">相手の共有IDで申請</h2>
          <p className="mt-1 text-xs text-[#64748b]">相手から教えてもらった共有IDを入力してつながり申請を送ります。</p>
          <div className="mt-3 flex gap-2">
            <input
              className="h-12 flex-1 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 text-sm font-bold uppercase tracking-[0.1em] outline-none transition placeholder:normal-case placeholder:tracking-normal focus:border-[#0f766e] focus:bg-white focus:ring-4 focus:ring-[#99f6e4]/50"
              placeholder="共有IDを入力"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && sendRequest()}
              maxLength={12}
            />
            <button
              className="flex h-12 items-center gap-2 rounded-xl bg-[#0f766e] px-5 text-sm font-bold text-white transition hover:bg-[#115e59] disabled:opacity-50"
              onClick={sendRequest}
              disabled={!code.trim() || sendingRequest}
            >
              {sendingRequest ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : "申請"}
            </button>
          </div>
        </section>

        {/* Connected Users */}
        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#64748b]">Connected</p>
            <h2 className="mt-1 text-sm font-bold text-[#0f172a]">つながっているユーザー</h2>
            <p className="mt-1 text-xs text-[#64748b]">
              ここに表示されている相手に予定を共有できます。解除すると新しく共有できなくなります。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {connectedUsers.map((cu) => (
              <div key={cu.connection_id} className="rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f766e] text-sm font-black text-white">
                      {cu.username.slice(0, 1)}
                    </div>
                    <div>
                      <p className="font-bold text-[#0f172a]">{cu.username}</p>
                      <p className="text-xs text-[#64748b]">つながり済み</p>
                    </div>
                  </div>
                  {confirm?.type === "disconnect" && confirm.user.connection_id === cu.connection_id ? (
                    <div className="flex gap-1.5">
                      <button
                        className="h-8 rounded-lg bg-[#be123c] px-3 text-xs font-bold text-white"
                        onClick={() => disconnect(cu)}
                      >
                        解除
                      </button>
                      <button
                        className="h-8 rounded-lg border border-[#cbd5e1] px-3 text-xs font-bold text-[#475569]"
                        onClick={() => setConfirm(null)}
                      >
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    <button
                      className="h-9 rounded-lg border border-[#fecdd3] px-3 text-xs font-bold text-[#be123c]"
                      onClick={() => setConfirm({ type: "disconnect", user: cu })}
                    >
                      解除
                    </button>
                  )}
                </div>
                {confirm?.type === "disconnect" && confirm.user.connection_id === cu.connection_id && (
                  <p className="mt-2 text-xs font-bold text-[#be123c]">本当に解除しますか？</p>
                )}
              </div>
            ))}
            {connectedUsers.length === 0 && (
              <p className="rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-5 text-sm text-[#64748b] sm:col-span-2">
                まだつながっているユーザーはいません。<br />
                共有IDで申請するか、届いた申請を承認してください。
              </p>
            )}
          </div>
        </section>

        {/* Incoming Requests */}
        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#64748b]">Requests</p>
              <h2 className="mt-1 flex items-center gap-2 text-sm font-bold text-[#0f172a]">
                届いた申請
                {requests.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1.5 text-xs font-black text-white">
                    {requests.length}
                  </span>
                )}
              </h2>
              <p className="mt-1 text-xs text-[#64748b]">
                承認すると予定登録・編集時に共有相手として選べます。
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {requests.map((req) => (
              <div key={req.id} className="rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0369a1] text-sm font-black text-white">
                      {req.requester_name.slice(0, 1)}
                    </div>
                    <div>
                      <p className="font-bold text-[#0f172a]">{req.requester_name}</p>
                      <p className="text-xs text-[#0369a1]">つながり申請</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="h-9 rounded-lg bg-[#0f766e] px-4 text-sm font-bold text-white disabled:opacity-50"
                      disabled={approvingId === req.id}
                      onClick={() => approve(req)}
                    >
                      {approvingId === req.id ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white inline-block" />
                      ) : "承認"}
                    </button>
                    {confirm?.type === "reject" && confirm.request.id === req.id ? (
                      <div className="flex gap-1.5">
                        <button
                          className="h-9 rounded-lg bg-[#be123c] px-3 text-xs font-bold text-white"
                          onClick={() => reject(req)}
                        >
                          却下
                        </button>
                        <button
                          className="h-9 rounded-lg border border-[#cbd5e1] px-3 text-xs font-bold text-[#475569]"
                          onClick={() => setConfirm(null)}
                        >
                          戻る
                        </button>
                      </div>
                    ) : (
                      <button
                        className="h-9 rounded-lg border border-[#fecdd3] px-3 text-sm font-bold text-[#be123c]"
                        onClick={() => setConfirm({ type: "reject", request: req })}
                      >
                        却下
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {requests.length === 0 && (
              <p className="rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-5 text-sm text-[#64748b]">
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
