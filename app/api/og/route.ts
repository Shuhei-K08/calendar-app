import { NextResponse } from "next/server";

// ジャンル分類 — より具体的なキーワードで誤分類を防ぐ
// keywords は「単語単位」でマッチ（部分一致による誤爆を防ぐため word boundary 相当チェックを使用）
const GENRE_RULES: { label: string; emoji: string; patterns: RegExp[] }[] = [
  // 飲食
  { label: "寿司・海鮮", emoji: "🍣", patterns: [/寿司|鮨|sushi|海鮮料理|刺身|seafood/i] },
  { label: "焼肉", emoji: "🥩", patterns: [/焼肉|yakiniku|ステーキ|steak|bbq|バーベキュー/i] },
  { label: "ラーメン", emoji: "🍜", patterns: [/ラーメン|らーめん|ramen|中華そば/i] },
  { label: "イタリアン", emoji: "🍝", patterns: [/イタリアン|italian|ristorante|trattoria|ピザ|パスタ/i] },
  { label: "フレンチ", emoji: "🥐", patterns: [/フレンチ|french cuisine|bistro|ビストロ|brasserie/i] },
  { label: "カフェ", emoji: "☕", patterns: [/カフェ|cafe|coffee shop|珈琲|喫茶店/i] },
  { label: "居酒屋", emoji: "🍻", patterns: [/居酒屋|izakaya/i] },
  { label: "バー", emoji: "🍸", patterns: [/\bbar\b|バーラウンジ|cocktail bar|ワインバー|wine bar/i] },
  { label: "ラーメン", emoji: "🍜", patterns: [/ラーメン|らーめん|ramen|中華そば/i] },
  { label: "レストラン", emoji: "🍽️", patterns: [/restaurant|レストラン|ダイニング|dining/i] },
  // 旅行・宿泊
  { label: "ホテル・旅館", emoji: "🏨", patterns: [/hotel|ホテル|旅館|ryokan|inn\b|リゾート|resort|宿泊/i] },
  { label: "旅行・観光", emoji: "✈️", patterns: [/じゃらん|jalan|楽天トラベル|travel|観光|tour|トラベル|旅行/i] },
  // ショッピング
  { label: "ECショップ", emoji: "🛒", patterns: [/amazon|楽天市場|yahoo.*ショッピング|メルカリ|mercari|rakuten/i] },
  { label: "ショッピング", emoji: "🛍️", patterns: [/ショッピングモール|shopping mall|百貨店|デパート|アウトレット|outlet/i] },
  // エンタメ・文化
  { label: "映画", emoji: "🎬", patterns: [/映画館|cinema|movie theater|シネマ/i] },
  { label: "音楽・ライブ", emoji: "🎵", patterns: [/コンサート|concert|ライブハウス|live house|チケット.*ライブ/i] },
  { label: "美術館・博物館", emoji: "🏛️", patterns: [/美術館|博物館|museum|gallery|ギャラリー/i] },
  // スポーツ・フィットネス
  { label: "スポーツ観戦", emoji: "🏟️", patterns: [/スタジアム|stadium|アリーナ|arena|野球場|サッカー.*チケット/i] },
  { label: "フィットネス", emoji: "💪", patterns: [/ジム|gym|フィットネス|fitness|スポーツクラブ|yoga|ヨガ/i] },
  // 医療・美容
  { label: "クリニック・病院", emoji: "🏥", patterns: [/クリニック|clinic|病院|hospital|医院|歯科|dental/i] },
  { label: "美容サロン", emoji: "💇", patterns: [/美容室|ヘアサロン|hair salon|ネイルサロン|nail salon|エステ|esthetic/i] },
  // 金融・ビジネス
  { label: "株・投資", emoji: "📈", patterns: [/株式|kabushiki|投資|investment|証券|securities|fx\b|仮想通貨|crypto/i] },
  { label: "ビジネス", emoji: "💼", patterns: [/ビジネス|business|企業|corporation|株式会社|有限会社/i] },
  // 教育
  { label: "教育・学習", emoji: "📚", patterns: [/大学|学校|school|university|塾|予備校|eラーニング|e-learning/i] },
  // 不動産
  { label: "不動産", emoji: "🏠", patterns: [/不動産|real estate|賃貸|マンション.*物件|suumo|homes\.co/i] },
  // ニュース
  { label: "ニュース・メディア", emoji: "📰", patterns: [/ニュース|news|新聞|メディア|media|報道/i] },
];

function classifyGenre(text: string): { label: string; emoji: string } | null {
  for (const rule of GENRE_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      return { label: rule.label, emoji: rule.emoji };
    }
  }
  return null;
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

    const combinedText = `${title} ${description} ${siteName}`;
    const genre = classifyGenre(combinedText);

    return NextResponse.json({
      title: title.trim(),
      description: description.trim(),
      siteName: siteName.trim(),
      image: image.trim(),
      genre,
    });
  } catch {
    return NextResponse.json({ title: "", description: "", siteName: "", image: "", genre: null });
  }
}
