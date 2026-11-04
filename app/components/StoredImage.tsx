"use client";

// 予定に添付した画像を表示する。画像の置き場所は非公開なので、見るたびに期限付きのURLをもらって表示する
import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { supabase } from "@/lib/supabase";

const BUCKET = "event-images";
const EXPIRES = 60 * 60; // 1時間
const cache = new Map<string, { url: string; until: number }>();

/** 保存しているURL（…/event-images/<user_id>/<file>）から置き場所のパスを取り出す。違う形なら null */
export const eventImagePath = (stored: string) => {
  const m = /\/event-images\/([0-9a-f-]{36}\/[^?#]+)/i.exec(stored);
  return m ? decodeURIComponent(m[1]) : null;
};

export function useStoredImageUrl(stored: string) {
  const path = eventImagePath(stored);
  const [signed, setSigned] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    const hit = cache.get(path);
    if (hit && hit.until > Date.now()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSigned({ key: path, url: hit.url });
      return;
    }
    void supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, EXPIRES)
      .then(({ data }) => {
        if (!alive || !data?.signedUrl) return;
        cache.set(path, { url: data.signedUrl, until: Date.now() + (EXPIRES - 300) * 1000 });
        setSigned({ key: path, url: data.signedUrl });
      });
    return () => {
      alive = false;
    };
  }, [path]);

  if (!path) return stored; // 外部の画像URLなどはそのまま
  return signed?.key === path ? signed.url : "";
}

export default function StoredImage({ src, alt, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string }) {
  const url = useStoredImageUrl(src);
  if (!url) return <span className={`inline-block animate-pulse bg-[var(--surface-alt)] ${rest.className ?? ""}`} aria-label={alt} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} {...rest} />;
}
