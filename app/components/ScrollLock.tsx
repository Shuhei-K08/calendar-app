"use client";

import { useEffect } from "react";

// 重なって出る画面（登録シート・確認ダイアログなど）が開いている間、後ろの画面がスクロールしないようにする。
// 画面ごとに付けなくて済むよう、表示中のオーバーレイを見張ってまとめて止める。
// iPhone の Safari でも効くよう、body を固定してスクロール位置を覚えておく方法を使う。
const OVERLAY_SELECTOR = [
  ".kt-overlay",
  ".confirm-overlay",
  ".add-sheet-overlay",
  ".fixed.inset-0",
  '[aria-modal="true"]',
].join(",");

const isShown = (el: Element) => {
  const s = window.getComputedStyle(el);
  return s.display !== "none" && s.visibility !== "hidden" && (el as HTMLElement).getClientRects().length > 0;
};

export default function ScrollLock() {
  useEffect(() => {
    const body = document.body;
    let locked = false;
    let savedY = 0;
    let frame = 0;

    const lock = () => {
      savedY = window.scrollY;
      body.style.position = "fixed";
      body.style.top = `-${savedY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      locked = true;
    };
    const unlock = () => {
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      body.style.overflow = "";
      window.scrollTo(0, savedY);
      locked = false;
    };

    const check = () => {
      frame = 0;
      const open = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).some(isShown);
      if (open && !locked) lock();
      else if (!open && locked) unlock();
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    check();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      if (locked) unlock();
    };
  }, []);

  return null;
}
