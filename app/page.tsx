"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Event, View } from "react-big-calendar";
import { addDays, addMonths, addWeeks, addYears, endOfDay, format, getDay, isSameDay, parse, startOfDay, startOfWeek } from "date-fns";
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

// その日にかかる予定（複数日にまたがる予定も含む）を開始時刻順で返す
const getEventsOnDate = (events: CalendarEvent[], date: Date) => {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = endOfDay(date).getTime();
  return events
    .filter((event) => {
      const start = event.start.getTime();
      const end = event.end.getTime();
      if (start > dayEnd) return false;
      // 終了が当日0:00ちょうどの予定は前日扱い（開始と同時刻のものは除く）
      return end > dayStart || (start >= dayStart && end >= start);
    })
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start.getTime() - b.start.getTime();
    });
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
  const unit = view === "week" ? "週" : view === "day" ? "日" : view === "agenda" ? "期間" : "月";

  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar-nav">
        <button
          className="cal-nav-btn"
          onClick={() => onNavigate("PREV")}
          aria-label={`前の${unit}`}
          title={`前の${unit}`}
          type="button"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <h2 className="cal-toolbar-label" aria-live="polite">{label}</h2>
        <button
          className="cal-nav-btn"
          onClick={() => onNavigate("NEXT")}
          aria-label={`次の${unit}`}
          title={`次の${unit}`}
          type="button"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
        <button className="cal-today-btn" onClick={() => onNavigate("TODAY")} type="button">
          今日
        </button>
      </div>

      {/* ビュー切替タブ */}
      <div className="cal-view-tabs" role="tablist" aria-label="表示切替">
        {(["month", "week", "day", "agenda"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className="cal-view-tab"
            data-active={view === v ? "true" : undefined}
            onClick={() => onView(v)}
          >
            {viewLabels[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

// タップの間隔判定用（イベントハンドラ内でのみ呼ぶ）
const currentTimeMs = () => Date.now();

// 月表示の予定チップ: PCでは開始時刻も表示（スマホはCSSで時刻を隠す）
function MonthEventChip({ event }: { event: CalendarEvent; title: string }) {
  const showTime = !event.allDay && isSameDay(event.start, event.end);
  return (
    <span className="month-chip">
      {showTime && <span className="month-chip-time">{format(event.start, "H:mm")}</span>}
      <span className="month-chip-title">{event.title}</span>
    </span>
  );
}

// 週・日表示の予定ブロック: タイトルを先に大きく、時間と共有状況を下に
function TimeEventBlock({ event }: { event: CalendarEvent; title: string }) {
  const who = event.isShared
    ? `${event.ownerName}さん`
    : event.sharedWith.length > 0
      ? `${event.sharedWith.map((u) => u.username).join("、")}と共有`
      : "";
  return (
    <span className="time-block">
      <span className="time-block-title">{event.title}</span>
      {!event.allDay && (
        <span className="time-block-meta">
          {format(event.start, "H:mm")}〜{format(event.end, "H:mm")}
          {who && ` · ${who}`}
        </span>
      )}
    </span>
  );
}

// 週・日表示を開いたときに最初に見せる時刻（朝8時）
const CALENDAR_SCROLL_TIME = new Date(1970, 0, 1, 8, 0, 0);

const SearchIcon = () => (
  <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const PlusIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

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
  imageUrl: string;
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
  image_url?: string | null;
  all_day: boolean | null;
  category_id: string | null;
  event_visibility?: EventVisibility | null;
};

type DbRecurringEvent = DbEvent & {
  recurrence_rule: RecurrenceRule;
  recurrence_until: string | null;
  excluded_dates?: string[] | null;
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
  imageUrl: string;
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

const normalizeLinkUrl = (url: string) =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`;

const linkHostOf = (url: string) => {
  try {
    return new URL(normalizeLinkUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

type LinkOption = { url: string; label: string; host: string; isFavorite: boolean };

type ImageFieldToast = (message: string, type?: ToastType) => void;

function EventImageField({
  imageUrl,
  onImageUrlChange,
  onOcrText,
  show,
  onBusyChange,
}: {
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  onOcrText: (text: string) => void;
  show: ImageFieldToast;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);

  const handleSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      show("画像ファイルを選択してください", "error");
      return;
    }
    setUploading(true);
    onBusyChange?.(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        show("ログインが必要です", "error");
        return;
      }
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("event-images")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) {
        console.error(error);
        show("画像のアップロードに失敗しました。SQL（event-imagesバケット作成）を実行してください。", "error");
        return;
      }
      const { data } = supabase.storage.from("event-images").getPublicUrl(path);
      onImageUrlChange(data.publicUrl);
      show("画像を添付しました", "success");
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  };

  const runOcr = async () => {
    if (!imageUrl) {
      show("先に画像を選択してください", "error");
      return;
    }
    setOcrRunning(true);
    onBusyChange?.(true);
    // 進捗はGeminiから取得できないため、待機中に擬似的に進める（完了で100%）
    setOcrProgress(5);
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setOcrProgress((p) => (p < 95 ? p + Math.max(1, Math.round((95 - p) / 10)) : p));
    }, 300);
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        show(data.error || "文字の読み取りに失敗しました", "error");
        return;
      }
      const text = (data.text || "").trim();
      if (!text) {
        show("文字を読み取れませんでした", "error");
        return;
      }
      setOcrProgress(100);
      onOcrText(text);
      show("読み取った文字をメモに追加しました", "success");
    } catch (error) {
      console.error(error);
      show("文字の読み取りに失敗しました", "error");
    } finally {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
      setOcrRunning(false);
      onBusyChange?.(false);
    }
  };

  const handleRemove = () => {
    onImageUrlChange("");
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-[#64748b]">画像</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelect}
      />
      {imageUrl ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-lg border border-[#cbd5e1] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="添付画像" className="h-16 w-16 shrink-0 rounded-md object-cover" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-xs font-bold text-[#334155]"
                onClick={() => setShowOriginal(true)}
              >
                元画像を表示
              </button>
              <button
                type="button"
                className="rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-xs font-bold text-[#334155] disabled:opacity-60"
                onClick={() => inputRef.current?.click()}
                disabled={uploading || ocrRunning}
              >
                {uploading ? "アップロード中…" : "画像を変更"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-[#fca5a5] px-3 py-1.5 text-xs font-bold text-[#b91c1c] disabled:opacity-60"
                onClick={handleRemove}
                disabled={ocrRunning}
              >
                削除
              </button>
            </div>
          </div>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f766e] px-3 py-2 text-xs font-bold text-white disabled:opacity-70"
            onClick={runOcr}
            disabled={ocrRunning}
          >
            {ocrRunning ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
                </svg>
                文字を読み取り中… {ocrProgress}%
              </>
            ) : (
              "文字を読み取ってメモに追加"
            )}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded-lg border border-dashed border-[#cbd5e1] px-3 py-3 text-xs font-bold text-[#334155] disabled:opacity-60"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "アップロード中…" : "画像を選択してアップロード"}
        </button>
      )}
      {showOriginal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowOriginal(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="元画像"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

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
    imageUrl: "",
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
    // 「その日だけ削除」された回の除外セット（ミリ秒タイムスタンプで比較）
    const excludedTimes = new Set(
      (row.excluded_dates ?? []).map((iso) => new Date(iso).getTime()),
    );
    const events: CalendarEvent[] = [];
    let occurrenceStart = originalStart;
    let guard = 0;

    while (occurrenceStart <= until && occurrenceStart <= windowEnd && guard < 500) {
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);

      if (occurrenceEnd >= windowStart && !excludedTimes.has(occurrenceStart.getTime())) {
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
          imageUrl: row.image_url ?? "",
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
  // 新規登録フォームの「メモ・画像・URL」欄を開いているか
  const [showMoreFields, setShowMoreFields] = useState(false);
  // よく使う予定の登録前確認
  const [confirmPattern, setConfirmPattern] = useState<SchedulePattern | null>(null);
  const [savingPattern, setSavingPattern] = useState(false);
  // 登録後に翌日へ移動したことを知らせるハイライト
  const [dateMovedKey, setDateMovedKey] = useState(0);
  const [showDateMoved, setShowDateMoved] = useState(false);
  const dateMovedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [recurringEditScope, setRecurringEditScope] = useState<"single" | "all">("single");
  const [detailImageOpen, setDetailImageOpen] = useState(false);
  const [linkOptions, setLinkOptions] = useState<LinkOption[]>([]);
  const [linkOptionsLoaded, setLinkOptionsLoaded] = useState(false);
  const [linkPickerTarget, setLinkPickerTarget] = useState<"new" | "edit" | null>(null);
  const [linkPickerQuery, setLinkPickerQuery] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
        .select("id, title, start_at, end_at, user_id, note, url, prefecture, city, image_url, all_day, category_id, event_visibility")
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
        image_url: null,
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
      .select("id, title, start_at, end_at, user_id, note, all_day, category_id, event_visibility, recurrence_rule, recurrence_until, excluded_dates")
      .eq("user_id", user.id);

    // excluded_dates 列が無い古いDB向けフォールバック
    if (recurringError?.code === "42703" || recurringError?.code === "PGRST204") {
      const retry = await supabase
        .from("recurring_events")
        .select("id, title, start_at, end_at, user_id, note, all_day, category_id, event_visibility, recurrence_rule, recurrence_until")
        .eq("user_id", user.id);
      recurringEvents = retry.data?.map((r) => ({ ...r, excluded_dates: null })) ?? null;
      recurringError = retry.error;
    }

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
      let { data, error } = await supabase
        .from("recurring_events")
        .select("id, title, start_at, end_at, user_id, note, all_day, category_id, event_visibility, recurrence_rule, recurrence_until, excluded_dates")
        .in("id", sharedRecurringIds);

      if (error?.code === "42703" || error?.code === "PGRST204") {
        const retry = await supabase
          .from("recurring_events")
          .select("id, title, start_at, end_at, user_id, note, all_day, category_id, event_visibility, recurrence_rule, recurrence_until")
          .in("id", sharedRecurringIds);
        data = retry.data?.map((r) => ({ ...r, excluded_dates: null })) ?? null;
        error = retry.error;
      }

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
        .select("id, title, start_at, end_at, user_id, note, url, prefecture, city, image_url, all_day, category_id, event_visibility")
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
          image_url: null,
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
        imageUrl: event.image_url ?? "",
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
        imageUrl: detailEvent.imageUrl,
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
    setShowMoreFields(false);
    setOcrBusy(false);
    setIsEventModalOpen(true);
  };

  const fetchLinkOptions = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    type LinkRow = {
      title: string;
      url: string | null;
      place_name?: string | null;
      is_favorite?: boolean | null;
      start_at: string;
    };

    let rows: LinkRow[] = [];
    const full = await supabase
      .from("events")
      .select("title, url, place_name, is_favorite, start_at")
      .eq("user_id", user.id)
      .not("url", "is", null)
      .order("start_at", { ascending: false });

    if (full.error?.code === "42703" || full.error?.code === "PGRST204") {
      const basic = await supabase
        .from("events")
        .select("title, url, start_at")
        .eq("user_id", user.id)
        .not("url", "is", null)
        .order("start_at", { ascending: false });
      rows = (basic.data ?? []) as LinkRow[];
    } else {
      rows = (full.data ?? []) as LinkRow[];
    }

    // URLで重複排除（お気に入り優先→新しい順）
    const sorted = [...rows].sort((a, b) => {
      const fav = Number(b.is_favorite ?? false) - Number(a.is_favorite ?? false);
      if (fav !== 0) return fav;
      return new Date(b.start_at).getTime() - new Date(a.start_at).getTime();
    });
    const seen = new Set<string>();
    const options: LinkOption[] = [];
    for (const row of sorted) {
      const url = (row.url ?? "").trim();
      if (!url) continue;
      const key = normalizeLinkUrl(url).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        url,
        label: (row.place_name?.trim() || row.title || linkHostOf(url) || url).trim(),
        host: linkHostOf(url),
        isFavorite: row.is_favorite ?? false,
      });
    }

    setLinkOptions(options);
    setLinkOptionsLoaded(true);
  }, []);

  const openLinkPicker = (target: "new" | "edit") => {
    setLinkPickerTarget(target);
    setLinkPickerQuery("");
    if (!linkOptionsLoaded) void fetchLinkOptions();
  };

  const chooseLink = (url: string) => {
    if (linkPickerTarget === "new") {
      setEventForm((current) => ({ ...current, url }));
    } else if (linkPickerTarget === "edit") {
      setEditForm((current) => ({ ...current, url }));
    }
    setLinkPickerTarget(null);
  };

  const filteredLinkOptions = useMemo(() => {
    const q = linkPickerQuery.trim().toLowerCase();
    if (!q) return linkOptions;
    return linkOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.url.toLowerCase().includes(q) ||
        o.host.toLowerCase().includes(q),
    );
  }, [linkOptions, linkPickerQuery]);

  const openDetailEvent = (event: CalendarEvent) => {
    setDetailEvent(event);
    setOcrBusy(false);
    setIsDetailEditing(false);
    setRecurringEditScope("single");
  };

  // スマホ: カレンダーを横スワイプで前月/翌月へ
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const handleCalendarTouchStart = (e: React.TouchEvent) => {
    if (calendarView !== "month" || e.touches.length !== 1) {
      swipeRef.current = null;
      return;
    }
    const touch = e.touches[0];
    swipeRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  };
  const handleCalendarTouchEnd = (e: React.TouchEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || calendarView !== "month") return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // 横方向が十分大きく、縦より優勢で、素早いスワイプのときだけ月を移動
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (Date.now() - start.t > 800) return;
    setCalendarDate((current) => addMonths(current, dx < 0 ? 1 : -1));
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

  const buildPatternForm = (pattern: SchedulePattern): EventForm => {
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
    return patternForm;
  };

  const applyPatternAndSave = async (pattern: SchedulePattern) => {
    if (savingPattern) return;
    setSavingPattern(true);
    try {
      await addEventWithForm(buildPatternForm(pattern), true);
    } finally {
      setSavingPattern(false);
      setConfirmPattern(null);
    }
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

  const addEventWithForm = async (form: EventForm, keepOpen = false): Promise<boolean> => {
    if (!form.title.trim()) return false;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const { startAt, endAt } = normalizeEventTimes(form);
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      show("終了日時は開始日時より後にしてください", "error");
      return false;
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
      image_url: form.imageUrl.trim() || null,
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
      // まず新しい列(prefecture/city/image_url)だけ外して再試行（分類・メモ等は維持）
      const { prefecture, city, image_url, ...withoutLocation } = eventPayload;
      let retry = await supabase.from("events").insert(withoutLocation).select().single();

      if (retry.error?.code === "PGRST204" || retry.error?.code === "42703") {
        // さらに古いDB向け: メモ・終日・分類等も外す
        const { note, all_day, category_id, event_visibility, ...minimal } = withoutLocation;
        retry = await supabase.from("events").insert(minimal).select().single();
        if (!retry.error && (note || all_day || category_id || event_visibility !== "private")) {
          show("DB列がまだ不足しています。SQL実行後はメモ・終日・分類も保存されます。", "error");
        }
      } else if (!retry.error && (prefecture || city || image_url)) {
        show("場所・画像を保存するにはSQL（prefecture/city/image_url列の追加）を実行してください。", "error");
      }

      insertedEvent = retry.data;
      error = retry.error;
    }

    if (error || !insertedEvent) {
      console.error(error);
      show("予定の追加に失敗しました", "error");
      return false;
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
        return false;
      }
    }

    if (keepOpen) {
      // パネルを開いたまま翌日へ移動し、日付が変わったことを目立たせる
      const savedDate = new Date(form.start);
      const nextDate = new Date(form.start);
      nextDate.setDate(nextDate.getDate() + 1);
      setEventForm(createBlankForm(nextDate));
      show(
        `${format(savedDate, "M月d日(E)", { locale: ja })}に「${form.title.trim()}」を登録しました。次は${format(nextDate, "M月d日(E)", { locale: ja })}です`,
        "success",
      );
      setDateMovedKey((k) => k + 1);
      setShowDateMoved(true);
      if (dateMovedTimer.current) clearTimeout(dateMovedTimer.current);
      dateMovedTimer.current = setTimeout(() => setShowDateMoved(false), 2500);
    } else {
      show("予定を追加しました", "success");
      setIsEventModalOpen(false);
    }
    await fetchEvents();
    return true;
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
      image_url: editForm.imageUrl.trim() || null,
      event_visibility: shareDraftIds.length > 0 ? editForm.shareType : "private",
    };

    if (detailEvent.recurringId && recurringEditScope === "single") {
      // 「この日だけ編集」: 元の回を excluded_dates に追加して繰り返しから除外し、
      // 編集内容を単発の予定として新規作成する（切り出し）。
      const originalIso = detailEvent.start.toISOString();

      const { data: rowData, error: fetchError } = await supabase
        .from("recurring_events")
        .select("excluded_dates")
        .eq("id", detailEvent.recurringId)
        .single();

      if (fetchError?.code === "42703" || fetchError?.code === "PGRST204") {
        show("この日だけ編集するにはSQL（excluded_dates列の追加）を実行してください。", "error");
        return;
      }
      if (fetchError) {
        console.error(fetchError);
        show(fetchError.message, "error");
        return;
      }

      // 先に単発の予定を作成（失敗したら除外はしない＝元の繰り返しを残す）
      const created = await addEventWithForm(
        { ...editForm, selectedUserIds: shareDraftIds },
        false,
      );
      if (!created) return;

      const existing: string[] = rowData?.excluded_dates ?? [];
      const nextExcluded = existing.includes(originalIso)
        ? existing
        : [...existing, originalIso];

      const { error: excludeError } = await supabase
        .from("recurring_events")
        .update({ excluded_dates: nextExcluded })
        .eq("id", detailEvent.recurringId);

      if (excludeError) {
        console.error(excludeError);
        show("この日の予定を作成しましたが、繰り返しからの除外に失敗しました。", "error");
      } else {
        show("この日の予定を更新しました", "success");
      }

      await fetchEvents();
      setDetailEvent(null);
      setIsDetailEditing(false);
      return;
    }

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
      // まず新しい列(prefecture/city/image_url)だけ外して再試行（分類・メモ等は維持）
      const { prefecture, city, image_url, ...withoutLocation } = payload;
      let retry = await supabase.from("events").update(withoutLocation).eq("id", detailEvent.id);

      if (retry.error?.code === "PGRST204" || retry.error?.code === "42703") {
        // さらに古いDB向け: メモ・終日・分類等も外す
        const { note, all_day, category_id, event_visibility, ...minimal } = withoutLocation;
        retry = await supabase.from("events").update(minimal).eq("id", detailEvent.id);
        if (!retry.error && (note || all_day || category_id || event_visibility !== "private")) {
          show("DB列がまだ不足しています。SQL実行後はメモ・終日・分類も保存されます。", "error");
        }
      } else if (!retry.error && (prefecture || city || image_url)) {
        show("場所・画像を保存するにはSQL（prefecture/city/image_url列の追加）を実行してください。", "error");
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
      // 繰り返し予定はカレンダーからは「その日だけ」削除する（行は残す）。
      // 全削除は 設定 → 繰り返し予定 から。
      const { data: rowData, error: fetchError } = await supabase
        .from("recurring_events")
        .select("excluded_dates")
        .eq("id", event.recurringId)
        .single();

      if (fetchError?.code === "42703" || fetchError?.code === "PGRST204") {
        show("この日だけ削除するにはSQL（excluded_dates列の追加）を実行してください。", "error");
        return;
      }

      const existing: string[] = rowData?.excluded_dates ?? [];
      const targetIso = event.start.toISOString();
      const nextExcluded = existing.includes(targetIso)
        ? existing
        : [...existing, targetIso];

      const { error } = await supabase
        .from("recurring_events")
        .update({ excluded_dates: nextExcluded })
        .eq("id", event.recurringId);

      if (error) {
        console.error(error);
        if (error.code === "42703" || error.code === "PGRST204") {
          show("この日だけ削除するにはSQL（excluded_dates列の追加）を実行してください。", "error");
        } else {
          show("削除に失敗しました", "error");
        }
        return;
      }

      show("この日の予定を削除しました", "success");
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

  // 予定検索: タイトル・メモ・分類・共有相手をあいまい一致で検索
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as CalendarEvent[];
    // eslint-disable-next-line react-hooks/purity -- 検索時点の現在時刻で近い順に並べたいだけ
    const now = Date.now();
    const matched = events.filter((event) => {
      const haystack = [
        event.title,
        event.note,
        event.categoryName,
        event.ownerName,
        event.prefecture,
        event.city,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    // 繰り返し予定は最も近い1件に集約
    const bestByKey = new Map<string, CalendarEvent>();
    for (const event of matched) {
      const key = event.recurringId ?? event.id ?? `${event.title}-${event.start.toISOString()}`;
      const current = bestByKey.get(key);
      if (!current) {
        bestByKey.set(key, event);
        continue;
      }
      const better =
        Math.abs(event.start.getTime() - now) < Math.abs(current.start.getTime() - now);
      if (better) bestByKey.set(key, event);
    }
    // 未来を優先し、今日に近い順に並べる
    return Array.from(bestByKey.values())
      .sort((a, b) => {
        const da = a.start.getTime() - now;
        const db = b.start.getTime() - now;
        const fa = da >= 0 ? 0 : 1;
        const fb = db >= 0 ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return fa === 0 ? da - db : db - da;
      })
      .slice(0, 50);
  }, [events, searchQuery]);

  const openSearchResult = (event: CalendarEvent) => {
    setCalendarDate(new Date(event.start));
    setIsSearchOpen(false);
    setSearchQuery("");
    openDetailEvent(event);
  };

  const selectedDayDate = dayDetail?.date ?? calendarDate;
  const selectedDayEvents = getEventsOnDate(visibleEvents, selectedDayDate);
  const timedCount = selectedDayEvents.filter((e) => !e.allDay).length;
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

  // 月表示の「何件まで表示するか」はウィンドウのリサイズ時にしか再計算されないため、
  // 下の予定パネルの開閉などでカレンダーの高さが変わったらリサイズを通知して数え直させる
  const mobileCalendarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = mobileCalendarRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastHeight = el.getBoundingClientRect().height;
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? lastHeight;
      if (Math.abs(height - lastHeight) < 1) return;
      lastHeight = height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => window.dispatchEvent(new window.Event("resize")));
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [loading]);

  // 日付タップ: 1回目はその日を選んで予定一覧を表示、選択中の日をもう一度タップすると追加画面
  const lastDateTapRef = useRef<{ key: string; at: number } | null>(null);
  const selectDate = (date: Date) => {
    const key = format(date, "yyyy-MM-dd");
    const now = currentTimeMs();
    const last = lastDateTapRef.current;
    // pointerup と click が連続して届くので二重発火は無視する。
    // 選択でパネルの高さが変わると、後から届く click が別の日付に当たることがあるため、日付が違っても短時間なら無視
    if (last && now - last.at < (last.key === key ? 450 : 350)) return;
    lastDateTapRef.current = { key, at: now };

    if (dayDetail && isSameDay(dayDetail.date, date)) {
      openEventModal(date);
      return;
    }
    setDayDetail({ date, events: [] });
    setIsDayEventsOpen(true);
  };

  // 「+N件」を押したら、その日を選んで一覧（スマホは下のパネル、PCは右側）に全件出す
  const showDayFromMore = (date: Date) => {
    lastDateTapRef.current = { key: format(date, "yyyy-MM-dd"), at: currentTimeMs() };
    setDayDetail({ date, events: [] });
    setIsDayEventsOpen(true);
  };

  // 日付タップ直後に届くクリックが、ずれた位置の予定に当たって詳細が開くのを防ぐ
  const handleSelectCalendarEvent = (event: CalendarEvent) => {
    const last = lastDateTapRef.current;
    if (last && currentTimeMs() - last.at < 450) return;
    openDetailEvent(event);
  };

  const shiftSelectedDay = (amount: number) => {
    const next = addDays(selectedDayDate, amount);
    setDayDetail({ date: next, events: [] });
    if (next.getMonth() !== calendarDate.getMonth() || next.getFullYear() !== calendarDate.getFullYear()) {
      setCalendarDate(next);
    }
  };

  const goToday = () => {
    const today = new Date();
    setCalendarDate(today);
    setDayDetail({ date: today, events: [] });
  };

  const calendarFormats = {
    monthHeaderFormat: "yyyy年M月",
    dayHeaderFormat: "M月d日(EEE)",
    weekdayFormat: "EEE",
    dateFormat: "d",
    dayFormat: "d(EEE)",
    agendaDateFormat: "M/d(EEE)",
    dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${format(start, "yyyy年M月d日", { locale: ja })} – ${format(end, "M月d日", { locale: ja })}`,
    agendaHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${format(start, "yyyy年M月d日", { locale: ja })} – ${format(end, "M月d日", { locale: ja })}`,
  };

  const calendarMessages = {
    today: "今日",
    previous: "前へ",
    next: "次へ",
    month: "月",
    week: "週",
    day: "日",
    agenda: "一覧",
    date: "日付",
    time: "時間",
    event: "予定",
    allDay: "終日",
    noEventsInRange: "この期間の予定はまだありません",
    showMore: (total: number) => `他${total}件`,
  };

  const calendarEventPropGetter = (event: CalendarEvent) => ({
    className: `${event.displayKind}-event`,
    style: {
      backgroundColor: getDisplayStyle(event.displayKind).background,
      borderLeft: `4px solid ${event.categoryColor ?? getDisplayStyle(event.displayKind).border}`,
      color: getDisplayStyle(event.displayKind).text,
    },
  });

  const calendarDayPropGetter = (date: Date) => {
    const classes: string[] = [];
    if (dayDetail && isSameDay(date, dayDetail.date)) classes.push("is-selected-day");
    const dow = date.getDay();
    if (isJapaneseHoliday(date) || dow === 0) classes.push("is-holiday");
    else if (dow === 6) classes.push("is-saturday");
    return { className: classes.join(" ") };
  };

  const renderDateHeader = ({ date, label }: { date: Date; label: string }) => {
    const dayCount = getEventsOnDate(visibleEvents, date).length;
    const dow = date.getDay();
    const holidayName = isJapaneseHoliday(date);
    const color = holidayName !== null || dow === 0 ? "var(--holiday)" : dow === 6 ? "var(--saturday)" : undefined;
    return (
      <span className="calendar-date-head">
        {dayCount >= 3 && (
          <span className="day-count-badge" title={`この日の予定 ${dayCount}件`}>{dayCount}件</span>
        )}
        {holidayName && <span className="calendar-holiday-name">{holidayName}</span>}
        <button
          className="calendar-date-button"
          style={color ? { color } : undefined}
          type="button"
          title={holidayName ?? undefined}
          aria-label={`${format(date, "M月d日(E)", { locale: ja })}${holidayName ? ` ${holidayName}` : ""}`}
          onPointerUp={(event) => { event.preventDefault(); event.stopPropagation(); selectDate(date); }}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); selectDate(date); }}
        >
          {label}
        </button>
      </span>
    );
  };

  const handleSelectSlot = (slotInfo: { start: Date; slots?: Date[]; action?: string }) => {
    if (slotInfo.action === "select") return;
    const date = slotInfo.slots && slotInfo.slots.length > 0 ? slotInfo.slots[0] : slotInfo.start;
    if (calendarView === "month") {
      selectDate(date);
      return;
    }
    // 週・日表示: 押した時間で追加画面を開く
    setDayDetail({ date, events: [] });
    setEventForm(() => {
      const base = createBlankForm(date);
      const start = new Date(date);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return { ...base, start: formatDateTimeLocal(start), end: formatDateTimeLocal(end) };
    });
    setShowMoreFields(false);
    setOcrBusy(false);
    setIsEventModalOpen(true);
  };

  const legendItems: { kind: EventDisplayKind; label: string }[] = [
    { kind: "own", label: "自分" },
    { kind: "partner", label: "自分→相手に共有" },
    { kind: "incoming", label: "相手から共有" },
    { kind: "together", label: "私たちの予定" },
  ];

  const filterKindColor = (value: CalendarFilter) =>
    value === "all" ? "var(--accent)"
    : value === "own" ? "#38bdf8"
    : value.startsWith("person:") ? "#8b5cf6"
    : "#f59e0b";

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
      if (isEventModalOpen || detailEvent || isSearchOpen) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openEventModal(dayDetail?.date ?? calendarDate);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setCalendarDate(new Date());
        setDayDetail({ date: new Date(), events: [] });
      } else if (e.key === "/") {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.key === "ArrowLeft" ? -1 : 1;
        setCalendarDate((current) =>
          calendarView === "week" ? addWeeks(current, step)
          : calendarView === "day" ? addDays(current, step)
          : addMonths(current, step),
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [calendarDate, calendarView, isEventModalOpen, isSearchOpen, detailEvent, dayDetail, showTutorial]);

  // 終日の予定と時間の決まった予定を分けて表示する
  const renderDayEventGroups = () => {
    const allDay = selectedDayEvents.filter((e) => e.allDay);
    const timed = selectedDayEvents.filter((e) => !e.allDay);
    return (
      <>
        {allDay.length > 0 && timed.length > 0 && <p className="day-group-label">終日</p>}
        {allDay.map((event) => renderDayEventRow(event))}
        {allDay.length > 0 && timed.length > 0 && <p className="day-group-label">時間指定（{timedCount}件）</p>}
        {timed.map((event) => renderDayEventRow(event))}
      </>
    );
  };

  const renderDayEventRow = (event: CalendarEvent) => {
    const style = getDisplayStyle(event.displayKind);
    const multiDay = !isSameDay(event.start, event.end);
    const time = event.allDay
      ? "終日"
      : multiDay
        ? `${format(event.start, "M/d HH:mm")}〜${format(event.end, "M/d HH:mm")}`
        : `${format(event.start, "HH:mm")}〜${format(event.end, "HH:mm")}`;
    const who = event.isShared
      ? `${event.ownerName}さんから`
      : event.sharedWith.length > 0
        ? `${event.sharedWith.map((u) => u.username).join("、")}と共有`
        : event.categoryName || "";
    return (
      <button
        key={`${event.id}-${event.start.toISOString()}`}
        className="day-event-row"
        style={{ backgroundColor: style.background }}
        onClick={() => openDetailEvent(event)}
        type="button"
      >
        <span className="day-event-bar" style={{ backgroundColor: event.categoryColor ?? style.border }} />
        <span className="min-w-0 flex-1">
          <span className="day-event-title">{event.title}</span>
          <span className="day-event-meta">
            {time}
            {who && ` · ${who}`}
            {event.recurringRule && event.recurringRule !== "none" && " · 繰り返し"}
          </span>
        </span>
      </button>
    );
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <main className="page-shell page-shell-home min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-6 lg:px-8">

      {/* ========== モバイル専用レイアウト ========== */}
      <div className="page-shell-mobile-inner sm:hidden">

        {/* 通知プロンプト（モバイル） */}
        {notificationsEnabled && showNotificationPrompt && notificationPermission === "default" && (
          <div className="notice-banner">
            <p className="flex-1 text-xs font-bold">共有されたときに通知を受け取りますか？</p>
            <button className="notice-banner-action" onClick={requestNotificationPermission}>受け取る</button>
            <button
              className="notice-banner-close"
              aria-label="通知の案内を閉じる"
              onClick={() => { window.localStorage.setItem("sharecal_notification_prompt_dismissed", "true"); setShowNotificationPrompt(false); }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* 検索 + 絞り込み（モバイル） */}
        <div className="flex items-center gap-2">
          <button className="icon-btn" onClick={() => setIsSearchOpen(true)} aria-label="予定を検索" type="button">
            <SearchIcon />
          </button>
          <div className="filter-chip-row" role="radiogroup" aria-label="表示する予定">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                role="radio"
                aria-checked={calendarFilter === option.value}
                className="filter-chip"
                data-active={calendarFilter === option.value ? "true" : undefined}
                onClick={() => setCalendarFilter(option.value)}
                type="button"
              >
                <span className="filter-chip-dot" style={{ backgroundColor: filterKindColor(option.value) }} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* カレンダー（モバイル） */}
        <div className="calendar-section-mobile calendar-card" ref={mobileCalendarRef}>
          <div
            className="calendar-shell h-full"
            onTouchStart={handleCalendarTouchStart}
            onTouchEnd={handleCalendarTouchEnd}
          >
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
              popup={false}
              doShowMoreDrillDown={false}
              selectable="ignoreEvents"
              messages={calendarMessages}
              formats={calendarFormats}
              eventPropGetter={calendarEventPropGetter}
              dayPropGetter={calendarDayPropGetter}
              onNavigate={(date) => setCalendarDate(date)}
              onView={(view) => setCalendarView(view)}
              longPressThreshold={350}
              scrollToTime={CALENDAR_SCROLL_TIME}
              components={{
                toolbar: CalendarToolbar,
                month: { dateHeader: renderDateHeader, event: MonthEventChip },
                week: { event: TimeEventBlock },
                day: { event: TimeEventBlock },
              }}
              onDrillDown={(date) => selectDate(date)}
              onShowMore={(_shownEvents, date) => showDayFromMore(date)}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectCalendarEvent}
            />
          </div>
        </div>

        {/* 選択した日の予定（モバイル） */}
        <section className="day-panel" aria-label="選択した日の予定">
          <div className="day-panel-head">
            <button
              className="day-panel-toggle"
              onClick={() => setIsDayEventsOpen((v) => !v)}
              aria-expanded={isDayEventsOpen}
              type="button"
            >
              <span className="day-panel-date">{format(selectedDayDate, "M月d日(E)", { locale: ja })}</span>
              {isSameDay(selectedDayDate, new Date()) && <span className="today-pill">今日</span>}
              <span className="day-panel-count">{selectedDayEvents.length}件</span>
              <svg className={`day-panel-chevron ${isDayEventsOpen ? "is-open" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 15 12 9 18 15" /></svg>
            </button>
            <button className="add-btn" onClick={() => openEventModal(selectedDayDate)} type="button">
              <PlusIcon />
              追加
            </button>
          </div>
          {isDayEventsOpen && (
            <div className="day-panel-body">
              {selectedDayEvents.length === 0 ? (
                <p className="day-panel-empty">予定はありません。「追加」か、日付をもう一度タップで登録できます。</p>
              ) : (
                renderDayEventGroups()
              )}
            </div>
          )}
        </section>
      </div>

      {/* ========== PC レイアウト（sm以上） ========== */}
      <div className="mx-auto hidden w-full max-w-[1400px] flex-col gap-4 sm:flex">
        <header className="page-header glass-card flex items-center justify-between gap-3 p-3">
          <div className="xl:hidden"><ShareCalLogo compact /></div>
          <div className="hidden xl:block"><ShareCalLogo /></div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="lg:hidden">
              <button className="icon-btn" onClick={() => setIsSearchOpen(true)} aria-label="予定を検索" type="button">
                <SearchIcon />
              </button>
            </div>
            <DesktopNavigation />
          </div>
        </header>

        {/* タブレット幅: 追加ボタンを右下に固定 */}
        <div className="contents lg:hidden">
          <button className="tablet-fab" onClick={() => openEventModal(selectedDayDate)} type="button">
            <PlusIcon />
            予定を追加
          </button>
        </div>

        {notificationsEnabled && showNotificationPrompt && notificationPermission === "default" && (
          <div className="notice-banner">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            <p className="flex-1 text-sm font-bold">予定が共有されたときに、画面とブラウザ通知でお知らせできます。</p>
            <button className="notice-banner-action" onClick={requestNotificationPermission}>通知を受け取る</button>
            <button
              className="notice-banner-close"
              aria-label="通知の案内を閉じる"
              onClick={() => { window.localStorage.setItem("sharecal_notification_prompt_dismissed", "true"); setShowNotificationPrompt(false); }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <div className="home-grid">
          {/* カレンダー本体 */}
          <section className="calendar-card home-grid-main p-2 sm:p-3">
            <div className="calendar-shell desktop-calendar">
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
                popup={false}
                doShowMoreDrillDown={false}
                selectable="ignoreEvents"
                messages={calendarMessages}
                formats={calendarFormats}
                eventPropGetter={calendarEventPropGetter}
                dayPropGetter={calendarDayPropGetter}
                onNavigate={(date) => setCalendarDate(date)}
                onView={(view) => setCalendarView(view)}
                longPressThreshold={350}
                scrollToTime={CALENDAR_SCROLL_TIME}
                components={{
                  toolbar: CalendarToolbar,
                  month: { dateHeader: renderDateHeader, event: MonthEventChip },
                  week: { event: TimeEventBlock },
                  day: { event: TimeEventBlock },
                }}
                onDrillDown={(date) => selectDate(date)}
                onShowMore={(_shownEvents, date) => showDayFromMore(date)}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectCalendarEvent}
              />
            </div>
          </section>

          {/* サイドバー */}
          <aside className="home-sidebar">
            <div className="hidden flex-col gap-2 lg:flex">
              <button className="add-btn add-btn-lg" onClick={() => openEventModal(selectedDayDate)} type="button">
                <PlusIcon />
                予定を追加
              </button>
              <button className="search-trigger" onClick={() => setIsSearchOpen(true)} type="button">
                <SearchIcon />
                <span className="flex-1 text-left">予定を検索</span>
                <kbd>/</kbd>
              </button>
            </div>

            <section className="side-card" aria-label="選択した日の予定">
              <div className="flex items-center gap-1">
                <button className="cal-nav-btn cal-nav-btn-sm" onClick={() => shiftSelectedDay(-1)} aria-label="前の日" type="button">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <p className="side-card-title">
                    {format(selectedDayDate, "M月d日(E)", { locale: ja })}
                    {isSameDay(selectedDayDate, new Date()) && <span className="today-pill ml-1.5">今日</span>}
                  </p>
                  <p className="side-card-sub">
                    {isJapaneseHoliday(selectedDayDate) ? `${isJapaneseHoliday(selectedDayDate)} · ` : ""}
                    予定 {selectedDayEvents.length}件
                  </p>
                </div>
                <button className="cal-nav-btn cal-nav-btn-sm" onClick={() => shiftSelectedDay(1)} aria-label="次の日" type="button">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                {selectedDayEvents.length === 0 ? (
                  <p className="day-panel-empty">この日の予定はありません。</p>
                ) : (
                  renderDayEventGroups()
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button className="ghost-btn flex-1" onClick={() => openEventModal(selectedDayDate)} type="button">
                  <PlusIcon />
                  この日に追加
                </button>
                {!isSameDay(selectedDayDate, new Date()) && (
                  <button className="ghost-btn" onClick={goToday} type="button">今日へ</button>
                )}
              </div>
            </section>

            <section className="side-card" aria-label="表示する予定">
              <div className="flex items-center justify-between">
                <p className="side-card-title">表示する予定</p>
                {calendarFilter !== "all" && (
                  <button className="text-link" onClick={() => setCalendarFilter("all")} type="button">すべて表示</button>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1" role="radiogroup" aria-label="表示する予定">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    role="radio"
                    aria-checked={calendarFilter === option.value}
                    className="filter-row"
                    data-active={calendarFilter === option.value ? "true" : undefined}
                    onClick={() => setCalendarFilter(option.value)}
                    type="button"
                  >
                    <span className="filter-row-dot" style={{ backgroundColor: filterKindColor(option.value) }} />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <span className="filter-row-count">{option.description}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="side-card" aria-label="色の見方">
              <p className="side-card-title">色の見方</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {legendItems.map((item) => (
                  <li key={item.kind} className="legend-item">
                    <span
                      className="legend-swatch"
                      style={{ backgroundColor: getDisplayStyle(item.kind).background, borderLeftColor: getDisplayStyle(item.kind).border }}
                    />
                    {item.label}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] font-semibold leading-relaxed text-[var(--fg-muted)]">
                ショートカット：<kbd>N</kbd> 追加 ／ <kbd>T</kbd> 今日 ／ <kbd>←</kbd><kbd>→</kbd> 前後へ ／ <kbd>/</kbd> 検索
              </p>
            </section>
          </aside>
        </div>
      </div>{/* /PC */}

      {/* 予定検索モーダル */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-[#0f172a]/40 p-3 pt-[8vh]"
          onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#d9e2ef] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[#e2e8f0] p-3">
              <span className="text-lg">🔍</span>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="予定を検索（タイトル・メモ・分類）"
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none"
              />
              <button
                className="shrink-0 rounded-lg border border-[#cbd5e1] bg-[#f8fafc] px-3 py-1.5 text-xs font-bold text-[#475569]"
                onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }}
                type="button"
              >
                閉じる
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {searchQuery.trim() === "" ? (
                <p className="px-3 py-6 text-center text-sm text-[#94a3b8]">キーワードを入力してください</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-[#94a3b8]">「{searchQuery}」に一致する予定はありません</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {searchResults.map((event) => (
                    <li key={`${event.id}-${event.start.toISOString()}`}>
                      <button
                        className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition hover:border-[#0f766e] hover:bg-[#ecfdf5]"
                        onClick={() => openSearchResult(event)}
                        type="button"
                      >
                        <span
                          className="h-9 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: event.categoryColor ?? getDisplayStyle(event.displayKind).border }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#0f172a]">{event.title}</span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-[#64748b]">
                            {format(event.start, "yyyy/M/d(E)", { locale: ja })}
                            {event.allDay ? " 終日" : ` ${format(event.start, "HH:mm")}`}
                            {event.categoryName ? ` ・ ${event.categoryName}` : ""}
                            {event.recurringRule && event.recurringRule !== "none" ? " ・ 繰り返し" : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

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

                  <div
                    key={dateMovedKey}
                    className={`relative rounded-xl px-2 py-0.5 text-center ${dateMovedKey > 0 ? "date-moved-flash" : ""}`}
                  >
                    <p className="text-[11px] font-bold text-[#64748b]">新しい予定</p>
                    {showDateMoved && (
                      <span className="date-moved-badge absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0f766e] px-2.5 py-0.5 text-[11px] font-bold text-white shadow">
                        次の日に移動しました
                      </span>
                    )}
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
                よく使う予定からワンタップ入力
              </p>
              <div className="flex gap-2 overflow-x-auto px-1 py-1">
              {patterns.map((pattern) => (
                <button
                  key={pattern.id}
                  className="shrink-0 rounded-full border border-[#cbd5e1] bg-[#f8fafc] px-4 py-2 text-sm font-semibold text-[#334155] transition hover:border-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#0f766e] active:scale-95"
                  onClick={() => setConfirmPattern(pattern)}
                >
                  {pattern.label}
                </button>
              ))}
              {patterns.length === 0 && (
                <p className="text-sm text-[#64748b]">
                  「夜勤」「休み」などを
                  <button type="button" className="mx-1 font-bold text-[#0f766e] underline" onClick={() => router.push("/patterns")}>よく使う予定</button>
                  に登録すると、ここからすぐ入力できます。
                </p>
              )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#64748b]">
                  タイトル <span className="text-[#e11d48]">*</span>
                </span>
                <input
                  className="h-11 w-full rounded-lg border border-[#cbd5e1] px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#99f6e4]"
                  placeholder="例：打ち合わせ、ごはん、歯医者"
                  enterKeyHint="done"
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
              {!(showMoreFields || eventForm.note || eventForm.imageUrl || eventForm.url) ? (
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#cbd5e1] py-3 text-sm font-bold text-[#475569] transition hover:border-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#0f766e] sm:col-span-2"
                  onClick={() => setShowMoreFields(true)}
                >
                  <PlusIcon />
                  メモ・画像・URLを追加
                </button>
              ) : (
              <>
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
              <div className="sm:col-span-2">
                <EventImageField
                  imageUrl={eventForm.imageUrl}
                  onImageUrlChange={(url) =>
                    setEventForm((current) => ({ ...current, imageUrl: url }))
                  }
                  onOcrText={(text) =>
                    setEventForm((current) => ({
                      ...current,
                      note: current.note.trim() ? `${current.note.trim()}\n${text}` : text,
                    }))
                  }
                  show={show}
                  onBusyChange={setOcrBusy}
                />
              </div>
              <label className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#64748b]">URL（お店・予約ページなど）</span>
                  <button
                    type="button"
                    className="rounded-lg border border-[#cbd5e1] px-2.5 py-1 text-xs font-bold text-[#0f766e]"
                    onClick={() => openLinkPicker("new")}
                  >
                    🔗 リンク集から選択
                  </button>
                </div>
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
              </>
              )}
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-[#64748b]">共有する相手 <span className="font-normal">（選ばなければ自分だけの予定）</span></p>
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

            <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-6 border-t border-[#e2e8f0] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
              <div className="flex gap-2">
                <button
                  className="h-11 shrink-0 rounded-lg border border-[#cbd5e1] px-4 text-sm font-bold text-[#475569] transition hover:bg-[#f8fafc]"
                  onClick={() => setIsEventModalOpen(false)}
                  type="button"
                >
                  キャンセル
                </button>
                <button
                  className="h-11 flex-1 rounded-lg bg-[#0f766e] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!eventForm.title.trim() || ocrBusy}
                  onClick={addEvent}
                  type="button"
                >
                  {ocrBusy ? "画像を処理中…" : !eventForm.title.trim() ? "タイトルを入力してください" : "登録する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailEvent && (
        <div className="fixed inset-0 z-50 flex items-start overflow-hidden bg-[#0f172a]/40 p-3 pt-4 sm:items-center sm:justify-center" onClick={() => { setDetailEvent(null); setIsDetailEditing(false); setDetailImageOpen(false); }}>
          {detailImageOpen && detailEvent.imageUrl && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
              onClick={(event) => { event.stopPropagation(); setDetailImageOpen(false); }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detailEvent.imageUrl}
                alt="元画像"
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          )}
          <div className="max-h-[88vh] w-full max-w-full overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-2xl sm:max-w-lg sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 border-b border-[#e2e8f0] bg-white pb-4">
              <div>
                <p className="text-xs font-bold text-[#64748b]">
                  {format(detailEvent.start, "M月d日(E)", { locale: ja })}
                  {detailEvent.allDay ? " · 終日" : ` · ${format(detailEvent.start, "HH:mm")}〜${format(detailEvent.end, "HH:mm")}`}
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
                <div className="sm:col-span-2">
                  <EventImageField
                    imageUrl={editForm.imageUrl}
                    onImageUrlChange={(url) =>
                      setEditForm((current) => ({ ...current, imageUrl: url }))
                    }
                    onOcrText={(text) =>
                      setEditForm((current) => ({
                        ...current,
                        note: current.note.trim() ? `${current.note.trim()}\n${text}` : text,
                      }))
                    }
                    show={show}
                    onBusyChange={setOcrBusy}
                  />
                </div>
                <label className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#64748b]">URL（お店・予約ページなど）</span>
                    <button
                      type="button"
                      className="rounded-lg border border-[#cbd5e1] px-2.5 py-1 text-xs font-bold text-[#0f766e]"
                      onClick={() => openLinkPicker("edit")}
                    >
                      🔗 リンク集から選択
                    </button>
                  </div>
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
                {detailEvent.imageUrl && (
                  <div className="rounded-xl bg-[#f8fafc] p-3">
                    <p className="text-xs font-semibold text-[#64748b]">画像</p>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        className="shrink-0"
                        onClick={() => setDetailImageOpen(true)}
                        aria-label="元画像を表示"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={detailEvent.imageUrl}
                          alt="添付画像"
                          className="h-20 w-20 rounded-md object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-xs font-bold text-[#334155]"
                        onClick={() => setDetailImageOpen(true)}
                      >
                        元画像を表示
                      </button>
                    </div>
                  </div>
                )}
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
                  <div className="rounded-xl bg-[#f8fafc] p-3">
                    <p className="text-xs font-bold text-[#64748b]">編集する範囲</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[
                        { value: "single" as const, label: "この日だけ" },
                        { value: "all" as const, label: "すべての繰り返し" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setRecurringEditScope(option.value)}
                          className={`h-10 rounded-lg border text-sm font-bold transition ${
                            recurringEditScope === option.value
                              ? "border-[#0f766e] bg-[#0f766e] text-white"
                              : "border-[#d9e2ef] bg-white text-[#475569]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[#64748b]">
                      {recurringEditScope === "single"
                        ? "この日の予定だけを変更します（時間・URLなども変更でき、他の回はそのままです）。"
                        : "変更内容が繰り返し予定のすべての回に反映されます。"}
                    </p>
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
                  className="h-11 w-full rounded-lg bg-[#0f766e] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={updateEvent}
                  disabled={ocrBusy}
                >
                  {ocrBusy ? "画像を処理中…" : "予定を保存"}
                </button>
                <button
                  className="h-11 w-full rounded-lg border border-[#fecdd3] px-5 text-sm font-semibold text-[#be123c] transition hover:bg-[#fff1f2] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => deleteEvent(detailEvent)}
                  disabled={ocrBusy}
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
                <p className="font-bold text-[#0f172a]">1. 日付を押して予定を確認・登録</p>
                <p className="mt-1">日付を押すとその日の予定が下に出ます。「＋追加」か、同じ日付をもう一度押すと登録画面が開きます。</p>
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

      {/* リンク集から選択 */}
      {linkPickerTarget && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-[#0f172a]/40 p-3 sm:items-center"
          onClick={() => setLinkPickerTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-black text-[#0f172a]">リンク集から選択</p>
              <button className="text-[#94a3b8]" onClick={() => setLinkPickerTarget(null)}>
                ✕
              </button>
            </div>
            <input
              className="mt-3 w-full rounded-lg border border-[#cbd5e1] p-2.5 text-sm outline-none focus:border-[#0f766e]"
              placeholder="店名・URLで検索"
              value={linkPickerQuery}
              onChange={(e) => setLinkPickerQuery(e.target.value)}
            />
            <div className="mt-3 max-h-[50vh] space-y-1.5 overflow-y-auto">
              {!linkOptionsLoaded ? (
                <p className="p-4 text-center text-sm text-[#94a3b8]">読み込み中…</p>
              ) : filteredLinkOptions.length === 0 ? (
                <p className="p-4 text-center text-sm text-[#94a3b8]">
                  {linkOptions.length === 0
                    ? "URL付きの予定がまだありません。"
                    : "一致するリンクがありません。"}
                </p>
              ) : (
                filteredLinkOptions.map((opt) => (
                  <button
                    key={opt.url}
                    type="button"
                    onClick={() => chooseLink(opt.url)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[#e2e8f0] p-2.5 text-left transition hover:border-[#0f766e] hover:bg-[#ecfdf5]"
                  >
                    <span className="text-base">{opt.isFavorite ? "⭐" : "🔗"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#0f172a]">{opt.label}</span>
                      <span className="block truncate text-xs text-[#94a3b8]">{opt.host || opt.url}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* よく使う予定の登録確認 */}
      {confirmPattern && (() => {
        const f = buildPatternForm(confirmPattern);
        const start = new Date(f.start);
        const end = new Date(f.end);
        const crossesDay = format(start, "yyyy-MM-dd") !== format(end, "yyyy-MM-dd");
        const categoryName = categories.find((c) => c.id === f.categoryId)?.name ?? "未分類";
        const shareCount = f.selectedUserIds.length;
        return (
          <div className="confirm-overlay" onClick={() => !savingPattern && setConfirmPattern(null)}>
            <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#64748b]">確認</p>
              <p className="mt-2 text-base font-black text-[#0f172a]">この内容で登録しますか？</p>
              <dl className="mt-4 space-y-2 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3 text-sm">
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#64748b]">日付</dt>
                  <dd className="text-lg font-black text-[#0f766e]">
                    {format(start, "M月d日(E)", { locale: ja })}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#64748b]">予定</dt>
                  <dd className="font-bold text-[#0f172a]">{f.title}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#64748b]">時間</dt>
                  <dd className="font-bold text-[#0f172a]">
                    {format(start, "HH:mm")} 〜 {crossesDay ? "翌" : ""}{format(end, "HH:mm")}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#64748b]">分類</dt>
                  <dd className="font-bold text-[#0f172a]">{categoryName}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#64748b]">共有</dt>
                  <dd className="font-bold text-[#0f172a]">{shareCount > 0 ? `${shareCount}人` : "自分のみ"}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-[#64748b]">登録後は次の日の入力に進みます。</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  className="h-11 rounded-xl border border-[#cbd5e1] font-bold text-[#334155] transition hover:bg-[#f8fafc] disabled:opacity-50"
                  disabled={savingPattern}
                  onClick={() => setConfirmPattern(null)}
                >
                  キャンセル
                </button>
                <button
                  className="h-11 rounded-xl bg-[#0f766e] font-bold text-white transition hover:bg-[#115e59] disabled:opacity-60"
                  disabled={savingPattern}
                  onClick={() => void applyPatternAndSave(confirmPattern)}
                >
                  {savingPattern ? "登録中…" : "登録する"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete confirmation modal */}
      {confirmDeleteEvent && (
        <div className="confirm-overlay" onClick={() => setConfirmDeleteEvent(null)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#64748b]">確認</p>
            <p className="mt-2 text-base font-black text-[#0f172a]">
              {confirmDeleteEvent.recurringId
                ? `「${confirmDeleteEvent.title}」の${format(confirmDeleteEvent.start, "M月d日", { locale: ja })}の予定を削除しますか？`
                : `「${confirmDeleteEvent.title}」を削除しますか？`}
            </p>
            {confirmDeleteEvent.recurringId && (
              <p className="mt-1 text-sm text-[#64748b]">
                この日のみ削除します（繰り返し予定は残ります）。すべて削除する場合は 設定 → 繰り返し予定 から行ってください。
              </p>
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
                {confirmDeleteEvent.recurringId ? "この日を削除" : "削除する"}
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
