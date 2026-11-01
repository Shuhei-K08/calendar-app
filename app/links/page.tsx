"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShopInfo, type ShopDetails } from "@/app/components/ShopInfo";
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
  details?: ShopDetails;
  storeName: string;
  mainGenre: string; // 大きいジャンル（例: グルメ・飲食）。判定できなければ空
  subGenre: string; // 細かいジャンル（例: 居酒屋）。無ければ空
  prefecture: string;
  city: string;
};

type WishRow = {
  id: string;
  user_id: string;
  url: string;
  title: string | null;
  genre: string | null;
  note: string | null;
  prefecture?: string | null;
  city?: string | null;
  created_at: string;
};
type WishSpot = WishRow & { ownerName: string | null };

const WISH_COLS = "id, user_id, url, title, genre, note, prefecture, city, created_at";
const WISH_BASE_COLS = "id, user_id, url, title, genre, note, created_at";
const isMissingColumn = (code?: string) => code === "42703" || code === "PGRST204";
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";
const nowMs = () => Date.now();

type ToastItem = { id: number; msg: string; type: "success" | "error" | "info" };

const FULL_COLS =
  "id, title, start_at, url, note, prefecture, city, place_name, category_id, user_id, event_visibility, is_favorite, link_genre";
const BASE_COLS = "id, title, start_at, url, note, category_id, user_id, event_visibility";

const UNCATEGORIZED = "未設定";

// ジャンルのプルダウン候補（OGの自動判定と同じ分類＋絵文字）
const GENRE_GROUPS: { label: string; options: { name: string; emoji: string }[] }[] = [
  {
    label: "グルメ・飲食",
    options: [
      { name: "居酒屋", emoji: "🍻" }, { name: "寿司・海鮮", emoji: "🍣" },
      { name: "焼肉", emoji: "🥩" }, { name: "焼き鳥", emoji: "🍢" },
      { name: "鉄板焼", emoji: "🍳" }, { name: "ラーメン", emoji: "🍜" },
      { name: "うどん・そば", emoji: "🍝" }, { name: "天ぷら", emoji: "🍤" },
      { name: "とんかつ", emoji: "🥩" }, { name: "しゃぶしゃぶ・鍋", emoji: "🫕" },
      { name: "お好み焼き", emoji: "🥞" }, { name: "ステーキ", emoji: "🥩" },
      { name: "ハンバーガー", emoji: "🍔" }, { name: "カレー", emoji: "🍛" },
      { name: "中華", emoji: "🥡" }, { name: "韓国料理", emoji: "🌶️" },
      { name: "タイ料理", emoji: "🌿" }, { name: "インド料理", emoji: "🫔" },
      { name: "イタリアン", emoji: "🍝" }, { name: "フレンチ", emoji: "🥐" },
      { name: "カフェ", emoji: "☕" }, { name: "スイーツ・パティスリー", emoji: "🍰" },
      { name: "パン・ベーカリー", emoji: "🍞" }, { name: "食べ放題", emoji: "🍱" },
      { name: "バー", emoji: "🍸" }, { name: "ベジタリアン・ヴィーガン", emoji: "🥗" },
    ],
  },
  { label: "旅行・宿泊", options: [
    { name: "ホテル", emoji: "🏨" }, { name: "旅館", emoji: "🏯" },
    { name: "リゾート", emoji: "🏖️" }, { name: "民泊", emoji: "🏠" }, { name: "温泉", emoji: "♨️" },
  ] },
  { label: "アウトドア", options: [
    { name: "キャンプ", emoji: "🏕️" }, { name: "登山・ハイキング", emoji: "⛰️" },
    { name: "釣り", emoji: "🎣" }, { name: "サーフィン", emoji: "🏄" }, { name: "BBQ", emoji: "🔥" },
  ] },
  { label: "スポーツ", options: [
    { name: "野球", emoji: "⚾" }, { name: "サッカー", emoji: "⚽" },
    { name: "バスケ", emoji: "🏀" }, { name: "ラグビー", emoji: "🏉" },
  ] },
  { label: "フィットネス", options: [
    { name: "ヨガ・ピラティス", emoji: "🧘" }, { name: "ジム", emoji: "🏋️" },
  ] },
  { label: "ショッピング", options: [
    { name: "ファッション", emoji: "👗" }, { name: "家電", emoji: "💻" },
    { name: "ドラッグストア", emoji: "💊" }, { name: "スーパーマーケット", emoji: "🛒" },
    { name: "デパート", emoji: "🏬" }, { name: "アウトレット", emoji: "🏷️" },
  ] },
  { label: "エンタメ", options: [
    { name: "映画", emoji: "🎬" }, { name: "音楽・ライブ", emoji: "🎵" },
    { name: "美術館・博物館", emoji: "🏛️" }, { name: "テーマパーク", emoji: "🎡" },
  ] },
  { label: "自動車", options: [
    { name: "新車・中古車", emoji: "🚘" }, { name: "カー用品", emoji: "🔧" },
  ] },
  { label: "バイク", options: [
    { name: "ツーリング", emoji: "🛣️" }, { name: "バイク用品", emoji: "🪖" },
  ] },
  { label: "医療・クリニック", options: [
    { name: "歯科", emoji: "🦷" }, { name: "皮膚科", emoji: "🩺" }, { name: "眼科", emoji: "👁️" },
  ] },
  { label: "美容", options: [
    { name: "ヘアサロン", emoji: "✂️" }, { name: "ネイル", emoji: "💅" }, { name: "エステ", emoji: "🧖" },
  ] },
  { label: "不動産", options: [
    { name: "賃貸", emoji: "🔑" }, { name: "売買", emoji: "📝" },
  ] },
  { label: "株・投資", options: [
    { name: "株式", emoji: "📊" }, { name: "FX", emoji: "💱" }, { name: "仮想通貨", emoji: "₿" },
  ] },
  { label: "その他", options: [
    { name: "その他", emoji: "📌" },
  ] },
];

