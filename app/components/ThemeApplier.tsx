"use client";

import { useEffect } from "react";
import { findDesignTheme, resolveEventColor } from "@/lib/theme";

// 設定画面で選んだ配色を、どのページでも同じように反映する
export function applySavedTheme() {
  if (typeof window === "undefined") return;
  let settings: Record<string, string | undefined> = {};
  try {
    settings = JSON.parse(window.localStorage.getItem("calendar_settings") ?? "{}");
  } catch {
    settings = {};
  }
  const root = document.documentElement;
  const theme = findDesignTheme(settings.designTheme);
  const t = theme.id;
  root.style.setProperty("--app-bg", theme.background);
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--app-accent", theme.accent);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-strong", theme.accentStrong);
  root.style.setProperty("--accent-soft", theme.accentSoft);
  root.style.setProperty("--accent-ring", `color-mix(in srgb, ${theme.accent} 22%, transparent)`);
  root.style.setProperty("--plus-bg", theme.plusBg);
  root.style.setProperty("--plus-ink", theme.plusInk);
  root.style.setProperty("--own-event-bg", resolveEventColor("ownEventBackground", settings.ownEventBackground ?? settings.ownEvent, t));
  root.style.setProperty(
    "--partner-event-bg",
    resolveEventColor("partnerEventBackground", settings.partnerEventBackground ?? settings.ownEventBackground, t),
  );
  root.style.setProperty("--incoming-event-bg", resolveEventColor("incomingEventBackground", settings.incomingEventBackground, t));
  root.style.setProperty("--shared-event-bg", resolveEventColor("sharedEventBackground", settings.sharedEventBackground ?? settings.sharedEvent, t));
  root.style.setProperty("--uncategorized-event", resolveEventColor("unclassifiedEvent", settings.unclassifiedEvent, t));
}

export default function ThemeApplier() {
  useEffect(() => {
    applySavedTheme();
  }, []);
  return null;
}
