"use client";

// ねこ図鑑：これまでに見つけたねこ（この端末の記録）
import { useEffect, useState } from "react";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";
import { CAT_NAMES, CAT_SPRITES, catImage, readFound, type CatKey, type FoundLog } from "@/lib/catVisitor";

const GROUPS: { key: CatKey; title: string }[] = [
  { key: "a", title: CAT_NAMES.a },
  { key: "b", title: CAT_NAMES.b },
  { key: "both", title: "2匹いっしょ（レア）" },
];

export default function CatsPage() {
  const [log, setLog] = useState<FoundLog | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLog(readFound());
  }, []);
  const total = log ? CAT_SPRITES.filter((s) => log[s.id]).length : 0;

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
              <em> / {CAT_SPRITES.length}</em>
            </b>
          </span>
          <p>ごく稀に画面のすみっこに遊びに来ます。クリスマス・お正月限定の子は、その期間限定デザインのときだけ。見つけたらタップ！</p>
        </section>

        {GROUPS.map((g) => {
          const items = CAT_SPRITES.filter((s) => s.cat === g.key);
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={catImage(s.id)} alt={f ? s.label : "まだ見つけていないねこ"} loading="lazy" />
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
        <p className="cats-note">記録はこの端末に残ります。</p>
      </div>
      <MobileNavigation />
    </main>
  );
}
