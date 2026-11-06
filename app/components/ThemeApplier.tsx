"use client";

import { useEffect, useState } from "react";
import { findDesignTheme, resolveEventColor, type EventColorKey } from "@/lib/theme";
import { fetchSeason, isSeasonActive, readCachedSeason, SEASON_CHANGED_EVENT, seasonalEnabled, XMAS_THEME } from "@/lib/season";

const EVENT_KEYS: EventColorKey[] = [
  "ownEventBackground",
  "partnerEventBackground",
  "incomingEventBackground",
  "sharedEventBackground",
  "unclassifiedEvent",
];

// 設定画面で選んだ配色を、どのページでも同じように反映する
// 期間限定のデザイン（クリスマス）の期間中で、本人が使う設定なら、そちらを優先する
export function applySavedTheme() {
  if (typeof window === "undefined") return false;
  let settings: Record<string, string | undefined> = {};
  try {
    settings = JSON.parse(window.localStorage.getItem("calendar_settings") ?? "{}");
  } catch {
    settings = {};
  }
  const root = document.documentElement;
  const base = findDesignTheme(settings.designTheme);
  const seasonal = seasonalEnabled(settings) && isSeasonActive(readCachedSeason());
  const theme = seasonal ? XMAS_THEME : base;

  // 予定の色：期間中は、テーマのままの色ならクリスマスの色に。自分で変えた色はそのまま
  const eventColor = (key: EventColorKey, saved?: string) => {
    const resolved = resolveEventColor(key, saved, base.id);
    if (!seasonal) return resolved;
    return resolved.trim().toLowerCase() === base.events[key].toLowerCase() ? XMAS_THEME.events[key] : resolved;
  };
  const saved: Record<EventColorKey, string | undefined> = {
    ownEventBackground: settings.ownEventBackground ?? settings.ownEvent,
    partnerEventBackground: settings.partnerEventBackground ?? settings.ownEventBackground,
    incomingEventBackground: settings.incomingEventBackground,
    sharedEventBackground: settings.sharedEventBackground ?? settings.sharedEvent,
    unclassifiedEvent: settings.unclassifiedEvent,
  };
  const colors = Object.fromEntries(EVENT_KEYS.map((k) => [k, eventColor(k, saved[k])])) as Record<EventColorKey, string>;

  root.style.setProperty("--app-bg", theme.background);
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--app-accent", theme.accent);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-strong", theme.accentStrong);
  root.style.setProperty("--accent-soft", theme.accentSoft);
  root.style.setProperty("--accent-ring", `color-mix(in srgb, ${theme.accent} 22%, transparent)`);
  root.style.setProperty("--plus-bg", theme.plusBg);
  root.style.setProperty("--plus-ink", theme.plusInk);
  root.style.setProperty("--own-event-bg", colors.ownEventBackground);
  root.style.setProperty("--partner-event-bg", colors.partnerEventBackground);
  root.style.setProperty("--incoming-event-bg", colors.incomingEventBackground);
  root.style.setProperty("--shared-event-bg", colors.sharedEventBackground);
  root.style.setProperty("--uncategorized-event", colors.unclassifiedEvent);
  if (seasonal) root.dataset.season = "xmas";
  else delete root.dataset.season;
  return seasonal;
}

// 雪のつぶ（位置・大きさ・速さ）。毎回同じ並びにして、ちらつかないようにする
const FLAKES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  size: 3 + ((i * 7) % 4),
  duration: 9 + ((i * 5) % 8),
  delay: -((i * 13) % 17),
  drift: (i % 2 ? 1 : -1) * (10 + ((i * 3) % 14)),
}));

export default function ThemeApplier() {
  const [seasonal, setSeasonal] = useState(false);

  useEffect(() => {
    const apply = () => setSeasonal(applySavedTheme());
    apply();
    void fetchSeason().then(apply, () => undefined);
    // 日付が変わったときにも合わせる（アプリに戻ったとき）
    const onVisible = () => {
      if (document.visibilityState === "visible") apply();
    };
    window.addEventListener(SEASON_CHANGED_EVENT, apply);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(SEASON_CHANGED_EVENT, apply);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!seasonal) return null;
  return (
    <div className="season-snow" aria-hidden="true">
      {FLAKES.map((f, i) => (
        <i
          key={i}
          style={
            {
              left: `${f.left}%`,
              width: f.size,
              height: f.size,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              "--drift": `${f.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
