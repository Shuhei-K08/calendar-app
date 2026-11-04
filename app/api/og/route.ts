import { NextResponse } from "next/server";
import { requireUser } from "@/lib/serverAuth";
import { safeFetch } from "@/lib/safeUrl";

type Genre = { label: string; emoji: string };

type MainCategory = {
  label: string;
  emoji: string;
  /** メインカテゴリを決定するパターン */
  patterns: RegExp[];
  /** このカテゴリ内のサブジャンル */
  subGenres: (Genre & { patterns: RegExp[] })[];
};

const MAIN_CATEGORIES: MainCategory[] = [
  {
    label: "グルメ・飲食",
    emoji: "🍽️",
    patterns: [
      /居酒屋|izakaya|レストラン|restaurant|食堂|料理店|ダイニング|dining|定食|ランチ|ディナー|グルメ|gourmet|eatery|tabelog|hotpepper|gurunavi|食べログ|ぐるなび|retty/i,
    ],
    subGenres: [
      // ジャンルが名称にほぼ直接出るもの（誤爆しにくい）
      { label: "居酒屋", emoji: "🍻", patterns: [/居酒屋|izakaya/i] },
      { label: "寿司・海鮮", emoji: "🍣", patterns: [/寿司|鮨|sushi|刺身|海鮮料理/i] },
      { label: "焼肉", emoji: "🥩", patterns: [/焼肉専門|焼き肉|yakiniku/i] },
      { label: "鉄板焼", emoji: "🍳", patterns: [/鉄板焼|鉄板焼き|teppanyaki/i] },
      { label: "焼き鳥", emoji: "🍢", patterns: [/焼き鳥|焼鳥|やきとり|yakitori/i] },
      { label: "ラーメン", emoji: "🍜", patterns: [/ラーメン専門|らーめん|ramen店/i] },
      { label: "うどん・そば", emoji: "🍝", patterns: [/うどん専門|そば専門|蕎麦屋|うどん店/i] },
      { label: "天ぷら", emoji: "🍤", patterns: [/天ぷら専門|天麩羅|tempura/i] },
      { label: "とんかつ", emoji: "🥩", patterns: [/とんかつ|トンカツ|tonkatsu/i] },
      { label: "焼き鳥", emoji: "🍢", patterns: [/焼き鳥|焼鳥|yakitori/i] },
      { label: "しゃぶしゃぶ・鍋", emoji: "🫕", patterns: [/しゃぶしゃぶ|すき焼き|もつ鍋|水炊き|shabu/i] },
      { label: "お好み焼き", emoji: "🥞", patterns: [/お好み焼き|たこ焼き|もんじゃ焼き/i] },
      { label: "ステーキ", emoji: "🥩", patterns: [/ステーキ専門|steak house|ステーキハウス/i] },
      { label: "ハンバーガー", emoji: "🍔", patterns: [/ハンバーガー専門|burger|バーガー/i] },
      { label: "カレー", emoji: "🍛", patterns: [/カレー専門|curry restaurant|カレーライス専門/i] },
      { label: "中華", emoji: "🥡", patterns: [/中華料理|中国料理|chinese restaurant/i] },
      { label: "韓国料理", emoji: "🌶️", patterns: [/韓国料理|korean restaurant|チゲ|ビビンバ|サムギョプサル/i] },
      { label: "タイ料理", emoji: "🌿", patterns: [/タイ料理|thai restaurant|タイ cuisine/i] },
      { label: "インド料理", emoji: "🫔", patterns: [/インド料理|indian restaurant|ナン|タンドール/i] },
      { label: "イタリアン", emoji: "🍝", patterns: [/イタリアン|イタリア料理|italian restaurant|ristorante/i] },
      { label: "フレンチ", emoji: "🥐", patterns: [/フレンチ|フランス料理|french restaurant|bistro|ビストロ/i] },
      { label: "カフェ", emoji: "☕", patterns: [/カフェ|珈琲専門|coffee shop|喫茶店/i] },
      { label: "スイーツ・パティスリー", emoji: "🍰", patterns: [/スイーツ専門|patisserie|パティスリー|洋菓子店/i] },
      { label: "パン・ベーカリー", emoji: "🍞", patterns: [/パン屋|ベーカリー|bakery|ブランジェリー/i] },
      { label: "食べ放題", emoji: "🍱", patterns: [/食べ放題|ビュッフェ|バイキング|buffet/i] },
      { label: "バー", emoji: "🍸", patterns: [/バーラウンジ|cocktail bar|ワインバー|クラフトビール|craft beer/i] },
      { label: "ベジタリアン・ヴィーガン", emoji: "🥗", patterns: [/ベジタリアン|ヴィーガン|vegan|vegetarian/i] },
    ],
  },
  {
    label: "旅行・宿泊",
    emoji: "✈️",
    patterns: [
      /jalan|じゃらん|楽天トラベル|rakuten.travel|一休|ikyu|travel|旅行|宿泊|観光|ツアー/i,
    ],
    subGenres: [
      { label: "ホテル", emoji: "🏨", patterns: [/hotel|ホテル/i] },
      { label: "旅館", emoji: "🏯", patterns: [/旅館|ryokan/i] },
      { label: "リゾート", emoji: "🏖️", patterns: [/リゾート|resort/i] },
      { label: "民泊", emoji: "🏠", patterns: [/airbnb|民泊|ゲストハウス/i] },
      { label: "温泉", emoji: "♨️", patterns: [/温泉|onsen|湯/i] },
    ],
  },
  {
    label: "アウトドア",
    emoji: "🏕️",
    patterns: [
      /キャンプ|camp|アウトドア|outdoor|登山|hiking|トレッキング|trekking|釣り|fishing|サーフィン|surfing|サバゲー|bbq場|バーベキュー場/i,
    ],
    subGenres: [
      { label: "キャンプ", emoji: "🏕️", patterns: [/キャンプ|camp/i] },
      { label: "登山・ハイキング", emoji: "⛰️", patterns: [/登山|ハイキング|hiking|トレッキング/i] },
      { label: "釣り", emoji: "🎣", patterns: [/釣り|fishing|アングラー/i] },
      { label: "サーフィン", emoji: "🏄", patterns: [/サーフィン|surf/i] },
      { label: "BBQ", emoji: "🔥", patterns: [/bbq|バーベキュー場/i] },
    ],
  },
  {
    label: "スポーツ",
    emoji: "🏟️",
    patterns: [
      /スタジアム|stadium|アリーナ|arena|スポーツ観戦|チケット.*(野球|サッカー|バスケ|ラグビー)/i,
    ],
    subGenres: [
      { label: "野球", emoji: "⚾", patterns: [/野球|baseball/i] },
      { label: "サッカー", emoji: "⚽", patterns: [/サッカー|soccer|football/i] },
      { label: "バスケ", emoji: "🏀", patterns: [/バスケ|basketball/i] },
      { label: "ラグビー", emoji: "🏉", patterns: [/ラグビー|rugby/i] },
    ],
  },
  {
    label: "フィットネス",
    emoji: "💪",
    patterns: [
      /ジム|gym|フィットネス|fitness|スポーツクラブ|yoga|ヨガ|pilates|ピラティス/i,
    ],
    subGenres: [
      { label: "ヨガ・ピラティス", emoji: "🧘", patterns: [/yoga|ヨガ|pilates|ピラティス/i] },
      { label: "ジム", emoji: "🏋️", patterns: [/ジム|gym|筋トレ/i] },
    ],
  },
  {
    label: "ショッピング",
    emoji: "🛍️",
    patterns: [
      /amazon|楽天市場|メルカリ|mercari|yahoo.*ショッピング|ショッピングモール|百貨店|デパート|アウトレット/i,
    ],
    subGenres: [
      { label: "ファッション", emoji: "👗", patterns: [/ファッション|fashion|アパレル|apparel/i] },
      { label: "家電", emoji: "💻", patterns: [/家電|electronics|ヨドバシ|ビックカメラ|ヤマダ/i] },
      { label: "ドラッグストア", emoji: "💊", patterns: [/ドラッグストア|drugstore|薬局|マツモトキヨシ|マツキヨ|ウエルシア|スギ薬局|ツルハ|ココカラ/i] },
      { label: "スーパーマーケット", emoji: "🛒", patterns: [/スーパーマーケット|supermarket|イオン|aeon|西友|ライフ|まいばすけっと|業務スーパー/i] },
      { label: "デパート", emoji: "🏬", patterns: [/百貨店|デパート|department store|伊勢丹|高島屋|三越|大丸|そごう|阪急百貨店/i] },
      { label: "アウトレット", emoji: "🏷️", patterns: [/アウトレット|outlet/i] },
    ],
  },
  {
    label: "エンタメ",
    emoji: "🎭",
    patterns: [
      /映画館|cinema|コンサート|concert|ライブ|live house|美術館|博物館|museum|テーマパーク|遊園地/i,
    ],
    subGenres: [
      { label: "映画", emoji: "🎬", patterns: [/映画館|cinema|movie/i] },
      { label: "音楽・ライブ", emoji: "🎵", patterns: [/コンサート|concert|ライブ|live house/i] },
      { label: "美術館・博物館", emoji: "🏛️", patterns: [/美術館|博物館|museum|gallery/i] },
      { label: "テーマパーク", emoji: "🎡", patterns: [/テーマパーク|遊園地|ディズニー|universal/i] },
    ],
  },
  {
    label: "自動車",
    emoji: "🚗",
    patterns: [
      /カーディーラー|car dealer|中古車|新車|ディーラー|トヨタ|ホンダ|日産|マツダ|スバル|レクサス|bmw|mercedes|audi|volkswagen|オートバックス|カーショップ/i,
    ],
    subGenres: [
      { label: "新車・中古車", emoji: "🚘", patterns: [/新車|中古車|ディーラー|dealer/i] },
      { label: "カー用品", emoji: "🔧", patterns: [/オートバックス|カー用品|パーツ|タイヤ/i] },
    ],
  },
  {
    label: "バイク",
    emoji: "🏍️",
    patterns: [
      /バイク|motorcycle|二輪|ハーレー|harley|kawasaki|yamaha.*バイク|honda.*バイク|suzuki.*バイク|ツーリング/i,
    ],
    subGenres: [
      { label: "ツーリング", emoji: "🛣️", patterns: [/ツーリング|touring/i] },
      { label: "バイク用品", emoji: "🪖", patterns: [/バイク用品|二輪用品|ライダー/i] },
    ],
  },
  {
    label: "医療・クリニック",
    emoji: "🏥",
    patterns: [
      /クリニック|clinic|病院|hospital|医院|歯科|dental|内科|外科|皮膚科|眼科/i,
    ],
    subGenres: [
      { label: "歯科", emoji: "🦷", patterns: [/歯科|dental|歯医者/i] },
      { label: "皮膚科", emoji: "🩺", patterns: [/皮膚科|dermatology/i] },
      { label: "眼科", emoji: "👁️", patterns: [/眼科|ophthalmology/i] },
    ],
  },
  {
    label: "美容",
    emoji: "💇",
    patterns: [
      /美容室|ヘアサロン|hair salon|ネイルサロン|nail salon|エステ|esthetic|美容院/i,
    ],
    subGenres: [
      { label: "ヘアサロン", emoji: "✂️", patterns: [/美容室|ヘアサロン|hair salon|美容院/i] },
      { label: "ネイル", emoji: "💅", patterns: [/ネイル|nail/i] },
      { label: "エステ", emoji: "🧖", patterns: [/エステ|esthetic|マッサージ|spa/i] },
    ],
  },
  {
    label: "不動産",
    emoji: "🏠",
    patterns: [/不動産|real estate|賃貸|マンション.*物件|suumo|homes\.co|at-home/i],
    subGenres: [
      { label: "賃貸", emoji: "🔑", patterns: [/賃貸|rental/i] },
      { label: "売買", emoji: "📝", patterns: [/売買|購入|マンション.*購入/i] },
    ],
  },
  {
    label: "株・投資",
    emoji: "📈",
    patterns: [
      /株式投資|stock|証券会社|securities|fx取引|\bfx\b.*投資|仮想通貨取引|crypto.*exchange|投資信託/i,
    ],
    subGenres: [
      { label: "株式", emoji: "📊", patterns: [/株式|stock/i] },
      { label: "FX", emoji: "💱", patterns: [/\bfx\b|外国為替/i] },
      { label: "仮想通貨", emoji: "₿", patterns: [/仮想通貨|crypto|bitcoin|ethereum/i] },
    ],
  },
];

