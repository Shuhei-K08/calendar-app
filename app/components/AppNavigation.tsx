"use client";

import { useEffect, useState } from "react";
import { useKintaiEnabled } from "@/lib/features";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ロゴマーク（B案: 吹き出しの形のカレンダー。3つの点は わたし・ふたり・相手 の色）
export function ShareCalMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`sharecal-logo-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <rect width="120" height="120" rx="28" style={{ fill: "var(--accent)" }} />
      <path
        d="M38 30h44a14 14 0 0 1 14 14v30a14 14 0 0 1-14 14H72l-12 12-4-12H38a14 14 0 0 1-14-14V44a14 14 0 0 1 14-14Z"
        fill="#FFFFFF"
      />
      <path d="M38 30h44a14 14 0 0 1 14 14v4H24v-4a14 14 0 0 1 14-14Z" fill="#CFE9E1" />
      <rect x="39" y="22" width="7" height="16" rx="3.5" fill="#FFFFFF" />
      <rect x="74" y="22" width="7" height="16" rx="3.5" fill="#FFFFFF" />
      <circle cx="43" cy="67" r="6" style={{ fill: "var(--accent)" }} />
      <circle cx="60" cy="67" r="6" fill="#6D3FD8" />
      <circle cx="77" cy="67" r="6" fill="#E0703A" />
    </svg>
  );
}

export function ShareCalLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="sharecal-logo" aria-label="ShareCal">
      <ShareCalMark />
      {!compact && <span className="sharecal-logo-text">ShareCal</span>}
    </div>
  );
}

const CalendarIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </svg>
);

const SpotIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

const ClockIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const TodoIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
  </svg>
);

const PatternIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 5h6v6H5V5ZM13 5h6v6h-6V5ZM5 13h6v6H5v-6ZM13 13h6v6h-6v-6Z" />
  </svg>
);

const AdminIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
    <path d="M9 12l2 2 4-5" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

// メインのメニュー（ふたり・よく使う予定・管理は設定の中）
const items = [
  { href: "/", label: "カレンダー", icon: <CalendarIcon /> },
  { href: "/links", label: "スポット", icon: <SpotIcon /> },
  { href: "/todos", label: "やること", icon: <TodoIcon /> },
  { href: "/kintai", label: "勤怠", icon: <ClockIcon /> },
  { href: "/settings", label: "設定", icon: <SettingsIcon /> },
];

// 勤怠は設定でオンにした人だけに出す
function useNavItems() {
  const { enabled } = useKintaiEnabled();
  return enabled ? items : items.filter((i) => i.href !== "/kintai");
}

const ADMIN_CACHE_KEY = "sharecal_is_admin";

// 予定追加イベント: カレンダー画面ならその場で追加画面を開き、他の画面ならカレンダーへ移動して開く
export const OPEN_ADD_EVENT = "sharecal:add";
// 勤怠画面の＋: 今日の勤怠を記入する
export const OPEN_KINTAI_ENTRY = "sharecal:kintai-entry";
// やること画面の＋: やることを追加する
export const OPEN_TODO_ADD = "sharecal:todo-add";
// つながり申請を承認・却下したら、メニューの印を数え直す
export const PENDING_CHANGED_EVENT = "sharecal:pending-changed";

function useNavigationMeta() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchMeta = async () => {
      // 前回の結果を先に反映（サーバー描画と食い違わないよう、表示後に読む）
      setIsAdmin(window.localStorage.getItem(ADMIN_CACHE_KEY) === "1");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const [{ count }, { data: profile }] = await Promise.all([
        supabase
          .from("connections")
          .select("id", { count: "exact", head: true })
          .eq("receiver_id", user.id)
          .eq("status", "pending"),
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      ]);

      setPendingCount(count ?? 0);
      const role = (profile?.role ?? "").toString().trim().toLowerCase();
      const admin = role === "admin" || role === "admine";
      setIsAdmin(admin);
      // 次回レンダリング用にキャッシュ保存
      window.localStorage.setItem(ADMIN_CACHE_KEY, admin ? "1" : "0");
    };

    void fetchMeta();
    const refetch = () => void fetchMeta();
    window.addEventListener(PENDING_CHANGED_EVENT, refetch);
    return () => window.removeEventListener(PENDING_CHANGED_EVENT, refetch);
  }, []);

  return { pendingCount, isAdmin };
}

function useAddAction() {
  const pathname = usePathname();
  const router = useRouter();
  return () => {
    if (pathname === "/") {
      window.dispatchEvent(new window.Event(OPEN_ADD_EVENT));
      return;
    }
    router.push("/?new=1");
  };
}

const isActivePath = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
};

export function DesktopNavigation() {
  const { pendingCount, isAdmin } = useNavigationMeta();
  const navItems = useNavItems();
  const pathname = usePathname();
  const openAdd = useAddAction();

  return (
    <>
      {/* タブレット幅: ヘッダー内の横並びメニュー */}
      <nav className="top-nav" aria-label="メニュー">
        {navItems.map((item) => (
          <Link
            key={item.href}
            className="top-nav-link"
            href={item.href}
            data-active={isActivePath(pathname, item.href) ? "true" : undefined}
          >
            {item.href === "/settings" && pendingCount > 0 && <span className="nav-badge" />}
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* PC: 左に固定のサイドメニュー */}
      <aside className="side-nav" aria-label="メニュー">
        <Link href="/" className="side-nav-brand">
          <ShareCalLogo />
        </Link>
        <nav className="side-nav-links">
          {navItems.map((item) => (
            <Link
              key={item.href}
              className="side-nav-link"
              href={item.href}
              data-active={isActivePath(pathname, item.href) ? "true" : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.href === "/settings" && pendingCount > 0 && <span className="side-nav-badge">申請</span>}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="side-nav-add"
          onClick={() => (pathname.startsWith("/todos") ? window.dispatchEvent(new window.Event(OPEN_TODO_ADD)) : openAdd())}
        >
          <PlusIcon />
          {pathname.startsWith("/todos") ? "やることを追加" : "予定を追加"}
        </button>
        <div className="side-nav-sub">
          <Link className="side-nav-sublink" href="/patterns" data-active={isActivePath(pathname, "/patterns") ? "true" : undefined}>
            <PatternIcon />
            よく使う予定
          </Link>
          {isAdmin && (
            <Link className="side-nav-sublink" href="/admin" data-active={isActivePath(pathname, "/admin") ? "true" : undefined}>
              <AdminIcon />
              管理
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}

export function MobileNavigation() {
  const { pendingCount } = useNavigationMeta();
  const navItems = useNavItems();
  const pathname = usePathname();
  const openAdd = useAddAction();
  // 勤怠を使う人は下のメニューが5つ埋まるので、真ん中の＋は出さず右下に小さな＋を出す
  const compact = navItems.length >= 5;
  const [left, right] = [navItems.slice(0, 2), navItems.slice(2)];

  // ＋で何をするか（画面ごと）
  const plus = pathname.startsWith("/kintai")
    ? { label: "今日の勤怠を記入", run: () => window.dispatchEvent(new window.Event(OPEN_KINTAI_ENTRY)) }
    : pathname.startsWith("/todos")
      ? { label: "やることを追加", run: () => window.dispatchEvent(new window.Event(OPEN_TODO_ADD)) }
      : { label: "予定を追加", run: openAdd };
  const showFab = compact && (pathname === "/" || pathname.startsWith("/kintai") || pathname.startsWith("/todos"));

  const renderItem = (item: (typeof items)[number]) => (
    <Link
      key={item.href}
      className="mobile-nav-link"
      href={item.href}
      data-active={isActivePath(pathname, item.href) ? "true" : undefined}
    >
      {item.href === "/settings" && pendingCount > 0 && <span className="nav-badge mobile" />}
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );

  return (
    <>
      {showFab && (
        <button type="button" className="mobile-fab sm:hidden" onClick={plus.run} aria-label={plus.label}>
          <PlusIcon />
        </button>
      )}
      <nav className={`mobile-nav sm:hidden ${compact ? "is-five" : ""}`} aria-label="メニュー">
        {compact ? (
          navItems.map(renderItem)
        ) : (
          <>
            {left.map(renderItem)}
            <button type="button" className="mobile-nav-add" onClick={plus.run} aria-label={plus.label}>
              <PlusIcon />
            </button>
            {right.map(renderItem)}
          </>
        )}
      </nav>
    </>
  );
}
