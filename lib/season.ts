// 期間限定のデザイン（いまはクリスマス）
//  - 期間は管理画面で決め、app_settings に保存。端末にも覚えておき、開いた瞬間から反映する
//  - 使うかどうかは人ごと（設定 › テーマ。calendar_settings.seasonalTheme、初期値はオン）
import { supabase } from "@/lib/supabase";
import type { DesignTheme } from "@/lib/theme";

export type SeasonPeriod = { start: string; end: string }; // 日本時間の日付 yyyy-mm-dd（両端を含む）

const CACHE_KEY = "sharecal_season";
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

/** 日本時間の今日 yyyy-mm-dd */
export const jstToday = (ms: number = Date.now()) => new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const isSeasonActive = (p: SeasonPeriod | null, today: string = jstToday()) =>
  !!p && !!p.start && !!p.end && p.start <= today && today <= p.end;

/** 「11/7〜12/25」 */
export const periodLabel = (p: SeasonPeriod) => {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${md(p.start)}〜${md(p.end)}`;
};

export function readCachedSeason(): SeasonPeriod | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null");
    return v && typeof v.start === "string" && typeof v.end === "string" ? v : null;
  } catch {
    return null;
  }
}

function cacheSeason(p: SeasonPeriod | null) {
  try {
    const before = window.localStorage.getItem(CACHE_KEY);
    const next = JSON.stringify(p);
    if (before === next) return;
    window.localStorage.setItem(CACHE_KEY, next);
  } catch {
    /* 覚えられない環境でも、その場では使える */
  }
  window.dispatchEvent(new Event(SEASON_CHANGED_EVENT));
}

/** サーバーから期間を読み直す（表がまだ無いときは「期間なし」） */
export async function fetchSeason(): Promise<SeasonPeriod | null> {
  const { data, error } = await supabase.from("app_settings").select("xmas_start, xmas_end").eq("id", 1).maybeSingle();
  if (error) return readCachedSeason();
  const row = data as { xmas_start: string | null; xmas_end: string | null } | null;
  const p = row?.xmas_start && row?.xmas_end ? { start: row.xmas_start, end: row.xmas_end } : null;
  cacheSeason(p);
  return p;
}

/** 管理画面から期間を保存（空にすると、期間なし） */
export async function saveSeason(p: SeasonPeriod | null) {
  const { data, error } = await supabase
    .from("app_settings")
    .update({ xmas_start: p?.start ?? null, xmas_end: p?.end ?? null, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("保存できませんでした（管理者だけが変えられます。supabase-season.sql は実行済みですか？）");
  cacheSeason(p);
}

/** この人が期間限定のデザインを使うか（設定 › テーマ。初期値はオン） */
export function seasonalEnabled(settings: Record<string, unknown>) {
  return settings.seasonalTheme !== false;
}
