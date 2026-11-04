"use client";

// 使う機能のオン／オフ（いまは「勤怠」だけ）。
// アカウントに保存してスマホとPCでそろえ、端末にも控えを置いてメニューをすぐ出せるようにする。
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const KINTAI_KEY = "sharecal_use_kintai";
export const FEATURES_CHANGED_EVENT = "sharecal:features-changed";

const readCache = () => {
  try {
    return window.localStorage.getItem(KINTAI_KEY) === "1";
  } catch {
    return false;
  }
};
const writeCache = (on: boolean) => {
  try {
    window.localStorage.setItem(KINTAI_KEY, on ? "1" : "0");
  } catch {
    /* 保存できない環境ではこの画面の間だけ */
  }
};

/** アカウントの設定を読む。列がまだ無いなど読めなければ null */
async function fetchKintaiEnabled(): Promise<boolean | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("use_kintai").eq("id", user.id).maybeSingle();
  if (error || !data || typeof data.use_kintai !== "boolean") return null;
  return data.use_kintai;
}

/** 勤怠を使うかどうかを切り替える（初期値はオフ） */
export async function setKintaiEnabled(on: boolean) {
  writeCache(on);
  window.dispatchEvent(new window.Event(FEATURES_CHANGED_EVENT));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // 列がまだ無いときは端末の控えだけで動く
  await supabase.from("profiles").update({ use_kintai: on }).eq("id", user.id);
}

/** 勤怠を使うか（null はまだ読んでいない）。ready はアカウントの設定まで読み終えたか */
export function useKintaiEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      // 端末の控えを先に反映（サーバー描画と食い違わないよう、表示後に読む）
      setEnabled(readCache());
      const remote = await fetchKintaiEnabled();
      if (!alive) return;
      if (remote !== null) {
        setEnabled(remote);
        writeCache(remote);
      }
      setReady(true);
    };
    void sync();
    const onChange = () => setEnabled(readCache());
    window.addEventListener(FEATURES_CHANGED_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(FEATURES_CHANGED_EVENT, onChange);
    };
  }, []);

  return { enabled, ready };
}
