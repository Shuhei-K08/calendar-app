// うちのねこ：ごく稀に画面に遊びに来る
// 見つけた記録（ねこ図鑑）はアカウントごとに保存（cat_finds）。端末にも控えを置き、開いたときに合わせる
import { supabase } from "@/lib/supabase";

export type CatKey = "a" | "b" | "both";

// 名前を変えるときはここだけ
export const CAT_NAMES: Record<CatKey, string> = { a: "おこげ", b: "るる", both: "2匹" };

// season：その期間限定デザインを使っている間だけ出る絵（なしはいつでも出る）
export type CatSprite = { id: string; cat: CatKey; label: string; season?: "xmas" | "newyear" };

export const CAT_SPRITES: CatSprite[] = [
  { id: "01", cat: "a", label: "おすわり" },
  { id: "02", cat: "a", label: "のびー" },
  { id: "03", cat: "a", label: "ねずみと遊ぶ" },
  { id: "04", cat: "a", label: "香箱座り" },
  { id: "05", cat: "a", label: "まるまって寝る" },
  { id: "12", cat: "a", label: "おさんぽ" },
  { id: "31", cat: "a", label: "雪をおいかける" },
  { id: "34", cat: "a", label: "顔あらい" },
  { id: "35", cat: "a", label: "あくび" },
  { id: "24", cat: "a", label: "サンタ帽", season: "xmas" },
  { id: "26", cat: "a", label: "リボンにからまる", season: "xmas" },
  { id: "28", cat: "a", label: "鏡餅のとなり", season: "newyear" },
  { id: "13", cat: "b", label: "おすわり" },
  { id: "14", cat: "b", label: "毛づくろい" },
  { id: "15", cat: "b", label: "おさんぽ" },
  { id: "16", cat: "b", label: "毛布からのぞく" },
  { id: "17", cat: "b", label: "おひるね" },
  { id: "21", cat: "b", label: "香箱座り" },
  { id: "22", cat: "b", label: "ふりむき" },
  { id: "27", cat: "b", label: "ふちからのぞく" },
  { id: "29", cat: "b", label: "クッションでおやすみ" },
  { id: "32", cat: "b", label: "あくび" },
  { id: "36", cat: "b", label: "おなかを見せてのびー" },
  { id: "25", cat: "b", label: "プレゼント箱", season: "xmas" },
  { id: "30", cat: "b", label: "こたつ", season: "newyear" },
  { id: "19", cat: "both", label: "いっしょに遊ぶ" },
  { id: "23", cat: "both", label: "ぎゅー" },
  { id: "33", cat: "both", label: "毛布にくるまる" },
];

export const catImage = (id: string) => `/cats/cat${id}.png`;

/** アプリを開いたとき（1日1回まで）に現れる確率 */
export const APPEAR_RATE = 0.03;
/** まだ1匹も見つけていない人は、すぐ出会えるように必ず現れる（1日1回までは同じ） */
export const FIRST_APPEAR_RATE = 1;

const FOUND_KEY = "sharecal_cats_found";
const LAST_KEY = "sharecal_cat_last";

export type FoundLog = Record<string, { count: number; first: string }>;

export function readFound(): FoundLog {
  try {
    const v = JSON.parse(window.localStorage.getItem(FOUND_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function writeFound(log: FoundLog) {
  try {
    window.localStorage.setItem(FOUND_KEY, JSON.stringify(log));
  } catch {
    /* 記録できなくても遊べる */
  }
}

async function myUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

type FindRow = { sprite_id: string; count: number; first_found: string; last_found?: string | null };

/** アカウントの図鑑と、この端末の控えを合わせる（回数は多いほう、はじめての日は早いほう）。端末にだけある記録は送る */
export async function syncFound(): Promise<FoundLog> {
  const local = readFound();
  const uid = await myUserId();
  if (!uid) return local;
  const { data, error } = await supabase.from("cat_finds").select("sprite_id, count, first_found").eq("user_id", uid);
  if (error) return local; // 表がまだ無い（supabase-cat-finds.sql 未実行）
  const merged: FoundLog = { ...local };
  const remote = new Map(((data ?? []) as FindRow[]).map((r) => [r.sprite_id, r]));
  remote.forEach((r, id) => {
    const l = merged[id];
    merged[id] = {
      count: Math.max(l?.count ?? 0, r.count),
      first: l?.first && l.first < r.first_found ? l.first : r.first_found,
    };
  });
  writeFound(merged);
  const upload = Object.entries(merged)
    .filter(([id, f]) => {
      const r = remote.get(id);
      return !r || r.count < f.count || f.first < r.first_found;
    })
    .map(([id, f]) => ({ user_id: uid, sprite_id: id, count: f.count, first_found: f.first, updated_at: new Date().toISOString() }));
  if (upload.length) await supabase.from("cat_finds").upsert(upload, { onConflict: "user_id,sprite_id" });
  return merged;
}

export function recordFound(id: string, today: string): FoundLog {
  const log = readFound();
  const prev = log[id];
  log[id] = { count: (prev?.count ?? 0) + 1, first: prev?.first ?? today };
  writeFound(log);
  // アカウントにも保存（失敗しても端末の控えから、次に開いたときに送り直す）
  const entry = log[id];
  void myUserId().then((uid) => {
    if (!uid) return;
    void supabase
      .from("cat_finds")
      .upsert(
        { user_id: uid, sprite_id: id, count: entry.count, first_found: entry.first, last_found: today, updated_at: new Date().toISOString() },
        { onConflict: "user_id,sprite_id" },
      )
      .then(() => undefined);
  });
  return log;
}

/** 今日もう現れたか */
export function shownToday(today: string) {
  try {
    return window.localStorage.getItem(LAST_KEY) === today;
  } catch {
    return false;
  }
}

export function markShown(today: string) {
  try {
    window.localStorage.setItem(LAST_KEY, today);
  } catch {
    /* noop */
  }
}

/** どの絵が出るか（2匹いっしょの絵はちょっとレア。季節の絵はその期間だけ） */
export function pickSprite(season: string | undefined, rand: () => number = Math.random): CatSprite {
  const weights: number[] = CAT_SPRITES.map((s) => (s.season && s.season !== season ? 0 : s.cat === "both" ? 0.35 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < CAT_SPRITES.length; i++) {
    r -= weights[i];
    if (r <= 0) return CAT_SPRITES[i];
  }
  return CAT_SPRITES[0];
}

/** 管理画面の「お試し」：この端末に、いますぐねこを出す（図鑑には記録しない）。id なしはランダム */
export const CAT_PREVIEW_EVENT = "sharecal-cat-preview";
export function previewCat(id?: string) {
  window.dispatchEvent(new CustomEvent<{ id?: string }>(CAT_PREVIEW_EVENT, { detail: { id } }));
}
