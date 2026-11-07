"use client";

// カレンダーの上：誕生日の約1か月前から「◯歳まで あと◯日」。当日は「HAPPY ◯」
//  - 本人と、つながっている相手の誕生日だけ（profiles を読めるのがその人たちだけ）
//  - 当日にはじめて開いたときは、おめでとうの画面へ自動で（端末ごとに1回）
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { jstToday } from "@/lib/season";
import { celebrateSeen, COUNTDOWN_DAYS, markCelebrateSeen, msUntil, nextBirthday, type BirthdayPerson } from "@/lib/birthday";

export default function BirthdayBanner({ people, me }: { people: BirthdayPerson[]; me: string | null }) {
  const router = useRouter();
  const today = jstToday();
  const upcoming = people
    .map((p) => ({ ...p, nb: nextBirthday(p.birthday, today) }))
    .filter((p) => p.nb.daysLeft <= COUNTDOWN_DAYS)
    .sort((a, b) => a.nb.daysLeft - b.nb.daysLeft);

  const celebrate = upcoming.find((p) => p.nb.isToday && !celebrateSeen(p.id, p.nb.date));
  useEffect(() => {
    if (!celebrate) return;
    markCelebrateSeen(celebrate.id, celebrate.nb.date);
    router.push(`/birthday?u=${celebrate.id}`);
  }, [celebrate, router]);

  if (!upcoming.length) return null;
  return (
    <div className="bd-banners">
      {upcoming.map((p) => {
        const self = p.id === me;
        const who = self ? "" : `${p.username}の誕生日 ・ `;
        // 特設ページの大きな数字と同じ数え方（0:00 までの残り、切り捨て）
        const days = Math.floor(msUntil(p.nb.date) / 86400000);
        return (
          <Link key={p.id} href={`/birthday?u=${p.id}`} className={`bd-banner${p.nb.isToday ? " is-today" : ""}`}>
            {p.nb.isToday ? (
              <>
                <span className="bd-banner-kicker">{self ? "TODAY" : `${p.username}の誕生日`}</span>
                <b>HAPPY {p.nb.age}!</b>
              </>
            ) : (
              <>
                <span className="bd-banner-kicker">{who}{Number(p.nb.date.slice(5, 7))}/{Number(p.nb.date.slice(8, 10))}</span>
                <span className="bd-banner-main">
                  {p.nb.age}歳まで {days > 0 ? <>あと<b>{days}</b>日</> : "もうすぐ"}
                </span>
              </>
            )}
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </Link>
        );
      })}
    </div>
  );
}
