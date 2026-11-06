"use client";

// この端末で通知（リマインド）を受け取る設定
import { supabase } from "@/lib/supabase";

export type PushState = "unsupported" | "ios-needs-install" | "denied" | "off" | "on" | "no-key";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const keyToBytes = (base64: string) => {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** いまの状態 */
export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!supported()) return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  if (!VAPID_PUBLIC_KEY) return "no-key";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** 通知を受け取る（許可を聞いて、この端末を登録） */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  if (!VAPID_PUBLIC_KEY) return "no-key";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("subscribe failed");
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: "user_id,endpoint" },
  );
  if (error) throw error;
  return "on";
}

/** この端末では通知を受け取らない */
export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
  return "off";
}
