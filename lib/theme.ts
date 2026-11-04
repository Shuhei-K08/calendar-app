// アプリ全体の配色（デザイン「シャープ」）
// テーマカラーは設定から選べる。予定の色（わたし・相手・ふたり）は、テーマカラーとかぶらない組み合わせにしてある

export type EventColorKey =
  | "ownEventBackground"
  | "partnerEventBackground"
  | "incomingEventBackground"
  | "sharedEventBackground"
  | "unclassifiedEvent";

export type DesignTheme = {
  id: string;
  name: string;
  description: string;
  background: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  plusBg: string;
  plusInk: string;
  // 予定の背景色の初期値（設定で個別に変えた場合はそちらが優先）
  events: Record<EventColorKey, string>;
  // 設定画面の見本用
  preview: string[];
};

export const DESIGN_THEMES: DesignTheme[] = [
  {
    id: "clean",
    name: "グリーン",
    description: "ShareCalの深い緑（標準）",
    background: "#ffffff",
    accent: "#0f7a66",
    accentStrong: "#0b5e4f",
    accentSoft: "#e6f2ee",
    plusBg: "#0f7a66",
    plusInk: "#ffffff",
    events: {
      ownEventBackground: "#ddf0ea",
      partnerEventBackground: "#ddf0ea",
      incomingEventBackground: "#fbe3d3",
      sharedEventBackground: "#eae2fb",
      unclassifiedEvent: "#0f7a66",
    },
    preview: ["#0f7a66", "#fbe3d3", "#eae2fb"],
  },
  {
    id: "navy",
    name: "ネイビー",
    description: "誠実で仕事向き",
    background: "#ffffff",
    accent: "#1e3a8a",
    accentStrong: "#172c69",
    accentSoft: "#e8edfa",
    plusBg: "#1e3a8a",
    plusInk: "#ffffff",
    events: {
      ownEventBackground: "#dde5f7",
      partnerEventBackground: "#dde5f7",
      incomingEventBackground: "#fbe3d3",
      sharedEventBackground: "#eae2fb",
      unclassifiedEvent: "#1e3a8a",
    },
    preview: ["#1e3a8a", "#fbe3d3", "#eae2fb"],
  },
  {
    id: "bordeaux",
    name: "ボルドー",
    description: "大人っぽく少し華やか",
    background: "#ffffff",
    accent: "#8e1b3e",
    accentStrong: "#6e1530",
    accentSoft: "#f8e8ed",
    plusBg: "#8e1b3e",
    plusInk: "#ffffff",
    events: {
      ownEventBackground: "#f5dfe6",
      partnerEventBackground: "#f5dfe6",
      incomingEventBackground: "#d9f1ec",
      sharedEventBackground: "#dfeafb",
      unclassifiedEvent: "#8e1b3e",
    },
    preview: ["#8e1b3e", "#d9f1ec", "#dfeafb"],
  },
  {
    id: "indigo",
    name: "インディゴ",
    description: "今っぽいアプリ感",
    background: "#ffffff",
    accent: "#4338ca",
    accentStrong: "#3529a6",
    accentSoft: "#ecebfb",
    plusBg: "#4338ca",
    plusInk: "#ffffff",
    events: {
      ownEventBackground: "#e3e1fa",
      partnerEventBackground: "#e3e1fa",
      incomingEventBackground: "#fbe3d3",
      sharedEventBackground: "#ddf2ea",
      unclassifiedEvent: "#4338ca",
    },
    preview: ["#4338ca", "#fbe3d3", "#ddf2ea"],
  },
  {
    id: "charcoal",
    name: "チャコール",
    description: "黒に黄色を差したシャープな配色",
    background: "#ffffff",
    accent: "#111816",
    accentStrong: "#000000",
    accentSoft: "#fff6d6",
    plusBg: "#ffd23f",
    plusInk: "#111816",
    events: {
      ownEventBackground: "#e6e8e7",
      partnerEventBackground: "#e6e8e7",
      incomingEventBackground: "#fbe3d3",
      sharedEventBackground: "#eae2fb",
      unclassifiedEvent: "#111816",
    },
    preview: ["#111816", "#ffd23f", "#eae2fb"],
  },
  {
    id: "terracotta",
    name: "テラコッタ",
    description: "あたたかみのあるレンガ色",
    background: "#ffffff",
    accent: "#b5482a",
    accentStrong: "#8f3820",
    accentSoft: "#f8e9e3",
    plusBg: "#b5482a",
    plusInk: "#ffffff",
    events: {
      ownEventBackground: "#f5e0d8",
      partnerEventBackground: "#f5e0d8",
      incomingEventBackground: "#dfeafb",
      sharedEventBackground: "#eae2fb",
      unclassifiedEvent: "#b5482a",
    },
    preview: ["#b5482a", "#dfeafb", "#eae2fb"],
  },
];

// 以前のテーマ名からの引き継ぎ
const LEGACY_THEME_IDS: Record<string, string> = { mint: "clean", sky: "navy", rose: "bordeaux" };

export type DesignThemeId = (typeof DESIGN_THEMES)[number]["id"];

export const findDesignTheme = (id?: string | null) => {
  const key = id ? LEGACY_THEME_IDS[id] ?? id : "clean";
  return DESIGN_THEMES.find((t) => t.id === key) ?? DESIGN_THEMES[0];
};

export const EVENT_COLOR_DEFAULTS: Record<EventColorKey, string> = DESIGN_THEMES[0].events;

// 旧デザインの初期値。これが保存されたままなら、いまのテーマの初期値に置き換える
const LEGACY_DEFAULTS: Record<EventColorKey, string[]> = {
  ownEventBackground: ["#e0f2fe", "#ddf0ea"],
  partnerEventBackground: ["#e0f2fe", "#ddf0ea"],
  incomingEventBackground: ["#ede9fe", "#fde8d7"],
  sharedEventBackground: ["#fef3c7", "#ece6fb"],
  unclassifiedEvent: ["#22c8d6", "#0f7a66"],
};

// 保存された予定の色。空、または昔の初期値のままなら、テーマの初期値を使う
export const resolveEventColor = (key: EventColorKey, saved?: string | null, themeId?: string | null) => {
  const fallback = findDesignTheme(themeId).events[key];
  if (!saved) return fallback;
  if (LEGACY_DEFAULTS[key].includes(saved.trim().toLowerCase())) return fallback;
  return saved;
};
