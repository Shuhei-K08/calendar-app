"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function ShareCalLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="sharecal-logo" aria-label="ShareCal">
      <span className="sharecal-logo-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <path d="M8 3v4M16 3v4M3.5 10h17" />
        </svg>
      </span>
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

const LinksIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
  </svg>
);

const PeopleIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
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

// メインのメニューは4つだけ（よく使う予定は追加画面・設定から、管理は設定から）
const items = [
  { href: "/", label: "カレンダー", icon: <CalendarIcon /> },
  { href: "/links", label: "リンク", icon: <LinksIcon /> },
  { href: "/connect", label: "ふたり", icon: <PeopleIcon /> },
  { href: "/settings", label: "設定", icon: <SettingsIcon /> },
];

const ADMIN_CACHE_KEY = "sharecal_is_admin";

// 予定追加イベント: カレンダー画面ならその場で追加画面を開き、他の画面ならカレンダーへ移動して開く
export const OPEN_ADD_EVENT = "sharecal:add";

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
  const pathname = usePathname();
  const openAdd = useAddAction();

  return (
    <>
      {/* タブレット幅: ヘッダー内の横並びメニュー */}
      <nav className="top-nav" aria-label="メニュー">
        {items.map((item) => (
          <Link
            key={item.href}
            className="top-nav-link"
            href={item.href}
            data-active={isActivePath(pathname, item.href) ? "true" : undefined}
          >
            {item.href === "/connect" && pendingCount > 0 && <span className="nav-badge" />}
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
          {items.map((item) => (
            <Link
              key={item.href}
              className="side-nav-link"
              href={item.href}
              data-active={isActivePath(pathname, item.href) ? "true" : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.href === "/connect" && pendingCount > 0 && <span className="side-nav-badge">申請</span>}
            </Link>
          ))}
        </nav>
        <button type="button" className="side-nav-add" onClick={openAdd}>
          <PlusIcon />
          予定を追加
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
  const pathname = usePathname();
  const openAdd = useAddAction();
  const [left, right] = [items.slice(0, 2), items.slice(2)];

  const renderItem = (item: (typeof items)[number]) => (
    <Link
      key={item.href}
      className="mobile-nav-link"
      href={item.href}
      data-active={isActivePath(pathname, item.href) ? "true" : undefined}
    >
      {item.href === "/connect" && pendingCount > 0 && <span className="nav-badge mobile" />}
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );

  return (
    <nav className="mobile-nav sm:hidden" aria-label="メニュー">
      {left.map(renderItem)}
      <button type="button" className="mobile-nav-add" onClick={openAdd} aria-label="予定を追加">
        <PlusIcon />
      </button>
      {right.map(renderItem)}
    </nav>
  );
}
