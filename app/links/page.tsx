"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";
import LinksMap, { type MapPoint } from "./LinksMap";

type DbLinkEvent = {
  id: string;
  title: string;
  start_at: string;
  url: string | null;
  note: string | null;
  prefecture?: string | null;
  city?: string | null;
  place_name?: string | null;
  lat?: number | null;
  lng?: number | null;
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
  placeName: string;
  lat: number | null;
  lng: number | null;
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
  "id, title, start_at, url, note, prefecture, city, place_name, lat, lng, category_id, user_id, event_visibility";
const BASE_COLS = "id, title, start_at, url, note, category_id, user_id, event_visibility";

const UNCATEGORIZED = "未設定";

// 市区町村プルダウンの候補（東京23区＋政令指定都市など。これ以外は自由入力も可）
const CITY_SUGGESTIONS = [
  "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区",
  "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区", "杉並区", "豊島区",
  "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区",
  "札幌市", "仙台市", "さいたま市", "千葉市", "横浜市", "川崎市", "相模原市",
  "新潟市", "静岡市", "浜松市", "名古屋市", "京都市", "大阪市", "堺市", "神戸市",
  "岡山市", "広島市", "北九州市", "福岡市", "熊本市",
];

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

// GoogleマップなどのURLに含まれる座標を抽出（あれば即座にピン化できる）
const parseLatLngFromUrl = (url: string): { lat: number; lng: number } | null => {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // /@35.65,139.70
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // !3d35.65!4d139.70
    /[?&](?:q|ll|center|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/, // q=35.65,139.70
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  return null;
};

// ジャンルごとのピン色（固定パレットからハッシュで割り当て）
const PIN_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#84cc16",
];
const genreColor = (genre: string) => {
  let h = 0;
  for (let i = 0; i < genre.length; i++) h = (h * 31 + genre.charCodeAt(i)) >>> 0;
  return PIN_COLORS[h % PIN_COLORS.length];
};

// Nominatim(OpenStreetMap)でジオコーディング。利用ポリシーに配慮し1件ずつ呼ぶ。
const geocode = async (query: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ja&countrycodes=jp&q=${encodeURIComponent(query)}`,
    );
    if (!r.ok) return null;
    const data = await r.json();
    if (Array.isArray(data) && data[0]) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch {
    /* ignore */
  }
  return null;
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const ogCache = useRef<Record<string, OgInfo>>({});
  const autoSaveTried = useRef<Set<string>>(new Set());

  // 地図
  const [showMap, setShowMap] = useState(false);
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 });
  const geocodeTried = useRef<Set<string>>(new Set());

  // 詳細パネル
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPref, setEditPref] = useState("");
  const [editCity, setEditCity] = useState("");
  const [savingLoc, setSavingLoc] = useState(false);

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
        lat: typeof e.lat === "number" ? e.lat : null,
        lng: typeof e.lng === "number" ? e.lng : null,
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

  // 保存済み座標・URL内座標を coords に取り込む
  useEffect(() => {
    if (items.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoords((prev) => {
      const next = { ...prev };
      let changed = false;
      items.forEach((it) => {
        if (next[it.id]) return;
        if (typeof it.lat === "number" && typeof it.lng === "number") {
          next[it.id] = { lat: it.lat, lng: it.lng };
          changed = true;
        } else {
          const fromUrl = parseLatLngFromUrl(normalizeUrl(it.url));
          if (fromUrl) {
            next[it.id] = fromUrl;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [items]);

  // 未取得の店をジオコーディング（地図を開いたときに実行）
  const geocodeMissing = useCallback(async () => {
    const targets = items.filter(
      (it) => !coords[it.id] && !geocodeTried.current.has(it.id),
    );
    if (targets.length === 0) return;
    targets.forEach((it) => geocodeTried.current.add(it.id));

    setGeocoding(true);
    setGeocodeProgress({ done: 0, total: targets.length });

    for (let i = 0; i < targets.length; i++) {
      const it = targets[i];
      const og = ogMap[normalizeUrl(it.url)];
      const name = (it.placeName || og?.storeName || it.eventTitle).trim();
      const area = [it.prefecture || og?.prefecture, it.city || og?.city]
        .filter(Boolean)
        .join(" ");
      const query = [name, area].filter(Boolean).join(" ").trim();
      if (query) {
        const result = await geocode(query);
        if (result) {
          setCoords((prev) => ({ ...prev, [it.id]: result }));
          // 自分の予定なら座標をDBへキャッシュ
          if (it.ownerName === null) {
            await supabase
              .from("events")
              .update({ lat: result.lat, lng: result.lng })
              .eq("id", it.id);
          }
        }
      }
      setGeocodeProgress({ done: i + 1, total: targets.length });
      // Nominatim利用ポリシー: 1秒に1リクエストまで
      if (i < targets.length - 1) await sleep(1100);
    }

    setGeocoding(false);
  }, [items, coords, ogMap]);

  const openMap = () => {
    setShowMap(true);
    void geocodeMissing();
  };

  // 表示用に店名・ジャンル・場所を合成
  const enriched = useMemo(() => {
    return items.map((it) => {
      const og = ogMap[normalizeUrl(it.url)];
      return {
        ...it,
        // 手入力した店名を最優先、無ければOG店名、最後に予定名
        storeName: (it.placeName || og?.storeName || it.eventTitle).trim(),
        genre: og?.genre ?? UNCATEGORIZED,
        emoji: og?.emoji ?? "📌",
        // 保存済みの県市を優先、無ければOG推定を表示用に使う
        prefecture: it.prefecture || og?.prefecture || "",
        city: it.city || og?.city || "",
      };
    });
  }, [items, ogMap]);

  type EnrichedItem = (typeof enriched)[number];

  const detail = useMemo(
    () => enriched.find((it) => it.id === detailId) ?? null,
    [enriched, detailId],
  );

  const openDetail = (it: EnrichedItem) => {
    setDetailId(it.id);
    // 編集欄は「保存済み or 自動取得」の値で初期化（違っていれば直して保存）
    setEditName(it.storeName);
    setEditPref(it.prefecture);
    setEditCity(it.city);
  };

  const closeDetail = () => {
    setDetailId(null);
    setSavingLoc(false);
  };

  const saveLocation = async () => {
    if (!detail) return;
    setSavingLoc(true);
    const { error } = await supabase
      .from("events")
      .update({
        place_name: editName.trim() || null,
        prefecture: editPref || null,
        city: editCity.trim() || null,
      })
      .eq("id", detail.id);
    setSavingLoc(false);

    if (error) {
      if (error.code === "42703" || error.code === "PGRST204") {
        show("保存にはSQL（place_name/prefecture/city列の追加）の実行が必要です。", "error");
      } else {
        show("保存に失敗しました", "error");
      }
      return;
    }

    // ローカル状態を更新
    setItems((prev) =>
      prev.map((x) =>
        x.id === detail.id
          ? { ...x, placeName: editName.trim(), prefecture: editPref, city: editCity.trim() }
          : x,
      ),
    );
    show("保存しました", "success");
  };

  const genres = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number }>();
    enriched.forEach((it) => {
      const cur = map.get(it.genre);
      if (cur) cur.count += 1;
      else map.set(it.genre, { emoji: it.emoji, count: 1 });
    });
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

  // 市区町村プルダウンの候補（既に使った市区町村＋定番候補）
  const cityOptions = useMemo(() => {
    const set = new Set<string>(CITY_SUGGESTIONS);
    enriched.forEach((it) => {
      if (it.city) set.add(it.city);
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

  // 地図のピン（絞り込み後 かつ 座標があるものだけ）
  const mapPoints: MapPoint[] = useMemo(() => {
    return visible
      .filter((it) => coords[it.id])
      .map((it) => {
        const c = coords[it.id];
        return {
          id: it.id,
          lat: c.lat,
          lng: c.lng,
          storeName: it.storeName,
          genre: it.genre,
          area: [it.prefecture, it.city].filter(Boolean).join(" "),
          color: genreColor(it.genre),
          url: normalizeUrl(it.url),
          mapUrl: mapUrlOf([it.storeName, it.prefecture, it.city]),
        };
      });
  }, [visible, coords]);

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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--fg-muted)]">
            予定に登録したURLを、お店のジャンル別にまとめています。カードを押すと詳細が開き、場所の追加やリンクを開けます。
          </p>
          <button className="btn btn-primary shrink-0" onClick={openMap}>
            🗺️ 地図で見る
          </button>
        </div>

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
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => openDetail(it)}
                    className="group flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3 text-left transition hover:border-[var(--accent)]"
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
                    </div>
                  </button>
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
            className="confirm-card max-w-md"
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
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="badge badge-slate">
                {format(detail.date, "yyyy/M/d", { locale: ja })} に予定
              </span>
              {detail.ownerName && (
                <span className="badge badge-slate">👥 {detail.ownerName}</span>
              )}
            </div>

            {detail.eventTitle && detail.eventTitle !== detail.storeName && (
              <p className="mt-3 text-xs text-[var(--fg-muted)]">予定名: {detail.eventTitle}</p>
            )}
            {detail.note && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--fg-muted)]">{detail.note}</p>
            )}

            {/* 店名・場所の追加・編集 */}
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
              <p className="text-xs font-bold text-[var(--fg-muted)]">店名・場所（URLから自動取得・違っていれば修正できます）</p>
              {detail.ownerName ? (
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
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <select
                      className="field-input"
                      value={editPref}
                      onChange={(e) => setEditPref(e.target.value)}
                    >
                      <option value="">都道府県</option>
                      {PREFECTURES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      className="field-input"
                      list="city-suggestions"
                      placeholder="市区町村を選択／入力"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                    />
                    <datalist id="city-suggestions">
                      {cityOptions.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
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

      {/* 地図オーバーレイ */}
      {showMap && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-lg font-black text-[var(--fg-strong)]">🗺️ 地図で見る</h2>
            <div className="flex items-center gap-2">
              {geocoding && (
                <span className="text-xs text-[var(--fg-muted)]">
                  座標取得中… {geocodeProgress.done}/{geocodeProgress.total}
                </span>
              )}
              <button className="btn btn-soft" onClick={() => setShowMap(false)}>
                閉じる
              </button>
            </div>
          </div>

          {/* 検索・ジャンル絞り込み */}
          <div className="border-b border-[var(--border)] px-4 py-2">
            <div className="search-input flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--fg-muted)]" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
                placeholder="店名・ジャンル・地名で検索"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="text-xs text-[var(--fg-muted)]" onClick={() => setQuery("")}>
                  クリア
                </button>
              )}
            </div>
            {genres.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                <button
                  className={`chip shrink-0 ${activeGenre === "all" ? "chip-active" : ""}`}
                  onClick={() => setActiveGenre("all")}
                >
                  すべて
                </button>
                {genres.map((g) => (
                  <button
                    key={g.genre}
                    className={`chip shrink-0 ${activeGenre === g.genre ? "chip-active" : ""}`}
                    onClick={() => setActiveGenre(g.genre)}
                  >
                    {g.emoji} {g.genre}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 地図本体 */}
          <div className="relative flex-1">
            <LinksMap points={mapPoints} />
            {mapPoints.length === 0 && !geocoding && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <span className="rounded-full bg-[var(--surface-glass-strong)] px-4 py-2 text-xs text-[var(--fg-muted)] shadow">
                  表示できる場所がありません（座標を取得できた店だけ表示されます）
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-[var(--border)] px-4 py-2 text-center text-xs text-[var(--fg-muted)]">
            {mapPoints.length} 件を表示中 ・ 地図データ © OpenStreetMap contributors
          </div>
        </div>
      )}

      <MobileNavigation />
    </main>
  );
}
