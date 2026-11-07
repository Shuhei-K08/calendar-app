"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, PENDING_CHANGED_EVENT, ShareCalLogo } from "@/app/components/AppNavigation";
import { applySavedTheme } from "@/app/components/ThemeApplier";
import { setKintaiEnabled, useKintaiEnabled } from "@/lib/features";
import PushSetting from "@/app/components/PushSetting";
import { DESIGN_THEMES, EVENT_COLOR_DEFAULTS, findDesignTheme, resolveEventColor } from "@/lib/theme";
import { activePeriod, activeSeason, fetchSeasons, periodLabel, SEASON_CHANGED_EVENT, SEASON_THEMES, type SeasonKey, type SeasonPeriod } from "@/lib/season";

/* ── Toast ── */
type ToastItem = { id: number; msg: string; type: "success" | "error" | "info" };

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const show = useCallback((msg: string, type: ToastItem["type"] = "success") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, msg, type }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

/* ── Types ── */
const defaultSettings = {
  designTheme: "clean",
  background: "var(--background)",
  calendarWeekStart: "monday",
  ownEventBackground: EVENT_COLOR_DEFAULTS.ownEventBackground,
  partnerEventBackground: EVENT_COLOR_DEFAULTS.partnerEventBackground,
  incomingEventBackground: EVENT_COLOR_DEFAULTS.incomingEventBackground,
  sharedEventBackground: EVENT_COLOR_DEFAULTS.sharedEventBackground,
  unclassifiedEvent: EVENT_COLOR_DEFAULTS.unclassifiedEvent,
  notificationsEnabled: true,
  seasonalTheme: true, // 期間限定のデザイン（クリスマス・年末年始）を使う
};
type CalendarSettings = typeof defaultSettings;

type Category = { id: string; name: string; color: string };
type RecurrenceRule = "weekly" | "monthly" | "yearly";
type EventVisibility = "private" | "partner" | "together";
type RecurringEvent = {
  id: string; title: string; start_at: string; end_at: string; all_day: boolean | null;
  recurrence_rule: RecurrenceRule; recurrence_until: string | null;
  category_id: string | null; event_visibility: EventVisibility | null;
  sharedWith: { id: string; username: string }[];
};
type RecurringForm = {
  id?: string; title: string; start: string; end: string; allDay: boolean;
  recurrenceRule: RecurrenceRule; recurrenceUntil: string;
  categoryId: string; selectedUserIds: string[]; shareType: EventVisibility;
};
type ConnectedUser = { connectionId: string; id: string; username: string };
type PendingRequest = { id: string; requesterId: string; name: string };

type Page = "home" | "profile" | "partner" | "recurring" | "categories" | "theme" | "guide";
const PAGES: Page[] = ["home", "profile", "partner", "recurring", "categories", "theme", "guide"];
const PAGE_TITLES: Record<Page, string> = {
  home: "設定",
  profile: "プロフィール",
  partner: "ふたり（共有）",
  recurring: "くり返し予定",
  categories: "分類",
  theme: "テーマカラーと予定の色",
  guide: "使い方",
};
const isPage = (v: string | null): v is Page => !!v && (PAGES as string[]).includes(v);

const RULE_LABEL: Record<RecurrenceRule, string> = { weekly: "毎週", monthly: "毎月", yearly: "毎年" };

const COLOR_ROWS: { label: string; key: keyof typeof EVENT_COLOR_DEFAULTS }[] = [
  { label: "わたしの予定", key: "ownEventBackground" },
  { label: "相手に共有した予定", key: "partnerEventBackground" },
  { label: "相手からの予定", key: "incomingEventBackground" },
  { label: "ふたりの予定", key: "sharedEventBackground" },
  { label: "分類なしの予定の線", key: "unclassifiedEvent" },
];

const formatDateTimeLocal = (date: Date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

const createBlankRecurring = (): RecurringForm => {
  const s = new Date(); s.setHours(9, 0, 0, 0);
  const e = new Date(); e.setHours(10, 0, 0, 0);
  return { title: "", start: formatDateTimeLocal(s), end: formatDateTimeLocal(e), allDay: false, recurrenceRule: "weekly", recurrenceUntil: "", categoryId: "", selectedUserIds: [], shareType: "together" };
};

const loadSettings = (): CalendarSettings => {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const saved = window.localStorage.getItem("calendar_settings");
    if (!saved) return defaultSettings;
    const p = JSON.parse(saved);
    return {
      ...defaultSettings, ...p,
      ownEventBackground: resolveEventColor("ownEventBackground", p.ownEventBackground ?? p.ownEvent),
      sharedEventBackground: resolveEventColor("sharedEventBackground", p.sharedEventBackground ?? p.sharedEvent),
      partnerEventBackground: resolveEventColor("partnerEventBackground", p.partnerEventBackground ?? p.ownEventBackground),
      incomingEventBackground: resolveEventColor("incomingEventBackground", p.incomingEventBackground),
      unclassifiedEvent: resolveEventColor("unclassifiedEvent", p.unclassifiedEvent),
      calendarWeekStart: p.calendarWeekStart === "sunday" ? "sunday" : "monday",
    };
  } catch {
    return defaultSettings;
  }
};

