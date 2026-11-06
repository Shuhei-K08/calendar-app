"use client";

// 設定画面：この端末でリマインドの通知を受け取る
import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";

const BellIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

const MESSAGE: Record<PushState, string> = {
  on: "この端末に、やることのリマインドが届きます",
  off: "オンにすると、この端末にリマインドが届きます",
  denied: "通知がブロックされています。端末の設定で ShareCal の通知を許可してください",
  "ios-needs-install": "iPhone は、Safari の共有ボタン › 「ホーム画面に追加」で追加したアプリから開くとオンにできます",
  unsupported: "このブラウザは通知に対応していません",
  "no-key": "通知の準備がまだです（管理者が VAPID の鍵を設定すると使えます）",
};

export default function PushSetting({ show }: { show: (m: string, t?: "success" | "error" | "info") => void }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPushState().then(setState).catch(() => setState("unsupported"));
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

  const canToggle = state === "on" || state === "off";
  return (
    <label className="st-row is-static">
      <span className="st-icon tone-orange">
        <BellIcon />
      </span>
      <span className="st-row-text">
        <span className="st-row-title">リマインドの通知</span>
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
  );
}
