// アプリ全体の配色（新デザイン「やわらか」）
// 予定の色: わたし＝緑、相手から＝オレンジ、ふたり＝紫

export type EventColorKey =
  | "ownEventBackground"
  | "partnerEventBackground"
  | "incomingEventBackground"
  | "sharedEventBackground"
  | "unclassifiedEvent";

export const EVENT_COLOR_DEFAULTS: Record<EventColorKey, string> = {
  ownEventBackground: "#ddf0ea",
  partnerEventBackground: "#ddf0ea",
  incomingEventBackground: "#fde8d7",
  sharedEventBackground: "#ece6fb",
  unclassifiedEvent: "#0f7a66",
};

// 旧デザインの初期値。これが保存されたままなら新しい初期値に置き換える
const LEGACY_DEFAULTS: Record<EventColorKey, string[]> = {
  ownEventBackground: ["#e0f2fe"],
  partnerEventBackground: ["#e0f2fe"],
  incomingEventBackground: ["#ede9fe"],
  sharedEventBackground: ["#fef3c7"],
  unclassifiedEvent: ["#22c8d6"],
};

export const resolveEventColor = (key: EventColorKey, saved?: string | null) => {
  if (!saved) return EVENT_COLOR_DEFAULTS[key];
  if (LEGACY_DEFAULTS[key].includes(saved.trim().toLowerCase())) return EVENT_COLOR_DEFAULTS[key];
  return saved;
};

export const DESIGN_THEMES = [
  {
    id: "clean",
    name: "やわらか",
    description: "あたたかい白と深い緑（標準）",
    background: "#f6f5f1",
    accent: "#0f7a66",
    preview: ["#ddf0ea", "#fde8d7", "#ece6fb"],
  },
  {
    id: "mint",
    name: "ミント",
    description: "明るい緑ですっきり",
    background: "#f0f7f4",
    accent: "#0d9488",
    preview: ["#ccfbf1", "#fde8d7", "#ffffff"],
  },
  {
    id: "sky",
    name: "スカイ",
    description: "青みのさわやかな配色",
    background: "#f1f5fb",
    accent: "#2563eb",
    preview: ["#dbeafe", "#fde8d7", "#ffffff"],
  },
  {
    id: "rose",
    name: "ローズ",
    description: "やさしいあたたかい配色",
    background: "#fbf5f4",
    accent: "#be123c",
    preview: ["#ffe4e6", "#fde8d7", "#ffffff"],
  },
] as const;

export type DesignThemeId = (typeof DESIGN_THEMES)[number]["id"];

export const findDesignTheme = (id?: string | null) =>
  DESIGN_THEMES.find((t) => t.id === id) ?? DESIGN_THEMES[0];
