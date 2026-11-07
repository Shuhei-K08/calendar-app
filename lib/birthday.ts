// 誕生日の特設ページ
//  - 誕生日は profiles.birthday（自分で設定 › 誕生日ページ から入れる）
//  - 見られるのは本人と、つながっている相手だけ（表・画像ともに RLS で守る。supabase-birthday.sql）
//  - 誕生日の約1か月前（31日前）からカウントダウン、当日はおめでとうの画面
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { jstToday } from "@/lib/season";

export const BIRTHDAY_BUCKET = "birthday-photos";
export const COUNTDOWN_DAYS = 31; // 何日前からバナーを出すか（約1か月前から）
export const ALBUM_MAX = 6;

export type BirthdayPerson = { id: string; username: string; birthday: string }; // birthday: yyyy-mm-dd
export type PhotoSlot = "hero" | "today" | "album";
export type BirthdayPhoto = { id: string; slot: PhotoSlot; path: string; sort: number; url: string };

const DAY = 86400000;
const utcDate = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** 次の誕生日（今日が誕生日なら今日）と、そのとき何歳になるか */
export function nextBirthday(birthday: string, today: string = jstToday()) {
  const y = Number(today.slice(0, 4));
  const md = birthday.slice(5, 10);
  const thisYear = `${y}-${md}`;
  const date = thisYear >= today ? thisYear : `${y + 1}-${md}`;
  const daysLeft = Math.round((utcDate(date) - utcDate(today)) / DAY);
  const age = Number(date.slice(0, 4)) - Number(birthday.slice(0, 4));
  return { date, daysLeft, age, isToday: daysLeft === 0 };
}

/** 誕生日 0:00（日本時間）までのミリ秒 */
export const msUntil = (date: string, now: number = Date.now()) => Math.max(0, utcDate(date) - 9 * 3600 * 1000 - now);

/** 自分とつながっている相手の誕生日（設定していない人は入らない） */
export async function fetchBirthdayPeople(userId: string, partnerIds: string[]): Promise<BirthdayPerson[]> {
  const ids = [userId, ...partnerIds];
  const { data, error } = await supabase.from("profiles").select("id, username, birthday").in("id", ids);
  if (error) return []; // birthday 列がまだ無い（SQL 未実行）
  return ((data ?? []) as { id: string; username: string | null; birthday: string | null }[])
    .filter((p) => !!p.birthday)
    .map((p) => ({ id: p.id, username: p.username ?? "", birthday: p.birthday as string }));
}

export function useBirthdayPeople(userId: string | null, partnerIds: string[]) {
  const [people, setPeople] = useState<BirthdayPerson[]>([]);
  const key = partnerIds.join(",");
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void fetchBirthdayPeople(userId, key ? key.split(",") : []).then((p) => {
      if (alive) setPeople(p);
    });
    return () => {
      alive = false;
    };
  }, [userId, key]);
  return people;
}

/** その人の写真（期限付きのURLつき）。見られない人には何も返らない */
export async function fetchBirthdayPhotos(ownerId: string): Promise<BirthdayPhoto[]> {
  const { data, error } = await supabase
    .from("birthday_photos")
    .select("id, slot, path, sort")
    .eq("owner_id", ownerId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data?.length) return [];
  const rows = data as { id: string; slot: PhotoSlot; path: string; sort: number }[];
  const { data: signed } = await supabase.storage.from(BIRTHDAY_BUCKET).createSignedUrls(
    rows.map((r) => r.path),
    60 * 60,
  );
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({ ...r, url: urlOf.get(r.path) ?? "" })).filter((r) => r.url);
}

/** 写真を追加（hero / today は1枚だけなので、前のものは消す） */
export async function addBirthdayPhoto(ownerId: string, slot: PhotoSlot, file: File, sort: number) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${ownerId}/${slot}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BIRTHDAY_BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (upErr) throw upErr;
  if (slot !== "album") {
    const { data: old } = await supabase.from("birthday_photos").select("id, path").eq("owner_id", ownerId).eq("slot", slot);
    for (const o of (old ?? []) as { id: string; path: string }[]) await removeBirthdayPhoto(o.id, o.path);
  }
  const { error } = await supabase.from("birthday_photos").insert({ owner_id: ownerId, slot, path, sort });
  if (error) {
    await supabase.storage.from(BIRTHDAY_BUCKET).remove([path]);
    throw error;
  }
}

export async function removeBirthdayPhoto(id: string, path: string) {
  await supabase.storage.from(BIRTHDAY_BUCKET).remove([path]);
  const { error } = await supabase.from("birthday_photos").delete().eq("id", id);
  if (error) throw error;
}

/** 誕生日の当日に、その人のおめでとう画面を自動で見せたか（端末ごと・年ごと） */
const seenKey = (id: string, date: string) => `sharecal_bday_seen_${id}_${date.slice(0, 4)}`;
export function celebrateSeen(id: string, date: string) {
  try {
    return window.localStorage.getItem(seenKey(id, date)) === "1";
  } catch {
    return true;
  }
}
export function markCelebrateSeen(id: string, date: string) {
  try {
    window.localStorage.setItem(seenKey(id, date), "1");
  } catch {
    /* 覚えられない環境では毎回出さない */
  }
}