/* ── Icons ── */
const Svg = ({ d, children }: { d?: string; children?: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className="st-svg" aria-hidden="true">
    {d && <path d={d} />}
    {children}
  </svg>
);
const Icons = {
  people: <Svg d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"><circle cx="9" cy="8" r="3.5" /></Svg>,
  grid: <Svg d="M5 5h6v6H5V5ZM13 5h6v6h-6V5ZM5 13h6v6H5v-6ZM13 13h6v6h-6v-6Z" />,
  repeat: <Svg d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />,
  tag: <Svg d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z"><circle cx="8" cy="8" r="1.5" /></Svg>,
  calendar: <Svg d="M8 3v4M16 3v4M3.5 10h17"><rect x="3.5" y="5" width="17" height="15" rx="3" /></Svg>,
  cat: <Svg d="M5 9V4l4 3h6l4-3v5c1.3 1.4 2 3.2 2 5 0 4-4 7-9 7s-9-3-9-7c0-1.8.7-3.6 2-5Z"><circle cx="9" cy="13" r="0.9" /><circle cx="15" cy="13" r="0.9" /></Svg>,
  palette: <Svg d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3Z"><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></Svg>,
  clock: <Svg d="M12 7v5l3 2"><circle cx="12" cy="12" r="9" /></Svg>,
  bell: <Svg d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9ZM10 20a2 2 0 0 0 4 0" />,
  help: <Svg d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"><circle cx="12" cy="12" r="9" /></Svg>,
  shield: <Svg d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3ZM9 12l2 2 4-5" />,
  logout: <Svg d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />,
  chevron: <svg viewBox="0 0 24 24" className="st-chevron" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>,
  back: <svg viewBox="0 0 24 24" className="st-svg" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>,
};

/* ── Building blocks ── */
function Group({ title, children, note }: { title?: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="st-group">
      {title && <h2 className="st-group-title">{title}</h2>}
      <div className="st-card">{children}</div>
      {note && <p className="st-group-note">{note}</p>}
    </section>
  );
}

function Row({ icon, tone = "green", title, sub, value, badge, onClick, danger }: {
  icon?: React.ReactNode; tone?: "green" | "orange" | "purple" | "gray" | "blue";
  title: string; sub?: string; value?: string; badge?: number; onClick: () => void; danger?: boolean;
}) {
  return (
    <button type="button" className={`st-row ${danger ? "is-danger" : ""}`} onClick={onClick}>
      {icon && <span className={`st-icon tone-${tone}`}>{icon}</span>}
      <span className="st-row-text">
        <span className="st-row-title">{title}</span>
        {sub && <span className="st-row-sub">{sub}</span>}
      </span>
      {badge ? <span className="st-badge">{badge}</span> : null}
      {value && <span className="st-value">{value}</span>}
      {!danger && Icons.chevron}
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { toasts, show } = useToast();

  const [page, setPage] = useState<Page>("home");
  const pushedRef = useRef(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<CalendarSettings>(defaultSettings);
  const { enabled: kintaiEnabled } = useKintaiEnabled();
  // 期間限定のデザイン（期間中だけテーマ画面に出す）
  const [season, setSeason] = useState<{ key: SeasonKey; period: SeasonPeriod } | null>(null);
  useEffect(() => {
    const read = () => {
      // 期間中だけ出す（期間外は選べない）
      const key = activeSeason();
      setSeason(key ? { key, period: activePeriod(key) } : null);
    };
    read();
    void fetchSeasons().then(read, () => undefined);
    window.addEventListener(SEASON_CHANGED_EVENT, read);
    return () => window.removeEventListener(SEASON_CHANGED_EVENT, read);
  }, []);

  // プロフィール
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  // 名前（本名）：勤怠表などに記入する。null = 列がまだ無い（SQL 未実行）
  const [fullName, setFullName] = useState("");
  const [savedFullName, setSavedFullName] = useState<string | null>("");
  const [shareCode, setShareCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // ふたり
  const [connections, setConnections] = useState<ConnectedUser[]>([]);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [partnerCode, setPartnerCode] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // 分類・くり返し
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#0f7a66");
  const [recurringEvents, setRecurringEvents] = useState<RecurringEvent[]>([]);
  const [recurringForm, setRecurringForm] = useState<RecurringForm>(createBlankRecurring);
  const [recurringOpen, setRecurringOpen] = useState(false);

  // アカウント削除
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const normalizedDeleteConfirmText = deleteConfirmText.replace(/\s/g, "");

  /* ── サブページの切り替え（?p=partner のように URL にも残す。戻るボタンでも戻れる） ── */
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search).get("p");
      setPage(isPage(p) ? p : "home");
      setIsAdmin(window.localStorage.getItem("sharecal_is_admin") === "1");
      setSettings(loadSettings());
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const go = (p: Page) => {
    window.history.pushState(null, "", p === "home" ? "/settings" : `/settings?p=${p}`);
    pushedRef.current = true;
    setPage(p);
    setConfirmKey(null);
    window.scrollTo(0, 0);
  };
  const back = () => {
    if (pushedRef.current) {
      window.history.back();
    } else {
      window.history.replaceState(null, "", "/settings");
      setPage("home");
    }
    setConfirmKey(null);
  };

  /* ── 読み込み ── */
  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? "");
    let res = await supabase.from("profiles").select("username, share_code, full_name").eq("id", user.id).maybeSingle();
    const hasFullName = !res.error;
    if (res.error) res = await supabase.from("profiles").select("username, share_code").eq("id", user.id).maybeSingle();
    const data = res.data as { username?: string | null; share_code?: string | null; full_name?: string | null } | null;
    setUsername(data?.username ?? "");
    setSavedUsername(data?.username ?? "");
    setShareCode(data?.share_code ?? "");
    setFullName(data?.full_name ?? "");
    setSavedFullName(hasFullName ? data?.full_name ?? "" : null);
  }, []);

  const fetchCategories = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("schedule_categories").select("id, name, color").eq("user_id", user.id).order("created_at", { ascending: true });
    setCategories(data ?? []);
  }, []);

  const fetchRecurringEvents = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from("recurring_events")
      .select("id, title, start_at, end_at, all_day, recurrence_rule, recurrence_until, category_id, event_visibility")
      .eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) return;
    const rows = (data ?? []) as Omit<RecurringEvent, "sharedWith">[];
    const ids = rows.map((r) => r.id);
    let shareRows: { recurring_event_id: string; shared_with: string }[] = [];
    if (ids.length > 0) {
      const { data: shares } = await supabase.from("recurring_event_shares")
        .select("recurring_event_id, shared_with").in("recurring_event_id", ids);
      shareRows = (shares ?? []) as { recurring_event_id: string; shared_with: string }[];
    }
    const userIds = Array.from(new Set(shareRows.map((s) => s.shared_with)));
    let profileMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", userIds);
      profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));
    }
    setRecurringEvents(rows.map((r) => ({
      ...r,
      sharedWith: shareRows.filter((s) => s.recurring_event_id === r.id)
        .map((s) => ({ id: s.shared_with, username: profileMap.get(s.shared_with) ?? "共有先" })),
    })));
  }, []);

  const fetchPartners = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: accepted }, { data: pending }] = await Promise.all([
      supabase.from("connections").select("id, requester_id, receiver_id").eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`),
      supabase.from("connections").select("id, requester_id").eq("receiver_id", user.id).eq("status", "pending"),
    ]);
    const acc = accepted ?? [];
    const pend = pending ?? [];
    const otherIds = Array.from(new Set([
      ...acc.map((c) => (c.requester_id === user.id ? c.receiver_id : c.requester_id)),
      ...pend.map((c) => c.requester_id),
    ]));
    const names = new Map<string, string>();
    if (otherIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", otherIds);
      (profiles ?? []).forEach((p) => names.set(p.id, p.username));
    }
    setConnections(acc.map((c) => {
      const id = c.requester_id === user.id ? c.receiver_id : c.requester_id;
      return { connectionId: c.id, id, username: names.get(id) ?? "名前未設定" };
    }));
    setRequests(pend.map((c) => ({ id: c.id, requesterId: c.requester_id, name: names.get(c.requester_id) ?? "名前未設定" })));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProfile();
    void fetchCategories();
    void fetchRecurringEvents();
    void fetchPartners();
  }, [fetchCategories, fetchPartners, fetchProfile, fetchRecurringEvents]);

  /* ── 表示の設定は変えたらすぐ保存 ── */
  const updateSettings = (patch: Partial<CalendarSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      window.localStorage.setItem("calendar_settings", JSON.stringify(next));
      window.localStorage.removeItem("sharecal_theme");
    } catch {
      /* 保存できない環境では見た目だけ変える */
    }
    applySavedTheme();
  };

  /* ── プロフィール ── */
  const saveUsername = async () => {
    if (!username.trim()) return;
    setSavingProfile(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingProfile(false); return; }
    const { error } = await supabase.from("profiles").update({ username: username.trim() }).eq("id", user.id);
    setSavingProfile(false);
    if (error) { show(error.message, "error"); return; }
    setSavedUsername(username.trim());
    show("ニックネームを変更しました");
  };

  const saveFullName = async () => {
    setSavingProfile(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingProfile(false); return; }
    const value = fullName.trim();
    const { error } = await supabase.from("profiles").update({ full_name: value || null }).eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      show(/full_name/.test(error.message) ? "名前をしまう場所がまだありません（supabase-profile-fullname.sql を実行してください）" : error.message, "error");
      return;
    }
    setFullName(value);
    setSavedFullName(value);
    show(value ? "名前を保存しました" : "名前を消しました（勤怠表にはニックネームが入ります）");
  };

  const updatePassword = async () => {
    if (newPassword.length < 6) { show("パスワードは6文字以上にしてください", "error"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { show(error.message, "error"); return; }
    setNewPassword("");
    show("パスワードを変更しました");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const deleteAccount = async () => {
    setDeleteError("");
    if (!deletePassword || normalizedDeleteConfirmText !== "削除する") {
      setDeleteError("パスワードを入力し、確認欄に「削除する」と入力してください。"); return;
    }
    setDeletingAccount(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setDeleteError("ログイン情報がありません。"); setDeletingAccount(false); return; }
    const em = session.user.email;
    if (!em) { setDeleteError("メールアドレスを確認できません。"); setDeletingAccount(false); return; }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: em, password: deletePassword });
    if (signInError) { setDeleteError("パスワードが正しくありません。"); setDeletingAccount(false); return; }
    const { data: { session: refreshed } } = await supabase.auth.getSession();
    const resp = await fetch("/api/account/delete", {
      method: "POST",
      headers: { authorization: `Bearer ${(refreshed ?? session).access_token}` },
    });
    const result = await resp.json();
    if (!resp.ok) { setDeleteError(result.error ?? "アカウント削除に失敗しました"); setDeletingAccount(false); return; }
    await supabase.auth.signOut();
    router.push("/account-deleted");
  };

  /* ── ふたり ── */
  const notifyPendingChanged = () => window.dispatchEvent(new window.Event(PENDING_CHANGED_EVENT));

  const copyShareCode = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      show("共有IDをコピーしました", "info");
    } catch {
      show("コピーできませんでした", "error");
    }
  };

  const sendShareCode = async () => {
    if (!shareCode) return;
    const text = `ShareCalでつながろう！ 私の共有IDは「${shareCode}」です。設定 › ふたり から入力してね。`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        return; // キャンセル
      }
    }
    await copyShareCode();
  };

  const sendRequest = async () => {
    const code = partnerCode.trim().toUpperCase();
    if (!code) { show("相手の共有IDを入力してください", "error"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { show("ログインしてください", "error"); return; }
    setSendingRequest(true);
    // 共有IDから相手を探す（他人のプロフィールは直接読めないので、専用の関数で id だけ受け取る）
    let target: { id: string } | null = null;
    const rpc = await supabase.rpc("find_profile_by_share_code", { code });
    if (!rpc.error) {
      target = rpc.data ? { id: rpc.data as string } : null;
    } else {
      const old = await supabase.from("profiles").select("id").eq("share_code", code).maybeSingle();
      target = (old.data as { id: string } | null) ?? null;
    }
    const findError = !target;
    if (findError || !target) { show("その共有IDのユーザーが見つかりません", "error"); setSendingRequest(false); return; }
    if (target.id === user.id) { show("自分の共有IDです。相手のIDを入力してください", "error"); setSendingRequest(false); return; }
    const { error } = await supabase.from("connections").insert({ requester_id: user.id, receiver_id: target.id, status: "pending" });
    setSendingRequest(false);
    if (error) { show(error.message.includes("duplicate") ? "すでに申請済みです" : error.message, "error"); return; }
    setPartnerCode("");
    show("申請を送りました。相手が承認するとつながります");
  };

  const approve = async (req: PendingRequest) => {
    if (approvingId) return;
    setApprovingId(req.id);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setApprovingId(null); return; }
    const { error } = await supabase.from("connections").update({ status: "accepted" })
      .eq("id", req.id).eq("receiver_id", user.id).eq("status", "pending");
    setApprovingId(null);
    if (error) { show(error.message, "error"); return; }
    show(`${req.name}さんとつながりました`);
    await fetchPartners();
    notifyPendingChanged();
  };

  const reject = async (req: PendingRequest) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("connections").delete()
      .eq("id", req.id).eq("receiver_id", user.id).eq("status", "pending");
    if (error) { show(error.message, "error"); return; }
    setConfirmKey(null);
    show(`${req.name}さんの申請を断りました`, "info");
    await fetchPartners();
    notifyPendingChanged();
  };

  const disconnect = async (cu: ConnectedUser) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: myEvents } = await supabase.from("events").select("id").eq("user_id", user.id);
    const myEventIds = (myEvents ?? []).map((e) => e.id);
    if (myEventIds.length > 0) {
      await supabase.from("event_shares").delete().eq("shared_with", cu.id).in("event_id", myEventIds);
    }
    const { data: otherEvents } = await supabase.from("events").select("id").eq("user_id", cu.id);
    const otherEventIds = (otherEvents ?? []).map((e) => e.id);
    if (otherEventIds.length > 0) {
      await supabase.from("event_shares").delete().eq("shared_with", user.id).in("event_id", otherEventIds);
    }
    const { error } = await supabase.from("connections").delete().eq("id", cu.connectionId);
    if (error) { show(error.message, "error"); return; }
    setConfirmKey(null);
    show(`${cu.username}さんとのつながりを解除しました`, "info");
    await fetchPartners();
  };

  /* ── 分類 ── */
  const addCategory = async () => {
    if (!categoryName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("schedule_categories").insert({ name: categoryName.trim(), color: categoryColor, user_id: user.id });
    if (error) { show(error.message, "error"); return; }
    setCategoryName("");
    await fetchCategories();
    show("分類を追加しました");
  };

  const updateCategory = async (category: Category, patch: Partial<Category>) => {
    const { error } = await supabase.from("schedule_categories").update(patch).eq("id", category.id);
    if (error) { show(error.message, "error"); return; }
    await fetchCategories();
  };

  const deleteCategory = async (category: Category) => {
    const { error } = await supabase.from("schedule_categories").delete().eq("id", category.id);
    if (error) { show(error.message, "error"); return; }
    setConfirmKey(null);
    await fetchCategories();
    show(`「${category.name}」を削除しました`, "info");
  };

  /* ── くり返し予定 ── */
  const openNewRecurring = () => {
    setRecurringForm(createBlankRecurring());
    setRecurringOpen(true);
  };

  const editRecurring = (ev: RecurringEvent) => {
    setRecurringForm({
      id: ev.id, title: ev.title,
      start: formatDateTimeLocal(new Date(ev.start_at)),
      end: formatDateTimeLocal(new Date(ev.end_at)),
      allDay: ev.all_day ?? false,
      recurrenceRule: ev.recurrence_rule,
      recurrenceUntil: ev.recurrence_until ? ev.recurrence_until.slice(0, 10) : "",
      categoryId: ev.category_id ?? "",
      selectedUserIds: ev.sharedWith.map((u) => u.id),
      shareType: ev.event_visibility && ev.event_visibility !== "private" ? ev.event_visibility : "together",
    });
    setRecurringOpen(true);
  };

  const saveRecurringEvent = async () => {
    if (!recurringForm.title.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const startAt = new Date(recurringForm.start).toISOString();
    const endAt = new Date(recurringForm.end).toISOString();
    if (new Date(endAt) <= new Date(startAt)) { show("終わりは始まりより後にしてください", "error"); return; }
    const payload = {
      user_id: user.id, title: recurringForm.title.trim(), start_at: startAt, end_at: endAt,
      note: null, all_day: recurringForm.allDay, category_id: recurringForm.categoryId || null,
      event_visibility: recurringForm.selectedUserIds.length > 0 ? recurringForm.shareType : "private",
      recurrence_rule: recurringForm.recurrenceRule,
      recurrence_until: recurringForm.recurrenceUntil ? new Date(`${recurringForm.recurrenceUntil}T23:59:59`).toISOString() : null,
    };
    const result = recurringForm.id
      ? await supabase.from("recurring_events").update(payload).eq("id", recurringForm.id).select("id").single()
      : await supabase.from("recurring_events").insert(payload).select("id").single();
    const { data: saved, error } = result;
    if (error) { show(error.code === "PGRST205" ? "SQLを再実行してください" : error.message, "error"); return; }
    const rid = recurringForm.id ?? saved.id;
    await supabase.from("recurring_event_shares").delete().eq("recurring_event_id", rid);
    if (recurringForm.selectedUserIds.length > 0) {
      const { error: se } = await supabase.from("recurring_event_shares").insert(
        recurringForm.selectedUserIds.map((uid) => ({ recurring_event_id: rid, shared_with: uid })),
      );
      if (se) { show(se.message, "error"); return; }
    }
    const wasEdit = !!recurringForm.id;
    setRecurringForm(createBlankRecurring());
    setRecurringOpen(false);
    await fetchRecurringEvents();
    show(wasEdit ? "くり返し予定を変更しました" : "くり返し予定を追加しました");
  };

  const deleteRecurring = async (ev: RecurringEvent) => {
    const { error } = await supabase.from("recurring_events").delete().eq("id", ev.id);
    if (error) { show(error.message, "error"); return; }
    setConfirmKey(null);
    setRecurringOpen(false);
    await fetchRecurringEvents();
    show(`「${ev.title}」を削除しました`, "info");
  };

  const partnerSummary =
    connections.length === 0 ? "まだつながっていません" : connections.map((c) => c.username).join("、");
  const seasonalOn = !!season && settings.seasonalTheme !== false;
  const seasonName = season ? SEASON_THEMES[season.key].name : "";
  const themeName = seasonalOn ? seasonName : findDesignTheme(settings.designTheme).name;

  /* ── 画面 ── */
  return (
    <main className="page-shell min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-6">
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
        ))}
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {page === "home" ? (
            <div className="flex items-center gap-3">
              <ShareCalLogo compact />
              <h1 className="text-2xl font-black text-[#1b2421]">設定</h1>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" className="st-back" onClick={back} aria-label="設定に戻る">
                {Icons.back}
                <span>設定</span>
              </button>
              <h1 className="st-page-title">{PAGE_TITLES[page]}</h1>
            </div>
          )}
          <DesktopNavigation />
        </header>

        <div className="st-wrap">
          {/* ───────── 一覧 ───────── */}
          {page === "home" && (
            <>
              <button type="button" className="st-profile" onClick={() => go("profile")}>
                <span className="st-avatar">{(savedUsername || "?").slice(0, 1)}</span>
                <span className="st-row-text">
                  <span className="st-profile-name">{savedUsername || "名前未設定"}</span>
                  <span className="st-row-sub">{email || "読み込み中"}</span>
                </span>
                {Icons.chevron}
              </button>

              <Group title="ふたり">
                <Row icon={Icons.people} tone="purple" title="つながっている相手" sub={partnerSummary} badge={requests.length} onClick={() => go("partner")} />
              </Group>

              <Group title="予定">
                <Row icon={Icons.grid} title="よく使う予定" sub="日勤・夜勤などをワンタップで入力" onClick={() => router.push("/patterns")} />
                <Row icon={Icons.repeat} tone="blue" title="くり返し予定" sub="誕生日・毎週の予定など" value={recurringEvents.length ? `${recurringEvents.length}件` : undefined} onClick={() => go("recurring")} />
                <Row icon={Icons.tag} tone="orange" title="分類" sub="予定に色を付けて見分ける" value={categories.length ? `${categories.length}件` : undefined} onClick={() => go("categories")} />
              </Group>

              <Group title="表示">
                <div className="st-row is-static">
                  <span className="st-icon tone-green">{Icons.calendar}</span>
                  <span className="st-row-text"><span className="st-row-title">週の始まり</span></span>
                  <div className="st-seg" role="radiogroup" aria-label="週の始まり">
                    {[{ v: "monday", l: "月曜" }, { v: "sunday", l: "日曜" }].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        role="radio"
                        aria-checked={settings.calendarWeekStart === o.v}
                        onClick={() => updateSettings({ calendarWeekStart: o.v })}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
                <Row icon={Icons.palette} tone="purple" title="テーマカラーと予定の色" value={themeName} onClick={() => go("theme")} />
                <Row
                  icon={Icons.cat}
                  tone="orange"
                  title="ねこ図鑑"
                  sub="ごく稀に遊びに来たねこ"
                  onClick={() => router.push("/cats")}
                />
                <label className="st-row is-static">
                  <span className="st-icon tone-orange">{Icons.bell}</span>
                  <span className="st-row-text">
                    <span className="st-row-title">画面内のお知らせ</span>
                    <span className="st-row-sub">アプリを開いているとき、共有された予定を画面の上に出す</span>
                  </span>
                  <input
                    type="checkbox"
                    className="st-switch"
                    checked={settings.notificationsEnabled}
                    onChange={(e) => updateSettings({ notificationsEnabled: e.target.checked })}
                  />
                </label>
              </Group>

              <Group title="通知" note="「この端末で受け取る」は端末ごとです（スマホとPCの両方で受け取るなら、それぞれでオン）。種類ごとのオン・オフは、すべての端末に効きます。">
                <PushSetting show={show} />
              </Group>

              <Group title="機能" note="勤怠は自分だけの機能です。オンにしても、つながっている相手には見えません。">
                <label className="st-row is-static">
                  <span className="st-icon tone-blue">{Icons.clock}</span>
                  <span className="st-row-text">
                    <span className="st-row-title">勤怠を使う</span>
                    <span className="st-row-sub">稼働時間の記録・精算幅の見込み・Excelへの書き出し。オンにするとメニューに出ます</span>
                  </span>
                  <input
                    type="checkbox"
                    className="st-switch"
                    checked={!!kintaiEnabled}
                    onChange={(e) => {
                      void setKintaiEnabled(e.target.checked);
                      show(e.target.checked ? "メニューに「勤怠」を出しました" : "メニューから「勤怠」を消しました（記録は残っています）", "info");
                    }}
                  />
                </label>
              </Group>

              <Group title="ヘルプ">
                <Row icon={Icons.help} tone="gray" title="使い方" onClick={() => go("guide")} />
                {isAdmin && <Row icon={Icons.shield} tone="gray" title="管理" sub="ユーザーとOCRの使用状況" onClick={() => router.push("/admin")} />}
              </Group>

              <Group>
                <Row icon={Icons.logout} tone="gray" title="ログアウト" onClick={() => void logout()} danger />
              </Group>
            </>
          )}

          {/* ───────── プロフィール ───────── */}
          {page === "profile" && (
            <>
              <Group title="ニックネーム" note="ふだん表示される名前です。相手のカレンダーやコメント、やることなどに出ます。">
                <div className="st-field-row">
                  <input className="st-input" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveUsername()} aria-label="ニックネーム" />
                  <button type="button" className="st-btn" disabled={savingProfile || !username.trim() || username.trim() === savedUsername} onClick={() => void saveUsername()}>
                    {savingProfile ? "保存中" : "保存"}
                  </button>
                </div>
              </Group>

              <Group
                title="名前（本名）"
                note={
                  savedFullName === null
                    ? "使うには supabase-profile-fullname.sql の実行が必要です。"
                    : "勤怠表など、書類に記入される名前です。ふだんの画面には出ません。空のときはニックネームが入ります。"
                }
              >
                <div className="st-field-row">
                  <input
                    className="st-input"
                    value={fullName}
                    placeholder="例：山田 太郎"
                    autoComplete="name"
                    disabled={savedFullName === null}
                    onChange={(e) => setFullName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveFullName()}
                    aria-label="名前（本名）"
                  />
                  <button type="button" className="st-btn" disabled={savingProfile || savedFullName === null || fullName.trim() === (savedFullName ?? "")} onClick={() => void saveFullName()}>
                    {savingProfile ? "保存中" : "保存"}
                  </button>
                </div>
              </Group>

              <Group title="メールアドレス">
                <p className="st-plain">{email || "読み込み中"}</p>
              </Group>

              <Group title="パスワードを変更">
                <div className="st-field-row">
                  <div className="relative min-w-0 flex-1">
                    <input
                      className="st-input pr-11"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="新しいパスワード（6文字以上）"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      aria-label="新しいパスワード"
                    />
                    <button type="button" className="st-eye" onClick={() => setShowNewPassword((v) => !v)} aria-label={showNewPassword ? "パスワードを隠す" : "パスワードを表示"}>
                      {showNewPassword ? "隠す" : "表示"}
                    </button>
                  </div>
                  <button type="button" className="st-btn is-outline" disabled={newPassword.length < 6} onClick={() => void updatePassword()}>変更</button>
                </div>
              </Group>

              <Group note="予定・分類・共有情報がすべて消え、元に戻せません。">
                <button type="button" className="st-row is-danger" onClick={() => { setDeletePassword(""); setDeleteConfirmText(""); setDeleteError(""); setDeleteModalOpen(true); }}>
                  <span className="st-row-text"><span className="st-row-title">アカウントを削除</span></span>
                </button>
              </Group>
            </>
          )}

          {/* ───────── ふたり ───────── */}
          {page === "partner" && (
            <>
              {requests.length > 0 && (
                <Group title={`届いた申請（${requests.length}）`}>
                  {requests.map((req) => (
                    <div key={req.id} className="st-person is-request">
                      <span className="st-avatar is-small tone-orange">{req.name.slice(0, 1)}</span>
                      <span className="st-row-text">
                        <span className="st-row-title">{req.name}</span>
                        <span className="st-row-sub">つながりたいそうです</span>
                      </span>
                      {confirmKey === `reject-${req.id}` ? (
                        <span className="st-actions">
                          <button type="button" className="st-btn is-small is-danger" onClick={() => void reject(req)}>断る</button>
                          <button type="button" className="st-btn is-small is-ghost" onClick={() => setConfirmKey(null)}>戻る</button>
                        </span>
                      ) : (
                        <span className="st-actions">
                          <button type="button" className="st-btn is-small" disabled={approvingId === req.id} onClick={() => void approve(req)}>
                            {approvingId === req.id ? "…" : "承認"}
                          </button>
                          <button type="button" className="st-btn is-small is-ghost" onClick={() => setConfirmKey(`reject-${req.id}`)}>断る</button>
                        </span>
                      )}
                    </div>
                  ))}
                </Group>
              )}

              <Group title="つながっている相手" note={connections.length > 0 ? "つながっている相手と、予定やスポットを共有できます。" : undefined}>
                {connections.length === 0 ? (
                  <p className="st-plain is-muted">まだつながっていません。下の共有IDを相手に送るか、相手の共有IDを入力してください。</p>
                ) : (
                  connections.map((cu) => (
                    <div key={cu.connectionId} className="st-person">
                      <span className="st-avatar is-small tone-purple">{cu.username.slice(0, 1)}</span>
                      <span className="st-row-text">
                        <span className="st-row-title">{cu.username}</span>
                        <span className="st-row-sub">つながっています</span>
                      </span>
                      {confirmKey === `disc-${cu.connectionId}` ? (
                        <span className="st-actions">
                          <button type="button" className="st-btn is-small is-danger" onClick={() => void disconnect(cu)}>解除する</button>
                          <button type="button" className="st-btn is-small is-ghost" onClick={() => setConfirmKey(null)}>戻る</button>
                        </span>
                      ) : (
                        <button type="button" className="st-link-danger" onClick={() => setConfirmKey(`disc-${cu.connectionId}`)}>解除</button>
                      )}
                    </div>
                  ))
                )}
              </Group>

              <Group title="相手とつなぐ">
                <div className="st-connect">
                  <p className="st-connect-label">① あなたの共有IDを相手に送る</p>
                  <div className="st-code">{shareCode || "読み込み中"}</div>
                  <div className="st-field-row">
                    <button type="button" className="st-btn is-outline flex-1" disabled={!shareCode} onClick={() => void copyShareCode()}>コピー</button>
                    <button type="button" className="st-btn flex-1" disabled={!shareCode} onClick={() => void sendShareCode()}>LINEなどで送る</button>
                  </div>
                </div>
                <div className="st-connect">
                  <p className="st-connect-label">② または、相手の共有IDを入力する</p>
                  <div className="st-field-row">
                    <input
                      className="st-input st-code-input"
                      placeholder="相手の共有ID"
                      value={partnerCode}
                      onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && sendRequest()}
                      maxLength={12}
                      aria-label="相手の共有ID"
                    />
                    <button type="button" className="st-btn" disabled={!partnerCode.trim() || sendingRequest} onClick={() => void sendRequest()}>
                      {sendingRequest ? "送信中" : "申請"}
                    </button>
                  </div>
                </div>
              </Group>
            </>
          )}

          {/* ───────── くり返し予定 ───────── */}
          {page === "recurring" && (
            <>
              {!recurringOpen && (
                <button type="button" className="st-add" onClick={openNewRecurring}>＋ くり返し予定を追加</button>
              )}

              {recurringOpen && (
                <Group title={recurringForm.id ? "くり返し予定を編集" : "新しいくり返し予定"}>
                  <div className="st-form">
                    <label className="st-label">
                      <span>予定名</span>
                      <input className="st-input" placeholder="例：週次ミーティング、誕生日" value={recurringForm.title} onChange={(e) => setRecurringForm((f) => ({ ...f, title: e.target.value }))} />
                    </label>
                    <label className="st-check">
                      <input type="checkbox" checked={recurringForm.allDay} onChange={(e) => setRecurringForm((f) => ({ ...f, allDay: e.target.checked }))} />
                      終日
                    </label>
                    <div className="st-two">
                      <label className="st-label">
                        <span>始まり</span>
                        <input className="st-input" type={recurringForm.allDay ? "date" : "datetime-local"} value={recurringForm.allDay ? recurringForm.start.slice(0, 10) : recurringForm.start} onChange={(e) => setRecurringForm((f) => ({ ...f, start: f.allDay ? `${e.target.value}T00:00` : e.target.value }))} />
                      </label>
                      <label className="st-label">
                        <span>終わり</span>
                        <input className="st-input" type={recurringForm.allDay ? "date" : "datetime-local"} value={recurringForm.allDay ? recurringForm.end.slice(0, 10) : recurringForm.end} onChange={(e) => setRecurringForm((f) => ({ ...f, end: f.allDay ? `${e.target.value}T23:59` : e.target.value }))} />
                      </label>
                    </div>
                    <div className="st-label">
                      <span>くり返し</span>
                      <div className="st-seg is-wide" role="radiogroup" aria-label="くり返し">
                        {(["weekly", "monthly", "yearly"] as RecurrenceRule[]).map((r) => (
                          <button key={r} type="button" role="radio" aria-checked={recurringForm.recurrenceRule === r} onClick={() => setRecurringForm((f) => ({ ...f, recurrenceRule: r }))}>
                            {RULE_LABEL[r]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="st-two">
                      <label className="st-label">
                        <span>終了日（任意）</span>
                        <input className="st-input" type="date" value={recurringForm.recurrenceUntil} onChange={(e) => setRecurringForm((f) => ({ ...f, recurrenceUntil: e.target.value }))} />
                      </label>
                      <label className="st-label">
                        <span>分類</span>
                        <select className="st-input" value={recurringForm.categoryId} onChange={(e) => setRecurringForm((f) => ({ ...f, categoryId: e.target.value }))}>
                          <option value="">なし</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </label>
                    </div>
                    {connections.length > 0 && (
                      <div className="st-label">
                        <span>共有</span>
                        <div className="st-seg is-wide" role="radiogroup" aria-label="共有">
                          {[
                            { v: "private", l: "わたしだけ" },
                            { v: "partner", l: "相手にも見せる" },
                            { v: "together", l: "ふたりの予定" },
                          ].map((o) => {
                            const current = recurringForm.selectedUserIds.length === 0 ? "private" : recurringForm.shareType;
                            return (
                              <button
                                key={o.v}
                                type="button"
                                role="radio"
                                aria-checked={current === o.v}
                                onClick={() =>
                                  setRecurringForm((f) =>
                                    o.v === "private"
                                      ? { ...f, selectedUserIds: [] }
                                      : { ...f, shareType: o.v as EventVisibility, selectedUserIds: f.selectedUserIds.length ? f.selectedUserIds : connections.map((c) => c.id) },
                                  )
                                }
                              >
                                {o.l}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="st-field-row">
                      <button type="button" className="st-btn is-ghost flex-1" onClick={() => setRecurringOpen(false)}>やめる</button>
                      <button type="button" className="st-btn flex-1" disabled={!recurringForm.title.trim()} onClick={() => void saveRecurringEvent()}>
                        {recurringForm.id ? "変更を保存" : "追加する"}
                      </button>
                    </div>
                    {recurringForm.id && (
                      confirmKey === `rec-${recurringForm.id}` ? (
                        <div className="st-field-row">
                          <button type="button" className="st-btn is-danger flex-1" onClick={() => { const ev = recurringEvents.find((r) => r.id === recurringForm.id); if (ev) void deleteRecurring(ev); }}>本当に削除する</button>
                          <button type="button" className="st-btn is-ghost" onClick={() => setConfirmKey(null)}>戻る</button>
                        </div>
                      ) : (
                        <button type="button" className="st-link-danger self-center" onClick={() => setConfirmKey(`rec-${recurringForm.id}`)}>このくり返し予定を削除</button>
                      )
                    )}
                  </div>
                </Group>
              )}

              <Group title="登録済み">
                {recurringEvents.length === 0 ? (
                  <p className="st-plain is-muted">まだありません。誕生日や毎週の予定を登録すると、カレンダーに自動で表示されます。</p>
                ) : (
                  recurringEvents.map((ev) => {
                    const cat = categories.find((c) => c.id === ev.category_id);
                    return (
                      <button key={ev.id} type="button" className="st-row" onClick={() => editRecurring(ev)}>
                        <span className="st-dot" style={{ background: cat?.color ?? "#cfd6d2" }} />
                        <span className="st-row-text">
                          <span className="st-row-title">{ev.title}</span>
                          <span className="st-row-sub">
                            {RULE_LABEL[ev.recurrence_rule]}・{new Date(ev.start_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}から
                            {ev.sharedWith.length > 0 && `・${ev.event_visibility === "together" ? "ふたりの予定" : "共有中"}`}
                          </span>
                        </span>
                        {Icons.chevron}
                      </button>
                    );
                  })
                )}
              </Group>
            </>
          )}

          {/* ───────── 分類 ───────── */}
          {page === "categories" && (
            <>
              <Group title="新しい分類" note="分類を作ると、予定に色の線が付いて種類をひと目で見分けられます。">
                <div className="st-field-row">
                  <input type="color" className="st-color" value={categoryColor} onChange={(e) => setCategoryColor(e.target.value)} aria-label="色" />
                  <input className="st-input" placeholder="例：勤務、プライベート" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} aria-label="分類の名前" />
                  <button type="button" className="st-btn" disabled={!categoryName.trim()} onClick={() => void addCategory()}>追加</button>
                </div>
              </Group>

              <Group title="分類の一覧">
                {categories.length === 0 ? (
                  <p className="st-plain is-muted">まだありません。</p>
                ) : (
                  categories.map((cat) => (
                    <div key={cat.id} className="st-person">
                      <input type="color" className="st-color is-small" value={cat.color} onChange={(e) => void updateCategory(cat, { color: e.target.value })} aria-label={`${cat.name}の色`} />
                      <input
                        className="st-input is-inline"
                        value={cat.name}
                        onChange={(e) => setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, name: e.target.value } : c)))}
                        onBlur={(e) => void updateCategory(cat, { name: e.target.value })}
                        aria-label="分類の名前"
                      />
                      {confirmKey === `cat-${cat.id}` ? (
                        <span className="st-actions">
                          <button type="button" className="st-btn is-small is-danger" onClick={() => void deleteCategory(cat)}>削除</button>
                          <button type="button" className="st-btn is-small is-ghost" onClick={() => setConfirmKey(null)}>戻る</button>
                        </span>
                      ) : (
                        <button type="button" className="st-link-danger" onClick={() => setConfirmKey(`cat-${cat.id}`)}>削除</button>
                      )}
                    </div>
                  ))
                )}
              </Group>
            </>
          )}

          {/* ───────── テーマ ───────── */}
          {page === "theme" && (
            <>
              {season && (
                <Group
                  title="期間限定"
                  note={`期間が終わると、自動で下のテーマ（${findDesignTheme(settings.designTheme).name}）に戻ります。設定は端末ごとです。`}
                >
                  <div className="st-season-banner" data-kind={season.key} aria-hidden="true">
                    <span className="st-season-dots">
                      {SEASON_THEMES[season.key].preview.map((c) => <i key={c} style={{ background: c }} />)}
                    </span>
                    <span className="st-season-period">{periodLabel(season.period)}</span>
                  </div>
                  <label className="st-row is-static">
                    <span className="st-row-text">
                      <span className="st-row-title">{seasonName}</span>
                      <span className="st-row-sub" style={{ whiteSpace: "normal" }}>
                        {settings.seasonalTheme !== false
                          ? `いま${seasonName}のデザインです`
                          : `オンにすると、期間中だけ${seasonName}のデザインになります`}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      className="st-switch"
                      checked={settings.seasonalTheme !== false}
                      onChange={(e) => {
                        updateSettings({ seasonalTheme: e.target.checked });
                        window.dispatchEvent(new Event(SEASON_CHANGED_EVENT));
                      }}
                      aria-label={`期間中は${seasonName}のデザインにする`}
                    />
                  </label>
                </Group>
              )}

              <Group
                title={seasonalOn ? "いつものテーマ" : "テーマカラー"}
                note={
                  seasonalOn
                    ? `いまは${seasonName}のデザインです。ここで選んだテーマは、期間が終わってから使われます。`
                    : "変えるとすぐに反映されます。予定の色もテーマに合わせた色に変わります。"
                }
              >
                <div className="st-themes">
                  {DESIGN_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className="st-theme"
                      aria-pressed={findDesignTheme(settings.designTheme).id === theme.id}
                      onClick={() => updateSettings({ designTheme: theme.id, background: theme.background, ...theme.events })}
                    >
                      <span className="st-theme-swatch">
                        {theme.preview.map((c) => <i key={c} style={{ background: c }} />)}
                      </span>
                      <span className="st-row-title">{theme.name}</span>
                      <span className="st-row-sub">{theme.description}</span>
                    </button>
                  ))}
                </div>
              </Group>

              <Group title="予定の色">
                {COLOR_ROWS.map(({ label, key }) => (
                  <label key={key} className="st-row is-static">
                    <span className="st-chip-preview" style={{ background: settings[key] as string }} />
                    <span className="st-row-text"><span className="st-row-title">{label}</span></span>
                    <input type="color" className="st-color" value={settings[key] as string} onChange={(e) => updateSettings({ [key]: e.target.value })} aria-label={`${label}の色`} />
                  </label>
                ))}
              </Group>
              <button
                type="button"
                className="st-text-btn"
                onClick={() => {
                  updateSettings({ ...findDesignTheme(settings.designTheme).events });
                  show("予定の色を元に戻しました", "info");
                }}
              >
                予定の色をテーマの色に戻す
              </button>
            </>
          )}

          {/* ───────── 使い方 ───────── */}
          {page === "guide" && (
            <>
              <Group>
                {[
                  { title: "予定を登録", desc: "下の＋か、カレンダーの日付をもう一度タップすると登録画面が開きます。" },
                  { title: "まとめて入力", desc: "よく使う予定を選んで日付を次々タップすると、一気に登録できます。" },
                  { title: "相手と共有", desc: "設定 › ふたり で相手とつながると、予定ごとに「ふたりの予定」などを選べます。" },
                  { title: "スポット", desc: "行きたいお店のURLを貼っておくと、予定の追加からすぐ選べます。行った後は「行った」に移ります。" },
                  { title: "くり返し予定", desc: "誕生日や毎週の予定は、設定 › くり返し予定 に登録するとカレンダーに自動で出ます。" },
                  { title: "色で見分ける", desc: "分類を作ると予定に色の線が付き、種類をひと目で見分けられます。" },
                ].map(({ title, desc }) => (
                  <div key={title} className="st-tip">
                    <span className="st-row-title">{title}</span>
                    <span className="st-row-sub">{desc}</span>
                  </div>
                ))}
              </Group>
              <button
                type="button"
                className="st-text-btn"
                onClick={() => { window.localStorage.removeItem("calendar_tutorial_seen"); show("カレンダーを開くとチュートリアルが表示されます", "info"); }}
              >
                チュートリアルをもう一度見る
              </button>
            </>
          )}
        </div>
      </div>

      {/* アカウント削除の確認 */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1b2421]/45 p-4 pt-8 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-black text-[#1b2421]">アカウントを削除しますか？</h2>
              <button className="st-btn is-ghost is-small" disabled={deletingAccount} onClick={() => setDeleteModalOpen(false)}>閉じる</button>
            </div>
            <p className="mt-3 rounded-2xl bg-[#fff1f2] p-4 text-sm leading-6 text-[#9f1239]">
              予定・分類・共有情報・プロフィールがすべて消え、元に戻せません。本人確認のため、今のパスワードを入力してください。
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="st-label">
                <span>今のパスワード</span>
                <input className="st-input" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
              </label>
              <label className="st-label">
                <span>確認のため「削除する」と入力</span>
                <input className="st-input" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
              </label>
              {deleteError && <p className="rounded-xl bg-[#fff1f2] p-3 text-sm font-bold text-[#be123c]">{deleteError}</p>}
              <div className="st-field-row">
                <button className="st-btn is-ghost flex-1" disabled={deletingAccount} onClick={() => setDeleteModalOpen(false)}>キャンセル</button>
                <button
                  className="st-btn is-danger flex-1"
                  disabled={deletingAccount || !deletePassword || normalizedDeleteConfirmText !== "削除する"}
                  onClick={() => void deleteAccount()}
                >
                  {deletingAccount ? "削除中…" : "完全に削除する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <MobileNavigation />
    </main>
  );
}
