"use client";

// 相手が予定ややることを変えたら、画面を自動で最新にする。
//  - Supabase Realtime：表が変わった瞬間に知らせてもらう（RLS が効くので、自分が見られる行の変更だけ届く）
//  - アプリに戻ってきたとき（裏から表に出たとき）にも読み直す（Realtime が切れていたときの保険）
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export function useLiveRefresh(name: string, tables: string[], refresh: () => unknown, enabled = true) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const key = tables.join(",");

  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    // 続けて変わったときは1回にまとめる
    const run = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshRef.current(), 400);
    };

    let channel = supabase.channel(`live-${name}-${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(",")) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, run);
    }
    channel.subscribe();

    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // 少しでも裏にいたら読み直す
      if (hiddenAt && Date.now() - hiddenAt > 2000) run();
      hiddenAt = 0;
    };
    const onOnline = () => run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [name, key, enabled]);
}
