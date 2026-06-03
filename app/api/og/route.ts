import { NextResponse } from "next/server";

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
      // 酒・居酒屋系
      { label: "居酒屋", emoji: "🍻", patterns: [/居酒屋|izakaya/i] },
      { label: "バー・カクテル", emoji: "🍸", patterns: [/\bbar\b|バーラウンジ|cocktail bar|ワインバー|wine bar|ビアバー|craft beer/i] },
      { label: "ワイン", emoji: "🍷", patterns: [/ワインバー|wine bar|ワイン専門|enoteca/i] },
      { label: "クラフトビール", emoji: "🍺", patterns: [/クラフトビール|craft beer|ビアバー|brewpub/i] },
      // 和食系
      { label: "寿司・海鮮", emoji: "🍣", patterns: [/寿司|鮨|sushi|刺身|海鮮|seafood/i] },
      { label: "天ぷら・揚げ物", emoji: "🍤", patterns: [/天ぷら|天麩羅|揚げ物|とんかつ|フライ|tempura/i] },
      { label: "焼き鳥・串焼き", emoji: "🍢", patterns: [/焼き鳥|焼鳥|やきとり|串焼き|串鳥|yakitori/i] },
      { label: "うどん・そば", emoji: "🍝", patterns: [/うどん|そば|蕎麦|udon|soba/i] },
      { label: "丼もの", emoji: "🍚", patterns: [/丼|天丼|親子丼|うな丼|海鮮丼|donburi/i] },
      { label: "鍋・しゃぶしゃぶ", emoji: "🫕", patterns: [/鍋料理|しゃぶしゃぶ|すき焼き|おでん|もつ鍋|水炊き|shabu/i] },
      { label: "和食・懐石", emoji: "🍱", patterns: [/和食|日本料理|懐石|割烹|定食|和定食/i] },
      { label: "お好み焼き・鉄板", emoji: "🥞", patterns: [/お好み焼き|たこ焼き|もんじゃ|鉄板焼き|okonomiyaki/i] },
      { label: "もつ・ホルモン", emoji: "🫀", patterns: [/もつ|ホルモン|内臓|モツ/i] },
      { label: "おでん", emoji: "🍢", patterns: [/おでん/i] },
      { label: "カレー", emoji: "🍛", patterns: [/カレー|curry|カレーライス/i] },
      // 肉料理
      { label: "焼肉", emoji: "🥩", patterns: [/焼肉|yakiniku/i] },
      { label: "ステーキ・ハンバーグ", emoji: "🥩", patterns: [/ステーキ|steak|ハンバーグ|hamburg/i] },
      { label: "ジビエ", emoji: "🦌", patterns: [/ジビエ|gibier|猪|鹿肉|鴨/i] },
      // 麺類
      { label: "ラーメン", emoji: "🍜", patterns: [/ラーメン|らーめん|ramen|中華そば/i] },
      { label: "餃子", emoji: "🥟", patterns: [/餃子|ぎょうざ|gyoza/i] },
      // アジア・エスニック
      { label: "中華", emoji: "🥡", patterns: [/中華|中国料理|chinese/i] },
      { label: "韓国料理", emoji: "🌶️", patterns: [/韓国料理|korean|チゲ|ビビンバ|サムギョプサル/i] },
      { label: "タイ・アジアン", emoji: "🍜", patterns: [/タイ料理|thai|アジアン|ベトナム|フォー|pho|アジア料理/i] },
      { label: "インド料理", emoji: "🫔", patterns: [/インド料理|indian|カレー.*インド|ナン|tandoor/i] },
      { label: "メキシカン", emoji: "🌮", patterns: [/メキシカン|mexican|タコス|taco|burrito/i] },
      { label: "スペイン・バル", emoji: "🥘", patterns: [/スペイン|spanish|バル\b|tapas|パエリア/i] },
      // 洋食
      { label: "イタリアン", emoji: "🍝", patterns: [/イタリアン|italian|ristorante|ピザ|パスタ/i] },
      { label: "フレンチ", emoji: "🥐", patterns: [/フレンチ|french|bistro|ビストロ/i] },
      { label: "ハンバーガー", emoji: "🍔", patterns: [/ハンバーガー|burger|バーガー/i] },
      // カフェ・スイーツ
      { label: "カフェ", emoji: "☕", patterns: [/カフェ|cafe|coffee shop|珈琲|喫茶/i] },
      { label: "スイーツ・ケーキ", emoji: "🍰", patterns: [/スイーツ|ケーキ|sweets|patisserie|パティスリー|チョコレート/i] },
      { label: "パン・ベーカリー", emoji: "🍞", patterns: [/パン屋|ベーカリー|bakery|ブランジェリー/i] },
      // 食べ放題・ビュッフェ
      { label: "食べ放題・ビュッフェ", emoji: "🍱", patterns: [/食べ放題|ビュッフェ|バイキング|all.you.can.eat|buffet/i] },
      // こだわり系
      { label: "オーガニック", emoji: "🌿", patterns: [/オーガニック|有機|ナチュラル|organic|natural food/i] },
      { label: "ベジタリアン・ヴィーガン", emoji: "🥗", patterns: [/ベジタリアン|ヴィーガン|vegan|vegetarian/i] },
      { label: "グルテンフリー", emoji: "🌾", patterns: [/グルテンフリー|gluten.free/i] },
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
      { label: "EC", emoji: "🛒", patterns: [/amazon|楽天市場|メルカリ|mercari|yahoo.*ショッピング/i] },
      { label: "ファッション", emoji: "👗", patterns: [/ファッション|fashion|アパレル|apparel/i] },
      { label: "家電", emoji: "💻", patterns: [/家電|electronics|ヨドバシ|ビックカメラ|ヤマダ/i] },
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ShareCal/1.0)" },
      signal: AbortSignal.timeout(6000),
    });

    const html = await res.text();

    const getMeta = (property: string): string => {
      const match =
        html.match(new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, "i")) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, "i")) ??
        html.match(new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"));
      return match?.[1] ?? "";
    };

    const title =
      getMeta("title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
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

    return NextResponse.json({
      title: title.trim(),
      description: description.trim(),
      siteName: siteName.trim(),
      image: image.trim(),
      main: result?.main ?? null,
      subs: result?.subs ?? [],
    });
  } catch {
    // フェッチ失敗時もドメイン判定だけ返す
    const result = classify("", url);
    return NextResponse.json({ title: "", description: "", siteName: "", image: "", main: result?.main ?? null, subs: result?.subs ?? [] });
  }
}
