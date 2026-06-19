"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Event, View } from "react-big-calendar";
import { addMonths, addWeeks, addYears, format, getDay, parse, startOfWeek } from "date-fns";
import { ja } from "date-fns/locale/ja";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";
import * as HolidayJp from "@holiday-jp/holiday_jp";

const locales = { ja };
type CalendarWeekStart = "monday" | "sunday";

const createCalendarLocalizer = (weekStartsOn: 0 | 1) =>
  dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn }),
    getDay,
    locales,
  });

const getSavedCalendarWeekStart = (): CalendarWeekStart => {
  if (typeof window === "undefined") return "monday";
  const savedSettings = window.localStorage.getItem("calendar_settings");
  if (!savedSettings) return "monday";

  try {
    const settings = JSON.parse(savedSettings);
    return settings.calendarWeekStart === "sunday" ? "sunday" : "monday";
  } catch {
    return "monday";
  }
};

const formatDateTimeLocal = (date: Date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

const buildDateTimeLocal = (date: Date, time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return formatDateTimeLocal(next);
};

const normalizeEventTimes = (form: EventForm) => {
  if (!form.allDay) {
    return {
      startAt: new Date(form.start).toISOString(),
      endAt: new Date(form.end).toISOString(),
    };
  }

  const startDate = new Date(form.start);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(form.end || form.start);
  endDate.setHours(23, 59, 59, 999);

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  };
};

const getEventsOnDate = (events: CalendarEvent[], date: Date) => {
  const target = format(date, "yyyy-MM-dd");
  return events.filter((event) => format(event.start, "yyyy-MM-dd") === target);
};

const DESIGN_THEMES = {
  clean: { background: "#f5f7fb", accent: "#0f766e" },
  mint: { background: "#f0fdfa", accent: "#0d9488" },
  sky: { background: "#eef6ff", accent: "#2563eb" },
  rose: { background: "#fff7f7", accent: "#e11d48" },
};

// ── Toast ──────────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const show = (message: string, type: ToastType = "info") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };
  return { toasts, show };
}

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

