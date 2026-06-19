"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

type DbLinkEvent = {
  id: string;
  title: string;
  start_at: string;
  url: string | null;
  note: string | null;
  prefecture?: string | null;
  city?: string | null;
  category_id: string | null;
  user_id: string;
  event_visibility?: string | null;
};

type LinkItem = {
  id: string;
  title: string;
  url: string;
  note: string | null;
  prefecture: string;
  city: string;
  date: Date;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  ownerName: string | null; // null = 自分の予定
};

type ToastItem = { id: number; msg: string; type: "success" | "error" | "info" };

const FULL_COLS =
  "id, title, start_at, url, note, prefecture, city, category_id, user_id, event_visibility";
const BASE_COLS = "id, title, start_at, url, note, category_id, user_id, event_visibility";

const normalizeUrl = (url: string) =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`;

const hostOf = (url: string) => {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const faviconOf = (url: string) => {
  const host = hostOf(url);
  return host
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
    : "";
};

export default function LinksPage() {
  const [items, setItems] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activePrefecture, setActivePrefecture] = useState<string>("all");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((msg: string, type: ToastItem["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const fetchLinks = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // --- 自分の予定でURLがあるもの ---
    let ownEvents: DbLinkEvent[] = [];
    {
      const r = await supabase
        .from("events")
        .select(FULL_COLS)
        .eq("user_id", user.id)
        .not("url", "is", null);
      if (r.error?.code === "42703") {
        const r2 = await supabase
          .from("events")
          .select(BASE_COLS)
          .eq("user_id", user.id)
          .not("url", "is", null);
        if (r2.error) {
          show("リンクの取得に失敗しました", "error");
          setLoading(false);
          return;
        }
        ownEvents = (r2.data ?? []) as unknown as DbLinkEvent[];
      } else if (r.error) {
        show("リンクの取得に失敗しました", "error");
        setLoading(false);
        return;
      } else {
        ownEvents = (r.data ?? []) as unknown as DbLinkEvent[];
      }
    }

    // --- 共有された予定のうち「一緒の予定(together)」でURLがあるもの ---
    const { data: sharedRows } = await supabase
      .from("event_shares")
      .select("event_id")
      .eq("shared_with", user.id);
    const sharedIds = (sharedRows ?? []).map((r) => r.event_id as string);

    let sharedEvents: DbLinkEvent[] = [];
    if (sharedIds.length > 0) {
      const s = await supabase
        .from("events")
        .select(FULL_COLS)
        .in("id", sharedIds)
        .eq("event_visibility", "together")
        .not("url", "is", null);
      if (s.error?.code === "42703") {
        const s2 = await supabase
          .from("events")
          .select(BASE_COLS)
          .in("id", sharedIds)
          .eq("event_visibility", "together")
          .not("url", "is", null);
        sharedEvents = (s2.data ?? []) as unknown as DbLinkEvent[];
      } else {
        sharedEvents = (s.data ?? []) as unknown as DbLinkEvent[];
      }
    }

    // id重複を除外（自分のものを優先）
    const seen = new Set(ownEvents.map((e) => e.id));
    const merged = [...ownEvents, ...sharedEvents.filter((e) => !seen.has(e.id))];

    // カテゴリー名・色を解決
    const categoryIds = Array.from(
      new Set(merged.map((e) => e.category_id).filter(Boolean)),
    ) as string[];
    const categoryMap = new Map<string, { name: string; color: string }>();
    if (categoryIds.length > 0) {
      const { data: cats } = await supabase
        .from("schedule_categories")
        .select("id, name, color")
        .in("id", categoryIds);
      (cats ?? []).forEach((c) => categoryMap.set(c.id, { name: c.name, color: c.color }));
    }

    // 共有者(オーナー)名を解決
    const ownerIds = Array.from(
      new Set(merged.filter((e) => e.user_id !== user.id).map((e) => e.user_id)),
    );
    const ownerMap = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", ownerIds);
      (profiles ?? []).forEach((p) => ownerMap.set(p.id, p.username));
    }

    const list: LinkItem[] = merged
      .filter((e) => e.url && e.url.trim())
      .map((e) => ({
        id: e.id,
        title: e.title,
        url: e.url as string,
        note: e.note,
        prefecture: e.prefecture ?? "",
        city: e.city ?? "",
        date: new Date(e.start_at),
        categoryId: e.category_id,
        categoryName: e.category_id
          ? categoryMap.get(e.category_id)?.name ?? "分類"
          : "未分類",
        categoryColor: e.category_id ? categoryMap.get(e.category_id)?.color ?? null : null,
        ownerName: e.user_id === user.id ? null : ownerMap.get(e.user_id) ?? "共有相手",
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    setItems(list);
    setLoading(false);
    // showは安定。意図的に依存から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLinks();
  }, [fetchLinks]);

  const categories = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; count: number }>();
    items.forEach((it) => {
      const key = it.categoryName;
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { name: it.categoryName, color: it.categoryColor, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [items]);

  const prefectures = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.prefecture) set.add(it.prefecture);
    });
    return Array.from(set);
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (activeCategory !== "all" && it.categoryName !== activeCategory) return false;
      if (activePrefecture !== "all" && it.prefecture !== activePrefecture) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        it.url.toLowerCase().includes(q) ||
        (it.note ?? "").toLowerCase().includes(q) ||
        it.prefecture.toLowerCase().includes(q) ||
        it.city.toLowerCase().includes(q) ||
        hostOf(it.url).toLowerCase().includes(q)
      );
    });
  }, [items, query, activeCategory, activePrefecture]);

  // カテゴリーごとにグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, { color: string | null; items: LinkItem[] }>();
    visible.forEach((it) => {
      const g = map.get(it.categoryName);
      if (g) g.items.push(it);
      else map.set(it.categoryName, { color: it.categoryColor, items: [it] });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].items.length - a[1].items.length);
  }, [visible]);

  return (
    <main className="page-shell min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-6">
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
        ))}
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShareCalLogo compact />
            <div>
              <p className="eyebrow">Saved Links</p>
              <h1 className="mt-1 text-2xl font-black text-[var(--fg-strong)]">リンク集</h1>
            </div>
          </div>
          <DesktopNavigation />
        </header>

        <p className="text-sm text-[var(--fg-muted)]">
          予定に登録したURLを、カテゴリー別にまとめています。「前に行ったカフェどこだっけ？」をここで探せます。
        </p>

        {/* 検索 */}
        <section className="glass-card p-3">
          <div className="search-input flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-3">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--fg-muted)]" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
              placeholder="店名・URL・地名・メモで検索（例: カフェ）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="text-xs text-[var(--fg-muted)]" onClick={() => setQuery("")}>
                クリア
              </button>
            )}
          </div>

          {/* カテゴリー絞り込み */}
          {categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={`chip ${activeCategory === "all" ? "chip-active" : ""}`}
                onClick={() => setActiveCategory("all")}
              >
                すべて（{items.length}）
              </button>
              {categories.map((c) => (
                <button
                  key={c.name}
                  className={`chip ${activeCategory === c.name ? "chip-active" : ""}`}
                  onClick={() => setActiveCategory(c.name)}
                >
                  {c.color && (
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: c.color }}
                    />
                  )}
                  {c.name}（{c.count}）
                </button>
              ))}
            </div>
          )}

          {/* 都道府県絞り込み */}
          {prefectures.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className={`chip ${activePrefecture === "all" ? "chip-active" : ""}`}
                onClick={() => setActivePrefecture("all")}
              >
                全エリア
              </button>
              {prefectures.map((p) => (
                <button
                  key={p}
                  className={`chip ${activePrefecture === p ? "chip-active" : ""}`}
                  onClick={() => setActivePrefecture(p)}
                >
                  📍 {p}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 一覧 */}
        {loading ? (
          <div className="empty-state p-8 text-center">
            <p className="text-base">読み込み中…</p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="empty-state p-8 text-center">
            <p className="text-base">
              {items.length === 0
                ? "URL付きの予定がまだありません。予定にURLを登録すると、ここに自動で並びます。"
                : "条件に合うリンクが見つかりませんでした。"}
            </p>
          </div>
        ) : (
          grouped.map(([categoryName, group]) => (
            <section key={categoryName} className="glass-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: group.color ?? "var(--border-strong)" }}
                />
                <h2 className="text-base font-black text-[var(--fg-strong)]">{categoryName}</h2>
                <span className="badge badge-slate">{group.items.length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((it) => (
                  <a
                    key={it.id}
                    href={normalizeUrl(it.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 transition hover:border-[var(--accent)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                      {faviconOf(it.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={faviconOf(it.url)} alt="" className="h-6 w-6" />
                      ) : (
                        <span className="text-lg">🔗</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[var(--fg-strong)]">{it.title}</p>
                      <p className="truncate text-xs text-[var(--fg-muted)]">{hostOf(it.url)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="badge badge-slate">
                          {format(it.date, "yyyy/M/d", { locale: ja })}
                        </span>
                        {(it.prefecture || it.city) && (
                          <span className="badge badge-accent">
                            📍 {[it.prefecture, it.city].filter(Boolean).join(" ")}
                          </span>
                        )}
                        {it.ownerName && (
                          <span className="badge badge-slate">👥 {it.ownerName}</span>
                        )}
                      </div>
                      {it.note && (
                        <p className="mt-1 line-clamp-1 text-xs text-[var(--fg-muted)]">{it.note}</p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <MobileNavigation />
    </main>
  );
}
