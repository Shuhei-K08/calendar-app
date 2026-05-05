"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Event, View } from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { ja } from "date-fns/locale/ja";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, ShareCalLogo } from "@/app/components/AppNavigation";

const locales = { ja };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

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

const DEFAULT_PATTERNS = [
  { id: "default-work", label: "出勤", title: "出勤", start_time: "09:00", end_time: "18:00", next_day_end: false },
  { id: "default-day", label: "日勤", title: "日勤", start_time: "08:30", end_time: "17:30", next_day_end: false },
  { id: "default-night", label: "夜勤", title: "夜勤", start_time: "16:30", end_time: "09:30", next_day_end: true },
  { id: "default-after", label: "明け", title: "明け", start_time: "09:30", end_time: "10:00", next_day_end: false },
  { id: "default-off", label: "休み", title: "休み", start_time: "00:00", end_time: "23:59", next_day_end: false },
];

const DESIGN_THEMES = {
  clean: { background: "#f5f7fb", accent: "#0f766e" },
  mint: { background: "#f0fdfa", accent: "#0d9488" },
  sky: { background: "#eef6ff", accent: "#2563eb" },
  rose: { background: "#fff7f7", accent: "#e11d48" },
};

const LoadingScreen = () => (
  <main className="loading-screen">
    <div className="loading-card" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true">
        <span />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748b]">
        Preparing calendar
      </p>
      <p className="mt-2 text-lg font-black text-[#0f172a]">予定を読み込んでいます</p>
      <div className="mt-5 grid gap-2">
        <div className="loading-line w-44" />
        <div className="loading-line w-56" />
        <div className="loading-line w-36" />
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
  canDelete: boolean;
  isShared: boolean;
  ownerId: string;
  ownerName: string;
  sharedWith: ConnectedUser[];
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
};

type DbEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  user_id: string;
  note: string | null;
  all_day: boolean | null;
  category_id: string | null;
};

type ConnectedUser = {
  id: string;
  username: string;
};

type EventShareIdRow = {
  event_id: string;
  shared_with?: string;
};

