"use client";

// 相手が予定ややることを変えたら、画面を自動で最新にする。
//  - Supabase Realtime：表が変わった瞬間に知らせてもらう（RLS が効くので、自分が見られる行の変更だけ届く）
//  - アプリに戻ってきたとき：すぐ読み直し、Realtime もつなぎ直す
//    （ホーム画面に追加したアプリは、裏に回ると通信が止められ、戻っても古い接続が「つながったふり」をしたままになりやすい）
//  - Realtime が切れている間は、画面を開いている間だけ15秒ごとに読み直す（保険）
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ── アプリに戻ってきたことを、すべての画面の部品にまとめて知らせる ──
// phase "refresh"：すぐ読み直す／phase "reconnect"：接続を作り直したので、つなぎ直す
type ResumeListener = (phase: "refresh" | "reconnect") => void;
const resumeListeners = new Set<ResumeListener>();
let hiddenAt = 0;
let lastResume = 0;
let resumeInstalled = false;

const fireResume = (awayMs: number) => {
  const nowMs = Date.now();
  if (nowMs - lastResume < 1000) return; // focus と visibilitychange が続けて来ても1回だけ
  lastResume = nowMs;
  for (const listener of resumeListeners) listener("refresh");
  // 10秒以上離れていたら、古い接続を捨てて作り直す（切り終わってからでないと、つなげない）
  if (awayMs > 10_000) {
    void supabase.realtime
      .disconnect()
      .catch(() => undefined)
      .then(() => {
        for (const listener of resumeListeners) listener("reconnect");
      });
  }
};

function installResumeWatch() {
  if (resumeInstalled || typeof window === "undefined") return;
  resumeInstalled = true;
  const away = () => (hiddenAt ? Date.now() - hiddenAt : 0);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    fireResume(away());
    hiddenAt = 0;
  });
  // iPhone のホーム画面アプリは visibilitychange が来ないことがあるので、こちらでも拾う
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) fireResume(60_000);
  });
  window.addEventListener("focus", () => {
    if (hiddenAt) {
      fireResume(away());
      hiddenAt = 0;
    }
  });
  window.addEventListener("blur", () => {
    if (!hiddenAt) hiddenAt = Date.now();
  });
  window.addEventListener("online", () => fireResume(60_000));
}

export function useLiveRefresh(name: string, tables: string[], refresh: () => unknown, enabled = true) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const key = tables.join(",");

  useEffect(() => {
    if (!enabled) return;
    installResumeWatch();
    let timer = 0;
    let stopped = false;
    // 続けて変わったときは1回にまとめる
    const run = (delay = 400) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshRef.current(), delay);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let live = false;
    const connect = () => {
      if (channel) void supabase.removeChannel(channel);
      live = false;
      let next = supabase.channel(`live-${name}-${Math.random().toString(36).slice(2)}`);
      for (const table of key.split(",")) {
        next = next.on("postgres_changes", { event: "*", schema: "public", table }, () => run());
      }
      channel = next;
      next.subscribe((status: string) => {
        if (stopped || channel !== next) return;
        if (status === "SUBSCRIBED") {
          // つながり直した直後は、切れていた間の変更を取りこぼさないよう読み直す
          if (!live) run(0);
          live = true;
        } else {
          live = false;
        }
      });
    };
    connect();

    const onResume: ResumeListener = (phase) => {
      if (phase === "reconnect") {
        connect();
        return;
      }
      run(0);
      if (!live) connect();
    };
    resumeListeners.add(onResume);

    // 切れている間だけ、画面が見えているときに15秒ごとに読み直し・つなぎ直し
    const poll = window.setInterval(() => {
      if (live || document.visibilityState !== "visible") return;
      run(0);
      connect();
    }, 15_000);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      resumeListeners.delete(onResume);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [name, key, enabled]);
}
