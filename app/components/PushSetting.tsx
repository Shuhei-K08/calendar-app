"use client";

// 設定画面：この端末で通知を受け取る／通知の種類ごとのオン・オフ
import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";
import { supabase } from "@/lib/supabase";

const BellIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

const MESSAGE: Record<PushState, string> = {
  on: "この端末に通知が届きます",
  off: "オンにすると、この端末に通知が届きます",
  denied: "通知がブロックされています。端末の設定で ShareCal の通知を許可してください",
  "ios-needs-install": "iPhone は、Safari の共有ボタン › 「ホーム画面に追加」で追加したアプリから開くとオンにできます",
  unsupported: "このブラウザは通知に対応していません",
  "no-key": "通知の準備がまだです（管理者が VAPID の鍵を設定すると使えます）",
};

// 種類ごとの設定（notification_prefs の列名と同じ）
type Kind = "todo_remind" | "event_remind" | "share" | "comment" | "reaction";
const KINDS: { key: Kind; title: string; sub: string }[] = [
  { key: "todo_remind", title: "やることのリマインド", sub: "設定した日時に、担当の人へ" },
  { key: "event_remind", title: "予定のリマインド", sub: "「◯分前」を設定した予定" },
  { key: "share", title: "予定の共有", sub: "相手が予定を共有したとき" },
  { key: "comment", title: "コメント", sub: "予定にコメントが付いたとき" },
  { key: "reaction", title: "スタンプ", sub: "予定にスタンプが押されたとき" },
];
type Prefs = Record<Kind, boolean>;
const ALL_ON: Prefs = { todo_remind: true, event_remind: true, share: true, comment: true, reaction: true };

export default function PushSetting({ show }: { show: (m: string, t?: "success" | "error" | "info") => void }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(ALL_ON);
  const [prefsReady, setPrefsReady] = useState<"loading" | "ok" | "unavailable">("loading");

  useEffect(() => {
    void getPushState().then(setState).catch(() => setState("unsupported"));
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data, error } = await supabase.from("notification_prefs").select("*").eq("user_id", auth.user.id).maybeSingle();
      if (error) {
        setPrefsReady("unavailable");
        return;
      }
      if (data) {
        const row = data as Partial<Prefs>;
        setPrefs(Object.fromEntries(KINDS.map(({ key }) => [key, row[key] !== false])) as Prefs);
      }
      setPrefsReady("ok");
    })();
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      const next = on ? await enablePush() : await disablePush();
      setState(next);
      if (on && next === "on") show("この端末で通知を受け取ります");
      else if (!on) show("この端末では通知を受け取りません", "info");
      else show(MESSAGE[next], "error");
    } catch {
      show("通知の設定に失敗しました", "error");
    } finally {
      setBusy(false);
    }
  };

  const setKind = async (key: Kind, on: boolean) => {
    const before = prefs;
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = auth.user
      ? await supabase.from("notification_prefs").upsert({ user_id: auth.user.id, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      : { error: new Error("ログインが必要です") };
    if (error) {
      setPrefs(before);
      show("保存できませんでした", "error");
    }
  };

  const canToggle = state === "on" || state === "off";
  return (
    <>
      <label className="st-row is-static">
        <span className="st-icon tone-orange">
          <BellIcon />
        </span>
        <span className="st-row-text">
          <span className="st-row-title">この端末で通知を受け取る</span>
          <span className="st-row-sub">{state ? MESSAGE[state] : "確認中…"}</span>
        </span>
        <input
          type="checkbox"
          className="st-switch"
          checked={state === "on"}
          disabled={!canToggle || busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
      </label>
      {prefsReady === "unavailable" ? (
        <div className="st-row is-static is-sub">
          <span className="st-row-text">
            <span className="st-row-sub">種類ごとの設定は、準備ができると使えます（supabase-notify-prefs.sql を実行してください）</span>
          </span>
        </div>
      ) : (
        KINDS.map(({ key, title, sub }) => (
          <label key={key} className="st-row is-static is-sub">
            <span className="st-row-text">
              <span className="st-row-title">{title}</span>
              <span className="st-row-sub">{sub}</span>
            </span>
            <input
              type="checkbox"
              className="st-switch"
              checked={prefs[key]}
              disabled={prefsReady !== "ok"}
              onChange={(e) => void setKind(key, e.target.checked)}
              aria-label={`${title}の通知`}
            />
          </label>
        ))
      )}
    </>
  );
}