const GENRE_EMOJI: Record<string, string> = Object.fromEntries(
  GENRE_GROUPS.flatMap((g) => g.options.map((o) => [o.name, o.emoji])),
);
const MAIN_EMOJI: Record<string, string> = {
  "グルメ・飲食": "🍽️", "旅行・宿泊": "✈️", "アウトドア": "🏕️", "スポーツ": "🏟️",
  "フィットネス": "💪", "ショッピング": "🛍️", "エンタメ": "🎭", "自動車": "🚗",
  "バイク": "🏍️", "医療・クリニック": "🏥", "美容": "💇", "不動産": "🏠", "株・投資": "📈",
  "その他": "📌",
};
const ALL_GENRE_SET = new Set(Object.keys(GENRE_EMOJI));
const MAIN_GENRE_SET = new Set(GENRE_GROUPS.map((g) => g.label));
// 細かいジャンル → 大きいジャンル（例: 居酒屋 → グルメ・飲食）
const SUB_TO_MAIN: Record<string, string> = Object.fromEntries(
  GENRE_GROUPS.flatMap((g) => g.options.filter((o) => o.name !== g.label).map((o) => [o.name, g.label])),
);
const genreEmoji = (name: string) => GENRE_EMOJI[name] ?? MAIN_EMOJI[name] ?? "🏷️";
const mainEmoji = (name: string) => MAIN_EMOJI[name] ?? "📌";

// カードの上部の色（大きいジャンルごと）
const GENRE_TILE: Record<string, string> = {
  "グルメ・飲食": "#fde8d7", "旅行・宿泊": "#dcebfa", "アウトドア": "#e3efd9", "スポーツ": "#dcebfa",
  "フィットネス": "#e3efd9", "ショッピング": "#ece6fb", "エンタメ": "#f9e0ec", "美容": "#f9e0ec",
  "医療・クリニック": "#ddf0ea",
};
const genreTile = (main: string) => GENRE_TILE[main] ?? "#ebe8e1";

// 保存されたジャンル名を「大きいジャンル＋細かいジャンル」に分ける
// - 大きいジャンル名（例: グルメ・飲食）→ 細かいジャンルなし
// - 細かいジャンル名（例: 居酒屋）→ 大きいジャンルを補う
// - 一覧に無い自由入力の名前 → 「その他」の中の細かいジャンル扱い
const splitGenre = (name: string): { main: string; sub: string } => {
  const n = name.trim();
  if (!n) return { main: "", sub: "" };
  if (MAIN_GENRE_SET.has(n)) return { main: n, sub: "" };
  if (SUB_TO_MAIN[n]) return { main: SUB_TO_MAIN[n], sub: n };
  return { main: "その他", sub: n };
};

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