// ドメインでメインカテゴリを強制指定
const DOMAIN_OVERRIDES: { pattern: RegExp; mainLabel: string }[] = [
  { pattern: /tabelog\.com/i, mainLabel: "グルメ・飲食" },
  { pattern: /gurunavi\.com/i, mainLabel: "グルメ・飲食" },
  { pattern: /hotpepper\.jp/i, mainLabel: "グルメ・飲食" },
  { pattern: /retty\.me/i, mainLabel: "グルメ・飲食" },
  { pattern: /jalan\.net/i, mainLabel: "旅行・宿泊" },
  { pattern: /rurubu\.com/i, mainLabel: "旅行・宿泊" },
  { pattern: /booking\.com/i, mainLabel: "旅行・宿泊" },
  { pattern: /airbnb\./i, mainLabel: "旅行・宿泊" },
  { pattern: /rakuten-travel|travel\.rakuten/i, mainLabel: "旅行・宿泊" },
  { pattern: /amazon\.(co\.jp|com)/i, mainLabel: "ショッピング" },
  { pattern: /rakuten\.co\.jp/i, mainLabel: "ショッピング" },
  { pattern: /mercari\.com/i, mainLabel: "ショッピング" },
  { pattern: /suumo\.jp/i, mainLabel: "不動産" },
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

// ページのテキストから都道府県・市区町村を推定する
function extractLocation(text: string): { prefecture: string; city: string } {
  let prefecture = "";
  let city = "";

  // 1) 都道府県を検出（最初に出てきたもの）
  let prefIndex = -1;
  for (const pref of PREFECTURES) {
    const idx = text.indexOf(pref);
    if (idx !== -1 && (prefIndex === -1 || idx < prefIndex)) {
      prefIndex = idx;
      prefecture = pref;
    }
  }

  // 2) 都道府県の直後から市区町村を検出
  if (prefecture && prefIndex !== -1) {
    const after = text.slice(prefIndex + prefecture.length, prefIndex + prefecture.length + 30);
    // 「○○郡○○町」「○○市○○区」「○○市」「○○区」「○○町」「○○村」を拾う
    const m =
      after.match(/^([一-龥ヶ々ぁ-んァ-ヴー]{1,8}?郡[一-龥ヶ々ぁ-んァ-ヴー]{1,8}?[町村])/) ??
      after.match(/^([一-龥ヶ々ぁ-んァ-ヴー]{1,8}?市[一-龥ヶ々ぁ-んァ-ヴー]{1,6}?区)/) ??
      after.match(/^([一-龥ヶ々ぁ-んァ-ヴー]{1,10}?[市区町村])/);
    if (m) city = m[1];
  }

  // 3) 都道府県が無くても市区町村だけは拾えると便利（例: 渋谷区, 横浜市）
  if (!city) {
    const m = text.match(/([一-龥ヶ々ぁ-んァ-ヴー]{2,8}?市[一-龥ヶ々ぁ-んァ-ヴー]{1,6}?区|[一-龥ヶ々ぁ-んァ-ヴー]{2,8}?[市区])/);
    if (m) city = m[1];
  }

  return { prefecture, city };
}

function classify(text: string, url: string): { main: Genre; subs: Genre[] } | null {
  // ドメイン強制でメインカテゴリを決定
  let forcedMain: MainCategory | undefined;
  for (const rule of DOMAIN_OVERRIDES) {
    if (rule.pattern.test(url)) {
      forcedMain = MAIN_CATEGORIES.find((c) => c.label === rule.mainLabel);
      break;
    }
  }

  // テキストでメインカテゴリを検出（複数マッチしたら最初の1つ）
  const matchedMains = forcedMain
    ? [forcedMain]
    : MAIN_CATEGORIES.filter((c) => c.patterns.some((re) => re.test(text)));

  if (matchedMains.length === 0) return null;

  // サブジャンルはマッチした全メインカテゴリ内から収集
  const subs: Genre[] = [];
  const seenSub = new Set<string>();
  for (const main of matchedMains) {
    for (const sub of main.subGenres) {
      if (!seenSub.has(sub.label) && sub.patterns.some((re) => re.test(text))) {
        subs.push({ label: sub.label, emoji: sub.emoji });
        seenSub.add(sub.label);
      }
    }
  }

  return {
    main: { label: matchedMains[0].label, emoji: matchedMains[0].emoji },
    subs,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}


// ---- お店の詳細（JSON-LD と「営業時間」などの表から、取れる分だけ） ----

type ShopDetails = {
  address: string;
  phone: string;
  hours: string;
  holiday: string;
  budget: string;
  rating: string;
  ratingCount: string;
  cuisine: string;
  access: string;
};

const stripTags = (s: string) =>
  decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((l) => l.replace(/[ \t\u3000]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

const asText = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join("、");
  return "";
};

function findShopNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findShopNode(n);
      if (f) return f;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const types = ([] as unknown[]).concat(obj["@type"] ?? []).map(String);
  if (types.some((t) => /Restaurant|FoodEstablishment|LocalBusiness|Store|Cafe|Bar|Hotel|Lodging|TouristAttraction|Place/i.test(t)) && (obj.address || obj.telephone || obj.aggregateRating)) {
    return obj;
  }
  if (obj["@graph"]) return findShopNode(obj["@graph"]);
  return null;
}

function tableValue(html: string, label: RegExp): string {
  // <th>営業時間</th><td>…</td> / <dt>…</dt><dd>…</dd> の形を拾う
  const re = new RegExp(`<(th|dt)[^>]*>([\\s\\S]{0,80}?)<\\/\\1>\\s*<(td|dd)[^>]*>([\\s\\S]{0,1500}?)<\\/\\3>`, "gi");
  for (const m of html.matchAll(re)) {
    if (label.test(stripTags(m[2]))) {
      const v = stripTags(m[4]);
      if (v) return v.length > 300 ? v.slice(0, 300) + "…" : v;
    }
  }
  return "";
}

function extractShopDetails(html: string): ShopDetails {
  let node: Record<string, unknown> | null = null;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      node = findShopNode(JSON.parse(m[1]));
    } catch {
      /* ignore */
    }
    if (node) break;
  }

  let address = "";
  const addr = node?.address;
  if (typeof addr === "string") address = addr;
  else if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    address = [a.addressRegion, a.addressLocality, a.streetAddress].map(asText).join("");
  }
  const rating = node?.aggregateRating as Record<string, unknown> | undefined;
  const openingHours = asText(node?.openingHours);

  return {
    address: address.trim() || tableValue(html, /^(住所|所在地)$/),
    phone: asText(node?.telephone) || tableValue(html, /^(電話番号|TEL|予約・お問い合わせ|お問い合わせ)$/i),
    hours: tableValue(html, /^(営業時間|営業時間・定休日)$/) || openingHours,
    holiday: tableValue(html, /^(定休日|休業日)$/),
    budget: asText(node?.priceRange) || tableValue(html, /^(予算|平均予算)$/),
    rating: asText(rating?.ratingValue),
    ratingCount: asText(rating?.ratingCount ?? rating?.reviewCount),
    cuisine: asText(node?.servesCuisine) || tableValue(html, /^ジャンル$/),
    access: tableValue(html, /^(交通手段|アクセス)$/),
  };
}

