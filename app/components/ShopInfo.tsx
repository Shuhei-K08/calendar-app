export type ShopDetails = {
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

// お店の詳細（URLから取れた分だけ表示。何も取れなければ出さない）
export function ShopInfo({ details, loading }: { details?: ShopDetails; loading?: boolean }) {
  if (loading) return <p className="shop-info-loading">お店の情報を取得中…</p>;
  if (!details) return null;
  const rows: { label: string; value: string; href?: string }[] = [
    { label: "評価", value: details.rating ? `★ ${details.rating}${details.ratingCount ? `（${details.ratingCount}件）` : ""}` : "" },
    { label: "ジャンル", value: details.cuisine },
    { label: "予算", value: details.budget },
    { label: "営業時間", value: details.hours },
    { label: "定休日", value: details.holiday },
    { label: "住所", value: details.address },
    { label: "アクセス", value: details.access },
    { label: "電話", value: details.phone, href: details.phone ? `tel:${details.phone.replace(/[^0-9+]/g, "")}` : undefined },
  ].filter((r) => r.value);
  if (rows.length === 0) return null;
  return (
    <dl className="shop-info">
      {rows.map((r) => (
        <div key={r.label} className="shop-info-row">
          <dt>{r.label}</dt>
          <dd>{r.href ? <a href={r.href}>{r.value}</a> : r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
