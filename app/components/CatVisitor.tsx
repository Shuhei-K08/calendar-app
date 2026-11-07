"use client";

// ごく稀に小さくねこが現れる（季節限定の絵は、その期間限定デザインの間だけ）
//  - アプリを開いたとき／アプリに戻ったとき、1日1回まで APPEAR_RATE の確率
//  - 20秒でいなくなる。タップすると「にゃ！」と鳴いて、ねこ図鑑に記録
//  - 試すとき：URL に ?cat=1 を付けると必ず現れる。?cat=24 のように番号を付けると、その絵で現れる
//  - 管理画面の「ねこのお試し」からも出せる（お試しは図鑑に記録しない）
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APPEAR_RATE, CAT_NAMES, CAT_PREVIEW_EVENT, CAT_SPRITES, catImage, markShown, pickSprite, readFound, recordFound, shownToday, type CatSprite } from "@/lib/catVisitor";
import { jstToday } from "@/lib/season";

type Spot = "left" | "right";
type Place = { spot: Spot; bottom: number };

// 下のメニュー（スマホ）のふちの上にちょこんと乗る。PC は画面の下のふち
// ＋ボタン（右下の浮きボタン・メニューの真ん中の＋）と重なる側には出ない
const CAT_W = 72;
const CAT_H = 80; // 絵（56px）＋「にゃ！」の吹き出し
const GAP = 8;

// fixed の要素は offsetParent が null になるので、大きさで「表示中か」を見る
const shown = (el: Element | null): el is HTMLElement => !!el && el.getBoundingClientRect().height > 0;

function spotBox(spot: Spot, bottom: number) {
  const w = window.innerWidth;
  const wide = w >= 640; // globals.css の .cat-visitor.is-left / is-right と同じ位置
  const left = spot === "left" ? (wide ? 236 : 18) : w - (wide ? 24 : 18) - CAT_W;
  const bottomY = window.innerHeight - bottom;
  return { left, right: left + CAT_W, top: bottomY - CAT_H, bottom: bottomY };
}

function spotIsFree(spot: Spot, bottom: number) {
  const box = spotBox(spot, bottom);
  const buttons = Array.from(document.querySelectorAll(".mobile-fab, .mobile-nav-add")).filter(shown);
  return buttons.every((el) => {
    const r = el.getBoundingClientRect();
    return r.right + GAP <= box.left || r.left - GAP >= box.right || r.bottom + GAP <= box.top || r.top - GAP >= box.bottom;
  });
}

function choosePlace(keep?: Spot): Place {
  const nav = document.querySelector(".mobile-nav");
  const navTop = shown(nav) ? nav.getBoundingClientRect().top : window.innerHeight;
  const bottom = Math.max(0, Math.round(window.innerHeight - navTop - 1));
  // いまの側が空いていれば動かさない
  if (keep && spotIsFree(keep, bottom)) return { spot: keep, bottom };
  const free = (["left", "right"] as Spot[]).filter((s) => spotIsFree(s, bottom));
  const spots: Spot[] = free.length ? free : ["left"];
  return { spot: spots[Math.floor(Math.random() * spots.length)], bottom };
}
const STAY_MS = 20_000;

export default function CatVisitor() {
  const [visit, setVisit] = useState<{ sprite: CatSprite; place: Place; preview: boolean } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [found, setFound] = useState<{ name: string; label: string; total: number; isNew: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    const clearTimers = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const tryVisit = (force: boolean, forcedId?: string, preview = false) => {
      const today = jstToday();
      if (!force && (shownToday(today) || Math.random() >= APPEAR_RATE)) return;
      if (!preview) markShown(today);
      clearTimers();
      setLeaving(false);
      setFound(null);
      const forced = forcedId ? CAT_SPRITES.find((s) => s.id === forcedId.padStart(2, "0")) : undefined;
      setVisit({ sprite: forced ?? pickSprite(document.documentElement.dataset.season), place: choosePlace(), preview });
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
    const onPreview = (e: Event) => tryVisit(true, (e as CustomEvent<{ id?: string }>).detail?.id, true);
    window.addEventListener(CAT_PREVIEW_EVENT, onPreview);
    return () => {
      clearTimers();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CAT_PREVIEW_EVENT, onPreview);
    };
  }, []);

  // 出ている間も、画面を移ったり＋ボタンが出てきたりしたら、重ならない側へ移る
  const visible = !!visit;
  useEffect(() => {
    if (!visible) return;
    const recheck = () =>
      setVisit((v) => {
        if (!v) return v;
        const next = choosePlace(v.place.spot);
        return next.spot === v.place.spot && next.bottom === v.place.bottom ? v : { ...v, place: next };
      });
    recheck();
    const timer = window.setInterval(recheck, 800);
    window.addEventListener("resize", recheck);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", recheck);
    };
  }, [visible, pathname]);

  if (!visit) return null;
  const { sprite, place, preview } = visit;
  const name = CAT_NAMES[sprite.cat];

  const tap = () => {
    if (found) return;
    // お試しのときは図鑑に記録しない
    const log = preview ? readFound() : recordFound(sprite.id, jstToday());
    const total = CAT_SPRITES.filter((s) => log[s.id]).length;
    setFound({ name, label: sprite.label, total, isNew: !preview && log[sprite.id].count === 1 });
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
              {preview ? `お試し「${found.label}」・図鑑には記録しません` : `${found.isNew ? "はじめての" : ""}「${found.label}」・ねこ図鑑 ${found.total}/${CAT_SPRITES.length}`}
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