const EMPTY_DETAILS: ShopDetails = { address: "", phone: "", hours: "", holiday: "", budget: "", rating: "", ratingCount: "", cuisine: "", access: "" };

// ---- HTML取得 ----------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// SNSのリンクプレビュー用クローラー。OGPだけは返してくれるサイトが多い
const OGP_CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const browserHeaders = (ua: string): Record<string, string> => ({
  "User-Agent": ua,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
});

/** アクセス制限・Bot判定ページかどうか（食べログの「現在アクセスが集中しています」等） */
function isBlockedPage(status: number, html: string): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  const head = title + " " + html.slice(0, 3000);
  return /アクセスが集中|アクセスが混み合|しばらく(時間を置いて|してから)|Access Denied|Just a moment|Attention Required|captcha/i.test(
    head,
  );
}

async function fetchHtml(url: string, headers: Record<string, string>): Promise<{ status: number; html: string }> {
  // 社内アドレスなどには行かない（リダイレクト先も確認）
  const res = await safeFetch(url, { headers, signal: AbortSignal.timeout(6000) });
  const buffer = await res.arrayBuffer();

  // Content-Typeヘッダー → HTMLのmeta charset の順で文字コードを判定
  const contentType = res.headers.get("content-type") ?? "";
  const headerCharset = contentType.match(/charset=([^\s;]+)/i)?.[1];
  const tentative = new TextDecoder("utf-8").decode(buffer);
  const metaCharset =
    tentative.match(/<meta[^>]+charset=["']?([^"';\s>]+)/i)?.[1] ??
    tentative.match(/<meta[^>]+http-equiv=["']Content-Type["'][^>]+content=["'][^"']*charset=([^"'\s;]+)/i)?.[1];
  const charset = headerCharset ?? metaCharset ?? "utf-8";

  let html: string;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    html = tentative;
  }
  return { status: res.status, html };
}

/**
 * ブラウザ相当のヘッダーで取得し、制限ページが返ってきたら
 * OGPクローラーUA・スマホ版サイトの順に再試行する。全滅なら null。
 */
async function fetchHtmlWithFallback(url: string): Promise<string | null> {
  const attempts: { url: string; headers: Record<string, string> }[] = [
    { url, headers: browserHeaders(BROWSER_UA) },
    { url, headers: { "User-Agent": OGP_CRAWLER_UA, "Accept-Language": "ja" } },
  ];

  // 食べログはスマホ版(s.tabelog.com)も試す
  try {
    const u = new URL(url);
    if (/(^|\.)tabelog\.com$/i.test(u.hostname) && !u.hostname.startsWith("s.")) {
      u.hostname = "s.tabelog.com";
      attempts.push({ url: u.toString(), headers: browserHeaders(MOBILE_UA) });
    }
  } catch {
    /* ignore */
  }

  for (const a of attempts) {
    try {
      const { status, html } = await fetchHtml(a.url, a.headers);
      if (!isBlockedPage(status, html)) return html;
    } catch {
      /* 次の方法で再試行 */
    }
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const html = await fetchHtmlWithFallback(url);
    if (!html) throw new Error("blocked or unreachable");

    const getMeta = (property: string): string => {
      const match =
        html.match(new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, "i")) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, "i")) ??
        html.match(new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"));
      return decodeEntities(match?.[1] ?? "");
    };

    const title =
      getMeta("title") ||
      decodeEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "") ||
      "";
    const description = getMeta("description");
    const siteName = getMeta("site_name");
    const image = getMeta("image");

    const keywords =
      html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']keywords["']/i)?.[1] ??
      "";

    let jsonLdText = "";
    for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try { jsonLdText += " " + JSON.stringify(JSON.parse(m[1])); } catch { /* ignore */ }
    }

    const combinedText = `${title} ${description} ${siteName} ${keywords} ${jsonLdText}`;
    const result = classify(combinedText, url);
    const location = extractLocation(combinedText);

    return NextResponse.json({
      title: title.trim(),
      description: description.trim(),
      siteName: siteName.trim(),
      image: image.trim(),
      main: result?.main ?? null,
      subs: result?.subs ?? [],
      prefecture: location.prefecture,
      city: location.city,
      details: extractShopDetails(html),
    });
  } catch {
    // フェッチ失敗時もドメイン判定だけ返す
    const result = classify("", url);
    return NextResponse.json({ title: "", description: "", siteName: "", image: "", main: result?.main ?? null, subs: result?.subs ?? [], prefecture: "", city: "", details: EMPTY_DETAILS });
  }
}
