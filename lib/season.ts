// 期間限定のデザイン（クリスマス・年末年始）
//  - 期間は管理画面で決め、app_settings に保存。端末にも覚えておき、開いた瞬間から反映する
//  - 使うかどうかは人ごと（設定 › テーマ。calendar_settings.seasonalTheme、初期値はオン）
//  - 2つの期間が重なったら、年末年始を優先する
import { supabase } from "@/lib/supabase";
import type { DesignTheme } from "@/lib/theme";

export type SeasonPeriod = { start: string; end: string }; // 日本時間の日付 yyyy-mm-dd（両端を含む）
export type SeasonKey = "xmas" | "newyear";
export type Seasons = Record<SeasonKey, SeasonPeriod | null>;

export const SEASON_KEYS: SeasonKey[] = ["newyear", "xmas"]; // 先にあるほうを優先
const NO_SEASONS: Seasons = { xmas: null, newyear: null };

const CACHE_KEY = "sharecal_seasons";
const OLD_CACHE_KEY = "sharecal_season"; // クリスマスだけだったころの覚え方
const PREVIEW_KEY = "sharecal_season_preview"; // 管理者が、この端末だけで試す
export const SEASON_CHANGED_EVENT = "sharecal-season-changed";

export const XMAS_THEME: DesignTheme = {
  id: "xmas",
  name: "クリスマス",
  description: "期間限定",
  background: "#ffffff",
  accent: "#a3283a",
  accentStrong: "#8c1c2d",
  accentSoft: "#f9e3e6",
  plusBg: "#a3283a",
  plusInk: "#ffffff",
  events: {
    ownEventBackground: "#e3f0e8",
    partnerEventBackground: "#e3f0e8",
    incomingEventBackground: "#f6ecd6",
    sharedEventBackground: "#f9e3e6",
    unclassifiedEvent: "#a3283a",
  },
  preview: ["#a3283a", "#1f4d3a", "#e8c46a"],
};

export const NEWYEAR_THEME: DesignTheme = {
  id: "newyear",
  name: "年末年始",
  description: "期間限定",
  background: "#fffdf8",
  accent: "#b3261e",
  accentStrong: "#8f1f19",
  accentSoft: "#f8e6e1",
  plusBg: "#b3261e",
  plusInk: "#ffffff",
  events: {
    ownEventBackground: "#e6ecf5",
    partnerEventBackground: "#e6ecf5",
    incomingEventBackground: "#f6edd5",
    sharedEventBackground: "#f8e6e1",
    unclassifiedEvent: "#b3261e",
  },
  preview: ["#b3261e", "#1d2a44", "#c9a13b"],
};

export const SEASON_THEMES: Record<SeasonKey, DesignTheme> = { xmas: XMAS_THEME, newyear: NEWYEAR_THEME };

/** 日本時間の今日 yyyy-mm-dd */
export const jstToday = (ms: number = Date.now()) => new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const isSeasonActive = (p: SeasonPeriod | null, today: string = jstToday()) =>
  !!p && !!p.start && !!p.end && p.start <= today && today <= p.end;

