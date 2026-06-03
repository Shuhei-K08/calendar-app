import { NextResponse } from "next/server";

// ジャンル分類キーワード
const GENRE_RULES: { label: string; emoji: string; keywords: string[] }[] = [
  { label: "寿司・海鮮", emoji: "🍣", keywords: ["寿司", "鮨", "sushi", "海鮮", "魚", "seafood", "刺身"] },
  { label: "焼肉・肉料理", emoji: "🥩", keywords: ["焼肉", "yakiniku", "ステーキ", "steak", "肉", "meat", "bbq", "バーベキュー"] },
  { label: "ラーメン", emoji: "🍜", keywords: ["ラーメン", "ramen", "らーめん", "中華そば"] },
  { label: "イタリアン", emoji: "🍝", keywords: ["イタリアン", "italian", "pizza", "ピザ", "pasta", "パスタ", "ristorante"] },
  { label: "フレンチ", emoji: "🥐", keywords: ["フレンチ", "french", "bistro", "ビストロ", "brasserie"] },
  { label: "カフェ", emoji: "☕", keywords: ["カフェ", "cafe", "coffee", "コーヒー", "珈琲", "喫茶"] },
  { label: "居酒屋・バー", emoji: "🍻", keywords: ["居酒屋", "izakaya", "bar", "バー", "酒", "飲み"] },
  { label: "ショッピング", emoji: "🛍️", keywords: ["shop", "ショップ", "store", "ストア", "mall", "モール", "百貨店", "デパート"] },
  { label: "スポーツ", emoji: "⚽", keywords: ["sport", "スポーツ", "gym", "ジム", "fitness", "フィットネス", "野球", "soccer", "football"] },
  { label: "ホテル・宿泊", emoji: "🏨", keywords: ["hotel", "ホテル", "旅館", "inn", "resort", "リゾート", "宿"] },
  { label: "エンタメ", emoji: "🎭", keywords: ["cinema", "映画", "theater", "劇場", "concert", "コンサート", "ライブ", "live", "museum", "美術館"] },
  { label: "医療・クリニック", emoji: "🏥", keywords: ["clinic", "クリニック", "病院", "hospital", "医院", "歯科"] },
  { label: "美容", emoji: "💇", keywords: ["salon", "サロン", "美容", "hair", "ヘア", "nail", "ネイル", "beauty"] },
];

function classifyGenre(text: string): { label: string; emoji: string } | null {
  const lower = text.toLowerCase();
  for (const rule of GENRE_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
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
      signal: AbortSignal.timeout(5000),
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
