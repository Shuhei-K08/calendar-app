"use client";

// 管理画面：ねこの訪問をお試しで出す（この端末だけ。図鑑には記録しない）
import { CAT_NAMES, CAT_SPRITES, catImage, previewCat, type CatKey } from "@/lib/catVisitor";

const GROUPS: CatKey[] = ["a", "b", "both"];
const SEASON_LABEL = { xmas: "クリスマス", newyear: "お正月" } as const;

export default function CatPreviewCard() {
  return (
    <section className="glass-card p-4">
      <p className="eyebrow">うちのねこ</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-[var(--fg-strong)]">ねこのお試し</h2>
        <button
          type="button"
          className="h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-black text-white"
          onClick={() => previewCat()}
        >
          ランダムで出す
        </button>
      </div>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        絵を押すと、この端末の画面の下に、そのねこがいますぐ現れます（20秒でいなくなります）。みんなには出ず、ねこ図鑑にも記録されません。
      </p>
      {GROUPS.map((g) => (
        <div key={g} className="mt-3">
          <p className="text-sm font-black">{CAT_NAMES[g]}</p>
          <div className="cat-try-grid mt-2">
            {CAT_SPRITES.filter((s) => s.cat === g).map((s) => (
              <button key={s.id} type="button" className="cat-try" onClick={() => previewCat(s.id)} aria-label={`${CAT_NAMES[s.cat]}「${s.label}」を出す`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={catImage(s.id)} alt="" />
                <span className="cat-try-label">{s.label}</span>
                <span className="cat-try-meta">
                  No.{s.id}
                  {s.season ? `・${SEASON_LABEL[s.season]}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
