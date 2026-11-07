"use client";

// 年末年始のデザインの間、1月中に初めて開いたときに1回だけ「あけましておめでとう」
//  - 年末年始のデザインを使っている人だけ（設定でオフの人には出ない）
//  - 見たかどうかは端末ごと（NY_GREETED_KEY に年を覚える）
//  - 管理画面の「この端末で試す」中は、1月でなくても出る
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OPEN_ADD_EVENT } from "@/app/components/AppNavigation";
import { jstToday, NY_GREETED_KEY, readSeasonPreview, SEASON_CHANGED_EVENT } from "@/lib/season";

const ETO = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const SKIP_PATHS = ["/login", "/signup", "/auth", "/onboarding", "/account-deleted"];

function closeGreeting(year: number, setYear: (y: number | null) => void) {
  try {
    window.localStorage.setItem(NY_GREETED_KEY, String(year));
  } catch {
    /* 覚えられなくても閉じる */
  }
  setYear(null);
}

export default function NewYearGreeting() {
  const pathname = usePathname();
  const router = useRouter();
  const [year, setYear] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (SKIP_PATHS.some((p) => pathname.startsWith(p))) return;
    const check = () => {
      if (document.documentElement.dataset.season !== "newyear") return;
      const today = jstToday();
      const month = Number(today.slice(5, 7));
      const preview = readSeasonPreview() === "newyear";
      if (month !== 1 && !preview) return;
      // 試すとき（1月以外）は、次の1月の年
      const y = Number(today.slice(0, 4)) + (month === 1 ? 0 : 1);
      try {
        if (window.localStorage.getItem(NY_GREETED_KEY) === String(y)) return;
      } catch {
        return; // 覚えられない環境では、毎回出ないようにする
      }
      setYear(y);
    };
    // 着せ替えが反映されるのを少し待ってから
    const t = window.setTimeout(check, 600);
    window.addEventListener(SEASON_CHANGED_EVENT, check);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(SEASON_CHANGED_EVENT, check);
    };
  }, [pathname]);

  useEffect(() => {
    if (year === null) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeGreeting(year, setYear);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [year]);

  if (year === null) return null;
  const close = () => closeGreeting(year, setYear);

  const addEvent = () => {
    close();
    if (pathname === "/") window.dispatchEvent(new window.Event(OPEN_ADD_EVENT));
    else router.push("/?new=1");
  };

  return (
    <div className="ny-greet" onClick={(e) => e.target === e.currentTarget && close()}>
      <section className="ny-greet-card" role="dialog" aria-modal="true" aria-labelledby="ny-greet-title">
        <div className="ny-greet-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/season/ny-greeting.png" alt="羊の帽子をかぶったるるとおこげが、門松をはさんで座っている" width={640} height={441} />
        </div>
        <div className="ny-greet-body">
          <p className="ny-greet-eyebrow">
            謹賀新年 ・ {year} {ETO[(((year - 4) % 12) + 12) % 12]}年
          </p>
          <h2 id="ny-greet-title">
            あけまして
            <br />
            おめでとうございます
          </h2>
          <p className="ny-greet-text">
            今年もふたりで、よい一年を。
            <br />
            今年さいしょの予定を入れてみましょう。
          </p>
          <div className="ny-greet-actions">
            <button type="button" ref={closeRef} className="ny-greet-close" onClick={close}>
              閉じる
            </button>
            <button type="button" className="ny-greet-add" onClick={addEvent}>
              予定を入れる
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