/** 「11/7〜12/25」 */
export const periodLabel = (p: SeasonPeriod) => {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${md(p.start)}〜${md(p.end)}`;
};

const asPeriod = (v: unknown): SeasonPeriod | null => {
  const o = v as { start?: unknown; end?: unknown } | null;
  return o && typeof o.start === "string" && typeof o.end === "string" ? { start: o.start, end: o.end } : null;
};

export function readCachedSeasons(): Seasons {
  if (typeof window === "undefined") return NO_SEASONS;
  try {
    const v = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null");
    if (v && typeof v === "object") return { xmas: asPeriod(v.xmas), newyear: asPeriod(v.newyear) };
    // 前の覚え方（クリスマスだけ）
    return { xmas: asPeriod(JSON.parse(window.localStorage.getItem(OLD_CACHE_KEY) ?? "null")), newyear: null };
  } catch {
    return NO_SEASONS;
  }
}

/** 管理者が「この端末で試す」にしている期間限定デザイン */
export function readSeasonPreview(): SeasonKey | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PREVIEW_KEY);
    return v === "xmas" || v === "newyear" ? v : null;
  } catch {
    return null;
  }
}

export function setSeasonPreview(key: SeasonKey | null) {
  try {
    if (key) window.localStorage.setItem(PREVIEW_KEY, key);
    else window.localStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* 覚えられない環境では試せない */
  }
  window.dispatchEvent(new Event(SEASON_CHANGED_EVENT));
}

/** いま期間中の期間限定デザイン（なければ null） */
export function activeSeason(seasons: Seasons = readCachedSeasons(), today: string = jstToday()): SeasonKey | null {
  const preview = readSeasonPreview();
  if (preview) return preview;
  return SEASON_KEYS.find((k) => isSeasonActive(seasons[k], today)) ?? null;
}

/** 期間中なら、その期間（試しているときは、仮に今日だけ） */
export function activePeriod(key: SeasonKey, seasons: Seasons = readCachedSeasons()): SeasonPeriod {
  return seasons[key] ?? { start: jstToday(), end: jstToday() };
}

function cacheSeasons(s: Seasons) {
  try {
    const before = window.localStorage.getItem(CACHE_KEY);
    const next = JSON.stringify(s);
    if (before === next) return;
    window.localStorage.setItem(CACHE_KEY, next);
    window.localStorage.removeItem(OLD_CACHE_KEY);
  } catch {
    /* 覚えられない環境でも、その場では使える */
  }
  window.dispatchEvent(new Event(SEASON_CHANGED_EVENT));
}

type Row = { xmas_start?: string | null; xmas_end?: string | null; newyear_start?: string | null; newyear_end?: string | null };
const pick = (a?: string | null, b?: string | null) => (a && b ? { start: a, end: b } : null);

/** サーバーから期間を読み直す（表や列がまだ無いときは、ある分だけ） */
export async function fetchSeasons(): Promise<Seasons> {
  let res = await supabase.from("app_settings").select("xmas_start, xmas_end, newyear_start, newyear_end").eq("id", 1).maybeSingle();
  if (res.error) {
    // 年末年始の列がまだ無い（supabase-season-newyear.sql が未実行）
    res = await supabase.from("app_settings").select("xmas_start, xmas_end").eq("id", 1).maybeSingle();
    if (res.error) return readCachedSeasons();
  }
  const row = (res.data ?? null) as Row | null;
  const s: Seasons = { xmas: pick(row?.xmas_start, row?.xmas_end), newyear: pick(row?.newyear_start, row?.newyear_end) };
  cacheSeasons(s);
  return s;
}

/** 管理画面から期間を保存（空にすると、期間なし） */
export async function saveSeason(key: SeasonKey, p: SeasonPeriod | null) {
  const { data, error } = await supabase
    .from("app_settings")
    .update({ [`${key}_start`]: p?.start ?? null, [`${key}_end`]: p?.end ?? null, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("id");
  if (error) {
    if (key === "newyear" && /newyear_/.test(error.message)) {
      throw new Error("年末年始の期間をしまう場所がまだありません（supabase-season-newyear.sql を実行してください）");
    }
    throw error;
  }
  if (!data?.length) throw new Error("保存できませんでした（管理者だけが変えられます。supabase-season.sql は実行済みですか？）");
  cacheSeasons({ ...readCachedSeasons(), [key]: p });
}

/** この人が期間限定のデザインを使うか（設定 › テーマ。初期値はオン） */
export function seasonalEnabled(settings: Record<string, unknown>) {
  return settings.seasonalTheme !== false;
}

/** 1月のあいさつを見た年（端末ごと） */
export const NY_GREETED_KEY = "sharecal_ny_greeted";
