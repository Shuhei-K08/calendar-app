"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export function ShareCalLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="sharecal-logo" aria-label="ShareCal">
      <svg className="sharecal-logo-mark" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="7" y="10" width="27" height="29" rx="8" />
        <rect x="14" y="7" width="27" height="29" rx="8" />
        <path d="M20 16h15M20 22h9M20 29h12" />
        <path d="M13 20h4M13 27h4" />
      </svg>
      {!compact && (
        <span className="sharecal-logo-text">
          <span>ShareCal</span>
          <small>shared calendar</small>
        </span>
      )}
    </div>
  );
}

const CalendarIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
  </svg>
);

const PatternIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 5h6v6H5V5ZM13 5h6v6h-6V5ZM5 13h6v6H5v-6ZM13 13h6v6h-6v-6Z" />
  </svg>
);

const TodoIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m5 12 3 3 5-6M5 6h14M14 12h5M14 18h5" />
  </svg>
);

const ConnectIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 12a4 4 0 1 1 6 3.46M7 17a4 4 0 0 1 4-4h2M16 17l2 2 4-5M4 19a5 5 0 0 1 5-5" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    <path d="M19 13.5v-3l-2.05-.5a7.8 7.8 0 0 0-.68-1.64l1.1-1.8-2.12-2.12-1.8 1.1A7.8 7.8 0 0 0 11.8 4.9L11.3 3h-3l-.5 1.9a7.8 7.8 0 0 0-1.64.68l-1.8-1.1-2.12 2.12 1.1 1.8A7.8 7.8 0 0 0 2.7 10L1 10.5v3l1.7.5a7.8 7.8 0 0 0 .68 1.64l-1.1 1.8 2.12 2.12 1.8-1.1a7.8 7.8 0 0 0 1.64.68l.5 1.86h3l.5-1.86a7.8 7.8 0 0 0 1.64-.68l1.8 1.1 2.12-2.12-1.1-1.8a7.8 7.8 0 0 0 .68-1.64l2.02-.5Z" />
  </svg>
);

const AdminIcon = () => (
  <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
    <path d="M9 12l2 2 4-5" />
  </svg>
);

const items = [
  { href: "/", label: "予定", desktopLabel: "カレンダー", icon: <CalendarIcon /> },
  { href: "/patterns", label: "よく使う", desktopLabel: "よく使う予定", icon: <PatternIcon /> },
  { href: "/todos", label: "TODO", desktopLabel: "TODO", icon: <TodoIcon /> },
  { href: "/connect", label: "共有", desktopLabel: "つながる", icon: <ConnectIcon /> },
  { href: "/settings", label: "設定", desktopLabel: "設定", icon: <SettingsIcon /> },
];

const adminItem = {
  href: "/admin",
  label: "管理",
  desktopLabel: "管理",
  icon: <AdminIcon />,
};

function useNavigationMeta() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchMeta = async () => {
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
      setIsAdmin(profile?.role === "admin");
    };

    void fetchMeta();
  }, []);

  return { pendingCount, isAdmin };
}

export function DesktopNavigation() {
  const { pendingCount, isAdmin } = useNavigationMeta();
  const navItems = isAdmin ? [...items, adminItem] : items;

  return (
    <nav className="hidden gap-2 sm:flex sm:flex-wrap sm:items-center">
      {navItems.map((item) => (
        <Link key={item.href} className="top-nav-link" href={item.href} aria-label={item.desktopLabel}>
          {item.href === "/connect" && pendingCount > 0 && <span className="nav-badge" />}
          {item.icon}
          <span>{item.desktopLabel}</span>
        </Link>
      ))}
    </nav>
  );
}

export function MobileNavigation() {
  const { pendingCount, isAdmin } = useNavigationMeta();
  const navItems = isAdmin ? [...items, adminItem] : items;

  return (
    <nav className={`fixed inset-x-3 bottom-3 z-40 grid ${isAdmin ? "grid-cols-6" : "grid-cols-5"} rounded-2xl border border-[#d9e2ef] bg-white/95 p-2 text-center text-[10px] font-semibold text-[#334155] shadow-xl backdrop-blur sm:hidden`}>
      {navItems.map((item) => (
        <Link key={item.href} className="mobile-nav-link" href={item.href} aria-label={item.desktopLabel}>
          {item.href === "/connect" && pendingCount > 0 && <span className="nav-badge mobile" />}
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
