"use client";

// 期間限定のデザイン（クリスマスなど）の間だけ、ごく稀に小さくねこが現れる
//  - アプリを開いたとき／アプリに戻ったとき、1日1回まで APPEAR_RATE の確率
//  - 20秒でいなくなる。タップすると「にゃ！」と鳴いて、ねこ図鑑に記録
//  - 試すとき：URL に ?cat=1 を付けると必ず現れる。?cat=24 のように番号を付けると、その絵で現れる
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { APPEAR_RATE, CAT_NAMES, CAT_SPRITES, catImage, markShown, pickSprite, recordFound, shownToday, type CatSprite } from "@/lib/catVisitor";
import { jstToday } from "@/lib/season";

type Spot = "left" | "right";
type Place = { spot: Spot; bottom: number };

// 下のメニュー（スマホ）のふちの上にちょこんと乗る。PC は画面の下のふち
function choosePlace(): Place {
  const nav = document.querySelector<HTMLElement>(".mobile-nav");
  // fixed の要素は offsetParent が null になるので、大きさで「表示中か」を見る
  const shown = (el: HTMLElement | null) => !!el && el.getBoundingClientRect().height > 0;
  const navTop = shown(nav) ? nav!.getBoundingClientRect().top : window.innerHeight;
  // 右下に＋の浮きボタンがあるときは左にだけ出る
  const fab = document.querySelector<HTMLElement>(".mobile-fab");
  const spots: Spot[] = shown(fab) ? ["left"] : ["left", "right"];
  return { spot: spots[Math.floor(Math.random() * spots.length)], bottom: Math.max(0, Math.round(window.innerHeight - navTop - 1)) };
}
const STAY_MS = 20_000;

export default function CatVisitor() {
  const [visit, setVisit] = useState<{ sprite: CatSprite; place: Place } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [found, setFound] = useState<{ name: string; label: string; total: number; isNew: boolean } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const tryVisit = (force: boolean, forcedId?: string) => {
      const today = jstToday();
      const seasonal = !!document.documentElement.dataset.season;
      if (!force && (!seasonal || shownToday(today) || Math.random() >= APPEAR_RATE)) return;
      markShown(today);
      clearTimers();
      setLeaving(false);
      setFound(null);
      const forced = forcedId ? CAT_SPRITES.find((s) => s.id === forcedId.padStart(2, "0")) : undefined;
      setVisit({ sprite: forced ?? pickSprite(document.documentElement.dataset.season), place: choosePlace() });
      timers.current.push(window.setTimeout(() => setLeaving(true), STAY_MS));
      timers.current.push(window.setTimeout(() => setVisit(null), STAY_MS + 700));
    };
    const q = new URLSearchParams(window.location.search).get("cat");
    const force = !!q && q !== "0";
    // 着せ替えが反映されるのを少し待ってから
    timers.current.push(window.setTimeout(() => tryVisit(force, q && q !== "1" ? q : undefined), 2500));
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > 10 * 60_000) {
        tryVisit(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimers();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!visit) return null;
  const { sprite, place } = visit;
  const name = CAT_NAMES[sprite.cat];

  const tap = () => {
    if (found) return;
    const log = recordFound(sprite.id, jstToday());
    const total = CAT_SPRITES.filter((s) => log[s.id]).length;
    setFound({ name, label: sprite.label, total, isNew: log[sprite.id].count === 1 });
    // 鳴いたあと、少ししてから帰る
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [window.setTimeout(() => setLeaving(true), 6000), window.setTimeout(() => setVisit(null), 6700)];
  };

  return (
    <>
      <div className={`cat-visitor is-${place.spot}${leaving ? " is-leaving" : ""}`} style={{ bottom: place.bottom }}>
        {found && <span className="cat-visitor-bubble">にゃ！</span>}
        <button type="button" className="cat-visitor-btn" onClick={tap} aria-label={`${name}をなでる`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={catImage(sprite.id)} alt="" draggable={false} />
        </button>
      </div>
      {found && (
        <div className={`cat-visitor-toast${leaving ? " is-leaving" : ""}`} role="status">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={catImage(sprite.id)} alt="" />
          <span className="cat-visitor-toast-text">
            <strong>{sprite.cat === "both" ? "2匹で遊びに来た！" : `${name}が遊びに来た！`}</strong>
            <span>
              {found.isNew ? "はじめての" : ""}「{found.label}」・ねこ図鑑 {found.total}/{CAT_SPRITES.length}
            </span>
          </span>
          <Link href="/cats" className="cat-visitor-toast-link">
            図鑑
          </Link>
        </div>
      )}
    </>
  );
}
