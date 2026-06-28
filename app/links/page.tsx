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
  place_name?: string | null;
  category_id: string | null;
  user_id: string;
  event_visibility?: string | null;
  is_favorite?: boolean | null;
  link_genre?: string | null;
};

type LinkItem = {
  id: string;
  eventTitle: string;
  url: string;
  note: string | null;
  prefecture: string;
  city: string;
  placeName: string;
  date: Date;
  ownerName: string | null; // null = 自分の予定
  isFavorite: boolean;
  linkGenre: string; // 手動設定したジャンル（空=未設定）
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
  "id, title, start_at, url, note, prefecture, city, place_name, category_id, user_id, event_visibility, is_favorite, link_genre";
const BASE_COLS = "id, title, start_at, url, note, category_id, user_id, event_visibility";

const UNCATEGORIZED = "未設定";

// ジャンルのプルダウン候補（OGの自動判定と同じ分類）
const GENRE_GROUPS: { label: string; options: string[] }[] = [
  {
    label: "グルメ・飲食",
    options: [
      "居酒屋", "寿司・海鮮", "焼肉", "焼き鳥", "ラーメン", "うどん・そば", "天ぷら",
      "とんかつ", "しゃぶしゃぶ・鍋", "お好み焼き", "ステーキ", "ハンバーガー", "カレー",
      "中華", "韓国料理", "タイ料理", "インド料理", "イタリアン", "フレンチ", "カフェ",
      "スイーツ・パティスリー", "パン・ベーカリー", "食べ放題", "バー", "ベジタリアン・ヴィーガン",
    ],
  },
  { label: "旅行・宿泊", options: ["ホテル", "旅館", "リゾート", "民泊", "温泉"] },
  { label: "アウトドア", options: ["キャンプ", "登山・ハイキング", "釣り", "サーフィン", "BBQ"] },
  { label: "スポーツ", options: ["野球", "サッカー", "バスケ", "ラグビー"] },
  { label: "フィットネス", options: ["ヨガ・ピラティス", "ジム"] },
  { label: "ショッピング", options: ["EC", "ファッション", "家電", "アウトレット"] },
  { label: "エンタメ", options: ["映画", "音楽・ライブ", "美術館・博物館", "テーマパーク"] },
  { label: "自動車", options: ["新車・中古車", "カー用品"] },
  { label: "バイク", options: ["ツーリング", "バイク用品"] },
  { label: "医療・クリニック", options: ["歯科", "皮膚科", "眼科"] },
  { label: "美容", options: ["ヘアサロン", "ネイル", "エステ"] },
  { label: "不動産", options: ["賃貸", "売買"] },
  { label: "株・投資", options: ["株式", "FX", "仮想通貨"] },
  { label: "その他", options: ["グルメ・飲食", "ショッピング", "エンタメ"] },
];

const ALL_GENRE_OPTIONS = new Set(GENRE_GROUPS.flatMap((g) => g.options));

// 47都道府県
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

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

// Googleマップ検索URL（店名＋県＋市で検索）
const mapUrlOf = (parts: (string | undefined)[]) => {
  const q = parts.filter(Boolean).join(" ").trim();
  return q
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
    : "";
};

// サイト名区切りや末尾の括弧情報を落として店名らしく整える
const cleanStoreName = (raw: string) => {
  if (!raw) return "";
  let s = raw.split(/\s*[|｜]\s*|\s+[-–—:：/]\s+/)[0].trim();
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
  const [favOnly, setFavOnly] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const ogCache = useRef<Record<string, OgInfo>>({});
  const autoSaveTried = useRef<Set<string>>(new Set());
  const cityTried = useRef<Set<string>>(new Set());

  // 詳細パネル（URLグループ単位）
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [expandedOccId, setExpandedOccId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPref, setEditPref] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [savingLoc, setSavingLoc] = useState(false);
  // 都道府県ごとの市区町村一覧キャッシュ
  const [cityListByPref, setCityListByPref] = useState<Record<string, string[]>>({});
  const [cityLoading, setCityLoading] = useState(false);

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
        placeName: e.place_name ?? "",
        date: new Date(e.start_at),
        ownerName: e.user_id === user.id ? null : ownerMap.get(e.user_id) ?? "共有相手",
        isFavorite: e.is_favorite ?? false,
        linkGenre: e.link_genre ?? "",
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

  // 自分の予定で場所が未登録のものは、OGから取得できた県・市を自動保存
  useEffect(() => {
    const targets = items
      .filter(
        (it) =>
          it.ownerName === null &&
          !it.prefecture &&
          !it.city &&
          !autoSaveTried.current.has(it.id),
      )
      .map((it) => ({ it, og: ogMap[normalizeUrl(it.url)] }))
      .filter(({ og }) => og && (og.prefecture || og.city));

    if (targets.length === 0) return;
    // 一度試したものは再試行しない（列が無い等の無限ループ防止）
    targets.forEach(({ it }) => autoSaveTried.current.add(it.id));

    let cancelled = false;
    void (async () => {
      const saved: { id: string; prefecture: string; city: string }[] = [];
      for (const { it, og } of targets) {
        const { error } = await supabase
          .from("events")
          .update({ prefecture: og.prefecture || null, city: og.city || null })
          .eq("id", it.id);
        if (error) {
          // prefecture/city列が無い環境では以降の保存も無駄なので中断
          if (error.code === "42703" || error.code === "PGRST204") break;
          continue;
        }
        saved.push({ id: it.id, prefecture: og.prefecture, city: og.city });
      }
      if (cancelled || saved.length === 0) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems((prev) =>
        prev.map((x) => {
          const s = saved.find((ss) => ss.id === x.id);
          return s ? { ...x, prefecture: s.prefecture, city: s.city } : x;
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [ogMap, items]);

  // 表示用に店名・ジャンル・場所を合成
  const enriched = useMemo(() => {
    return items.map((it) => {
      const og = ogMap[normalizeUrl(it.url)];
      return {
        ...it,
        // 手入力した店名を最優先、無ければOG店名、最後に予定名
        storeName: (it.placeName || og?.storeName || it.eventTitle).trim(),
        // 手動ジャンルを最優先、無ければOG判定
        genre: (it.linkGenre || og?.genre || UNCATEGORIZED).trim(),
        emoji: it.linkGenre ? "🏷️" : og?.emoji ?? "📌",
        // 保存済みの県市を優先、無ければOG推定を表示用に使う
        prefecture: it.prefecture || og?.prefecture || "",
        city: it.city || og?.city || "",
      };
    });
  }, [items, ogMap]);

  type EnrichedItem = (typeof enriched)[number];

  type LinkOccurrence = {
    id: string;
    eventTitle: string;
    note: string | null;
    date: Date;
    ownerName: string | null;
  };
  type LinkGroup = {
    key: string;
    url: string;
    storeName: string;
    genre: string;
    emoji: string;
    prefecture: string;
    city: string;
    placeName: string;
    linkGenre: string;
    isFavorite: boolean;
    hasOwn: boolean;
    ownIds: string[];
    occurrences: LinkOccurrence[];
    latestDate: Date;
  };

  // 同じURLの予定をまとめる（1URL = 1カード、予定日は複数）
  const urlGroups = useMemo<LinkGroup[]>(() => {
    const map = new Map<string, EnrichedItem[]>();
    for (const it of enriched) {
      const key = normalizeUrl(it.url).toLowerCase();
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return Array.from(map.entries())
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => b.date.getTime() - a.date.getTime());
        const own = sorted.filter((x) => x.ownerName === null);
        const rep = own[0] ?? sorted[0];
        return {
          key,
          url: rep.url,
          storeName: rep.storeName,
          genre: rep.genre,
          emoji: rep.emoji,
          prefecture: rep.prefecture,
          city: rep.city,
          placeName: rep.placeName,
          linkGenre: rep.linkGenre,
          isFavorite: own.some((x) => x.isFavorite),
          hasOwn: own.length > 0,
          ownIds: own.map((x) => x.id),
          occurrences: sorted.map((x) => ({
            id: x.id,
            eventTitle: x.eventTitle,
            note: x.note,
            date: x.date,
            ownerName: x.ownerName,
          })),
          latestDate: sorted[0].date,
        };
      })
      .sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
  }, [enriched]);

  const detail = useMemo(
    () => urlGroups.find((g) => g.key === detailKey) ?? null,
    [urlGroups, detailKey],
  );

  const loadCities = useCallback(async (pref: string) => {
    if (!pref || cityTried.current.has(pref)) return;
    cityTried.current.add(pref);
    setCityLoading(true);
    try {
      const r = await fetch(`/api/cities?prefecture=${encodeURIComponent(pref)}`);
      const d = await r.json();
      const cities = (d.cities ?? []) as string[];
      setCityListByPref((prev) => ({ ...prev, [pref]: cities }));
      // 失敗時（空）は再取得できるようにする
      if (cities.length === 0) cityTried.current.delete(pref);
    } catch {
      cityTried.current.delete(pref);
      setCityListByPref((prev) => ({ ...prev, [pref]: [] }));
    } finally {
      setCityLoading(false);
    }
  }, []);

  const openDetail = (g: LinkGroup) => {
    setDetailKey(g.key);
    setExpandedOccId(null);
    // 編集欄は「保存済み or 自動取得」の値で初期化（違っていれば直して保存）
    setEditName(g.storeName);
    setEditPref(g.prefecture);
    setEditCity(g.city);
    setEditGenre(g.linkGenre);
    if (g.prefecture) void loadCities(g.prefecture);
  };

  const closeDetail = () => {
    setDetailKey(null);
    setExpandedOccId(null);
    setSavingLoc(false);
  };

  const toggleFavorite = useCallback(
    async (g: { ownIds: string[]; isFavorite: boolean; hasOwn: boolean }) => {
      if (!g.hasOwn) return; // 共有相手のみのリンクは変更不可
      const next = !g.isFavorite;
      const ids = g.ownIds;
      setItems((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, isFavorite: next } : x)));
      const { error } = await supabase
        .from("events")
        .update({ is_favorite: next })
        .in("id", ids);
      if (error) {
        setItems((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, isFavorite: !next } : x)));
        if (error.code === "42703" || error.code === "PGRST204") {
          show("お気に入りを使うにはSQL（is_favorite列の追加）を実行してください。", "error");
        } else {
          show("お気に入りの更新に失敗しました", "error");
        }
      }
    },
    [show],
  );

  const saveLocation = async () => {
    if (!detail || !detail.hasOwn) return;
    const ids = detail.ownIds;
    setSavingLoc(true);

    const base = {
      place_name: editName.trim() || null,
      prefecture: editPref || null,
      city: editCity.trim() || null,
    };
    const genreVal = editGenre.trim() || null;

    let { error } = await supabase
      .from("events")
      .update({ ...base, link_genre: genreVal })
      .in("id", ids);

    let genreSaved = !error;

    // link_genre 列が無い古いDBでは、ジャンルを外して場所だけ保存
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      const retry = await supabase.from("events").update(base).in("id", ids);
      error = retry.error;
      genreSaved = false;
      if (!error) {
        show("ジャンルを保存するにはSQL（link_genre列の追加）が必要です。場所のみ保存しました。", "error");
      }
    }

    setSavingLoc(false);

    if (error) {
      if (error.code === "42703" || error.code === "PGRST204") {
        show("保存にはSQL（place_name/prefecture/city列の追加）の実行が必要です。", "error");
      } else {
        show("保存に失敗しました", "error");
      }
      return;
    }

    // ローカル状態を更新（同じURLの自分の予定すべて）
    setItems((prev) =>
      prev.map((x) =>
        ids.includes(x.id)
          ? {
              ...x,
              placeName: editName.trim(),
              prefecture: editPref,
              city: editCity.trim(),
              ...(genreSaved ? { linkGenre: editGenre.trim() } : {}),
            }
          : x,
      ),
    );
    if (genreSaved) show("保存しました", "success");
  };

  const genres = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number }>();
    urlGroups.forEach((g) => {
      const cur = map.get(g.genre);
      if (cur) cur.count += 1;
      else map.set(g.genre, { emoji: g.emoji, count: 1 });
    });
    return Array.from(map.entries())
      .map(([genre, v]) => ({ genre, ...v }))
      .sort((a, b) => {
        if (a.genre === UNCATEGORIZED) return 1;
        if (b.genre === UNCATEGORIZED) return -1;
        return b.count - a.count;
      });
  }, [urlGroups]);

  const prefectures = useMemo(() => {
    const set = new Set<string>();
    urlGroups.forEach((g) => {
      if (g.prefecture) set.add(g.prefecture);
    });
    return Array.from(set);
  }, [urlGroups]);

  const favCount = useMemo(() => urlGroups.filter((g) => g.isFavorite).length, [urlGroups]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return urlGroups.filter((g) => {
      if (favOnly && !g.isFavorite) return false;
      if (activeGenre !== "all" && g.genre !== activeGenre) return false;
      if (activePrefecture !== "all" && g.prefecture !== activePrefecture) return false;
      if (!q) return true;
      return (
        g.storeName.toLowerCase().includes(q) ||
        g.url.toLowerCase().includes(q) ||
        g.genre.toLowerCase().includes(q) ||
        g.prefecture.toLowerCase().includes(q) ||
        g.city.toLowerCase().includes(q) ||
        hostOf(g.url).toLowerCase().includes(q) ||
        g.occurrences.some(
          (o) =>
            o.eventTitle.toLowerCase().includes(q) ||
            (o.note ?? "").toLowerCase().includes(q),
        )
      );
    });
  }, [urlGroups, query, activeGenre, activePrefecture, favOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, { emoji: string; items: LinkGroup[] }>();
    visible.forEach((g) => {
      const e = map.get(g.genre);
      if (e) e.items.push(g);
      else map.set(g.genre, { emoji: g.emoji, items: [g] });
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
          予定に登録したURLを、お店のジャンル別にまとめています。カードを押すと詳細が開き、場所の追加やリンクを開けます。
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
                className={`chip ${favOnly ? "chip-active" : ""}`}
                onClick={() => setFavOnly((v) => !v)}
              >
                ⭐ お気に入り（{favCount}）
              </button>
              <button
                className={`chip ${activeGenre === "all" && !favOnly ? "chip-active" : ""}`}
                onClick={() => {
                  setActiveGenre("all");
                  setFavOnly(false);
                }}
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
                {group.items.map((g) => (
                  <div key={g.key} className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => openDetail(g)}
                    className="group flex w-full gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 pr-10 text-left transition hover:border-[var(--accent)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                      {faviconOf(g.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={faviconOf(g.url)} alt="" className="h-6 w-6" />
                      ) : (
                        <span className="text-lg">🔗</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[var(--fg-strong)]">{g.storeName}</p>
                      <p className="truncate text-xs text-[var(--fg-muted)]">{hostOf(g.url)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="badge badge-slate">
                          {format(g.latestDate, "yyyy/M/d", { locale: ja })}
                          {g.occurrences.length > 1 && ` 他${g.occurrences.length - 1}件`}
                        </span>
                        {(g.prefecture || g.city) && (
                          <span className="badge badge-accent">
                            📍 {[g.prefecture, g.city].filter(Boolean).join(" ")}
                          </span>
                        )}
                        {!g.hasOwn && (
                          <span className="badge badge-slate">👥 共有</span>
                        )}
                      </div>
                    </div>
                  </button>
                    {g.hasOwn && (
                      <button
                        type="button"
                        aria-label={g.isFavorite ? "お気に入りを解除" : "お気に入りに追加"}
                        onClick={() => void toggleFavorite(g)}
                        className="absolute right-2 top-2 text-lg leading-none transition hover:scale-110"
                      >
                        {g.isFavorite ? "⭐" : "☆"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* 詳細パネル */}
      {detail && (
        <div className="confirm-overlay" onClick={closeDetail}>
          <div
            className="confirm-card max-h-[85vh] max-w-md overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                {faviconOf(detail.url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={faviconOf(detail.url)} alt="" className="h-7 w-7" />
                ) : (
                  <span className="text-xl">🔗</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{detail.emoji} {detail.genre}</p>
                <h3 className="mt-1 break-words text-lg font-black text-[var(--fg-strong)]">
                  {detail.storeName}
                </h3>
                <p className="mt-0.5 truncate text-xs text-[var(--fg-muted)]">{hostOf(detail.url)}</p>
              </div>
              {detail.hasOwn && (
                <button
                  type="button"
                  aria-label={detail.isFavorite ? "お気に入りを解除" : "お気に入りに追加"}
                  onClick={() => void toggleFavorite(detail)}
                  className="shrink-0 text-2xl leading-none transition hover:scale-110"
                >
                  {detail.isFavorite ? "⭐" : "☆"}
                </button>
              )}
            </div>

            {/* 予定日リスト（日付タップで予定名・メモを表示） */}
            <div className="mt-4">
              <p className="text-xs font-bold text-[var(--fg-muted)]">
                予定日（{detail.occurrences.length}件）— 日付をタップで予定名・メモを表示
              </p>
              <div className="mt-2 space-y-1.5">
                {detail.occurrences.map((occ) => {
                  const open = expandedOccId === occ.id;
                  return (
                    <div
                      key={occ.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)]"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedOccId(open ? null : occ.id)}
                        className="flex w-full items-center justify-between gap-2 p-2.5 text-left"
                      >
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="badge badge-slate">
                            {format(occ.date, "yyyy/M/d", { locale: ja })}
                          </span>
                          {occ.ownerName && (
                            <span className="badge badge-slate">👥 {occ.ownerName}</span>
                          )}
                        </span>
                        <svg
                          viewBox="0 0 24 24"
                          className={`h-4 w-4 shrink-0 text-[var(--fg-muted)] transition-transform ${open ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                      {open && (
                        <div className="border-t border-[var(--border)] p-2.5">
                          <p className="text-sm font-bold text-[var(--fg-strong)]">
                            予定名: {occ.eventTitle || "（名称なし）"}
                          </p>
                          {occ.note ? (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--fg-muted)]">
                              {occ.note}
                            </p>
                          ) : (
                            <p className="mt-1 text-sm text-[var(--fg-muted)]">メモはありません。</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 店名・ジャンル・場所の追加・編集 */}
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
              <p className="text-xs font-bold text-[var(--fg-muted)]">店名・ジャンル・場所（URLから自動取得・違っていれば修正できます）</p>
              {!detail.hasOwn ? (
                <p className="mt-2 text-sm text-[var(--fg)]">
                  {[detail.prefecture, detail.city].filter(Boolean).join(" ") || "場所未登録"}
                  <span className="ml-1 text-xs text-[var(--fg-muted)]">（共有相手の予定のため編集不可）</span>
                </p>
              ) : (
                <>
                  <input
                    className="field-input mt-2 w-full"
                    placeholder="店名・場所の名前"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <select
                    className="field-input mt-2 w-full"
                    value={editGenre}
                    onChange={(e) => setEditGenre(e.target.value)}
                  >
                    <option value="">未設定</option>
                    {/* 既存の値が候補に無い場合も選べるよう残す */}
                    {editGenre && !ALL_GENRE_OPTIONS.has(editGenre) && (
                      <option value={editGenre}>{editGenre}</option>
                    )}
                    {GENRE_GROUPS.map((grp) => (
                      <optgroup key={grp.label} label={grp.label}>
                        {grp.options.map((o) => (
                          <option key={`${grp.label}-${o}`} value={o}>
                            {o}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <select
                      className="field-input"
                      value={editPref}
                      onChange={(e) => {
                        const p = e.target.value;
                        setEditPref(p);
                        setEditCity(""); // 都道府県を変えたら市区町村はリセット
                        if (p) void loadCities(p);
                      }}
                    >
                      <option value="">都道府県</option>
                      {PREFECTURES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <select
                      className="field-input"
                      value={editCity}
                      disabled={!editPref || cityLoading}
                      onChange={(e) => setEditCity(e.target.value)}
                    >
                      <option value="">
                        {!editPref
                          ? "先に都道府県を選択"
                          : cityLoading
                          ? "読み込み中…"
                          : "市区町村を選択"}
                      </option>
                      {/* 保存済みの値が一覧に無い場合も選択肢として残す */}
                      {editCity && !(cityListByPref[editPref] ?? []).includes(editCity) && (
                        <option value={editCity}>{editCity}</option>
                      )}
                      {(cityListByPref[editPref] ?? []).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn btn-soft mt-2"
                    disabled={savingLoc}
                    onClick={saveLocation}
                  >
                    {savingLoc ? "保存中…" : "保存"}
                  </button>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <button className="btn btn-soft" onClick={closeDetail}>閉じる</button>
              <div className="flex gap-2">
                {mapUrlOf([detail.storeName, detail.prefecture, detail.city]) && (
                  <a
                    className="btn btn-soft"
                    href={mapUrlOf([detail.storeName, detail.prefecture, detail.city])}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🗺️ 地図
                  </a>
                )}
                <a
                  className="btn btn-primary"
                  href={normalizeUrl(detail.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  URLを開く ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <MobileNavigation />
    </main>
  );
}
