"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  eventTitle: string;
  url: string;
  note: string | null;
  prefecture: string;
  city: string;
  date: Date;
  ownerName: string | null; // null = 自分の予定
};

type OgInfo = {
  storeName: string;
  genre: string;
  emoji: string;
  prefecture: string;
  city: string;
};

type ToastItem = { id: number; msg: string; type: "success" | "error" | "info" };

const FULL_COLS =
  "id, title, start_at, url, note, prefecture, city, category_id, user_id, event_visibility";
const BASE_COLS = "id, title, start_at, url, note, category_id, user_id, event_visibility";

const UNCATEGORIZED = "未設定";

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

// 食べログ等のタイトルから余計なサイト名・キャッチを落として店名らしく整える
const cleanStoreName = (raw: string) => {
  if (!raw) return "";
  // 「店名 | 食べログ」「店名 - ぐるなび」などサイト名区切りで分割（スペース付き記号のみ）
  let s = raw.split(/\s*[|｜]\s*|\s+[-–—:：/]\s+/)[0].trim();
  // 「（渋谷/カフェ）」のような末尾の括弧情報を除去
  s = s.replace(/[（(【\[][^（()）【】\[\]]*[）)】\]]\s*$/g, "").trim();
  return s || raw.trim();
};

export default function LinksPage() {
  const [items, setItems] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ogMap, setOgMap] = useState<Record<string, OgInfo>>({});
  const [ogLoading, setOgLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState<string>("all");
  const [activePrefecture, setActivePrefecture] = useState<string>("all");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const ogCache = useRef<Record<string, OgInfo>>({});

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
        eventTitle: e.title,
        url: e.url as string,
        note: e.note,
        prefecture: e.prefecture ?? "",
        city: e.city ?? "",
        date: new Date(e.start_at),
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

  // 各URLの店名・ジャンルをOGから取得
  useEffect(() => {
    if (items.length === 0) return;
    const urls = Array.from(new Set(items.map((it) => normalizeUrl(it.url))));
    const todo = urls.filter((u) => !ogCache.current[u]);
    if (todo.length === 0) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOgLoading(true);

    void (async () => {
      await Promise.all(
        todo.map(async (u) => {
          try {
            const r = await fetch(`/api/og?url=${encodeURIComponent(u)}`);
            if (!r.ok) throw new Error();
            const d = await r.json();
            const sub = (d.subs ?? [])[0];
            const main = d.main;
            ogCache.current[u] = {
              storeName: cleanStoreName(d.title || d.siteName || ""),
              genre: sub?.label ?? main?.label ?? UNCATEGORIZED,
              emoji: sub?.emoji ?? main?.emoji ?? "📌",
              prefecture: d.prefecture ?? "",
              city: d.city ?? "",
            };
          } catch {
            ogCache.current[u] = {
              storeName: "",
              genre: UNCATEGORIZED,
              emoji: "📌",
              prefecture: "",
              city: "",
            };
          }
        }),
      );
      if (cancelled) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOgMap({ ...ogCache.current });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOgLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [items]);

  // 表示用に店名・ジャンル・場所を合成
  const enriched = useMemo(() => {
    return items.map((it) => {
      const og = ogMap[normalizeUrl(it.url)];
      return {
        ...it,
        storeName: (og?.storeName || it.eventTitle).trim(),
        genre: og?.genre ?? UNCATEGORIZED,
        emoji: og?.emoji ?? "📌",
        prefecture: it.prefecture || og?.prefecture || "",
        city: it.city || og?.city || "",
      };
    });
  }, [items, ogMap]);

  type EnrichedItem = (typeof enriched)[number];

  const genres = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number }>();
    enriched.forEach((it) => {
      const cur = map.get(it.genre);
      if (cur) cur.count += 1;
      else map.set(it.genre, { emoji: it.emoji, count: 1 });
    });
    // 件数順、ただし「未設定」は最後
    return Array.from(map.entries())
      .map(([genre, v]) => ({ genre, ...v }))
      .sort((a, b) => {
        if (a.genre === UNCATEGORIZED) return 1;
        if (b.genre === UNCATEGORIZED) return -1;
        return b.count - a.count;
      });
  }, [enriched]);

  const prefectures = useMemo(() => {
    const set = new Set<string>();
    enriched.forEach((it) => {
      if (it.prefecture) set.add(it.prefecture);
    });
    return Array.from(set);
  }, [enriched]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((it) => {
      if (activeGenre !== "all" && it.genre !== activeGenre) return false;
      if (activePrefecture !== "all" && it.prefecture !== activePrefecture) return false;
      if (!q) return true;
      return (
        it.storeName.toLowerCase().includes(q) ||
        it.eventTitle.toLowerCase().includes(q) ||
        it.url.toLowerCase().includes(q) ||
        (it.note ?? "").toLowerCase().includes(q) ||
        it.prefecture.toLowerCase().includes(q) ||
        it.city.toLowerCase().includes(q) ||
        it.genre.toLowerCase().includes(q) ||
        hostOf(it.url).toLowerCase().includes(q)
      );
    });
  }, [enriched, query, activeGenre, activePrefecture]);

  // ジャンルごとにグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, { emoji: string; items: EnrichedItem[] }>();
    visible.forEach((it) => {
      const g = map.get(it.genre);
      if (g) g.items.push(it);
      else map.set(it.genre, { emoji: it.emoji, items: [it] });
    });
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === UNCATEGORIZED) return 1;
      if (b[0] === UNCATEGORIZED) return -1;
      return b[1].items.length - a[1].items.length;
    });
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
          予定に登録したURLを、お店のジャンル別にまとめています。「前に行ったカフェどこだっけ？」をここで探せます。
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
              placeholder="店名・ジャンル・地名・URLで検索（例: カフェ）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="text-xs text-[var(--fg-muted)]" onClick={() => setQuery("")}>
                クリア
              </button>
            )}
          </div>

          {/* ジャンル絞り込み */}
          {genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={`chip ${activeGenre === "all" ? "chip-active" : ""}`}
                onClick={() => setActiveGenre("all")}
              >
                すべて（{enriched.length}）
              </button>
              {genres.map((g) => (
                <button
                  key={g.genre}
                  className={`chip ${activeGenre === g.genre ? "chip-active" : ""}`}
                  onClick={() => setActiveGenre(g.genre)}
                >
                  {g.emoji} {g.genre}（{g.count}）
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
          {ogLoading && (
            <p className="mt-2 text-xs text-[var(--fg-muted)]">店名・ジャンルを取得中…</p>
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
          grouped.map(([genre, group]) => (
            <section key={genre} className="glass-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">{group.emoji}</span>
                <h2 className="text-base font-black text-[var(--fg-strong)]">{genre}</h2>
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
                      <p className="truncate font-bold text-[var(--fg-strong)]">{it.storeName}</p>
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