type SchedulePattern = {
  id: string;
  label: string;
  title: string;
  start_time: string;
  end_time: string;
  next_day_end: boolean;
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
  categoryId: string;
  selectedUserIds: string[];
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
    categoryId: "",
    selectedUserIds: [],
  };
};

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [connections, setConnections] = useState<ConnectedUser[]>([]);
  const [patterns, setPatterns] = useState<SchedulePattern[]>(DEFAULT_PATTERNS);
  const [categories, setCategories] = useState<ScheduleCategory[]>([]);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<View>("month");
  const [eventForm, setEventForm] = useState<EventForm>(() => createBlankForm());
  const [editForm, setEditForm] = useState<EventForm>(() => createBlankForm());
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [shareDraftIds, setShareDraftIds] = useState<string[]>([]);
  const [dayDetail, setDayDetail] = useState<{
    date: Date;
    events: CalendarEvent[];
  } | null>(null);
  const [isDayEventsOpen, setIsDayEventsOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [notificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const savedSettings = window.localStorage.getItem("calendar_settings");
    if (!savedSettings) return true;
    return JSON.parse(savedSettings).notificationsEnabled ?? true;
  });
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(true);
  const [sharedNotification, setSharedNotification] =
    useState<SharedNotification | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

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
      .select("id, label, title, start_time, end_time, next_day_end")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      return [];
    }

    if (data && data.length > 0) return data;

    const defaults = DEFAULT_PATTERNS.map((pattern) => ({
      label: pattern.label,
      title: pattern.title,
      start_time: pattern.start_time,
      end_time: pattern.end_time,
      next_day_end: pattern.next_day_end,
      user_id: userId,
    }));

    const { error: insertError } = await supabase
      .from("schedule_patterns")
      .insert(defaults);

    if (insertError) return [];

    const { data: seededPatterns } = await supabase
      .from("schedule_patterns")
      .select("id, label, title, start_time, end_time, next_day_end")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    return seededPatterns ?? [];
  }, []);

  const fetchCategories = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("schedule_categories")
      .select("id, name, color")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) return [];

    if (data && data.length > 0) return data;

    const defaults = [
      { name: "勤務", color: "#2563eb", user_id: userId },
      { name: "私用", color: "#7c3aed", user_id: userId },
      { name: "重要", color: "#dc2626", user_id: userId },
    ];

    const { error: insertError } = await supabase
      .from("schedule_categories")
      .insert(defaults);

    if (insertError) return [];

    const { data: seededCategories } = await supabase
      .from("schedule_categories")
      .select("id, name, color")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    return seededCategories ?? [];
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
      .select("id, title, start_at, end_at, user_id, note, all_day, category_id")
      .eq("user_id", user.id);

    if (myError?.code === "42703") {
      const fallback = await supabase
        .from("events")
        .select("id, title, start_at, end_at, user_id")
        .eq("user_id", user.id);

      myEvents = fallback.data?.map((event) => ({
        ...event,
        note: null,
        all_day: false,
        category_id: null,
      })) ?? null;
      myError = fallback.error;
    }

    if (myError) {
      console.error(myError);
      return;
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
        .select("id, title, start_at, end_at, user_id, note, all_day, category_id")
        .in("id", sharedEventIds);

      if (error?.code === "42703") {
        const fallback = await supabase
          .from("events")
          .select("id, title, start_at, end_at, user_id")
          .in("id", sharedEventIds);

        data = fallback.data?.map((event) => ({
          ...event,
          note: null,
          all_day: false,
          category_id: null,
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

    if (myEventIds.length > 0) {
      const { data, error } = await supabase
        .from("event_shares")
        .select("event_id, shared_with")
        .in("event_id", myEventIds);

      if (!error) {
        myShareRows = (data ?? []) as Required<EventShareIdRow>[];
      }
    }

    const profileIds = Array.from(new Set([
      ...sharedEvents.map((event) => event.user_id),
      ...myShareRows.map((row) => row.shared_with),
    ]));
    let profileMap = new Map<string, string>();
    const categoryIds = Array.from(new Set([
      ...(myEvents ?? []).map((event) => event.category_id).filter(Boolean),
      ...sharedEvents.map((event) => event.category_id).filter(Boolean),
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
      })),
      ...sharedEvents.map((event) => ({
        ...event,
        canDelete: false,
        isShared: true,
        ownerId: event.user_id,
        ownerName: profileMap.get(event.user_id) ?? "共有元",
      })),
    ].map((event) => ({
      id: event.id,
      title: event.title,
      start: new Date(event.start_at),
      end: new Date(event.end_at),
      allDay: event.all_day ?? false,
      note: event.note ?? "",
      canDelete: event.canDelete,
      isShared: event.isShared,
      ownerId: event.ownerId,
      ownerName: event.ownerName,
      categoryId: event.category_id,
      categoryName: event.category_id
        ? categoryMap.get(event.category_id)?.name ?? "分類"
        : "未分類",
      categoryColor: event.category_id
        ? categoryMap.get(event.category_id)?.color ?? null
        : null,
      sharedWith: myShareRows
        .filter((row) => row.event_id === event.id)
        .map((row) => ({
          id: row.shared_with,
          username: profileMap.get(row.shared_with) ?? "共有先",
        })),
    }));

    setEvents(formatted);
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
        categoryId: detailEvent.categoryId ?? "",
        selectedUserIds: detailEvent.sharedWith.map((user) => user.id),
      });
    }
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
      document.documentElement.style.setProperty("--app-bg", theme.background);
      document.documentElement.style.setProperty("--app-accent", theme.accent);
      document.documentElement.style.setProperty(
        "--own-event-bg",
        settings.ownEventBackground ?? settings.ownEvent ?? "#e0f2fe",
      );
      document.documentElement.style.setProperty(
        "--shared-event-bg",
        settings.sharedEventBackground ?? settings.sharedEvent ?? "#fef3c7",
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
      alert("このブラウザでは通知が使えません。");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const openEventModal = (date = new Date()) => {
    setEventForm(createBlankForm(date));
    setIsEventModalOpen(true);
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
    }));
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

  const addEvent = async () => {
    if (!eventForm.title.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { startAt, endAt } = normalizeEventTimes(eventForm);
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      alert("終了日時は開始日時より後にしてください");
      return;
    }
    const eventPayload = {
      title: eventForm.title.trim(),
      start_at: startAt,
      end_at: endAt,
      all_day: eventForm.allDay,
      category_id: eventForm.categoryId || null,
      note: eventForm.note.trim() || null,
      user_id: user.id,
    };

    let { data: insertedEvent, error } = await supabase
      .from("events")
      .insert(eventPayload)
      .select()
      .single();

    if (error?.code === "PGRST204" || error?.code === "42703") {
      const { note, all_day, category_id, ...payloadWithoutNote } = eventPayload;
      const fallback = await supabase
        .from("events")
        .insert(payloadWithoutNote)
        .select()
        .single();

      insertedEvent = fallback.data;
      error = fallback.error;

      if (!fallback.error && (note || all_day || category_id)) {
        alert("DB列がまだ不足しています。SQL実行後はメモ・終日・分類も保存されます。");
      }
    }

    if (error || !insertedEvent) {
      console.error(error);
      alert("追加失敗");
      return;
    }

    if (eventForm.selectedUserIds.length > 0) {
      const shareRows = eventForm.selectedUserIds.map((userId) => ({
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
        alert(`予定は追加しましたが、共有に失敗しました: ${shareError.message}`);
        return;
      }
    }

    setIsEventModalOpen(false);
    await fetchEvents();
  };

  const updateEvent = async () => {
    if (!detailEvent?.id || !detailEvent.canDelete) return;
    if (!editForm.title.trim()) return;

    const { startAt, endAt } = normalizeEventTimes(editForm);
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      alert("終了日時は開始日時より後にしてください");
      return;
    }
    const payload = {
      title: editForm.title.trim(),
      start_at: startAt,
      end_at: endAt,
      all_day: editForm.allDay,
      category_id: editForm.categoryId || null,
      note: editForm.note.trim() || null,
    };

    let { error } = await supabase
      .from("events")
      .update(payload)
      .eq("id", detailEvent.id);

    if (error?.code === "PGRST204" || error?.code === "42703") {
      const { note, all_day, category_id, ...fallbackPayload } = payload;
      const fallback = await supabase
        .from("events")
        .update(fallbackPayload)
        .eq("id", detailEvent.id);

      error = fallback.error;

      if (!fallback.error && (note || all_day || category_id)) {
        alert("DB列がまだ不足しています。SQL実行後はメモ・終日・分類も保存されます。");
      }
    }

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    await fetchEvents();
    setDetailEvent(null);
  };

  const deleteEvent = async (event: CalendarEvent) => {
    if (!event.id) return;
    if (!event.canDelete) {
      alert("共有された予定は作成者だけが削除できます");
      return;
    }

    const ok = window.confirm(`「${event.title}」を削除しますか？`);
    if (!ok) return;

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", event.id);

    if (error) {
      console.error(error);
      alert("削除失敗");
      return;
    }

    setDetailEvent(null);
    setDayDetail(null);
    await fetchEvents();
  };

  const updateEventShares = async () => {
    if (!detailEvent?.id || !detailEvent.canDelete) return;

    const { error: deleteError } = await supabase
      .from("event_shares")
      .delete()
      .eq("event_id", detailEvent.id);

    if (deleteError) {
      console.error(deleteError);
      alert(deleteError.message);
      return;
    }

    if (shareDraftIds.length > 0) {
      const { error: insertError } = await supabase.from("event_shares").insert(
        shareDraftIds.map((userId) => ({
          event_id: detailEvent.id,
          shared_with: userId,
        })),
      );

      if (insertError) {
        console.error(insertError);
        alert(insertError.message);
        return;
      }
    }

    await fetchEvents();
    setDetailEvent(null);
  };

  const selectedDayDate = dayDetail?.date ?? calendarDate;
  const selectedDayEvents = dayDetail?.events ?? getEventsOnDate(events, selectedDayDate);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 pb-24 pt-4 text-[#172033] sm:px-6 sm:pb-4 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 rounded-2xl border border-[#d9e2ef] bg-white/95 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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
              onClick={() => setShowNotificationPrompt(false)}
            >
              ×
            </button>
            <div>
              <p className="text-sm font-bold text-[#075985]">共有通知を受け取る</p>
              <p className="mt-1 text-sm text-[#475569]">
                新しく予定が共有された時に、画面上とブラウザ通知で知らせます。
              </p>
            </div>
            <button
              className="h-10 rounded-lg bg-[#0f766e] px-4 text-sm font-bold text-white"
              onClick={requestNotificationPermission}
            >
              通知を許可
            </button>
          </section>
        )}

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                Day Events
              </p>
              <h2 className="text-lg font-bold text-[#0f172a]">
                {format(selectedDayDate, "M月d日", { locale: ja })} の予定
              </h2>
              <p className="mt-1 text-sm text-[#64748b]">
                {selectedDayEvents.length}件
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="h-10 rounded-lg border border-[#cbd5e1] px-3 text-sm font-semibold text-[#334155]"
                onClick={() => setIsDayEventsOpen((current) => !current)}
              >
                {isDayEventsOpen ? "閉じる" : "表示"}
              </button>
              <button
                className="h-10 rounded-lg bg-[#0f766e] px-3 text-sm font-semibold text-white"
                onClick={() => openEventModal(selectedDayDate)}
              >
                追加
              </button>
            </div>
          </div>

          {isDayEventsOpen && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selectedDayEvents.map((event) => (
              <button
                key={`${event.id}-${event.start.toISOString()}`}
                className={`rounded-xl border p-3 text-left transition hover:border-[#0f766e] ${
                  event.isShared
                    ? "border-[#fde68a] text-[#92400e]"
                    : "border-[#bfdbfe] text-[#075985]"
                }`}
                style={{
                  backgroundColor: event.isShared
                    ? "var(--shared-event-bg)"
                    : "var(--own-event-bg)",
                  borderLeft: `8px solid ${event.categoryColor ?? "var(--uncategorized-event)"}`,
                  color: event.isShared ? "#92400e" : "#075985",
                }}
                onClick={() => setDetailEvent(event)}
              >
                <p className="font-semibold text-[#0f172a]">{event.title}</p>
                <p className="mt-1 text-sm text-[#64748b]">
                  {event.allDay ? "終日" : `${format(event.start, "HH:mm")} - ${format(event.end, "HH:mm")}`}
                  {event.isShared && " / 共有"}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#64748b]">
                  {event.isShared
                    ? `${event.ownerName}さんから共有`
                    : event.sharedWith.length > 0
                      ? `${event.sharedWith.map((user) => user.username).join("、")}に共有中`
                      : "未共有"}
                </p>
              </button>
            ))}
            {selectedDayEvents.length === 0 && (
              <p className="text-sm text-[#64748b]">この日の予定はありません。</p>
            )}
          </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#d9e2ef] bg-white p-2 shadow-sm sm:p-3">
          <div className="calendar-shell h-[calc(100vh-255px)] min-h-[430px] sm:h-[calc(100vh-205px)] sm:min-h-[560px]">
            <Calendar<CalendarEvent>
              localizer={localizer}
              events={events}
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
              eventPropGetter={(event) => ({
                className: event.isShared ? "shared-event" : "own-event",
                style: {
                  backgroundColor: event.isShared
                    ? "var(--shared-event-bg)"
                    : "var(--own-event-bg)",
                  borderLeft: `5px solid ${event.categoryColor ?? "var(--uncategorized-event)"}`,
                  color: event.isShared ? "#92400e" : "#075985",
                },
              })}
              onNavigate={(date) => setCalendarDate(date)}
              onView={(view) => setCalendarView(view)}
              longPressThreshold={350}
              onDrillDown={(date) => {
                setDayDetail({
                  date,
                  events: getEventsOnDate(events, date),
                });
                openEventModal(date);
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

                setDayDetail({
                  date,
                  events: getEventsOnDate(events, date),
                });
                openEventModal(date);
              }}
              onSelectEvent={(event) => setDetailEvent(event)}
            />
          </div>
        </section>
      </div>

      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start overflow-hidden bg-[#0f172a]/40 p-3 pt-4 sm:items-center sm:justify-center">
          <div className="max-h-[88vh] w-full max-w-full overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-2xl sm:max-w-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-[#e2e8f0] bg-white pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                  New Schedule
                </p>
                <h2 className="text-xl font-bold text-[#0f172a]">予定を登録</h2>
              </div>
              <button
                className="rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#334155]"
                onClick={() => setIsEventModalOpen(false)}
              >
                閉じる
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-[#d9e2ef] bg-[#f8fafc] p-3">
              <p className="mb-2 text-xs font-bold text-[#64748b]">
                定型予定から入力
              </p>
              <div className="flex gap-2 overflow-x-auto px-1 py-1">
              {patterns.map((pattern) => (
                <button
                  key={pattern.id}
                  className="shrink-0 rounded-full border border-[#cbd5e1] bg-[#f8fafc] px-4 py-2 text-sm font-semibold text-[#334155] transition hover:border-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#0f766e]"
                  onClick={() => applyPattern(pattern)}
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
              <label className="flex items-center gap-2 rounded-lg border border-[#cbd5e1] px-3 py-3 text-sm text-[#334155] sm:col-span-2">
                <input
                  className="h-4 w-4 accent-[#0f766e]"
                  type="checkbox"
                  checked={eventForm.allDay}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, allDay: event.target.checked }))
                  }
                />
                終日の予定にする
              </label>
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
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, start: event.target.value }))
                  }
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
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-[#64748b]">共有する相手</p>
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

            <button
              className="mt-6 h-11 w-full rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!eventForm.title.trim()}
              onClick={addEvent}
            >
              登録する
            </button>
          </div>
        </div>
      )}

      {detailEvent && (
        <div className="fixed inset-0 z-50 flex items-start overflow-hidden bg-[#0f172a]/40 p-3 pt-4 sm:items-center sm:justify-center">
          <div className="max-h-[88vh] w-full max-w-full overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-2xl sm:max-w-lg sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-[#e2e8f0] bg-white pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                  Schedule Detail
                </p>
                <h2 className="text-xl font-bold text-[#0f172a]">{detailEvent.title}</h2>
              </div>
              <button
                className="rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#334155]"
                onClick={() => setDetailEvent(null)}
              >
                閉じる
              </button>
            </div>

            {detailEvent.canDelete ? (
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-lg border border-[#cbd5e1] px-3 py-3 text-[#334155] sm:col-span-2">
                  <input
                    className="h-4 w-4 accent-[#0f766e]"
                    type="checkbox"
                    checked={editForm.allDay}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, allDay: event.target.checked }))
                    }
                  />
                  終日の予定にする
                </label>
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
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, start: event.target.value }))
                    }
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
                <button
                  className="h-11 rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59] sm:col-span-2"
                  onClick={updateEvent}
                >
                  予定を保存
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
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
                <div className="rounded-xl bg-[#f8fafc] p-3">
                  <p className="text-xs font-semibold text-[#64748b]">メモ</p>
                  <p className="mt-1 whitespace-pre-wrap text-[#334155]">
                    {detailEvent.note || "メモはありません。"}
                  </p>
                </div>
                <div className="rounded-xl bg-[#fffbeb] p-3 text-[#92400e]">
                  {`${detailEvent.ownerName}さんから共有された予定`}
                </div>
              </div>
            )}

            {detailEvent.canDelete && (
              <div className="mt-6 space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold text-[#64748b]">共有先を変更</p>
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

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    className="h-11 rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59]"
                    onClick={updateEventShares}
                  >
                    共有を保存
                  </button>
                  <button
                    className="h-11 rounded-lg bg-[#be123c] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#9f1239]"
                    onClick={() => deleteEvent(detailEvent)}
                  >
                    削除する
                  </button>
                </div>
              </div>
            )}
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
                <p className="font-bold text-[#0f172a]">2. 定型予定で時短</p>
                <p className="mt-1">夜勤や休みは定型予定にしておくと、ワンタップで入力できます。</p>
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
      <MobileNavigation />
    </main>
  );
}