// 同じお店かどうかを見分けるためのキー。URLの細かな違い（末尾の/、www.、食べログのスマホ版 s.、
// ?以降の付け足し、#）は無視する。Googleマップなど ? の中身で場所が決まるものは残す
const spotKey = (url: string) => {
  try {
    const u = new URL(normalizeUrl(url.trim()));
    let host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (/(^|\.)tabelog\.com$/.test(host)) host = host.replace(/^s\./, "");
    const keepQuery = /google\.|goo\.gl|maps\.app|youtube\.com/.test(host);
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "").toLowerCase();
    return `${host}${path}${keepQuery ? u.search : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
};

const hostOf = (url: string) => {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// 店名が取れないときに表示するURL（https:// を省き、日本語も読める形に）
const shortUrl = (url: string) => {
  const raw = normalizeUrl(url).replace(/^https?:\/\//i, "").replace(/\/$/, "");
  try {
    return decodeURI(raw);
  } catch {
    return raw;
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

// /api/og の結果を表示用にそろえる
type OgResponse = {
  title?: string;
  siteName?: string;
  main?: { label?: string } | null;
  subs?: { label?: string }[];
  prefecture?: string;
  city?: string;
  details?: ShopDetails;
};
function toOgInfo(d: OgResponse): OgInfo {
  const subLabel: string = (d.subs ?? [])[0]?.label ?? "";
  const mainLabel: string = d.main?.label ?? (subLabel ? SUB_TO_MAIN[subLabel] ?? "" : "");
  return {
    storeName: cleanStoreName(d.title || d.siteName || ""),
    mainGenre: mainLabel,
    subGenre: subLabel,
    prefecture: d.prefecture ?? "",
    city: d.city ?? "",
    details: d.details ?? undefined,
  };
}

export default function LinksPage() {
  const [items, setItems] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ogMap, setOgMap] = useState<Record<string, OgInfo>>({});
  const [ogLoading, setOgLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState<string>("all");
  const [activeSubGenre, setActiveSubGenre] = useState<string>("all");
  const [activePrefecture, setActivePrefecture] = useState<string>("all");
  const [favOnly, setFavOnly] = useState(false);
  // 行きたい / 行った
  const [tab, setTab] = useState<"want" | "went">("want");
  const [wishes, setWishes] = useState<WishSpot[]>([]);
  const [wishMissing, setWishMissing] = useState(false);
  const [wishInput, setWishInput] = useState("");
  const [addingWish, setAddingWish] = useState(false);
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
  const [editNote, setEditNote] = useState("");
  const [refetching, setRefetching] = useState(false);
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

    // --- 行きたいスポット（自分＋つながっている相手） ---
    // 場所の列がまだ無いDBでは、場所なしで読み直す
    const wFull = await supabase.from("wish_spots").select(WISH_COLS).order("created_at", { ascending: false });
    const w: { data: unknown[] | null; error: { code?: string } | null } =
      wFull.error && isMissingColumn(wFull.error.code)
        ? await supabase.from("wish_spots").select(WISH_BASE_COLS).order("created_at", { ascending: false })
        : wFull;
    if (w.error) {
      setWishMissing(isMissingTable(w.error.code));
      setWishes([]);
    } else {
      setWishMissing(false);
      const rows = (w.data ?? []) as WishRow[];
      const unknown = Array.from(new Set(rows.map((r) => r.user_id).filter((id) => id !== user.id && !ownerMap.has(id))));
      if (unknown.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", unknown);
        (profiles ?? []).forEach((p) => ownerMap.set(p.id, p.username));
      }
      setWishes(rows.map((r) => ({ ...r, ownerName: r.user_id === user.id ? null : ownerMap.get(r.user_id) ?? "相手" })));
    }

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
    if (items.length === 0 && wishes.length === 0) return;
    const urls = Array.from(new Set([...items.map((it) => normalizeUrl(it.url)), ...wishes.map((w) => normalizeUrl(w.url))]));
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
            ogCache.current[u] = toOgInfo(await r.json());
          } catch {
            ogCache.current[u] = {
              storeName: "",
              mainGenre: "",
              subGenre: "",
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
  }, [items, wishes]);

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
        // 手入力した店名を最優先、無ければOG店名。どちらも無ければ空（表示はURL。予定の件名は使わない）
        storeName: (it.placeName || og?.storeName || "").trim(),
        // 手動ジャンルを最優先、無ければOG判定。どちらも「大きいジャンル＋細かいジャンル」にそろえる
        ...(() => {
          const g = it.linkGenre
            ? splitGenre(it.linkGenre)
            : { main: og?.mainGenre ?? "", sub: og?.subGenre ?? "" };
          const main = g.main || UNCATEGORIZED;
          return {
            genre: main,
            subGenre: g.sub,
            emoji: main === UNCATEGORIZED ? "📌" : mainEmoji(main),
            subEmoji: g.sub ? genreEmoji(g.sub) : "",
          };
        })(),
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
    genre: string; // 大きいジャンル
    subGenre: string; // 細かいジャンル（無ければ空）
    emoji: string;
    subEmoji: string;
    prefecture: string;
    city: string;
    placeName: string;
    linkGenre: string;
    isFavorite: boolean;
    hasOwn: boolean;
    ownIds: string[];
    occurrences: LinkOccurrence[];
    latestDate: Date;
    hasPast: boolean; // 予定日が過ぎたものがある = 行った
    nextDate: Date | null; // これからの予定（いちばん近い日）
    wishId: string | null; // 行きたいリストに入っていれば、その行のid
    wishMine: boolean;
    wishBy: string | null; // 追加した人（自分なら null）
    wishNote: string;
  };

  // 同じURLの予定をまとめる（1URL = 1カード、予定日は複数）
  const urlGroups = useMemo<LinkGroup[]>(() => {
    const map = new Map<string, EnrichedItem[]>();
    for (const it of enriched) {
      const key = spotKey(it.url);
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    const todayStart = (() => {
      const d = new Date(nowMs());
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();
    const groups: LinkGroup[] = Array.from(map.entries())
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => b.date.getTime() - a.date.getTime());
        const own = sorted.filter((x) => x.ownerName === null);
        const rep = own[0] ?? sorted[0];
        return {
          key,
          url: rep.url,
          storeName: rep.storeName,
          genre: rep.genre,
          subGenre: rep.subGenre,
          emoji: rep.emoji,
          subEmoji: rep.subEmoji,
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
          hasPast: sorted.some((x) => x.date.getTime() < todayStart),
          nextDate:
            [...sorted].reverse().find((x) => x.date.getTime() >= todayStart)?.date ?? null,
          wishId: null as string | null,
          wishMine: false,
          wishBy: null as string | null,
          wishNote: "",
        };
      });

    // 行きたいリストを重ねる（同じURLの予定があればそこに印を付け、無ければ新しいカードにする）
    const byKey = new Map(groups.map((g) => [g.key, g]));
    for (const w of wishes) {
      const key = spotKey(w.url);
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.wishId || w.ownerName === null) {
          existing.wishId = w.id;
          existing.wishMine = w.ownerName === null;
          existing.wishBy = w.ownerName;
          existing.wishNote = w.note ?? "";
        }
        continue;
      }
      const og = ogMap[normalizeUrl(w.url)];
      const g = w.genre ? splitGenre(w.genre) : { main: og?.mainGenre ?? "", sub: og?.subGenre ?? "" };
      const main = g.main || UNCATEGORIZED;
      const created = new Date(w.created_at);
      const wishGroup: LinkGroup = {
        key,
        url: w.url,
        storeName: (w.title || og?.storeName || "").trim(),
        genre: main,
        subGenre: g.sub,
        emoji: main === UNCATEGORIZED ? "📌" : mainEmoji(main),
        subEmoji: g.sub ? genreEmoji(g.sub) : "",
        prefecture: w.prefecture || og?.prefecture || "",
        city: w.city || og?.city || "",
        placeName: w.title ?? "",
        linkGenre: w.genre ?? "",
        isFavorite: false,
        hasOwn: false,
        ownIds: [],
        occurrences: [],
        latestDate: created,
        hasPast: false,
        nextDate: null,
        wishId: w.id,
        wishMine: w.ownerName === null,
        wishBy: w.ownerName,
        wishNote: w.note ?? "",
      };
      byKey.set(key, wishGroup);
      groups.push(wishGroup);
    }
    return groups.sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
  }, [enriched, wishes, ogMap]);

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
    // 手動 or 自動で割り当て済みのジャンルを初期表示（細かいジャンルがあればそちら、未設定のときだけ空）
    setEditGenre(g.genre === UNCATEGORIZED ? "" : g.subGenre || g.genre);
    setEditNote(g.wishNote);
    if (g.prefecture) void loadCities(g.prefecture);
  };

  const closeDetail = () => {
    setDetailKey(null);
    setExpandedOccId(null);
    setSavingLoc(false);
  };

  // 行きたいリストに追加（URLを貼るだけ。店名・ジャンルはURLから自動取得）
  const addWish = async (raw?: string) => {
    const text = (raw ?? wishInput).trim();
    const url = text.match(/https?:\/\/[^\s]+/)?.[0] ?? (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text) ? normalizeUrl(text) : "");
    if (!url) {
      show("お店のURLを貼り付けてください", "error");
      return;
    }
    const key = spotKey(url);
    if (urlGroups.some((g) => g.key === key && g.wishId)) {
      show("もう行きたいリストに入っています", "info");
      setWishInput("");
      return;
    }
    setAddingWish(true);
    let info: OgInfo | null = null;
    try {
      const r = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
      if (r.ok) {
        info = toOgInfo(await r.json());
        ogCache.current[normalizeUrl(url)] = info;
        setOgMap({ ...ogCache.current });
      }
    } catch {
      /* 店名が取れなくても保存する */
    }
    const { data, error } = await supabase
      .from("wish_spots")
      .insert({ url, title: info?.storeName || null, genre: info?.subGenre || info?.mainGenre || null })
      .select(WISH_BASE_COLS)
      .single();
    setAddingWish(false);
    if (error) {
      if (isMissingTable(error.code)) {
        setWishMissing(true);
        show("行きたいリストを使うにはSQL（supabase-wish-spots.sql）を実行してください。", "error");
      } else {
        show("追加に失敗しました", "error");
      }
      return;
    }
    setWishes((prev) => [{ ...(data as WishRow), ownerName: null }, ...prev]);
    setWishInput("");
    setTab("want");
    show(`${info?.storeName || "お店"}を行きたいに追加しました`, "success");
  };

  const pasteWish = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setWishInput(text);
        void addWish(text);
      }
    } catch {
      show("長押しして貼り付けてください", "info");
    }
  };

  const removeWish = async (id: string) => {
    const prev = wishes;
    setWishes((list) => list.filter((w) => w.id !== id));
    closeDetail();
    const { error } = await supabase.from("wish_spots").delete().eq("id", id);
    if (error) {
      setWishes(prev);
      show("外せませんでした", "error");
    } else {
      show("行きたいリストから外しました", "success");
    }
  };

  // お店の情報をURLから取り直す。店名・ジャンル・場所が空なら編集欄にも入れる
  const refetchShop = async (g: { url: string }) => {
    setRefetching(true);
    try {
      const r = await fetch(`/api/og?url=${encodeURIComponent(normalizeUrl(g.url))}&t=${nowMs()}`);
      if (!r.ok) throw new Error();
      const info = toOgInfo(await r.json());
      ogCache.current[normalizeUrl(g.url)] = info;
      setOgMap({ ...ogCache.current });
      if (!editName.trim() && info.storeName) setEditName(info.storeName);
      if (!editGenre && (info.subGenre || info.mainGenre)) setEditGenre(info.subGenre || info.mainGenre);
      if (!editPref && info.prefecture) {
        setEditPref(info.prefecture);
        void loadCities(info.prefecture);
        if (info.city) setEditCity(info.city);
      }
      const d = info.details;
      const got = d && Object.values(d).some(Boolean);
      show(got ? "お店の情報を取り直しました" : info.storeName ? "店名は取れましたが、詳しい情報は取れませんでした" : "このページからは情報が取れませんでした", got ? "success" : "info");
    } catch {
      show("情報を取得できませんでした", "error");
    } finally {
      setRefetching(false);
    }
  };

  const planHref = (g: { url: string; storeName: string }) =>
    `/?new=1&url=${encodeURIComponent(normalizeUrl(g.url))}${g.storeName ? `&title=${encodeURIComponent(g.storeName)}` : ""}`;

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

  // 行きたいリストの行を保存（店名・ジャンル・場所・メモ）
  const saveWish = async (wishId: string) => {
    const full = {
      title: editName.trim() || null,
      genre: editGenre.trim() || null,
      note: editNote.trim() || null,
      prefecture: editPref || null,
      city: editCity.trim() || null,
    };
    let { error } = await supabase.from("wish_spots").update(full).eq("id", wishId);
    let locationSaved = true;
    if (error && isMissingColumn(error.code)) {
      // 場所の列がまだ無いDBでは、場所を外して保存
      const { prefecture: _p, city: _c, ...rest } = full;
      void _p;
      void _c;
      ({ error } = await supabase.from("wish_spots").update(rest).eq("id", wishId));
      locationSaved = false;
    }
    if (error) return { ok: false, locationSaved };
    setWishes((prev) =>
      prev.map((w) =>
        w.id === wishId
          ? { ...w, ...full, ...(locationSaved ? {} : { prefecture: w.prefecture, city: w.city }) }
          : w,
      ),
    );
    return { ok: true, locationSaved };
  };

  const saveLocation = async () => {
    if (!detail) return;
    const wishId = detail.wishMine ? detail.wishId : null;
    if (!detail.hasOwn && !wishId) return;
    setSavingLoc(true);

    // 行きたいリストだけのお店
    if (!detail.hasOwn && wishId) {
      const r = await saveWish(wishId);
      setSavingLoc(false);
      if (!r.ok) {
        show("保存に失敗しました", "error");
      } else if (!r.locationSaved) {
        show("場所を保存するにはSQL（supabase-wish-spots-location.sql）を実行してください。ほかは保存しました。", "error");
      } else {
        show("保存しました", "success");
      }
      return;
    }
    if (wishId) await saveWish(wishId);

    const ids = detail.ownIds;

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

  // 行きたい = まだ行っていない（行きたいリスト＋これからの予定）、行った = 予定日が過ぎたもの
  const wantGroups = useMemo(() => urlGroups.filter((g) => !g.hasPast), [urlGroups]);
  const wentGroups = useMemo(() => urlGroups.filter((g) => g.hasPast), [urlGroups]);
  const tabGroups = tab === "want" ? wantGroups : wentGroups;

  const genres = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number }>();
    tabGroups.forEach((g) => {
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
  }, [tabGroups]);

  // 大きいジャンルを選んでいるときだけ、その中の細かいジャンルで絞り込める
  const subGenres = useMemo(() => {
    if (activeGenre === "all") return [];
    const map = new Map<string, { emoji: string; count: number }>();
    tabGroups.forEach((g) => {
      if (g.genre !== activeGenre || !g.subGenre) return;
      const cur = map.get(g.subGenre);
      if (cur) cur.count += 1;
      else map.set(g.subGenre, { emoji: g.subEmoji, count: 1 });
    });
    return Array.from(map.entries())
      .map(([genre, v]) => ({ genre, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [tabGroups, activeGenre]);

  const prefectures = useMemo(() => {
    const set = new Set<string>();
    tabGroups.forEach((g) => {
      if (g.prefecture) set.add(g.prefecture);
    });
    return Array.from(set);
  }, [tabGroups]);

  const favCount = useMemo(() => tabGroups.filter((g) => g.isFavorite).length, [tabGroups]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tabGroups.filter((g) => {
      if (favOnly && !g.isFavorite) return false;
      if (activeGenre !== "all" && g.genre !== activeGenre) return false;
      if (activeSubGenre !== "all" && g.subGenre !== activeSubGenre) return false;
      if (activePrefecture !== "all" && g.prefecture !== activePrefecture) return false;
      if (!q) return true;
      return (
        g.storeName.toLowerCase().includes(q) ||
        g.url.toLowerCase().includes(q) ||
        g.genre.toLowerCase().includes(q) ||
        g.subGenre.toLowerCase().includes(q) ||
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
  }, [tabGroups, query, activeGenre, activeSubGenre, activePrefecture, favOnly]);

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
              <h1 className="mt-1 text-2xl font-black text-[var(--fg-strong)]">スポット</h1>
            </div>
          </div>
          <DesktopNavigation />
        </header>

        <div className="spot-tabs" role="tablist" aria-label="表示切り替え">
          <button type="button" role="tab" aria-selected={tab === "want"} onClick={() => setTab("want")}>
            行きたい <span>{wantGroups.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "went"} onClick={() => setTab("went")}>
            行った <span>{wentGroups.length}</span>
          </button>
        </div>

        {tab === "want" && (
          <form
            className="wish-add"
            onSubmit={(e) => {
              e.preventDefault();
              void addWish();
            }}
          >
            <svg viewBox="0 0 24 24" className="wish-add-icon" aria-hidden="true">
              <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <input
              type="text"
              inputMode="url"
              aria-label="お店のURL"
              placeholder="いいなと思ったお店のURLを貼る"
              value={wishInput}
              onChange={(e) => setWishInput(e.target.value)}
              disabled={addingWish}
            />
            {wishInput.trim() ? (
              <button type="submit" disabled={addingWish}>{addingWish ? "追加中…" : "追加"}</button>
            ) : (
              <button type="button" onClick={() => void pasteWish()} disabled={addingWish}>貼り付け</button>
            )}
          </form>
        )}
        {tab === "want" && wishMissing && (
          <p className="wish-sql-note">行きたいリストを使うには、Supabase の SQL Editor で supabase-wish-spots.sql を1回実行してください。</p>
        )}

        {/* 検索 */}
        <section className="glass-card p-3">
          <div className="flex gap-2">
          <div className="search-input flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-3">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--fg-muted)]" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          {prefectures.length > 0 && (
            <label className="spot-area">
              <span className="sr-only">エリア</span>
              <select value={activePrefecture} onChange={(e) => setActivePrefecture(e.target.value)}>
                <option value="all">全エリア</option>
                {prefectures.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
          </div>

          {/* 絞り込み: 1行ずつ横にスクロール（縦に伸びないように） */}
          {genres.length > 0 && (
            <div className="spot-filter-row mt-3">
              <button
                type="button"
                className={`chip spot-chip ${favOnly ? "chip-active" : ""}`}
                onClick={() => setFavOnly((v) => !v)}
                aria-pressed={favOnly}
              >
                ★ お気に入り {favCount}
              </button>
              <button
                type="button"
                className={`chip spot-chip ${activeGenre === "all" && !favOnly ? "chip-active" : ""}`}
                onClick={() => {
                  setActiveGenre("all");
                  setActiveSubGenre("all");
                  setFavOnly(false);
                }}
              >
                すべて {tabGroups.length}
              </button>
              {genres.map((g) => (
                <button
                  type="button"
                  key={g.genre}
                  className={`chip spot-chip ${activeGenre === g.genre ? "chip-active" : ""}`}
                  onClick={() => {
                    setActiveGenre(activeGenre === g.genre ? "all" : g.genre);
                    setActiveSubGenre("all");
                  }}
                >
                  {g.emoji} {g.genre} <span className="spot-chip-count">{g.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* 細かいジャンル（大きいジャンルを選んだときだけ・小さめ） */}
          {subGenres.length > 0 && (
            <div className="spot-filter-row spot-filter-sub mt-2">
              <button
                type="button"
                className={`spot-subchip ${activeSubGenre === "all" ? "is-active" : ""}`}
                onClick={() => setActiveSubGenre("all")}
              >
                {activeGenre}すべて
              </button>
              {subGenres.map((g) => (
                <button
                  type="button"
                  key={g.genre}
                  className={`spot-subchip ${activeSubGenre === g.genre ? "is-active" : ""}`}
                  onClick={() => setActiveSubGenre(g.genre)}
                >
                  {g.genre} {g.count}
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
              {tabGroups.length === 0
                ? tab === "want"
                  ? "いいなと思ったお店のURLを上に貼ると、ここに並びます。"
                  : "まだ行ったスポットがありません。お店のURL付きの予定の日が過ぎると、ここに並びます。"
                : "条件に合うスポットが見つかりませんでした。"}
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
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {group.items.map((g) => (
                  <div key={g.key} className="relative min-w-0">
                    <button type="button" onClick={() => openDetail(g)} className="link-card">
                      <span className="link-card-thumb" style={{ backgroundColor: genreTile(g.genre) }}>
                        {faviconOf(g.url) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={faviconOf(g.url)} alt="" className="h-8 w-8 rounded-lg bg-white p-1" />
                        ) : (
                          <span className="text-2xl" aria-hidden="true">{g.emoji}</span>
                        )}
                        {!g.hasOwn && !g.wishMine && <span className="link-card-shared">{g.wishBy ?? "共有"}</span>}
                      </span>
                      <span className="link-card-body">
                        <span className={`link-card-name ${g.storeName ? "" : "is-url"}`}>{g.storeName || shortUrl(g.url)}</span>
                        <span className="link-card-meta">
                          {[g.subGenre || g.genre, g.city || g.prefecture].filter((v) => v && v !== "未設定").join(" ・ ") || hostOf(g.url)}
                        </span>
                        {tab === "want" ? (
                          <span className="link-card-date">
                            {g.nextDate ? (
                              <span className="wish-planned">{format(g.nextDate, "M/d", { locale: ja })} に予定あり</span>
                            ) : (
                              `${g.wishBy ?? "わたし"}が追加`
                            )}
                          </span>
                        ) : (
                          <span className="link-card-date">
                            {(() => {
                              const past = g.occurrences.filter((o) => !g.nextDate || o.date.getTime() < g.nextDate.getTime());
                              const last = past[0]?.date ?? g.latestDate;
                              return `${past.length > 1 ? `${past.length}回 ・ 最近 ` : ""}${format(last, "M/d", { locale: ja })}`;
                            })()}
                            {g.nextDate && <span className="wish-planned ml-1">次は {format(g.nextDate, "M/d", { locale: ja })}</span>}
                          </span>
                        )}
                      </span>
                    </button>
                    {g.hasOwn && (
                      <button
                        type="button"
                        aria-label={g.isFavorite ? "お気に入りを解除" : "お気に入りに追加"}
                        aria-pressed={g.isFavorite}
                        onClick={() => void toggleFavorite(g)}
                        className="link-card-star"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill={g.isFavorite ? "#e8a317" : "none"} stroke={g.isFavorite ? "#e8a317" : "#8e958f"} strokeWidth="2" strokeLinejoin="round">
                          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
                        </svg>
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
                <p className="eyebrow">
                  {detail.emoji} {detail.genre}
                  {detail.subGenre && ` › ${detail.subEmoji} ${detail.subGenre}`}
                </p>
                <h3 className="mt-1 break-words text-lg font-black text-[var(--fg-strong)]">
                  {detail.storeName || shortUrl(detail.url)}
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

            <ShopInfo details={ogMap[normalizeUrl(detail.url)]?.details} loading={(ogLoading && !ogMap[normalizeUrl(detail.url)]) || refetching} />
            <button type="button" className="shop-refetch" disabled={refetching} onClick={() => void refetchShop(detail)}>
              {refetching ? "取得中…" : "お店の情報を取り直す"}
            </button>

            {detail.wishNote && !detail.wishMine && <p className="wish-note">{detail.wishNote}</p>}

            {/* 予定日リスト（日付タップで予定名・メモを表示） */}
            {detail.occurrences.length > 0 && (
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

            )}

            {/* 店名・ジャンル・場所の追加・編集 */}
            {(detail.occurrences.length > 0 || detail.wishId) && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-3">
              <p className="text-xs font-bold text-[var(--fg-muted)]">店名・ジャンル・場所（URLから自動取得・違っていれば修正できます）</p>
              {!detail.hasOwn && !detail.wishMine ? (
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
                    {/* 現在のジャンルが候補に無い場合も選べるよう残す */}
                    {editGenre && !ALL_GENRE_SET.has(editGenre) && !MAIN_GENRE_SET.has(editGenre) && (
                      <option value={editGenre}>{genreEmoji(editGenre)} {editGenre}</option>
                    )}
                    {GENRE_GROUPS.map((grp) => (
                      <optgroup key={grp.label} label={`${mainEmoji(grp.label)} ${grp.label}`}>
                        {/* 細かく決めない場合は大きいジャンルだけ選べる */}
                        {grp.label !== "その他" && (
                          <option value={grp.label}>
                            {mainEmoji(grp.label)} {grp.label}（全般）
                          </option>
                        )}
                        {grp.options.map((o) => (
                          <option key={o.name} value={o.name}>
                            {o.emoji} {o.name}
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
                  {detail.wishMine && (
                    <textarea
                      className="field-input mt-2 w-full"
                      rows={2}
                      placeholder="ひとことメモ（例：記念日に行きたい）"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                    />
                  )}
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

            )}

            {(detail.wishId || !detail.hasPast) && (
              <div className="wish-actions">
                <Link className="btn btn-primary" href={planHref(detail)}>
                  {detail.nextDate ? "別の日にも予定にする" : "予定にする"}
                </Link>
                {detail.wishId && detail.wishMine && (
                  <button type="button" className="wish-remove" onClick={() => void removeWish(detail.wishId as string)}>
                    行きたいリストから外す
                  </button>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <button className="btn btn-soft" onClick={closeDetail}>閉じる</button>
              <div className="flex gap-2">
                {mapUrlOf([detail.storeName, ogMap[normalizeUrl(detail.url)]?.details?.address || [detail.prefecture, detail.city].join(" ")]) && (
                  <a
                    className="btn btn-soft"
                    href={mapUrlOf([detail.storeName, ogMap[normalizeUrl(detail.url)]?.details?.address || [detail.prefecture, detail.city].join(" ")])}
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

