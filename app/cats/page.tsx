"use client";

// ねこ図鑑：これまでに見つけたねこ（アカウントの記録）。見つけた子はタップで大きく見られる
import { useEffect, useRef, useState } from "react";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";
import { CAT_NAMES, catImage, readFound, syncFound, type CatKey, type CatSprite, type FoundLog } from "@/lib/catVisitor";
import { useCatSprites } from "@/lib/useCatSprites";

const GROUPS: { key: CatKey; title: string }[] = [
  { key: "a", title: CAT_NAMES.a },
  { key: "b", title: CAT_NAMES.b },
  { key: "both", title: "2匹いっしょ（レア）" },
];

export default function CatsPage() {
  const [log, setLog] = useState<FoundLog | null>(null);
  const [zoom, setZoom] = useState<string | null>(null); // 大きく見ている子の id
  const sprites = useCatSprites();
  useEffect(() => {
    // まず端末の控えを出し、アカウントの記録と合わせたら出し直す（どの端末でも同じ図鑑）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLog(readFound());
    let alive = true;
    void syncFound()
      .then((merged) => {
        if (alive) setLog(merged);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const total = log ? sprites.filter((s) => log[s.id]).length : 0;

  return (
    <main className="page-shell min-h-screen px-4 pb-28 pt-4 sm:px-6 sm:pb-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShareCalLogo compact />
            <h1 className="text-2xl font-black">ねこ図鑑</h1>
          </div>
          <DesktopNavigation />
        </header>

        <section className="cats-summary">
          <span>
            <small>見つけたねこ</small>
            <b>
              {total}
              <em> / {sprites.length}</em>
            </b>
          </span>
          <p>ごく稀に画面のすみっこに遊びに来ます。クリスマス・お正月限定の子は、その期間限定デザインのときだけ。見つけたらタップ！</p>
        </section>

        {GROUPS.map((g) => {
          const items = sprites.filter((s) => s.cat === g.key);
          const count = items.reduce((n, s) => n + (log?.[s.id]?.count ?? 0), 0);
          return (
            <section key={g.key} className="cats-group">
              <div className="cats-group-head">
                <h2>{g.title}</h2>
                <span>{count ? `見つけた回数 ${count}回` : "まだ見つけていません"}</span>
              </div>
              <div className="cats-grid">
                {items.map((s) => {
                  const f = log?.[s.id];
                  return (
                    <div key={s.id} className={`cats-card${f ? "" : " is-hidden"}`}>
                      {f ? (
                        <button type="button" className="cats-card-zoom" onClick={() => setZoom(s.id)} aria-label={`${s.label}を大きく見る`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={catImage(s.id)} alt={s.label} loading="lazy" draggable={false} />
                        </button>
                      ) : (
                        // まだ見つけていない子は、画像ではなく形だけ（長押しや保存で中身が見えないように）
                        <span
                          className="cats-silhouette"
                          role="img"
                          aria-label="まだ見つけていないねこ"
                          style={{ WebkitMaskImage: `url(${catImage(s.id)})`, maskImage: `url(${catImage(s.id)})` }}
                        />
                      )}
                      <span className="cats-card-label">{f ? s.label : "？？？"}</span>
                      {f && <span className="cats-card-meta">{f.count}回 ・ {f.first.slice(5).replace("-", "/")}〜</span>}
                      {s.season && <span className="cats-card-season">{s.season === "xmas" ? "クリスマス限定" : "お正月限定"}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        <p className="cats-note">記録はアカウントに保存されるので、どの端末でも同じ図鑑です。見つけた子はタップすると大きく見られます。</p>
      </div>
      {zoom && log && <CatZoom id={zoom} log={log} sprites={sprites} onMove={setZoom} onClose={() => setZoom(null)} />}
      <MobileNavigation />
    </main>
  );
}

/* 見つけた子を大きく見る（左右で、見つけたほかの子へ） */
function CatZoom({ id, log, sprites, onMove, onClose }: { id: string; log: FoundLog; sprites: CatSprite[]; onMove: (id: string) => void; onClose: () => void }) {
  const found = sprites.filter((s) => log[s.id]);
  const i = Math.max(0, found.findIndex((s) => s.id === id));
  const s: CatSprite | undefined = found[i];
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const go = (d: number) => found.length > 1 && onMove(found[(i + d + found.length) % found.length].id);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!s) return null;
  const f = log[s.id];
  const [y, m, d] = f.first.split("-").map(Number);

  return (
    <div className="cats-zoom" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section
        className="cats-zoom-card"
        role="dialog"
        aria-modal="true"
        aria-label={s.label}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="cats-zoom-head">
          <span className="cats-zoom-who">{s.cat === "both" ? "おこげ と るる" : CAT_NAMES[s.cat]}</span>
          <span className="cats-zoom-no">
            {i + 1} / {found.length}
          </span>
        </div>
        <div className="cats-zoom-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={s.id} src={catImage(s.id)} alt={s.label} draggable={false} />
        </div>
        <h2 className="cats-zoom-title">{s.label}</h2>
        <p className="cats-zoom-meta">
          見つけた回数 <b>{f.count}回</b> ・ はじめて {y}年{m}月{d}日
        </p>
        {s.season && <span className="cats-card-season">{s.season === "xmas" ? "クリスマス限定" : "お正月限定"}</span>}
        <div className="cats-zoom-actions">
          <button type="button" className="cats-zoom-nav" onClick={() => go(-1)} disabled={found.length < 2} aria-label="前の子">
            ‹
          </button>
          <button type="button" ref={closeRef} className="cats-zoom-close" onClick={onClose}>
            閉じる
          </button>
          <button type="button" className="cats-zoom-nav" onClick={() => go(1)} disabled={found.length < 2} aria-label="次の子">
            ›
          </button>
        </div>
      </section>
    </div>
  );
}
