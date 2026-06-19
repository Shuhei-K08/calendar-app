import { NextResponse } from "next/server";

// 都道府県名 → 市区町村一覧（HeartRails Geo API をサーバー側で取得して返す）
// 例: /api/cities?prefecture=東京都
const cache = new Map<string, string[]>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prefecture = searchParams.get("prefecture");

  if (!prefecture) {
    return NextResponse.json({ error: "prefecture is required" }, { status: 400 });
  }

  if (cache.has(prefecture)) {
    return NextResponse.json({ cities: cache.get(prefecture) });
  }

  try {
    const res = await fetch(
      `https://geoapi.heartrails.com/api/json?method=getCities&prefecture=${encodeURIComponent(prefecture)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    const data = await res.json();
    const loc = data?.response?.location;
    const cities: string[] = Array.isArray(loc)
      ? Array.from(new Set(loc.map((l: { city?: string }) => l.city).filter(Boolean) as string[]))
      : [];

    if (cities.length > 0) cache.set(prefecture, cities);
    return NextResponse.json({ cities });
  } catch {
    return NextResponse.json({ cities: [] });
  }
}