// ── Custom Calendar Toolbar ────────────────────────────────────────────────
function CalendarToolbar({
  label,
  view,
  onNavigate,
  onView,
}: {
  label: string;
  date: Date;
  view: import("react-big-calendar").View;
  views: import("react-big-calendar").View[];
  onNavigate: (action: "PREV" | "NEXT" | "TODAY" | "DATE") => void;
  onView: (view: import("react-big-calendar").View) => void;
}) {
  const viewLabels: Record<string, string> = {
    month: "月",
    week: "週",
    day: "日",
    agenda: "一覧",
  };

  return (
    <div className="mb-3 flex flex-col gap-2">
      {/* ナビゲーション行 */}
      <div className="flex items-center gap-2">
        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d9e2ef] bg-white text-[#475569] shadow-sm transition hover:border-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#0f766e] active:scale-95"
          onClick={() => onNavigate("PREV")}
          aria-label="前へ"
          type="button"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="flex flex-1 flex-col items-center gap-1">
          <span className="text-base font-black text-[#0f172a] sm:text-lg">{label}</span>
          <button
            className="rounded-full border border-[#cbd5e1] bg-[#f8fafc] px-3 py-0.5 text-xs font-bold text-[#475569] transition hover:border-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#0f766e] active:scale-95"
            onClick={() => onNavigate("TODAY")}
            type="button"
          >
            今日
          </button>
        </div>

        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d9e2ef] bg-white text-[#475569] shadow-sm transition hover:border-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#0f766e] active:scale-95"
          onClick={() => onNavigate("NEXT")}
          aria-label="次へ"
          type="button"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* ビュー切替タブ */}
      <div className="flex rounded-xl border border-[#d9e2ef] bg-[#f1f5f9] p-1 gap-1">
        {(["month", "week", "day", "agenda"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`flex-1 rounded-lg py-1.5 text-sm font-bold transition ${
              view === v
                ? "bg-[#0f766e] text-white shadow-sm"
                : "text-[#64748b] hover:bg-white hover:text-[#0f172a]"
            }`}
            onClick={() => onView(v)}
          >
            {viewLabels[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

const LoadingScreen = () => (
  <main className="loading-screen">
    <div className="flex flex-col items-center gap-6" aria-live="polite">
      {/* カレンダーアイコン + リング */}
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="loading-ring" aria-hidden="true" />
        <svg viewBox="0 0 40 40" className="h-10 w-10 text-[#0f766e]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="7" width="32" height="28" rx="4" />
          <line x1="4" y1="15" x2="36" y2="15" />
          <line x1="13" y1="4" x2="13" y2="11" />
          <line x1="27" y1="4" x2="27" y2="11" />
          <rect x="10" y="21" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
          <rect x="18" y="21" width="5" height="5" rx="1" fill="currentColor" stroke="none" opacity="0.4" />
          <rect x="26" y="21" width="5" height="5" rx="1" fill="currentColor" stroke="none" opacity="0.2" />
        </svg>
      </div>

      {/* テキスト */}
      <div className="text-center">
        <p className="text-xl font-black tracking-tight text-[#0f172a]">ShareCal</p>
        <p className="mt-1 text-sm font-semibold text-[#64748b]">予定を読み込んでいます</p>
      </div>

      {/* ドットインジケーター */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="loading-dot"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  </main>
);

type CalendarEvent = Event & {
  id?: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  note: string;
  url: string;
  prefecture: string;
  city: string;
  canDelete: boolean;
  isShared: boolean;
  ownerId: string;
  ownerName: string;
  ownerDeleted: boolean;
  sharedWith: ConnectedUser[];
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  recurringId?: string;
  recurringRule?: RecurrenceRule;
  visibility: EventVisibility;
  displayKind: EventDisplayKind;
};

type DbEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  user_id: string;
  note: string | null;
  url: string | null;
  prefecture?: string | null;
  city?: string | null;
  all_day: boolean | null;
  category_id: string | null;
  event_visibility?: EventVisibility | null;
};

type DbRecurringEvent = DbEvent & {
  recurrence_rule: RecurrenceRule;
  recurrence_until: string | null;
};

type ConnectedUser = {
  id: string;
  username: string;
};

type EventShareIdRow = {
  event_id: string;
  shared_with?: string;
};

type RecurringShareIdRow = {
  recurring_event_id: string;
  shared_with?: string;
};

type SchedulePattern = {
  id: string;
  label: string;
  title: string;
  start_time: string;
  end_time: string;
  next_day_end: boolean;
  category_id: string | null;
  event_visibility?: EventVisibility | null;
  share_user_ids?: string[] | null;
};

type ScheduleCategory = {
  id: string;
  name: string;
  color: string;
};

type SharedNotification = {
  title: string;
  ownerName: string;
};

type EventForm = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  note: string;
  url: string;
  prefecture: string;
  city: string;
  categoryId: string;
  selectedUserIds: string[];
  shareType: EventVisibility;
};

type RecurrenceRule = "none" | "weekly" | "monthly" | "yearly";
type EventVisibility = "private" | "partner" | "together";
type EventDisplayKind = "own" | "partner" | "incoming" | "together";
type CalendarFilter = "all" | "own" | `person:${string}` | `together:${string}`;

type OgData = {
  title: string;
  description: string;
  siteName: string;
  image: string;
  main: { label: string; emoji: string } | null;
  subs: { label: string; emoji: string }[];
  prefecture?: string;
  city?: string;
};

const isJapaneseHoliday = (date: Date): string | null => {
  const holiday = HolidayJp.between(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    new Date(date.getFullYear(), date.getMonth(), date.getDate()),
  )[0];
  return holiday ? holiday.name : null;
};

const extractUrl = (text: string): string => {
  const match = text.match(/https?:\/\/\S+/);
  if (match) return match[0].replace(/[.,)>\]]+$/, "");
  return text.trim();
};

const extractUrlFromClipboard = (clipboardData: DataTransfer): string => {
  // 1. text/uri-list (最も直接的)
  const uriList = clipboardData.getData("text/uri-list");
  if (uriList) {
    const uri = uriList.split("\n").find((line) => /^https?:\/\//i.test(line.trim()));
    if (uri) return uri.trim();
  }
  // 2. text/html の href 属性
  const html = clipboardData.getData("text/html");
  if (html) {
    const hrefMatch = html.match(/href=["']([^"']+)["']/i);
    if (hrefMatch && /^https?:\/\//i.test(hrefMatch[1])) return hrefMatch[1];
  }
  // 3. プレーンテキストからURL抽出
  const text = clipboardData.getData("text/plain") || clipboardData.getData("text");
  return extractUrl(text);
};

const createBlankForm = (date = new Date()): EventForm => {
  const startDate = new Date(date);
  startDate.setHours(9, 0, 0, 0);

  const endDate = new Date(date);
  endDate.setHours(10, 0, 0, 0);

  return {
    title: "",
    start: formatDateTimeLocal(startDate),
    end: formatDateTimeLocal(endDate),
    allDay: false,
    note: "",
    url: "",
    prefecture: "",
    city: "",
    categoryId: "",
    selectedUserIds: [],
    shareType: "together",
  };
};

const getDisplayKind = (
  isShared: boolean,
  hasShareTargets: boolean,
  visibility: EventVisibility | null,
): EventDisplayKind => {
  if (!isShared && !hasShareTargets) return "own";
  if (visibility === "partner") return isShared ? "incoming" : "partner";
  return "together";
};

const getDisplayLabel = (kind: EventDisplayKind) => {
  if (kind === "own") return "自分の予定";
  if (kind === "partner") return "自分の予定を相手に共有";
  if (kind === "incoming") return "相手から共有された予定";
  return "私たちの予定";
};

const getDisplayStyle = (kind: EventDisplayKind) => {
  if (kind === "incoming") {
    return {
      background: "var(--incoming-event-bg)",
      text: "#5b21b6",
      border: "#8b5cf6",
    };
  }

  if (kind === "partner") {
    return {
      background: "var(--partner-event-bg)",
      text: "#075985",
      border: "#38bdf8",
    };
  }

  if (kind === "together") {
    return {
      background: "var(--shared-event-bg)",
      text: "#92400e",
      border: "#f59e0b",
    };
  }

  return {
    background: "var(--own-event-bg)",
    text: "#075985",
    border: "var(--uncategorized-event)",
  };
};

const addByRecurrence = (date: Date, rule: RecurrenceRule) => {
  if (rule === "weekly") return addWeeks(date, 1);
  if (rule === "monthly") return addMonths(date, 1);
  if (rule === "yearly") return addYears(date, 1);
  return date;
};

const expandRecurringEvents = (
  rows: DbRecurringEvent[],
  categoryMap: Map<string, ScheduleCategory>,
  meta: {
    canDelete: boolean;
    isShared: boolean;
    ownerName: string;
    ownerDeleted?: boolean;
    sharedWith?: ConnectedUser[];
    visibility?: EventVisibility;
  },
): CalendarEvent[] => {
  const now = new Date();
  const windowStart = addYears(now, -1);
  const windowEnd = addYears(now, 2);

  return rows.flatMap((row) => {
    if (row.recurrence_rule === "none") return [];

    const originalStart = new Date(row.start_at);
    const originalEnd = new Date(row.end_at);
    const duration = originalEnd.getTime() - originalStart.getTime();
    const until = row.recurrence_until ? new Date(row.recurrence_until) : windowEnd;
    const events: CalendarEvent[] = [];
    let occurrenceStart = originalStart;
    let guard = 0;

    while (occurrenceStart <= until && occurrenceStart <= windowEnd && guard < 500) {
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);

      if (occurrenceEnd >= windowStart) {
        events.push({
          id: `${row.id}:${occurrenceStart.toISOString()}`,
          title: row.title,
          start: occurrenceStart,
          end: occurrenceEnd,
          allDay: row.all_day ?? false,
          note: row.note ?? "",
          url: row.url ?? "",
          prefecture: row.prefecture ?? "",
          city: row.city ?? "",
          canDelete: meta.canDelete,
          isShared: meta.isShared,
          ownerId: row.user_id,
          ownerName: meta.ownerName,
          ownerDeleted: meta.ownerDeleted ?? false,
          categoryId: row.category_id,
          categoryName: row.category_id
            ? categoryMap.get(row.category_id)?.name ?? "分類"
            : "未分類",
          categoryColor: meta.isShared
            ? null
            : row.category_id
            ? categoryMap.get(row.category_id)?.color ?? null
            : null,
          sharedWith: meta.sharedWith ?? [],
          recurringId: row.id,
          recurringRule: row.recurrence_rule,
          visibility: meta.visibility ?? "private",
          displayKind: getDisplayKind(
            meta.isShared,
            (meta.sharedWith ?? []).length > 0,
            meta.visibility ?? "private",
          ),
        });
      }

      occurrenceStart = addByRecurrence(occurrenceStart, row.recurrence_rule);
      guard += 1;
    }

    return events;
  });
};

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [connections, setConnections] = useState<ConnectedUser[]>([]);
  const [patterns, setPatterns] = useState<SchedulePattern[]>([]);
  const [categories, setCategories] = useState<ScheduleCategory[]>([]);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<View>("month");
  const [calendarWeekStart] = useState<CalendarWeekStart>(() =>
    getSavedCalendarWeekStart(),
  );
  const [eventForm, setEventForm] = useState<EventForm>(() => createBlankForm());
  const [editForm, setEditForm] = useState<EventForm>(() => createBlankForm());
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [ogData, setOgData] = useState<OgData | null>(null);
  const [ogLoading, setOgLoading] = useState(false);
  const [shareDraftIds, setShareDraftIds] = useState<string[]>([]);
  const [dayDetail, setDayDetail] = useState<{
    date: Date;
    events: CalendarEvent[];
  } | null>(null);
  const [isDayEventsOpen, setIsDayEventsOpen] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [notificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const savedSettings = window.localStorage.getItem("calendar_settings");
    if (!savedSettings) return true;
    return JSON.parse(savedSettings).notificationsEnabled ?? true;
  });
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("sharecal_notification_prompt_dismissed") !== "true";
  });
  const [sharedNotification, setSharedNotification] =
    useState<SharedNotification | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const { toasts, show } = useToast();
  const calendarLocalizer = useMemo(
    () => createCalendarLocalizer(calendarWeekStart === "sunday" ? 0 : 1),
    [calendarWeekStart],
  );
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<CalendarEvent | null>(null);

  const fetchConnections = useCallback(async (userId: string) => {
    const { data: acceptedConnections, error } = await supabase
      .from("connections")
      .select("requester_id, receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);

    if (error) {
      console.error(error);
      return [];
    }

    const userIds = (acceptedConnections ?? []).map((connection) =>
      connection.requester_id === userId
        ? connection.receiver_id
        : connection.requester_id,
    );

    if (userIds.length === 0) return [];

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", userIds);

    if (profileError) {
      console.error(profileError);
      return [];
    }

    return profiles ?? [];
  }, []);

  const fetchPatterns = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("schedule_patterns")
      .select("id, label, title, start_time, end_time, next_day_end, category_id, event_visibility, share_user_ids")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      return [];
    }

    return data ?? [];
  }, []);

  const fetchCategories = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("schedule_categories")
      .select("id, name, color")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) return [];

    return data ?? [];
  }, []);

  const notifyNewSharedEvents = useCallback((shared: CalendarEvent[], userId: string) => {
    if (typeof window === "undefined") return;
    if (!notificationsEnabled) return;

    const storageKey = `calendar_seen_shared_events_${userId}`;
    const currentIds = shared.map((event) => event.id).filter(Boolean) as string[];
    const saved = window.localStorage.getItem(storageKey);

    if (!saved) {
      window.localStorage.setItem(storageKey, JSON.stringify(currentIds));
      return;
    }

    const seenIds = new Set(JSON.parse(saved) as string[]);
    const newEvents = shared.filter((event) => event.id && !seenIds.has(event.id));

    window.localStorage.setItem(storageKey, JSON.stringify(currentIds));

    if (newEvents.length === 0) return;

    const newest = newEvents[0];
    setSharedNotification({
      title: newest.title,
      ownerName: newest.ownerName,
    });

    window.setTimeout(() => setSharedNotification(null), 6000);

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("予定が共有されました", {
        body: `${newest.ownerName}さんから「${newest.title}」が共有されました`,
      });
    }
  }, [notificationsEnabled]);

  const fetchEvents = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    let { data: myEvents, error: myError } = await supabase
        .from("events")
        .select("id, title, start_at, end_at, user_id, note, url, prefecture, city, all_day, category_id, event_visibility")
        .eq("user_id", user.id);

    if (myError?.code === "42703") {
      const fallback = await supabase
        .from("events")
        .select("id, title, start_at, end_at, user_id")
        .eq("user_id", user.id);

      myEvents = fallback.data?.map((event) => ({
        ...event,
        note: null,
        url: null,
        prefecture: null,
        city: null,
        all_day: false,
        category_id: null,
        event_visibility: "private",
      })) ?? null;
      myError = fallback.error;
    }

    if (myError) {
      console.error(myError);
      return;
    }

    let { data: recurringEvents, error: recurringError } = await supabase
      .from("recurring_events")
      .select("id, title, start_at, end_at, user_id, note, all_day, category_id, event_visibility, recurrence_rule, recurrence_until")
      .eq("user_id", user.id);

    if (recurringError?.code === "PGRST205") {
      recurringEvents = [];
      recurringError = null;
    }

    if (recurringError) {
      console.error(recurringError);
      recurringEvents = [];
    }

    const { data: sharedRecurringRows } = await supabase
      .from("recurring_event_shares")
      .select("recurring_event_id, shared_with")
      .eq("shared_with", user.id);

    const sharedRecurringIds = ((sharedRecurringRows ?? []) as RecurringShareIdRow[]).map(
      (row) => row.recurring_event_id,
    );

    let sharedRecurringEvents: DbRecurringEvent[] = [];

    if (sharedRecurringIds.length > 0) {
      const { data, error } = await supabase
        .from("recurring_events")
        .select("id, title, start_at, end_at, user_id, note, all_day, category_id, event_visibility, recurrence_rule, recurrence_until")
        .in("id", sharedRecurringIds);

      if (!error) {
        sharedRecurringEvents = (data ?? []) as DbRecurringEvent[];
      }
    }

    const { data: sharedRows, error: sharedError } = await supabase
      .from("event_shares")
      .select("event_id, shared_with")
      .eq("shared_with", user.id);

    if (sharedError) {
      console.error(sharedError);
      return;
    }

    const sharedEventIds = ((sharedRows ?? []) as EventShareIdRow[]).map(
      (row) => row.event_id,
    );

    let sharedEvents: DbEvent[] = [];

    if (sharedEventIds.length > 0) {
      let { data, error } = await supabase
        .from("events")
        .select("id, title, start_at, end_at, user_id, note, url, prefecture, city, all_day, category_id, event_visibility")
        .in("id", sharedEventIds);

      if (error?.code === "42703") {
        const fallback = await supabase
          .from("events")
          .select("id, title, start_at, end_at, user_id")
          .in("id", sharedEventIds);

        data = fallback.data?.map((event) => ({
          ...event,
          note: null,
          url: null,
          prefecture: null,
          city: null,
          all_day: false,
          category_id: null,
          event_visibility: "together",
        })) ?? null;
        error = fallback.error;
      }

      if (error) {
        console.error(error);
        return;
      }

      sharedEvents = data ?? [];
    }

    const myEventIds = (myEvents ?? []).map((event) => event.id);
    let myShareRows: Required<EventShareIdRow>[] = [];
    const myRecurringIds = ((recurringEvents ?? []) as DbRecurringEvent[]).map((event) => event.id);
    let myRecurringShareRows: Required<RecurringShareIdRow>[] = [];

    if (myEventIds.length > 0) {
      const { data, error } = await supabase
        .from("event_shares")
        .select("event_id, shared_with")
        .in("event_id", myEventIds);

      if (!error) {
        myShareRows = (data ?? []) as Required<EventShareIdRow>[];
      }
    }

    if (myRecurringIds.length > 0) {
      const { data, error } = await supabase
        .from("recurring_event_shares")
        .select("recurring_event_id, shared_with")
        .in("recurring_event_id", myRecurringIds);

      if (!error) {
        myRecurringShareRows = (data ?? []) as Required<RecurringShareIdRow>[];
      }
    }

    const profileIds = Array.from(new Set([
      ...sharedEvents.map((event) => event.user_id),
      ...sharedRecurringEvents.map((event) => event.user_id),
      ...myShareRows.map((row) => row.shared_with),
      ...myRecurringShareRows.map((row) => row.shared_with),
    ]));
    let profileMap = new Map<string, string>();
    const categoryIds = Array.from(new Set([
      ...(myEvents ?? []).map((event) => event.category_id).filter(Boolean),
      ...sharedEvents.map((event) => event.category_id).filter(Boolean),
      ...(recurringEvents ?? []).map((event) => event.category_id).filter(Boolean),
      ...sharedRecurringEvents.map((event) => event.category_id).filter(Boolean),
    ])) as string[];
    let categoryMap = new Map<string, ScheduleCategory>();

    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", profileIds);

      profileMap = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile.username]),
      );
    }

    if (categoryIds.length > 0) {
      const { data: eventCategories } = await supabase
        .from("schedule_categories")
        .select("id, name, color")
        .in("id", categoryIds);

      categoryMap = new Map(
        (eventCategories ?? []).map((category) => [category.id, category]),
      );
    }

    const formatted = [
      ...(myEvents ?? []).map((event) => ({
        ...event,
        canDelete: true,
        isShared: false,
        ownerId: user.id,
        ownerName: "自分",
        ownerDeleted: false,
      })),
      ...sharedEvents.map((event) => ({
        ...event,
        canDelete: false,
        isShared: true,
        ownerId: event.user_id,
        ownerName: profileMap.get(event.user_id) ?? "削除されたアカウント",
        ownerDeleted: !profileMap.has(event.user_id),
      })),
    ].map((event) => {
      const sharedWith = myShareRows
        .filter((row) => row.event_id === event.id)
        .map((row) => ({
          id: row.shared_with,
          username: profileMap.get(row.shared_with) ?? "共有先",
        }));
      const visibility = event.event_visibility ?? (sharedWith.length > 0 ? "together" : "private");

      return {
        id: event.id,
        title: event.title,
        start: new Date(event.start_at),
        end: new Date(event.end_at),
        allDay: event.all_day ?? false,
        note: event.note ?? "",
        url: event.url ?? "",
        prefecture: event.prefecture ?? "",
        city: event.city ?? "",
        canDelete: event.canDelete,
        isShared: event.isShared,
        ownerId: event.ownerId,
        ownerName: event.ownerName,
        ownerDeleted: event.ownerDeleted ?? false,
        categoryId: event.category_id,
        categoryName: event.category_id
          ? categoryMap.get(event.category_id)?.name ?? "分類"
          : "未分類",
        categoryColor: event.isShared
          ? null
          : event.category_id
          ? categoryMap.get(event.category_id)?.color ?? null
          : null,
        sharedWith,
        visibility,
        displayKind: getDisplayKind(event.isShared, sharedWith.length > 0, visibility),
      };
    });

    const expandedRecurring = ((recurringEvents ?? []) as DbRecurringEvent[]).flatMap((event) => {
      const sharedWith = myRecurringShareRows
        .filter((row) => row.recurring_event_id === event.id)
        .map((row) => ({
          id: row.shared_with,
          username: profileMap.get(row.shared_with) ?? "共有先",
        }));

      return expandRecurringEvents([event], categoryMap, {
        canDelete: true,
        isShared: false,
        ownerName: "自分",
        sharedWith,
        visibility: event.event_visibility ?? (sharedWith.length > 0 ? "together" : "private"),
      });
    });

    const expandedSharedRecurring = sharedRecurringEvents.flatMap((event) =>
      expandRecurringEvents([event], categoryMap, {
        canDelete: false,
        isShared: true,
        ownerName: profileMap.get(event.user_id) ?? "削除されたアカウント",
        ownerDeleted: !profileMap.has(event.user_id),
        visibility: event.event_visibility ?? "together",
      }),
    );

    setEvents([...formatted, ...expandedRecurring, ...expandedSharedRecurring]);
    notifyNewSharedEvents(
      formatted.filter((event) => event.isShared),
      user.id,
    );
  }, [notifyNewSharedEvents]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShareDraftIds(detailEvent?.sharedWith.map((user) => user.id) ?? []);
    if (detailEvent) {
      setEditForm({
        title: detailEvent.title,
        start: formatDateTimeLocal(detailEvent.start),
        end: formatDateTimeLocal(detailEvent.end),
        allDay: detailEvent.allDay,
        note: detailEvent.note,
        url: detailEvent.url,
        prefecture: detailEvent.prefecture,
        city: detailEvent.city,
        categoryId: detailEvent.categoryId ?? "",
        selectedUserIds: detailEvent.sharedWith.map((user) => user.id),
        shareType: detailEvent.visibility === "private" ? "together" : detailEvent.visibility,
      });
    }
  }, [detailEvent]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOgData(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOgLoading(false);
    if (!detailEvent?.url) return;
    const normalizedForFetch = /^https?:\/\//i.test(detailEvent.url)
      ? detailEvent.url
      : `https://${detailEvent.url}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOgLoading(true);
    fetch(`/api/og?url=${encodeURIComponent(normalizedForFetch)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<OgData>;
      })
      .then((data) => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOgData(data);
      })
      .catch(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOgData({ title: "", description: "", siteName: "", image: "", main: null, subs: [] });
      })
      .finally(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOgLoading(false);
      });
  }, [detailEvent]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    const savedSettings = window.localStorage.getItem("calendar_settings");
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      const theme =
        DESIGN_THEMES[settings.designTheme as keyof typeof DESIGN_THEMES] ??
        DESIGN_THEMES.clean;
      const isDarkMode = document.documentElement.getAttribute("data-theme") === "dark";
      if (!isDarkMode) {
        document.documentElement.style.setProperty("--app-bg", theme.background);
        document.documentElement.style.setProperty("--background", theme.background);
      }
      document.documentElement.style.setProperty("--app-accent", theme.accent);
      document.documentElement.style.setProperty("--accent", theme.accent);
      document.documentElement.style.setProperty(
        "--own-event-bg",
        settings.ownEventBackground ?? settings.ownEvent ?? "#e0f2fe",
      );
      document.documentElement.style.setProperty(
        "--shared-event-bg",
        settings.sharedEventBackground ?? settings.sharedEvent ?? "#fef3c7",
      );
      document.documentElement.style.setProperty(
        "--partner-event-bg",
        settings.partnerEventBackground ?? settings.ownEventBackground ?? "#e0f2fe",
      );
      document.documentElement.style.setProperty(
        "--incoming-event-bg",
        settings.incomingEventBackground ?? "#ede9fe",
      );
      document.documentElement.style.setProperty(
        "--uncategorized-event",
        settings.unclassifiedEvent ?? settings.ownEvent ?? "#22c8d6",
      );
    }

    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.onboarding_completed) {
        router.push("/onboarding");
        return;
      }

      const [acceptedUsers, userPatterns, userCategories] = await Promise.all([
        fetchConnections(user.id),
        fetchPatterns(user.id),
        fetchCategories(user.id),
        fetchEvents(),
      ]);

      setConnections(acceptedUsers);
      setPatterns(userPatterns);
      setCategories(userCategories);
      setLoading(false);
      if (!window.localStorage.getItem("calendar_tutorial_seen")) {
        setShowTutorial(true);
      }
    };

    void checkUser();
    const intervalId = window.setInterval(() => {
      void fetchEvents();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [fetchCategories, fetchConnections, fetchEvents, fetchPatterns, router]);

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      show("このブラウザでは通知が使えません。", "error");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const openEventModal = (date = new Date()) => {
    setEventForm(createBlankForm(date));
    setIsEventModalOpen(true);
  };

  const openDetailEvent = (event: CalendarEvent) => {
    setDetailEvent(event);
    setIsDetailEditing(false);
  };

  const applyPattern = (pattern: SchedulePattern) => {
    const baseDate = new Date(eventForm.start);
    const startValue = buildDateTimeLocal(baseDate, pattern.start_time);
    const endBase = new Date(baseDate);

    if (pattern.next_day_end) {
      endBase.setDate(endBase.getDate() + 1);
    }

    setEventForm((current) => ({
      ...current,
      title: pattern.title,
      start: startValue,
      end: buildDateTimeLocal(endBase, pattern.end_time),
      categoryId: pattern.category_id ?? current.categoryId,
      selectedUserIds: pattern.share_user_ids ?? [],
      shareType:
        pattern.event_visibility && pattern.event_visibility !== "private"
          ? pattern.event_visibility
          : current.shareType,
    }));
  };

  const applyPatternAndSave = async (pattern: SchedulePattern) => {
    const baseDate = new Date(eventForm.start);
    const startValue = buildDateTimeLocal(baseDate, pattern.start_time);
    const endBase = new Date(baseDate);

    if (pattern.next_day_end) {
      endBase.setDate(endBase.getDate() + 1);
    }

    const patternForm: EventForm = {
      ...eventForm,
      title: pattern.title,
      start: startValue,
      end: buildDateTimeLocal(endBase, pattern.end_time),
      categoryId: pattern.category_id ?? eventForm.categoryId,
      selectedUserIds: pattern.share_user_ids ?? [],
      shareType:
        pattern.event_visibility && pattern.event_visibility !== "private"
          ? (pattern.event_visibility as EventVisibility)
          : eventForm.shareType,
    };

    await addEventWithForm(patternForm, true);
  };

  const isEndOnNextDay = (form: EventForm) => {
    const start = new Date(form.start);
    const end = new Date(form.end || form.start);
    return format(start, "yyyy-MM-dd") !== format(end, "yyyy-MM-dd");
  };

  const toggleEndNextDay = (target: "new" | "edit") => {
    const form = target === "new" ? eventForm : editForm;
    const start = new Date(form.start);
    const end = new Date(form.end || form.start);
    const nextEnd = new Date(start);
    nextEnd.setDate(nextEnd.getDate() + (isEndOnNextDay(form) ? 0 : 1));
    nextEnd.setHours(end.getHours(), end.getMinutes(), 0, 0);

    if (target === "new") {
      setEventForm((current) => ({ ...current, end: formatDateTimeLocal(nextEnd) }));
      return;
    }

    setEditForm((current) => ({ ...current, end: formatDateTimeLocal(nextEnd) }));
  };

  const addEventWithForm = async (form: EventForm, keepOpen = false) => {
    if (!form.title.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { startAt, endAt } = normalizeEventTimes(form);
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      show("終了日時は開始日時より後にしてください", "error");
      return;
    }
    const eventPayload = {
      title: form.title.trim(),
      start_at: startAt,
      end_at: endAt,
      all_day: form.allDay,
      category_id: form.categoryId || null,
      note: form.note.trim() || null,
      url: form.url.trim() || null,
      prefecture: form.prefecture.trim() || null,
      city: form.city.trim() || null,
      event_visibility:
        form.selectedUserIds.length > 0 ? form.shareType : "private",
      user_id: user.id,
    };

    let { data: insertedEvent, error } = await supabase
      .from("events")
      .insert(eventPayload)
      .select()
      .single();

    if (error?.code === "PGRST204" || error?.code === "42703") {
      // まず新しい列(prefecture/city)だけ外して再試行（分類・メモ等は維持）
      const { prefecture, city, ...withoutLocation } = eventPayload;
      let retry = await supabase.from("events").insert(withoutLocation).select().single();

      if (retry.error?.code === "PGRST204" || retry.error?.code === "42703") {
        // さらに古いDB向け: メモ・終日・分類等も外す
        const { note, all_day, category_id, event_visibility, ...minimal } = withoutLocation;
        retry = await supabase.from("events").insert(minimal).select().single();
        if (!retry.error && (note || all_day || category_id || event_visibility !== "private")) {
          show("DB列がまだ不足しています。SQL実行後はメモ・終日・分類も保存されます。", "error");
        }
      } else if (!retry.error && (prefecture || city)) {
        show("場所を保存するにはSQL（prefecture/city列の追加）を実行してください。", "error");
      }

      insertedEvent = retry.data;
      error = retry.error;
    }

    if (error || !insertedEvent) {
      console.error(error);
      show("予定の追加に失敗しました", "error");
      return;
    }

    if (form.selectedUserIds.length > 0) {
      const shareRows = form.selectedUserIds.map((userId) => ({
        event_id: insertedEvent.id,
        shared_with: userId,
      }));

      const { error: shareError } = await supabase
        .from("event_shares")
        .insert(shareRows);

      if (shareError) {
        console.error("event_shares insert error:", {
          code: shareError.code,
          message: shareError.message,
          details: shareError.details,
          hint: shareError.hint,
          shareRows,
        });
        show(`予定は追加しましたが、共有に失敗しました: ${shareError.message}`, "error");
        return;
      }
    }

    show("予定を追加しました", "success");
    if (keepOpen) {
      // パネルを開いたまま翌日へ移動
      const nextDate = new Date(form.start);
      nextDate.setDate(nextDate.getDate() + 1);
      setEventForm(createBlankForm(nextDate));
    } else {
      setIsEventModalOpen(false);
    }
    await fetchEvents();
  };

  const addEvent = async () => addEventWithForm(eventForm, false);

  const updateEvent = async () => {
    if (!detailEvent?.id || !detailEvent.canDelete) return;
    if (!editForm.title.trim()) return;

    const { startAt, endAt } = normalizeEventTimes(editForm);
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      show("終了日時は開始日時より後にしてください", "error");
      return;
    }
    const payload = {
      title: editForm.title.trim(),
      start_at: startAt,
      end_at: endAt,
      all_day: editForm.allDay,
      category_id: editForm.categoryId || null,
      note: editForm.note.trim() || null,
      url: editForm.url.trim() || null,
      prefecture: editForm.prefecture.trim() || null,
      city: editForm.city.trim() || null,
      event_visibility: shareDraftIds.length > 0 ? editForm.shareType : "private",
    };

    if (detailEvent.recurringId) {
      const { error } = await supabase
        .from("recurring_events")
        .update(payload)
        .eq("id", detailEvent.recurringId);

      if (error) {
        console.error(error);
        show(error.message, "error");
        return;
      }

      await supabase
        .from("recurring_event_shares")
        .delete()
        .eq("recurring_event_id", detailEvent.recurringId);

      if (shareDraftIds.length > 0) {
        const { error: shareError } = await supabase.from("recurring_event_shares").insert(
          shareDraftIds.map((userId) => ({
            recurring_event_id: detailEvent.recurringId,
            shared_with: userId,
          })),
        );

        if (shareError) {
          console.error(shareError);
          show(shareError.message, "error");
          return;
        }
      }

      await fetchEvents();
      setDetailEvent(null);
      return;
    }

    let { error } = await supabase
      .from("events")
      .update(payload)
      .eq("id", detailEvent.id);

    if (error?.code === "PGRST204" || error?.code === "42703") {
      // まず新しい列(prefecture/city)だけ外して再試行（分類・メモ等は維持）
      const { prefecture, city, ...withoutLocation } = payload;
      let retry = await supabase.from("events").update(withoutLocation).eq("id", detailEvent.id);

      if (retry.error?.code === "PGRST204" || retry.error?.code === "42703") {
        // さらに古いDB向け: メモ・終日・分類等も外す
        const { note, all_day, category_id, event_visibility, ...minimal } = withoutLocation;
        retry = await supabase.from("events").update(minimal).eq("id", detailEvent.id);
        if (!retry.error && (note || all_day || category_id || event_visibility !== "private")) {
          show("DB列がまだ不足しています。SQL実行後はメモ・終日・分類も保存されます。", "error");
        }
      } else if (!retry.error && (prefecture || city)) {
        show("場所を保存するにはSQL（prefecture/city列の追加）を実行してください。", "error");
      }

      error = retry.error;
    }

    if (error) {
      console.error(error);
      show(error.message, "error");
      return;
    }

    // Sync event_shares for regular (non-recurring) events
    await supabase.from("event_shares").delete().eq("event_id", detailEvent.id);
    if (shareDraftIds.length > 0) {
      const { error: shareError } = await supabase.from("event_shares").insert(
        shareDraftIds.map((userId) => ({ event_id: detailEvent.id, shared_with: userId })),
      );
      if (shareError) {
        console.error(shareError);
        show(shareError.message, "error");
        return;
      }
    }

    show("予定を更新しました", "success");
    await fetchEvents();
    setDetailEvent(null);
  };

  const deleteEvent = async (event: CalendarEvent, confirmed = false) => {
    if (!event.id) return;
    if (!event.canDelete) {
      if (event.isShared && event.ownerDeleted) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        if (event.recurringId) {
          await supabase
            .from("recurring_event_shares")
            .delete()
            .eq("recurring_event_id", event.recurringId)
            .eq("shared_with", user.id);
        } else {
          await supabase
            .from("event_shares")
            .delete()
            .eq("event_id", event.id)
            .eq("shared_with", user.id);
        }

        setDetailEvent(null);
        setDayDetail(null);
        await fetchEvents();
        return;
      }

      show("共有された予定は作成者だけが削除できます", "error");
      return;
    }

    if (!confirmed) {
      setConfirmDeleteEvent(event);
      return;
    }

    setConfirmDeleteEvent(null);

    if (event.recurringId) {
      const { error } = await supabase
        .from("recurring_events")
        .delete()
        .eq("id", event.recurringId);

      if (error) {
        console.error(error);
        show("削除に失敗しました", "error");
        return;
      }

      show("予定を削除しました", "success");
      setDetailEvent(null);
      setDayDetail(null);
      await fetchEvents();
      return;
    }

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", event.id);

    if (error) {
      console.error(error);
      show("削除に失敗しました", "error");
      return;
    }

    show("予定を削除しました", "success");
    setDetailEvent(null);
    setDayDetail(null);
    await fetchEvents();
  };

  const updateEventShares = async () => {
    if (!detailEvent?.id || !detailEvent.canDelete) return;

    if (detailEvent.recurringId) {
      const { error: deleteError } = await supabase
        .from("recurring_event_shares")
        .delete()
        .eq("recurring_event_id", detailEvent.recurringId);

      if (deleteError) {
        console.error(deleteError);
        show(deleteError.message, "error");
        return;
      }

      await supabase
        .from("recurring_events")
        .update({ event_visibility: shareDraftIds.length > 0 ? editForm.shareType : "private" })
        .eq("id", detailEvent.recurringId);

      if (shareDraftIds.length > 0) {
        const { error: insertError } = await supabase.from("recurring_event_shares").insert(
          shareDraftIds.map((userId) => ({
            recurring_event_id: detailEvent.recurringId,
            shared_with: userId,
          })),
        );

        if (insertError) {
          console.error(insertError);
          show(insertError.message, "error");
          return;
        }
      }

      show("共有設定を保存しました", "success");
      await fetchEvents();
      setDetailEvent(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("event_shares")
      .delete()
      .eq("event_id", detailEvent.id);

    if (deleteError) {
      console.error(deleteError);
      show(deleteError.message, "error");
      return;
    }

    if (shareDraftIds.length > 0) {
      await supabase
        .from("events")
        .update({ event_visibility: editForm.shareType })
        .eq("id", detailEvent.id);

      const { error: insertError } = await supabase.from("event_shares").insert(
        shareDraftIds.map((userId) => ({
          event_id: detailEvent.id,
          shared_with: userId,
        })),
      );

      if (insertError) {
        console.error(insertError);
        show(insertError.message, "error");
        return;
      }
    } else {
      await supabase
        .from("events")
        .update({ event_visibility: "private" })
        .eq("id", detailEvent.id);
    }

    show("共有設定を保存しました", "success");
    await fetchEvents();
    setDetailEvent(null);
  };

  const filterEvents = useCallback((items: CalendarEvent[]) => {
    if (calendarFilter === "all") return items;
    if (calendarFilter === "own") {
      // "own" = 自分が作った予定（共有中＝partnerも含む）
      return items.filter((event) => event.displayKind === "own" || event.displayKind === "partner");
    }
    if (calendarFilter.startsWith("person:")) {
      const personId = calendarFilter.replace("person:", "");
      return items.filter(
        (event) =>
          event.displayKind === "incoming" &&
          event.ownerId === personId,
      );
    }
    if (calendarFilter.startsWith("together:")) {
      const personId = calendarFilter.replace("together:", "");
      return items.filter(
        (event) =>
          event.displayKind === "together" &&
          (event.ownerId === personId || event.sharedWith.some((user) => user.id === personId)),
      );
    }
    return items;
  }, [calendarFilter]);

  const visibleEvents = filterEvents(events);
  const selectedDayDate = dayDetail?.date ?? calendarDate;
  const selectedDayEvents = dayDetail?.events
    ? filterEvents(dayDetail.events)
    : getEventsOnDate(visibleEvents, selectedDayDate);
  const monthStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
  const monthEnd = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0, 23, 59, 59, 999);
  const isInSelectedMonth = (event: CalendarEvent) =>
    event.start <= monthEnd && event.end >= monthStart;
  const getFilterCount = (value: CalendarFilter) => {
    const monthlyEvents = events.filter(isInSelectedMonth);
    if (value === "all") return monthlyEvents.length;
    if (value === "own") {
      return monthlyEvents.filter((event) => event.displayKind === "own" || event.displayKind === "partner").length;
    }
    if (value.startsWith("person:")) {
      const personId = value.replace("person:", "");
      return monthlyEvents.filter(
        (event) => event.displayKind === "incoming" && event.ownerId === personId,
      ).length;
    }
    if (value.startsWith("together:")) {
      const personId = value.replace("together:", "");
      return monthlyEvents.filter(
        (event) =>
          event.displayKind === "together" &&
          (event.ownerId === personId || event.sharedWith.some((user) => user.id === personId)),
      ).length;
    }
    return monthlyEvents.length;
  };
  const filterOptions = [
    {
      value: "all" as CalendarFilter,
      label: "すべて",
      description: `${format(calendarDate, "M月", { locale: ja })} ${getFilterCount("all")}件`,
      color: "#0f766e",
    },
    {
      value: "own" as CalendarFilter,
      label: "自分だけ",
      description: `${format(calendarDate, "M月", { locale: ja })} ${getFilterCount("own")}件`,
      color: "#38bdf8",
    },
    ...connections.flatMap((connection) => [
      {
        value: `person:${connection.id}` as CalendarFilter,
        label: connection.username,
        description: `相手の予定 ${getFilterCount(`person:${connection.id}`)}件`,
        color: "#8b5cf6",
      },
      {
        value: `together:${connection.id}` as CalendarFilter,
        label: `${connection.username}さんと`,
        description: `私たちの予定 ${getFilterCount(`together:${connection.id}`)}件`,
        color: "#f59e0b",
      },
    ]),
  ];

  const openDateForRegistration = (date: Date) => {
    setDayDetail({
      date,
      events: getEventsOnDate(events, date),
    });
    openEventModal(date);
  };

  // ── Keyboard shortcuts: T=today, N=new, /=filter focus, Esc=close ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        if (e.key === "Escape") (target as HTMLElement).blur();
        return;
      }
      if (e.key === "Escape") {
        if (isEventModalOpen) { setIsEventModalOpen(false); return; }
        if (detailEvent) { setDetailEvent(null); return; }
        if (dayDetail) { setDayDetail(null); return; }
        if (showTutorial) { setShowTutorial(false); return; }
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openEventModal(calendarDate);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setCalendarDate(new Date());
      } else if (e.key === "/" ) {
        e.preventDefault();
        setIsFilterOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [calendarDate, isEventModalOpen, detailEvent, dayDetail, showTutorial]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <main className="page-shell page-shell-home min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-4 lg:px-8">

      {/* ========== モバイル専用レイアウト ========== */}
      <div className="page-shell-mobile-inner sm:hidden">

        {/* 通知プロンプト（モバイル） */}
        {notificationsEnabled && showNotificationPrompt && notificationPermission === "default" && (
          <div className="relative flex items-center gap-2 rounded-xl border border-[#bae6fd] bg-[#f0f9ff] px-3 py-2">
            <p className="flex-1 text-xs font-bold text-[#075985]">共有通知を受け取りますか？</p>
            <button className="rounded-lg bg-[#0f766e] px-3 py-1 text-xs font-bold text-white" onClick={requestNotificationPermission}>許可</button>
            <button className="text-[#94a3b8]" onClick={() => { window.localStorage.setItem("sharecal_notification_prompt_dismissed", "true"); setShowNotificationPrompt(false); }}>✕</button>
          </div>
        )}

        {/* 絞り込みバー（モバイル） */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold transition ${
                calendarFilter === option.value
                  ? "border-[#0f766e] bg-[#0f766e] text-white"
                  : "border-[#d9e2ef] bg-white text-[#475569]"
              }`}
              onClick={() => setCalendarFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* カレンダー（モバイル） */}
        <div className="calendar-section-mobile rounded-xl border border-[#d9e2ef] bg-white shadow-sm overflow-hidden">
          <div className="calendar-shell h-full">
            <Calendar<CalendarEvent>
              key={calendarWeekStart + "-mobile"}
              localizer={calendarLocalizer}
              events={visibleEvents}
              startAccessor="start"
              endAccessor="end"
              allDayAccessor="allDay"
              culture="ja"
              date={calendarDate}
              view={calendarView}
              dayLayoutAlgorithm="no-overlap"
              popup
              selectable="ignoreEvents"
              eventPropGetter={(event) => ({
                className: `${event.displayKind}-event`,
                style: {
                  backgroundColor: getDisplayStyle(event.displayKind).background,
                  borderLeft: `4px solid ${event.categoryColor ?? getDisplayStyle(event.displayKind).border}`,
                  color: getDisplayStyle(event.displayKind).text,
                },
              })}
              onNavigate={(date) => setCalendarDate(date)}
              onView={(view) => setCalendarView(view)}
              longPressThreshold={350}
              components={{
                toolbar: CalendarToolbar,
                month: {
                  dateHeader: ({ date, label }) => {
                    const dow = date.getDay();
                    const holidayName = isJapaneseHoliday(date);
                    const isHoliday = holidayName !== null;
                    const color =
                      isHoliday || dow === 0 ? "#e11d48"
                      : dow === 6            ? "#2563eb"
                      :                        undefined;
                    return (
                      <button
                        className="calendar-date-button"
                        style={color ? { color } : undefined}
                        type="button"
                        title={holidayName ?? undefined}
                        onPointerUp={(event) => { event.preventDefault(); event.stopPropagation(); openDateForRegistration(date); }}
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); openDateForRegistration(date); }}
                      >
                        {label}
                      </button>
                    );
                  },
                },
              }}
              onDrillDown={(date) => { openDateForRegistration(date); }}
              onShowMore={(shownEvents, date) => { setDayDetail({ date, events: shownEvents as CalendarEvent[] }); }}
              onSelectSlot={(slotInfo) => {
                if (slotInfo.action === "select") return;
                const date = Array.isArray(slotInfo.slots) ? slotInfo.slots[0] : slotInfo.start;
                openDateForRegistration(date as Date);
              }}
              onSelectEvent={(event) => openDetailEvent(event)}
            />
          </div>
        </div>

        {/* 本日の予定バー（モバイル） */}
        <div className="shrink-0 rounded-xl border border-[#d9e2ef] bg-white shadow-sm">
          <button
            className="flex w-full items-center justify-between px-3 py-2"
            onClick={() => setIsDayEventsOpen((v) => !v)}
          >
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#0f172a]">
                {format(selectedDayDate, "M/d(E)", { locale: ja })} の予定
              </span>
              {selectedDayEvents.length > 0 && (
                <span className="rounded-full bg-[#0f766e] px-2 py-0.5 text-xs font-bold text-white">
                  {selectedDayEvents.length}
                </span>
              )}
            </span>
            <span className="text-[#94a3b8]">{isDayEventsOpen ? "▲" : "▼"}</span>
          </button>
          {isDayEventsOpen && (
            <div className="max-h-40 overflow-y-auto border-t border-[#f1f5f9] px-3 pb-2">
              {selectedDayEvents.length === 0 ? (
                <p className="py-2 text-xs text-[#94a3b8]">この日の予定はありません</p>
              ) : (
                <div className="flex flex-col gap-1 pt-2">
                  {selectedDayEvents.map((event) => (
                    <button
                      key={`${event.id}-${event.start.toISOString()}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f8fafc]"
                      onClick={() => openDetailEvent(event)}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: event.categoryColor ?? getDisplayStyle(event.displayKind).border }}
                      />
                      <span className="flex-1 truncate text-sm font-semibold text-[#0f172a]">{event.title}</span>
                      <span className="shrink-0 text-xs text-[#94a3b8]">
                        {event.allDay ? "終日" : format(event.start, "HH:mm")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========== PC レイアウト（sm以上） ========== */}
      <div className="mx-auto hidden max-w-7xl flex-col gap-5 sm:flex">
        <header className="page-header glass-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <ShareCalLogo />
          <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <DesktopNavigation />
          </div>
        </header>

        {notificationsEnabled && showNotificationPrompt && notificationPermission === "default" && (
          <section className="relative flex flex-col gap-3 rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-4 pr-12 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <button
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-[#bae6fd] bg-white text-lg leading-none text-[#075985]"
              aria-label="通知案内を閉じる"
              onClick={() => { window.localStorage.setItem("sharecal_notification_prompt_dismissed", "true"); setShowNotificationPrompt(false); }}
            >×</button>
            <div>
              <p className="text-sm font-bold text-[#075985]">共有通知を受け取る</p>
              <p className="mt-1 text-sm text-[#475569]">新しく予定が共有された時に、画面上とブラウザ通知で知らせます。</p>
            </div>
            <button className="h-10 rounded-lg bg-[#0f766e] px-4 text-sm font-bold text-white" onClick={requestNotificationPermission}>通知を許可</button>
          </section>
        )}

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">View</p>
              <h2 className="text-base font-black text-[#0f172a]">
                {filterOptions.find((o) => o.value === calendarFilter)?.label ?? "表示をしぼる"}
              </h2>
              <p className="mt-0.5 text-xs font-bold text-[#64748b]">
                {filterOptions.find((o) => o.value === calendarFilter)?.description}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {calendarFilter !== "all" && (
                <button className="shrink-0 rounded-full border border-[#cbd5e1] bg-[#f8fafc] px-3 py-2 text-xs font-bold text-[#475569]" onClick={() => setCalendarFilter("all")}>解除</button>
              )}
              <button className="shrink-0 rounded-full bg-[#0f766e] px-4 py-2 text-xs font-black text-white shadow-sm" onClick={() => setIsFilterOpen((v) => !v)}>
                {isFilterOpen ? "閉じる" : "絞り込み"}
              </button>
            </div>
          </div>
          {isFilterOpen && (
            <div className="grid grid-flow-col auto-cols-[minmax(138px,1fr)] gap-2 overflow-x-auto pb-1 sm:auto-cols-fr sm:grid-flow-row sm:grid-cols-2 lg:grid-cols-4">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  className={`group flex min-h-[68px] items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    calendarFilter === option.value ? "border-[#0f766e] bg-[#ecfdf5] shadow-sm" : "border-[#d9e2ef] bg-[#f8fafc] hover:border-[#99f6e4] hover:bg-white"
                  }`}
                  onClick={() => setCalendarFilter(option.value)}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white shadow-sm" style={{ backgroundColor: option.color }}>
                    {option.value === "all" ? "All" : option.label.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[#0f172a]">{option.label}</span>
                    <span className="mt-0.5 block truncate text-xs font-bold text-[#64748b]">{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Day Events</p>
              <h2 className="text-lg font-bold text-[#0f172a]">{format(selectedDayDate, "M月d日", { locale: ja })} の予定</h2>
              <p className="mt-1 text-sm text-[#64748b]">{selectedDayEvents.length}件</p>
            </div>
            <div className="flex gap-2">
              <button className="h-10 rounded-lg border border-[#cbd5e1] px-3 text-sm font-semibold text-[#334155]" onClick={() => setIsDayEventsOpen((v) => !v)}>
                {isDayEventsOpen ? "閉じる" : "表示"}
              </button>
              <button className="h-10 rounded-lg bg-[#0f766e] px-3 text-sm font-semibold text-white" onClick={() => openEventModal(selectedDayDate)}>追加</button>
            </div>
          </div>
          {isDayEventsOpen && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {selectedDayEvents.map((event) => (
                <button
                  key={`${event.id}-${event.start.toISOString()}`}
                  className="rounded-xl border p-3 text-left transition hover:border-[#0f766e]"
                  style={{ backgroundColor: getDisplayStyle(event.displayKind).background, borderLeft: `8px solid ${event.categoryColor ?? getDisplayStyle(event.displayKind).border}`, color: getDisplayStyle(event.displayKind).text }}
                  onClick={() => openDetailEvent(event)}
                >
                  <p className="font-semibold text-[#0f172a]">{event.title}</p>
                  <p className="mt-1 text-sm text-[#64748b]">
                    {event.allDay ? "終日" : `${format(event.start, "HH:mm")} - ${format(event.end, "HH:mm")}`}
                    {` / ${getDisplayLabel(event.displayKind)}`}
                    {event.recurringRule && event.recurringRule !== "none" && " / 繰り返し"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#64748b]">
                    {event.isShared ? `${event.ownerName}さんから共有` : event.sharedWith.length > 0 ? `${event.sharedWith.map((u) => u.username).join("、")}に共有中` : "未共有"}
                  </p>
                </button>
              ))}
              {selectedDayEvents.length === 0 && <p className="text-sm text-[#64748b]">この日の予定はありません。</p>}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-2 shadow-sm sm:p-3">
          <div className="calendar-shell h-[calc(100vh-255px)] min-h-[430px] sm:h-[calc(100vh-205px)] sm:min-h-[560px]">
            <Calendar<CalendarEvent>
              key={calendarWeekStart}
              localizer={calendarLocalizer}
              events={visibleEvents}
              startAccessor="start"
              endAccessor="end"
              allDayAccessor="allDay"
              culture="ja"
              date={calendarDate}
              view={calendarView}
              dayLayoutAlgorithm="no-overlap"
              popup
              selectable="ignoreEvents"
              messages={{
                today: "今日",
                previous: "前へ",
                next: "次へ",
                month: "月",
                week: "週",
                day: "日",
                agenda: "一覧",
                noEventsInRange: "この期間の予定はまだありません",
                showMore: (total) => `+${total}件`,
              }}
              formats={{
                monthHeaderFormat: "yyyy年M月",
                dayHeaderFormat: "M月d日 EEEE",
                weekdayFormat: "EEE",
                dayRangeHeaderFormat: ({ start, end }) =>
                  `${format(start, "yyyy年M月d日", { locale: ja })} - ${format(end, "M月d日", { locale: ja })}`,
              }}
              eventPropGetter={(event) => ({
                className: `${event.displayKind}-event`,
                style: {
                  backgroundColor: getDisplayStyle(event.displayKind).background,
                  borderLeft: `5px solid ${event.categoryColor ?? getDisplayStyle(event.displayKind).border}`,
                  color: getDisplayStyle(event.displayKind).text,
                },
              })}
              onNavigate={(date) => setCalendarDate(date)}
              onView={(view) => setCalendarView(view)}
              longPressThreshold={350}
              components={{
                toolbar: CalendarToolbar,
                month: {
                  dateHeader: ({ date, label }) => {
                    const dow = date.getDay();
                    const holidayName = isJapaneseHoliday(date);
                    const isHoliday = holidayName !== null;
                    const color =
                      isHoliday || dow === 0 ? "#e11d48"
                      : dow === 6            ? "#2563eb"
                      :                        undefined;
                    return (
                      <button
                        className="calendar-date-button"
                        style={color ? { color } : undefined}
                        type="button"
                        title={holidayName ?? undefined}
                        onPointerUp={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openDateForRegistration(date);
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openDateForRegistration(date);
                        }}
                      >
                        {label}
                        {isHoliday && (
                          <span style={{ fontSize: "9px", fontWeight: 700, marginLeft: "2px", display: "none" }} className="sm:inline">
                            {holidayName}
                          </span>
                        )}
                      </button>
                    );
                  },
                },
              }}
              onDrillDown={(date) => {
                openDateForRegistration(date);
              }}
              onShowMore={(shownEvents, date) => {
                setDayDetail({
                  date,
                  events: shownEvents as CalendarEvent[],
                });
              }}
              onSelectSlot={(slotInfo) => {
                if (slotInfo.action === "select") return;
                const date = Array.isArray(slotInfo.slots)
                  ? slotInfo.slots[0]
                  : slotInfo.start;

                openDateForRegistration(date);
              }}
              onSelectEvent={(event) => openDetailEvent(event)}
            />
          </div>
        </section>
      </div>{/* /.mx-auto PC */}


      {isEventModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/40 p-4"
          onClick={() => setIsEventModalOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── ヘッダー ── */}
            <div className="mb-3 pb-3 border-b border-[#e2e8f0]">
              <div className="flex items-center justify-between">
                {/* 前日・日付・翌日ナビ */}
                <div className="flex items-center gap-1">
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748b] transition hover:bg-[#f1f5f9] active:scale-90"
                    aria-label="前の日"
                    onClick={() => {
                      const d = new Date(eventForm.start);
                      d.setDate(d.getDate() - 1);
                      setEventForm(createBlankForm(d));
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>

                  <div className="text-center px-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#94a3b8]">Schedule</p>
                    <p className="text-base font-black text-[#0f172a] leading-tight">
                      {format(new Date(eventForm.start), "M月d日", { locale: ja })}
                      <span className="ml-1.5 text-sm font-bold text-[#64748b]">
                        ({format(new Date(eventForm.start), "E", { locale: ja })})
                      </span>
                    </p>
                  </div>

                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748b] transition hover:bg-[#f1f5f9] active:scale-90"
                    aria-label="次の日"
                    onClick={() => {
                      const d = new Date(eventForm.start);
                      d.setDate(d.getDate() + 1);
                      setEventForm(createBlankForm(d));
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>

                {/* 閉じるボタン */}
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#64748b]"
                  onClick={() => setIsEventModalOpen(false)}
                  aria-label="閉じる"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-3">
              <p className="mb-2 text-xs font-bold text-[#64748b]">
                よく使う予定から入力
              </p>
              <div className="flex gap-2 overflow-x-auto px-1 py-1">
              {patterns.map((pattern) => (
                <button
                  key={pattern.id}
                  className="shrink-0 rounded-full border border-[#cbd5e1] bg-[#f8fafc] px-4 py-2 text-sm font-semibold text-[#334155] transition hover:border-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#0f766e] active:scale-95"
                  onClick={() => applyPatternAndSave(pattern)}
                >
                  {pattern.label}
                </button>
              ))}
              {patterns.length === 0 && (
                <p className="text-sm text-[#64748b]">
                  よく使う予定を登録すると、ここからすぐ入力できます。
                </p>
              )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#64748b]">タイトル</span>
                <input
                  className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  value={eventForm.title}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </label>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] px-3 py-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-bold text-[#0f172a]">終日の予定</p>
                  <p className="mt-1 text-xs text-[#64748b]">時間を指定しない予定として登録します。</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    className="peer sr-only"
                    type="checkbox"
                    checked={eventForm.allDay}
                    onChange={(event) =>
                      setEventForm((current) => ({ ...current, allDay: event.target.checked }))
                    }
                  />
                  <span className="h-7 w-12 rounded-full bg-[#cbd5e1] transition peer-checked:bg-[#0f766e]" />
                  <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                </label>
              </div>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#64748b]">分類</span>
                <select
                  className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  value={eventForm.categoryId}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, categoryId: event.target.value }))
                  }
                >
                  <option value="">未分類</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-[#64748b]">開始</span>
                <input
                  className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  type="datetime-local"
                  value={eventForm.start}
                  onChange={(event) => {
                    const newStart = event.target.value;
                    setEventForm((current) => {
                      const startMs = new Date(newStart).getTime();
                      const endMs = new Date(current.end).getTime();
                      const newEnd = endMs <= startMs
                        ? formatDateTimeLocal(new Date(startMs + 3600000))
                        : current.end;
                      return { ...current, start: newStart, end: newEnd };
                    });
                  }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-[#64748b]">終了</span>
                <input
                  className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  type="datetime-local"
                  value={eventForm.end}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, end: event.target.value }))
                  }
                />
                <button
                  className="mt-2 rounded-lg border border-[#cbd5e1] px-3 py-2 text-xs font-bold text-[#334155]"
                  type="button"
                  onClick={() => toggleEndNextDay("new")}
                >
                  {isEndOnNextDay(eventForm) ? "終了日を当日に戻す" : "終了日を翌日にする"}
                </button>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#64748b]">メモ</span>
                <textarea
                  className="min-h-24 w-full rounded-lg border border-[#cbd5e1] p-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  value={eventForm.note}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="申し送り、持ち物、集合場所など"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#64748b]">URL（お店・予約ページなど）</span>
                <input
                  type="text"
                  inputMode="url"
                  className="w-full rounded-lg border border-[#cbd5e1] p-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  value={eventForm.url}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, url: event.target.value }))
                  }
                  onPaste={(event) => {
                    event.preventDefault();
                    const extracted = extractUrlFromClipboard(event.clipboardData);
                    setEventForm((current) => ({ ...current, url: extracted }));
                  }}
                  placeholder="https://..."
                />
              </label>
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-[#64748b]">共有する相手</p>
              {eventForm.selectedUserIds.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { value: "partner", title: "自分の予定を相手に共有", desc: "自分の予定として持ったまま、相手にも見せたい時" },
                    { value: "together", title: "私たちの予定として表示", desc: "2人やグループ共通の予定" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`cursor-pointer rounded-2xl border p-3 transition ${
                        eventForm.shareType === option.value
                          ? "border-[#0f766e] bg-[#ecfdf5]"
                          : "border-[#d9e2ef] bg-[#f8fafc]"
                      }`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="new-share-type"
                        value={option.value}
                        checked={eventForm.shareType === option.value}
                        onChange={(event) =>
                          setEventForm((current) => ({
                            ...current,
                            shareType: event.target.value as EventVisibility,
                          }))
                        }
                      />
                      <span className="block text-sm font-black text-[#0f172a]">{option.title}</span>
                      <span className="mt-1 block text-xs font-semibold text-[#64748b]">{option.desc}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {connections.map((connection) => (
                  <label
                    key={connection.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                      eventForm.selectedUserIds.includes(connection.id)
                        ? "border-[#0f766e] bg-[#ecfdf5] text-[#0f766e]"
                        : "border-[#cbd5e1] bg-white text-[#334155] hover:border-[#94a3b8]"
                    }`}
                  >
                    <input
                      className="h-4 w-4 accent-[#0f766e]"
                      type="checkbox"
                      checked={eventForm.selectedUserIds.includes(connection.id)}
                      onChange={(event) => {
                        setEventForm((current) => ({
                          ...current,
                          selectedUserIds: event.target.checked
                            ? [...current.selectedUserIds, connection.id]
                            : current.selectedUserIds.filter((id) => id !== connection.id),
                        }));
                      }}
                    />
                    <span>{connection.username}</span>
                  </label>
                ))}
                {connections.length === 0 && (
                  <p className="text-sm text-[#64748b]">
                    共有相手はいません。先に「つながる」から申請してください。
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6">
              <button
                className="h-11 w-full rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!eventForm.title.trim()}
                onClick={addEvent}
              >
                登録する
              </button>
            </div>
          </div>
        </div>
      )}

      {detailEvent && (
        <div className="fixed inset-0 z-50 flex items-start overflow-hidden bg-[#0f172a]/40 p-3 pt-4 sm:items-center sm:justify-center" onClick={() => { setDetailEvent(null); setIsDetailEditing(false); }}>
          <div className="max-h-[88vh] w-full max-w-full overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-2xl sm:max-w-lg sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 border-b border-[#e2e8f0] bg-white pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                  Schedule Detail
                </p>
                <h2 className="text-xl font-bold text-[#0f172a]">{detailEvent.title}</h2>
              </div>
            </div>

            {detailEvent.canDelete && isDetailEditing ? (
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#64748b]">タイトル</span>
                  <input
                    className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                    value={editForm.title}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </label>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] px-3 py-3 sm:col-span-2">
                  <div>
                    <p className="text-sm font-bold text-[#0f172a]">終日の予定</p>
                    <p className="mt-1 text-xs text-[#64748b]">時間を指定しない予定として保存します。</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      className="peer sr-only"
                      type="checkbox"
                      checked={editForm.allDay}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, allDay: event.target.checked }))
                      }
                    />
                    <span className="h-7 w-12 rounded-full bg-[#cbd5e1] transition peer-checked:bg-[#0f766e]" />
                    <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                  </label>
                </div>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#64748b]">分類</span>
                  <select
                    className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                    value={editForm.categoryId}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, categoryId: event.target.value }))
                    }
                  >
                    <option value="">未分類</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#64748b]">開始</span>
                  <input
                    className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                    type="datetime-local"
                    value={editForm.start}
                    onChange={(event) => {
                      const newStart = event.target.value;
                      setEditForm((current) => {
                        const startMs = new Date(newStart).getTime();
                        const endMs = new Date(current.end).getTime();
                        const newEnd = endMs <= startMs
                          ? formatDateTimeLocal(new Date(startMs + 3600000))
                          : current.end;
                        return { ...current, start: newStart, end: newEnd };
                      });
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#64748b]">終了</span>
                  <input
                    className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                    type="datetime-local"
                    value={editForm.end}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, end: event.target.value }))
                    }
                  />
                  <button
                    className="mt-2 rounded-lg border border-[#cbd5e1] px-3 py-2 text-xs font-bold text-[#334155]"
                    type="button"
                    onClick={() => toggleEndNextDay("edit")}
                  >
                    {isEndOnNextDay(editForm) ? "終了日を当日に戻す" : "終了日を翌日にする"}
                  </button>
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#64748b]">メモ</span>
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-[#cbd5e1] p-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                    value={editForm.note}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, note: event.target.value }))
                    }
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#64748b]">URL（お店・予約ページなど）</span>
                  <input
                    type="text"
                    inputMode="url"
                    className="w-full rounded-lg border border-[#cbd5e1] p-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                    value={editForm.url}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, url: event.target.value }))
                    }
                    onPaste={(event) => {
                      event.preventDefault();
                      const extracted = extractUrlFromClipboard(event.clipboardData);
                      setEditForm((current) => ({ ...current, url: extracted }));
                    }}
                    placeholder="https://..."
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div
                  className="rounded-xl border-l-8 p-3"
                  style={{
                    backgroundColor: getDisplayStyle(detailEvent.displayKind).background,
                    borderLeftColor:
                      detailEvent.categoryColor ?? getDisplayStyle(detailEvent.displayKind).border,
                    color: getDisplayStyle(detailEvent.displayKind).text,
                  }}
                >
                  <p className="text-xs font-black uppercase tracking-[0.14em] opacity-80">
                    Preview
                  </p>
                  <p className="mt-1 text-lg font-black text-[#0f172a]">{detailEvent.title}</p>
                  <p className="mt-1 font-bold">{getDisplayLabel(detailEvent.displayKind)}</p>
                </div>
                <div className="rounded-xl bg-[#f8fafc] p-3">
                  <p className="text-xs font-semibold text-[#64748b]">時間</p>
                  <p className="mt-1 font-semibold text-[#0f172a]">
                    {detailEvent.allDay
                      ? "終日"
                      : `${format(detailEvent.start, "M月d日 HH:mm", { locale: ja })} - ${format(detailEvent.end, "M月d日 HH:mm", { locale: ja })}`}
                  </p>
                </div>
                <div className="rounded-xl bg-[#f8fafc] p-3">
                  <p className="text-xs font-semibold text-[#64748b]">分類</p>
                  <p className="mt-1 font-semibold text-[#0f172a]">{detailEvent.categoryName}</p>
                </div>
                {(detailEvent.prefecture || detailEvent.city) && (
                  <div className="rounded-xl bg-[#f8fafc] p-3">
                    <p className="text-xs font-semibold text-[#64748b]">場所</p>
                    <p className="mt-1 font-semibold text-[#0f172a]">
                      {[detailEvent.prefecture, detailEvent.city].filter(Boolean).join(" ")}
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-[#f8fafc] p-3">
                  <p className="text-xs font-semibold text-[#64748b]">メモ</p>
                  <p className="mt-1 whitespace-pre-wrap text-[#334155]">
                    {detailEvent.note || "メモはありません。"}
                  </p>
                </div>
                {detailEvent.url && (() => {
                  const normalizedUrl = /^https?:\/\//i.test(detailEvent.url)
                    ? detailEvent.url
                    : `https://${detailEvent.url}`;
                  return (
                  <a
                    href={normalizedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3 transition hover:border-[#0f766e] hover:bg-[#ecfdf5]"
                  >
                    {ogLoading && (
                      <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                        読み込み中…
                      </div>
                    )}
                    {!ogLoading && ogData?.title ? (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {(ogData.main || (ogData.subs?.length ?? 0) > 0) && (
                            <div className="mb-1 flex flex-wrap items-center gap-1">
                              {ogData.main && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#0f766e] px-2 py-0.5 text-[10px] font-bold text-white">
                                  {ogData.main.emoji} {ogData.main.label}
                                </span>
                              )}
                              {(ogData.subs ?? []).map((s) => (
                                <span key={s.label} className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-semibold text-[#0f766e]">
                                  {s.emoji} {s.label}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="truncate text-sm font-bold text-[#0f172a]">{ogData.title}</p>
                          {ogData.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-[#64748b]">{ogData.description}</p>
                          )}
                          <p className="mt-1 truncate text-[10px] text-[#94a3b8]">{detailEvent.url}</p>
                        </div>
                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#0f766e]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        </svg>
                      </div>
                    ) : !ogLoading && (
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-[#0f766e]">{detailEvent.url}</p>
                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#0f766e]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        </svg>
                      </div>
                    )}
                  </a>
                  );
                })()}
                {detailEvent.isShared ? (
                  <div className="rounded-xl bg-[#fffbeb] p-3 text-[#92400e]">
                    {detailEvent.ownerDeleted
                      ? "削除されたアカウントから共有"
                      : detailEvent.displayKind === "together"
                      ? `${detailEvent.ownerName}さんとの共有の予定`
                      : `${detailEvent.ownerName}さんから共有された予定`}
                  </div>
                ) : detailEvent.sharedWith.length > 0 ? (
                  <div className="rounded-xl bg-[#ecfdf5] p-3 text-[#0f766e]">
                    {`${detailEvent.sharedWith.map((user) => user.username).join("、")}に共有中`}
                  </div>
                ) : (
                  <div className="rounded-xl bg-[#f8fafc] p-3 text-[#475569]">
                    共有していない自分の予定です。
                  </div>
                )}
                {(detailEvent.canDelete || detailEvent.ownerDeleted) && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {detailEvent.canDelete && (
                    <button
                      className="h-11 rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59]"
                      onClick={() => setIsDetailEditing(true)}
                    >
                      編集する
                    </button>
                    )}
                    <button
                      className="h-11 rounded-lg border border-[#fecdd3] px-5 text-sm font-semibold text-[#be123c]"
                      onClick={() => deleteEvent(detailEvent)}
                    >
                      {detailEvent.ownerDeleted ? "表示から削除" : "削除する"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {detailEvent.canDelete && isDetailEditing && (
              <div className="mt-6 space-y-4">
                {detailEvent.recurringId && (
                  <div className="rounded-xl bg-[#f8fafc] p-3 text-sm font-bold text-[#475569]">
                    この予定は繰り返し予定です。保存や削除は同じ繰り返し予定全体に反映されます。
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-semibold text-[#64748b]">共有先を変更</p>
                  {shareDraftIds.length > 0 && (
                    <div className="mb-3 grid gap-2 sm:grid-cols-2">
                      {[
                        { value: "partner", title: "自分の予定を相手に共有", desc: "自分の予定として持ったまま共有" },
                        { value: "together", title: "私たちの予定", desc: "共通の予定として表示" },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className={`cursor-pointer rounded-2xl border p-3 transition ${
                            editForm.shareType === option.value
                              ? "border-[#0f766e] bg-[#ecfdf5]"
                              : "border-[#d9e2ef] bg-[#f8fafc]"
                          }`}
                        >
                          <input
                            className="sr-only"
                            type="radio"
                            name="edit-share-type"
                            value={option.value}
                            checked={editForm.shareType === option.value}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                shareType: event.target.value as EventVisibility,
                              }))
                            }
                          />
                          <span className="block text-sm font-black text-[#0f172a]">{option.title}</span>
                          <span className="mt-1 block text-xs font-semibold text-[#64748b]">{option.desc}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {connections.map((connection) => (
                      <label
                        key={connection.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm ${
                          shareDraftIds.includes(connection.id)
                            ? "border-[#0f766e] bg-[#ecfdf5] text-[#0f766e]"
                            : "border-[#cbd5e1] text-[#334155]"
                        }`}
                      >
                        <input
                          className="h-4 w-4 accent-[#0f766e]"
                          type="checkbox"
                          checked={shareDraftIds.includes(connection.id)}
                          onChange={(event) => {
                            setShareDraftIds((current) =>
                              event.target.checked
                                ? [...current, connection.id]
                                : current.filter((id) => id !== connection.id),
                            );
                          }}
                        />
                        {connection.username}
                      </label>
                    ))}
                    {connections.length === 0 && (
                      <p className="text-sm text-[#64748b]">共有できる相手がいません。</p>
                    )}
                  </div>
                </div>

                <button
                  className="h-11 w-full rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59]"
                  onClick={updateEvent}
                >
                  予定を保存
                </button>
                <button
                  className="h-11 w-full rounded-lg border border-[#fecdd3] px-5 text-sm font-semibold text-[#be123c] transition hover:bg-[#fff1f2]"
                  onClick={() => deleteEvent(detailEvent)}
                >
                  削除する
                </button>
              </div>
            )}
            <button
              className="mt-5 h-11 w-full rounded-lg border border-[#cbd5e1] px-5 text-sm font-semibold text-[#334155]"
              onClick={() => {
                if (isDetailEditing) {
                  setIsDetailEditing(false);
                  return;
                }
                setDetailEvent(null);
              }}
            >
              {isDetailEditing ? "プレビューに戻る" : "閉じる"}
            </button>
          </div>
        </div>
      )}
      {sharedNotification && (
        <div className="fixed right-4 top-4 z-[60] max-w-sm rounded-2xl border border-[#bae6fd] bg-white p-4 text-[#172033] shadow-2xl">
          <p className="text-sm font-black text-[#075985]">予定が共有されました</p>
          <p className="mt-1 text-sm text-[#475569]">
            {sharedNotification.ownerName}さんから「{sharedNotification.title}」
          </p>
        </div>
      )}
      {showTutorial && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f172a]/45 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748b]">
              Quick Tutorial
            </p>
            <h2 className="mt-2 text-2xl font-black text-[#0f172a]">
              最初にここだけ覚えれば大丈夫
            </h2>
            <div className="mt-5 grid gap-3 text-sm text-[#475569]">
              <div className="rounded-2xl bg-[#f8fafc] p-3">
                <p className="font-bold text-[#0f172a]">1. 日付を押して予定登録</p>
                <p className="mt-1">カレンダーの日付を押すと、その日の登録画面が開きます。</p>
              </div>
              <div className="rounded-2xl bg-[#f8fafc] p-3">
                <p className="font-bold text-[#0f172a]">2. よく使う予定で時短</p>
                <p className="mt-1">夜勤や休みはよく使う予定にしておくと、ワンタップで入力できます。</p>
              </div>
              <div className="rounded-2xl bg-[#f8fafc] p-3">
                <p className="font-bold text-[#0f172a]">3. 必要な予定だけ共有</p>
                <p className="mt-1">登録時や編集時に、共有する相手を選べます。</p>
              </div>
            </div>
            <button
              className="mt-5 h-11 w-full rounded-xl bg-[#0f766e] px-4 font-bold text-white"
              onClick={() => {
                window.localStorage.setItem("calendar_tutorial_seen", "true");
                setShowTutorial(false);
              }}
            >
              はじめる
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteEvent && (
        <div className="confirm-overlay" onClick={() => setConfirmDeleteEvent(null)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#64748b]">確認</p>
            <p className="mt-2 text-base font-black text-[#0f172a]">
              「{confirmDeleteEvent.title}」を削除しますか？
            </p>
            {confirmDeleteEvent.recurringId && (
              <p className="mt-1 text-sm text-[#64748b]">この操作は繰り返し予定全体に反映されます。</p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="h-11 rounded-xl border border-[#cbd5e1] font-bold text-[#334155] transition hover:bg-[#f8fafc]"
                onClick={() => setConfirmDeleteEvent(null)}
              >
                キャンセル
              </button>
              <button
                className="h-11 rounded-xl bg-[#be123c] font-bold text-white transition hover:bg-[#9f1239]"
                onClick={() => void deleteEvent(confirmDeleteEvent, true)}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} />
      <MobileNavigation />
    </main>
  );
}
