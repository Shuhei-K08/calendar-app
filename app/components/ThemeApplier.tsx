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
  root.style.setProperty("--app-bg", theme.background);
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--app-accent", theme.accent);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-strong", `color-mix(in srgb, ${theme.accent} 78%, #000)`);
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${theme.accent} 12%, #fff)`);
  root.style.setProperty("--own-event-bg", resolveEventColor("ownEventBackground", settings.ownEventBackground ?? settings.ownEvent));
  root.style.setProperty(
    "--partner-event-bg",
    resolveEventColor("partnerEventBackground", settings.partnerEventBackground ?? settings.ownEventBackground),
  );
  root.style.setProperty("--incoming-event-bg", resolveEventColor("incomingEventBackground", settings.incomingEventBackground));
  root.style.setProperty("--shared-event-bg", resolveEventColor("sharedEventBackground", settings.sharedEventBackground ?? settings.sharedEvent));
  root.style.setProperty("--uncategorized-event", resolveEventColor("unclassifiedEvent", settings.unclassifiedEvent));
}

export default function ThemeApplier() {
  useEffect(() => {
    applySavedTheme();
  }, []);
  return null;
}
