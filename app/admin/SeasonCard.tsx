"use client";

// 管理画面：期間限定のデザイン（クリスマス・年末年始）の期間を決める
import { useEffect, useState } from "react";
import {
  fetchSeasons,
  isSeasonActive,
  jstToday,
  NY_GREETED_KEY,
  periodLabel,
  readSeasonPreview,
  saveSeason,
  SEASON_CHANGED_EVENT,
  SEASON_THEMES,
  setSeasonPreview,
  type SeasonKey,
} from "@/lib/season";

const NOTES: Record<SeasonKey, string> = {
  xmas: "この期間だけ、みんなのアプリがクリスマスのデザインになります（各自が設定でオフにできます）。",
  newyear:
    "この期間だけ、みんなのアプリが年末年始のデザインになります（おこげがカレンダーの上を走ります）。1月中に初めて開いたとき、1回だけ「あけましておめでとう」が出ます。クリスマスと重なったら、こちらが優先です。",
};

export default function SeasonCard({
  kind,
  show,
}: {
  kind: SeasonKey;
  show: (message: string, type?: "success" | "error" | "info") => void;
}) {
  const name = SEASON_THEMES[kind].name;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [today, setToday] = useState("");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    void fetchSeasons().then((s) => {
      setToday(jstToday());
      setStart(s[kind]?.start ?? "");
      setEnd(s[kind]?.end ?? "");
      setLoaded(true);
    });
    const readPreview = () => setPreviewing(readSeasonPreview() === kind);
    readPreview();
    window.addEventListener(SEASON_CHANGED_EVENT, readPreview);
    return () => window.removeEventListener(SEASON_CHANGED_EVENT, readPreview);
  }, [kind]);

  const save = async (next: { start: string; end: string } | null) => {
    if (next && (!next.start || !next.end)) {
      show("始まりと終わりの日を入れてください", "error");
      return;
    }
    if (next && next.start > next.end) {
      show("終わりの日は、始まりの日より後にしてください", "error");
      return;
    }
    setSaving(true);
    try {
      await saveSeason(kind, next);
      if (!next) {
        setStart("");
        setEnd("");
      }
      show(next ? `${name}の期間を ${periodLabel(next)} にしました` : `${name}の期間をなしにしました`, "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "保存できませんでした", "error");
    } finally {
      setSaving(false);
    }
  };

  const current = start && end ? { start, end } : null;
  const status = !current ? "期間なし（だれにも出ません）" : isSeasonActive(current, today) ? "いま期間中です" : current.end < today ? "期間は終わっています" : "これから始まります";

  return (
    <section className="glass-card p-4">
      <p className="eyebrow">期間限定のデザイン</p>
      <h2 className="mt-1 text-lg font-black text-[var(--fg-strong)]">{name}</h2>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">{NOTES[kind]}日付は日本時間で、両端の日を含みます。</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-bold">
          始まり
          <input
            type="date"
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 font-normal"
            value={start}
            disabled={!loaded}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          終わり
          <input
            type="date"
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 font-normal"
            value={end}
            disabled={!loaded}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="h-11 rounded-xl bg-[var(--accent)] px-5 text-sm font-black text-white disabled:opacity-50"
          disabled={!loaded || saving}
          onClick={() => void save({ start, end })}
        >
          保存
        </button>
        <button
          type="button"
          className="h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--fg-muted)] disabled:opacity-50"
          disabled={!loaded || saving || !current}
          onClick={() => void save(null)}
        >
          期間なしにする
        </button>
      </div>
      <p className="mt-2 text-sm font-bold text-[var(--fg-muted)]">{loaded ? status : "読み込み中…"}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <button
          type="button"
          className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-bold"
          onClick={() => {
            setSeasonPreview(previewing ? null : kind);
            show(previewing ? "試すのをやめました" : `この端末だけ、${name}のデザインにしました`, "info");
          }}
        >
          {previewing ? "試すのをやめる" : "この端末で試す"}
        </button>
        {kind === "newyear" && (
          <button
            type="button"
            className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-bold"
            onClick={() => {
              try {
                window.localStorage.removeItem(NY_GREETED_KEY);
              } catch {
                /* 覚えていなければ、そのまま出る */
              }
              show(previewing ? "次に画面を開いたとき、あいさつが出ます" : "「この端末で試す」中なら、次に画面を開いたときにあいさつが出ます", "info");
            }}
          >
            あいさつをもう一度見る
          </button>
        )}
        <span className="text-xs text-[var(--fg-muted)]">期間に関係なく、この端末だけで見た目を確かめられます（みんなには出ません）。</span>
      </div>
    </section>
  );
}
