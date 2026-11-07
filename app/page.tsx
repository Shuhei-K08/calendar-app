"use client";

import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Event, View } from "react-big-calendar";
import { addDays, addMonths, addWeeks, addYears, endOfDay, format, getDay, isSameDay, parse, startOfDay, startOfWeek } from "date-fns";
import { ja } from "date-fns/locale/ja";
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";

// コメント・スタンプ・共有のお知らせを、10分ごとの確認を待たずにすぐ送る（失敗しても10分以内に届く）
const flushNotifications = () => {
  void authFetch("/api/notify/flush", { method: "POST" }).catch(() => undefined);
};
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import StoredImage from "@/app/components/StoredImage";
import { DesktopNavigation, MobileNavigation, OPEN_ADD_EVENT, ShareCalLogo, ShareCalMark } from "@/app/components/AppNavigation";
import * as HolidayJp from "@holiday-jp/holiday_jp";
import BirthdayBanner from "@/app/components/BirthdayBanner";
import { useBirthdayPeople } from "@/lib/birthday";

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
  date,
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
        <h2 className="cal-toolbar-label" aria-live="polite">
          {view === "month" ? (
            <>
              <span className="cal-toolbar-month">{format(date, "M月")}</span>
              <span className="cal-toolbar-year">{format(date, "yyyy")}</span>
            </>
          ) : (
            label
          )}
        </h2>
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

// ひとことの既読管理（この端末で最後に開いた時刻を予定ごとに保存）
const COMMENT_SEEN_KEY = "sharecal_comment_seen";
const commentKeyOf = (event: { id?: string; recurringId?: string }) =>
  event.recurringId ? `r:${event.recurringId}` : event.id ? `e:${event.id}` : "";
const readCommentSeen = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(COMMENT_SEEN_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
};

// まとめて入力中だけ、月表示のマス全体を押せるようにする
// （予定の帯や日付の上は CSS で押せなくし、マスの背景が押されるようにしている）
const BulkTapContext = createContext<((date: Date) => void) | null>(null);

function BulkCellWrapper({ value, children }: { value: Date; range?: Date[]; children?: ReactNode }) {
  const onTap = useContext(BulkTapContext);
  if (!onTap || !isValidElement(children)) return <>{children}</>;
  const child = children as ReactElement<{ className?: string; onClick?: () => void }>;
  return cloneElement(child, {
    className: `${child.props.className ?? ""} bulk-tap-cell`,
    onClick: () => onTap(value),
  });
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
      {event.hasUnread && <span className="unread-dot" aria-label="新しいひとことがあります" />}
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
      <span className="time-block-title">
        {event.hasUnread && <span className="unread-dot unread-dot-inline" aria-label="新しいひとことがあります" />}
        {event.title}
      </span>
      {!event.allDay && (
        <span className="time-block-meta">
          {format(event.start, "H:mm")}〜{format(event.end, "H:mm")}
          {who && ` · ${who}`}
        </span>
      )}
    </span>
  );
}

// PC・タブレット用: ドラッグで予定を移動・長さ変更できるカレンダー
const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar);

// ドラッグで動かせるのは自分の通常予定だけ（繰り返し・共有された予定は対象外）
const canDragEvent = (event: CalendarEvent) =>
  event.canDelete && !event.recurringId && !event.ownerDeleted;

type EventComment = {
  id: string;
  user_id: string;
  body: string | null;
  reaction: string | null;
  created_at: string;
};

const QUICK_REACTIONS = [
  { emoji: "👍", label: "了解" },
  { emoji: "🙏", label: "ありがとう" },
  { emoji: "❤️", label: "いいね" },
  { emoji: "🎉", label: "楽しみ" },
  { emoji: "😢", label: "ざんねん" },
];

// チャットの時刻: 今日は「19:05」、昨日は「昨日 19:05」、それ以前は「10/28 19:05」
const formatChatTime = (iso: string) => {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  if (d >= today) return format(d, "H:mm");
  if (d >= addDays(today, -1)) return `昨日 ${format(d, "H:mm")}`;
  return format(d, "M/d H:mm");
};

// ユーザーごとに固定のアイコン色
const AVATAR_COLORS = ["#8b5cf6", "#f59e0b", "#0ea5e9", "#ec4899", "#10b981", "#6366f1"];
const avatarColor = (userId: string) => {
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

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
        <ShareCalMark size={44} />
      </div>

      {/* テキスト */}
      <div className="text-center">
        <p className="text-xl font-black tracking-tight text-[#1b2421]">ShareCal</p>
        <p className="mt-1 text-sm font-semibold text-[#66706c]">予定を読み込んでいます</p>
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
  hasUnread?: boolean; // 相手から未読のひとこと・スタンプがある
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
  remindMinutes?: string; // 通知（開始の何分前。空 = なし）
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
  // 3. プレーンテキストからURL抽出（URLが含まれていなければ空を返し、普通に貼り付けさせる）
  const text = clipboardData.getData("text/plain") || clipboardData.getData("text");
  const match = text.match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[.,)>\]]+$/, "") : "";
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

type LinkOption = { url: string; label: string; host: string; isFavorite: boolean; isWish?: boolean };

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
      const res = await authFetch("/api/ocr", {
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
      <span className="text-xs font-semibold text-[#66706c]">画像</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelect}
      />
      {imageUrl ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] p-2">
            <StoredImage src={imageUrl} alt="添付画像" className="h-16 w-16 shrink-0 rounded-md object-cover" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-bold text-[#3a4440]"
                onClick={() => setShowOriginal(true)}
              >
                元画像を表示
              </button>
              <button
                type="button"
                className="rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-bold text-[#3a4440] disabled:opacity-60"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white disabled:opacity-70"
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
          className="w-full rounded-lg border border-dashed border-[#d5dad8] px-3 py-3 text-xs font-bold text-[#3a4440] disabled:opacity-60"
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
          <StoredImage
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

// 予定の通知（アプリを閉じていても届く）
const REMIND_TIMED = [
  { value: "", label: "なし" },
  { value: "0", label: "予定の時間" },
  { value: "10", label: "10分前" },
  { value: "20", label: "20分前" },
  { value: "30", label: "30分前" },
  { value: "60", label: "1時間前" },
  { value: "120", label: "2時間前" },
  { value: "1440", label: "1日前" },
];
const REMIND_ALL_DAY = [
  { value: "", label: "なし" },
  { value: "-480", label: "当日の朝 8:00" },
  { value: "240", label: "前日の夜 20:00" },
  { value: "1680", label: "2日前の夜 20:00" },
];

function RemindSelect({ allDay, value, onChange, disabledReason }: { allDay: boolean; value: string; onChange: (v: string) => void; disabledReason?: string }) {
  const base = allDay ? REMIND_ALL_DAY : REMIND_TIMED;
  // 前に付けた「5分前」などは、選択肢に無くてもそのまま残す
  const options = !allDay && value && Number(value) > 0 && !base.some((o) => o.value === value) ? [...base, { value, label: `${value}分前` }] : base;
  const current = options.some((o) => o.value === value) ? value : "";
  return (
    <label className="space-y-1.5 sm:col-span-2">
      <span className="field-label">通知（アプリを閉じていても届く）</span>
      <select
        className="h-11 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] disabled:opacity-50"
        value={disabledReason ? "" : current}
        disabled={!!disabledReason}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="block text-xs text-[#66706c]">
        {disabledReason ?? (current ? "自分にだけ届きます。設定 › 通知 をオンにした端末に届きます。" : "知らせてほしい予定にだけ付けてください。")}
      </span>
    </label>
  );
}

const getDisplayKind = (
  isShared: boolean,
  hasShareTargets: boolean,
  visibility: EventVisibility | null,
): EventDisplayKind => {
  if (!isShared && !hasShareTargets) return "own";
  if (visibility === "partner") return isShared ? "incoming" : "partner";
  return "together";
};


// 予定の色: わたし（自分・自分が共有した予定）＝緑、相手から＝オレンジ、ふたり＝紫
const getDisplayStyle = (kind: EventDisplayKind) => {
  if (kind === "incoming") {
    return { background: "var(--incoming-event-bg)", text: "#9a3412", border: "#c2410c" };
  }
  if (kind === "together") {
    return { background: "var(--shared-event-bg)", text: "#5b21b6", border: "#6d3fd8" };
  }
  if (kind === "partner") {
    return { background: "var(--partner-event-bg)", text: "var(--accent-strong)", border: "var(--accent)" };
  }
  return { background: "var(--own-event-bg)", text: "var(--accent-strong)", border: "var(--uncategorized-event)" };
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
  // まだ相手とつながっていない人への案内（閉じたら出さない）
  const [connectHintDismissed, setConnectHintDismissed] = useState(true);
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
  // 編集画面の「メモ・画像・URL」欄を開いているか
  const [showEditMoreFields, setShowEditMoreFields] = useState(false);
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // 誕生日（自分とつながっている相手）：カレンダーの上のカウントダウンと、誕生日のマスの印
  const birthdayPeople = useBirthdayPeople(currentUserId, connections.map((c) => c.id));
  // 予定のコメント・リアクション（詳細画面を開いたときに読み込む）
  const [comments, setComments] = useState<EventComment[]>([]);
  const [commentsState, setCommentsState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  // ドラッグで動かした直後の「元に戻す」用
  const [lastMove, setLastMove] = useState<{
    id: string;
    title: string;
    prevStart: Date;
    prevEnd: Date;
    prevAllDay: boolean;
  } | null>(null);
  const lastMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyingEvent, setCopyingEvent] = useState(false);
  // 相手からのひとこと・スタンプの最新時刻（予定ごと）と、この端末で最後に見た時刻
  const [commentActivity, setCommentActivity] = useState<Record<string, string>>({});
  const [commentSeen, setCommentSeen] = useState<Record<string, string>>(() => readCommentSeen());
  // よく使う予定の連続登録モード
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkPatternId, setBulkPatternId] = useState<string | null>(null);

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

    // スマホへの通知はサーバーから届くので、ここでは画面の中のお知らせだけにする（二重に鳴らさない）
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

  // 相手が付けたひとこと・スタンプの「予定ごとの最新時刻」を取得（直近60日分）
  const fetchCommentActivity = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("event_comments")
      .select("event_id, recurring_event_id, created_at")
      .neq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) return; // テーブル未作成などは静かに無視
    const latest: Record<string, string> = {};
    for (const row of data as { event_id: string | null; recurring_event_id: string | null; created_at: string }[]) {
      const key = row.recurring_event_id ? `r:${row.recurring_event_id}` : row.event_id ? `e:${row.event_id}` : "";
      if (key && (!latest[key] || latest[key] < row.created_at)) latest[key] = row.created_at;
    }
    setCommentActivity(latest);
  }, []);

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
        remindMinutes: "",
      });
    }
  }, [detailEvent]);

  // 自分がこの予定に付けた通知を読む（表がまだ無ければ何もしない）
  useEffect(() => {
    if (!detailEvent?.id || detailEvent.recurringId) return;
    let alive = true;
    void supabase
      .from("event_reminders")
      .select("remind_minutes")
      .eq("event_id", detailEvent.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) setEditForm((current) => ({ ...current, remindMinutes: String(data.remind_minutes) }));
      });
    return () => {
      alive = false;
    };
  }, [detailEvent]);

  // 予定の通知を保存（なしなら消す）
  const saveEventReminder = async (eventId: string, userId: string, minutes: string | undefined) => {
    const { error } = minutes
      ? await supabase
          .from("event_reminders")
          .upsert({ event_id: eventId, user_id: userId, remind_minutes: Number(minutes) }, { onConflict: "event_id,user_id" })
      : await supabase.from("event_reminders").delete().eq("event_id", eventId).eq("user_id", userId);
    if (error && minutes) show("通知を保存するには supabase-event-notify.sql を実行してください", "error");
  };

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
    authFetch(`/api/og?url=${encodeURIComponent(normalizedForFetch)}`)
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
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }
      setCurrentUserId(user.id);

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
        fetchCommentActivity(),
      ]);

      setConnections(acceptedUsers);
      setConnectHintDismissed(window.localStorage.getItem("sharecal_connect_hint_dismissed") === "1");
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
      void fetchCommentActivity();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [fetchCategories, fetchCommentActivity, fetchConnections, fetchEvents, fetchPatterns, router]);

  // 相手が予定を追加・変更・共有したら、開いている画面にもすぐ反映する
  useLiveRefresh("calendar-events", ["events", "event_shares", "recurring_events", "recurring_event_shares"], fetchEvents);
  useLiveRefresh("calendar-comments", ["event_comments"], fetchCommentActivity);

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
  const openAddRef = useRef<() => void>(() => {});
  useEffect(() => {
    openAddRef.current = () => openEventModal(dayDetail?.date ?? new Date());
  });


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
        // 店名が取れていなければ、予定の件名ではなくURLを表示する
        label: (row.place_name?.trim() || url).trim(),
        host: linkHostOf(url),
        isFavorite: row.is_favorite ?? false,
      });
    }

    // 行きたいリスト（自分＋相手）を先頭に。テーブルが無ければ何もしない
    const wish = await supabase
      .from("wish_spots")
      .select("url, title, created_at")
      .order("created_at", { ascending: false });
    const wishOptions: LinkOption[] = [];
    for (const row of (wish.data ?? []) as { url: string; title: string | null }[]) {
      const url = (row.url ?? "").trim();
      if (!url) continue;
      const key = normalizeLinkUrl(url).toLowerCase();
      const label = (row.title?.trim() || url).trim();
      const i = options.findIndex((o) => normalizeLinkUrl(o.url).toLowerCase() === key);
      if (i >= 0) {
        options.splice(i, 1); // 行ったことがあっても、行きたいに入っていれば行きたい扱いで先頭に
      } else if (seen.has(key)) continue;
      seen.add(key);
      wishOptions.push({ url, label, host: linkHostOf(url), isFavorite: false, isWish: true });
    }

    setLinkOptions([...wishOptions, ...options]);
    setLinkOptionsLoaded(true);
  }, []);

  // 予定の追加を開いたら、行きたいお店の候補を読み込んでおく
  useEffect(() => {
    if (!isEventModalOpen || linkOptionsLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLinkOptions();
  }, [isEventModalOpen, linkOptionsLoaded, fetchLinkOptions]);

  const wishChips = useMemo(() => linkOptions.filter((o) => o.isWish).slice(0, 8), [linkOptions]);

  const chooseWish = (opt: LinkOption) => {
    setEventForm((current) => ({
      ...current,
      url: opt.url,
      title: current.title.trim() ? current.title : opt.label.startsWith("http") ? current.title : opt.label,
    }));
    setShowMoreFields(true);
  };

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
    void loadComments(event);
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

  const addEventWithForm = async (
    form: EventForm,
    keepOpen = false,
    successMessage = "予定を追加しました",
  ): Promise<boolean> => {
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
      if (!shareError) flushNotifications();

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

    if (form.remindMinutes) await saveEventReminder(insertedEvent.id, user.id, form.remindMinutes);

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
      if (successMessage) show(successMessage, "success");
      setIsEventModalOpen(false);
    }
    await fetchEvents();
    return true;
  };

  const addEvent = async () => addEventWithForm(eventForm, false);

  // 新規登録画面の ‹ › : 入力内容はそのままで日付だけ前後に動かす
  const shiftFormDays = (amount: number) => {
    setEventForm((current) => ({
      ...current,
      start: formatDateTimeLocal(addDays(new Date(current.start), amount)),
      end: formatDateTimeLocal(addDays(new Date(current.end || current.start), amount)),
    }));
  };

  // ── 予定の複製 ─────────────────────────────────────────────
  // 予定の内容をフォームに写す（相手の予定は分類・共有先を引き継がず自分の予定にする）
  const buildCopyForm = (event: CalendarEvent, dayOffset: number): EventForm => {
    const isMine = event.canDelete;
    const start = addDays(event.start, dayOffset);
    const end = addDays(event.end, dayOffset);
    return {
      title: event.title,
      start: formatDateTimeLocal(start),
      end: formatDateTimeLocal(end),
      allDay: event.allDay,
      note: event.note ?? "",
      url: event.url ?? "",
      prefecture: event.prefecture ?? "",
      city: event.city ?? "",
      imageUrl: event.imageUrl ?? "",
      categoryId: isMine ? event.categoryId ?? "" : "",
      selectedUserIds: isMine ? event.sharedWith.map((u) => u.id) : [],
      shareType: isMine && event.visibility !== "private" ? event.visibility : "together",
    };
  };

  // 1週間後の同じ時間にそのまま登録
  const copyEventToNextWeek = async (event: CalendarEvent) => {
    if (copyingEvent) return;
    setCopyingEvent(true);
    try {
      const nextStart = addDays(event.start, 7);
      const ok = await addEventWithForm(
        buildCopyForm(event, 7),
        false,
        `${format(nextStart, "M月d日(E)", { locale: ja })}に「${event.title}」をコピーしました`,
      );
      if (ok) setDetailEvent(null);
    } finally {
      setCopyingEvent(false);
    }
  };

  // 内容を入れた状態で登録画面を開く（日付や時間を変えてから登録）
  const openCopyEditor = (event: CalendarEvent) => {
    setEventForm(buildCopyForm(event, 0));
    setShowMoreFields(Boolean(event.note || event.url || event.imageUrl));
    setOcrBusy(false);
    setDetailEvent(null);
    setIsEventModalOpen(true);
    show("内容をコピーしました。日付を選んで登録してください", "info");
  };

  // ── ドラッグで移動・長さ変更 ────────────────────────────────
  const saveEventTimes = async (
    event: CalendarEvent,
    nextStart: Date,
    nextEnd: Date,
    nextAllDay: boolean,
    options: { recordUndo: boolean; message?: string },
  ) => {
    if (!event.id) return;
    const prev = { start: event.start, end: event.end, allDay: event.allDay };
    // 先に画面へ反映（失敗したら戻す）
    setEvents((current) =>
      current.map((e) => (e.id === event.id ? { ...e, start: nextStart, end: nextEnd, allDay: nextAllDay } : e)),
    );

    let { error } = await supabase
      .from("events")
      .update({ start_at: nextStart.toISOString(), end_at: nextEnd.toISOString(), all_day: nextAllDay })
      .eq("id", event.id);
    if (error?.code === "PGRST204" || error?.code === "42703") {
      ({ error } = await supabase
        .from("events")
        .update({ start_at: nextStart.toISOString(), end_at: nextEnd.toISOString() })
        .eq("id", event.id));
    }

    if (error) {
      console.error(error);
      setEvents((current) =>
        current.map((e) => (e.id === event.id ? { ...e, start: prev.start, end: prev.end, allDay: prev.allDay } : e)),
      );
      show("予定を動かせませんでした", "error");
      return;
    }

    if (options.recordUndo) {
      setLastMove({ id: event.id, title: event.title, prevStart: prev.start, prevEnd: prev.end, prevAllDay: prev.allDay });
      if (lastMoveTimer.current) clearTimeout(lastMoveTimer.current);
      lastMoveTimer.current = setTimeout(() => setLastMove(null), 7000);
    }
    if (options.message) show(options.message, "success");
  };

  const handleEventDrop = ({ event, start, end, isAllDay }: EventInteractionArgs<CalendarEvent>) => {
    if (!canDragEvent(event)) return;
    let nextStart = new Date(start);
    let nextEnd = new Date(end);
    const nextAllDay = isAllDay ?? event.allDay;
    if (nextAllDay && !event.allDay) {
      // 時間指定 → 終日の枠へ: その日いっぱいの終日予定にする
      nextStart = startOfDay(nextStart);
      nextEnd = endOfDay(nextStart);
    } else if (!nextAllDay && event.allDay) {
      // 終日 → 時間の枠へ: 1時間の予定にする
      nextEnd = new Date(nextStart.getTime() + 60 * 60 * 1000);
    } else if (nextAllDay && nextEnd.getTime() <= nextStart.getTime()) {
      nextEnd = endOfDay(nextStart);
    }
    if (nextStart.getTime() === event.start.getTime() && nextEnd.getTime() === event.end.getTime() && nextAllDay === event.allDay) return;
    void saveEventTimes(event, nextStart, nextEnd, nextAllDay, { recordUndo: true });
  };

  const handleEventResize = ({ event, start, end }: EventInteractionArgs<CalendarEvent>) => {
    if (!canDragEvent(event)) return;
    const nextStart = new Date(start);
    let nextEnd = new Date(end);
    if (event.allDay) {
      // 終日予定の終わりは「最終日の23:59」で保存する
      nextEnd = endOfDay(addDays(nextEnd, nextEnd.getHours() === 0 && nextEnd.getMinutes() === 0 ? -1 : 0));
    }
    if (nextEnd.getTime() <= nextStart.getTime()) return;
    void saveEventTimes(event, nextStart, nextEnd, event.allDay, { recordUndo: true });
  };

  const undoLastMove = async () => {
    if (!lastMove) return;
    const target = events.find((e) => e.id === lastMove.id);
    const move = lastMove;
    setLastMove(null);
    if (lastMoveTimer.current) clearTimeout(lastMoveTimer.current);
    if (!target) return;
    await saveEventTimes(target, move.prevStart, move.prevEnd, move.prevAllDay, {
      recordUndo: false,
      message: "元に戻しました",
    });
  };

  // ── コメント・リアクション ─────────────────────────────────
  const commentTargetOf = (event: CalendarEvent) =>
    event.recurringId
      ? { column: "recurring_event_id" as const, id: event.recurringId }
      : event.id
        ? { column: "event_id" as const, id: event.id }
        : null;

  const isCommentable = (event: CalendarEvent) =>
    !event.ownerDeleted && (event.isShared || event.sharedWith.length > 0);

  const isMissingTable = (error: { code?: string; message?: string } | null) =>
    !!error && (error.code === "42P01" || error.code === "PGRST205" || /event_comments/.test(error.message ?? ""));

  const loadComments = async (event: CalendarEvent) => {
    setComments([]);
    setCommentDraft("");
    setReactionPickerOpen(false);
    setSelectedCommentId(null);
    const target = commentTargetOf(event);
    if (!target || !isCommentable(event)) {
      setCommentsState("idle");
      return;
    }
    setCommentsState("loading");
    const { data, error } = await supabase
      .from("event_comments")
      .select("id, user_id, body, reaction, created_at")
      .eq(target.column, target.id)
      .order("created_at", { ascending: true });
    if (error) {
      if (!isMissingTable(error)) console.error(error);
      setCommentsState(isMissingTable(error) ? "unavailable" : "ready");
      return;
    }
    setComments((data ?? []) as EventComment[]);
    setCommentsState("ready");
    markCommentsSeen(event);
  };

  // 詳細を開いた（＝読んだ）ので、この予定の💬印を消す
  const markCommentsSeen = (event: CalendarEvent) => {
    const key = commentKeyOf(event);
    if (!key) return;
    // 端末の時計がずれていても印が残らないよう、届いている最新の時刻以上を記録する
    const nowIso = new Date().toISOString();
    const latest = commentActivity[key];
    const seenAt = latest && latest > nowIso ? latest : nowIso;
    setCommentSeen((current) => {
      const next = { ...current, [key]: seenAt };
      try {
        window.localStorage.setItem(COMMENT_SEEN_KEY, JSON.stringify(next));
      } catch {
        // 保存できなくても表示には影響しない
      }
      return next;
    });
  };

  // 相手のアイコン色: 相手が1人ならオレンジ（予定の色と同じ）、複数ならそれぞれ別の色
  const partnerColor = (userId: string) => (connections.length <= 1 ? "#c2410c" : avatarColor(userId));

  const commenterName = (userId: string, event: CalendarEvent) => {
    if (userId === currentUserId) return "自分";
    const connected = connections.find((c) => c.id === userId);
    if (connected) return connected.username;
    if (userId === event.ownerId) return event.ownerName;
    return "メンバー";
  };

  const sendComment = async (event: CalendarEvent, payload: { body?: string; reaction?: string }) => {
    const target = commentTargetOf(event);
    if (!target || commentSending) return;
    setCommentSending(true);
    const { data, error } = await supabase
      .from("event_comments")
      .insert({ [target.column]: target.id, body: payload.body ?? null, reaction: payload.reaction ?? null })
      .select("id, user_id, body, reaction, created_at")
      .single();
    setCommentSending(false);
    if (error || !data) {
      console.error(error);
      if (isMissingTable(error)) setCommentsState("unavailable");
      else show("送信できませんでした", "error");
      return;
    }
    setComments((current) => [...current, data as EventComment]);
    if (payload.body) setCommentDraft("");
    flushNotifications();
  };

  const deleteComment = async (commentId: string) => {
    const before = comments;
    setComments((current) => current.filter((c) => c.id !== commentId));
    const { error } = await supabase.from("event_comments").delete().eq("id", commentId);
    if (error) {
      console.error(error);
      setComments(before);
      show("削除できませんでした", "error");
    }
  };

  // 同じリアクションをもう一度押したら取り消し
  const toggleReaction = async (event: CalendarEvent, emoji: string) => {
    const mine = comments.find((c) => c.reaction === emoji && c.user_id === currentUserId);
    if (mine) {
      await deleteComment(mine.id);
      return;
    }
    await sendComment(event, { reaction: emoji });
  };

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
        if (!shareError) flushNotifications();

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
      if (!shareError) flushNotifications();
      if (shareError) {
        console.error(shareError);
        show(shareError.message, "error");
        return;
      }
    }

    {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await saveEventReminder(detailEvent.id, user.id, editForm.remindMinutes);
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
        if (!insertError) flushNotifications();

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
      if (!insertError) flushNotifications();

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

  const visibleEvents = useMemo(
    () =>
      filterEvents(events).map((event) => {
        const key = commentKeyOf(event);
        const latest = key ? commentActivity[key] : undefined;
        const hasUnread = !!latest && (!commentSeen[key] || commentSeen[key] < latest);
        return hasUnread === !!event.hasUnread ? event : { ...event, hasUnread };
      }),
    [events, filterEvents, commentActivity, commentSeen],
  );

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
      color: "var(--accent)",
    },
    {
      value: "own" as CalendarFilter,
      label: "わたし",
      description: `${format(calendarDate, "M月", { locale: ja })} ${getFilterCount("own")}件`,
      color: "var(--accent)",
    },
    ...connections.flatMap((connection) => [
      {
        value: `person:${connection.id}` as CalendarFilter,
        label: connection.username,
        description: `相手の予定 ${getFilterCount(`person:${connection.id}`)}件`,
        color: "#c2410c",
      },
      {
        value: `together:${connection.id}` as CalendarFilter,
        label: connections.length === 1 ? "ふたり" : `${connection.username}とふたり`,
        description: `私たちの予定 ${getFilterCount(`together:${connection.id}`)}件`,
        color: "#6d3fd8",
      },
    ]),
  ];

  // 下のメニュー・左のメニューの「＋」から予定追加を開く
  useEffect(() => {
    const handler = () => openAddRef.current();
    window.addEventListener(OPEN_ADD_EVENT, handler);
    return () => window.removeEventListener(OPEN_ADD_EVENT, handler);
  }, []);
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      openAddRef.current();
      // スポットの「予定にする」から来たときは、お店のURLと名前を入れておく
      const url = params.get("url") ?? "";
      const title = params.get("title") ?? "";
      if (url || title) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEventForm((current) => ({ ...current, url: url || current.url, title: title || current.title }));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (url) setShowMoreFields(true);
      }
    }
  }, [loading]);

  // 通知（コメント・スタンプ）をタップして来たときは、その予定を開く（/?open=e:<id> または r:<繰り返しのid>）
  const openedFromNotice = useRef(false);
  const openDetailEventRef = useRef(openDetailEvent);
  useEffect(() => {
    openDetailEventRef.current = openDetailEvent;
  });
  useEffect(() => {
    if (loading || openedFromNotice.current) return;
    const key = new URLSearchParams(window.location.search).get("open");
    if (!key) return;
    const [kind, id] = key.split(":");
    const matches = events.filter((e) => (kind === "r" ? e.recurringId === id : e.id === id && !e.recurringId));
    if (!matches.length) return; // 読み込みが終わるまで待つ
    openedFromNotice.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    // 繰り返し予定は、これから来る一番近い回（なければ一番最近の回）
    const nowMs = currentTimeMs();
    const sorted = [...matches].sort((a, b) => a.start.getTime() - b.start.getTime());
    const target = sorted.find((e) => e.end.getTime() >= nowMs) ?? sorted[sorted.length - 1];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalendarDate(target.start);
    openDetailEventRef.current(target);
  }, [loading, events]);

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

  // ── よく使う予定の連続登録 ───────────────────────────────
  const bulkPattern = patterns.find((p) => p.id === bulkPatternId) ?? null;
  const bulkInflightRef = useRef<Set<string>>(new Set());
  // まとめて入力中の結果はトーストではなくバーの中に出す（完了ボタンが隠れないように）
  const [bulkStatus, setBulkStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const startBulkMode = () => {
    setBulkMode(true);
    setBulkStatus(null);
    setBulkPatternId((current) => current ?? patterns[0]?.id ?? null);
    setCalendarView("month");
  };

  const stopBulkMode = () => setBulkMode(false);

  const buildPatternFormForDate = (pattern: SchedulePattern, date: Date): EventForm => {
    const endBase = new Date(date);
    if (pattern.next_day_end) endBase.setDate(endBase.getDate() + 1);
    return {
      ...createBlankForm(date),
      title: pattern.title,
      start: buildDateTimeLocal(date, pattern.start_time),
      end: buildDateTimeLocal(endBase, pattern.end_time),
      categoryId: pattern.category_id ?? "",
      selectedUserIds: pattern.share_user_ids ?? [],
      shareType:
        pattern.event_visibility && pattern.event_visibility !== "private"
          ? (pattern.event_visibility as EventVisibility)
          : "together",
    };
  };

  // 連続登録モード中に日付をタップ: 選んでいる予定をその日に登録
  const registerPatternOn = async (date: Date) => {
    if (!bulkPattern) {
      show("先に登録する予定を選んでください", "info");
      return;
    }
    const label = format(date, "M/d(E)", { locale: ja });
    // 登録中に同じ日をもう一度押しても二重登録しない
    const inflightKey = `${bulkPattern.id}:${format(date, "yyyy-MM-dd")}`;
    if (bulkInflightRef.current.has(inflightKey)) return;
    const exists = events.some(
      (e) => e.canDelete && e.title === bulkPattern.title && isSameDay(e.start, date),
    );
    if (exists) {
      setBulkStatus({ text: `${label}にはすでに「${bulkPattern.title}」があります`, ok: false });
      return;
    }
    setDayDetail({ date, events: [] });
    bulkInflightRef.current.add(inflightKey);
    try {
      const ok = await addEventWithForm(buildPatternFormForDate(bulkPattern, date), false, "");
      if (ok) setBulkStatus({ text: `${label}に「${bulkPattern.title}」を登録しました`, ok: true });
    } finally {
      bulkInflightRef.current.delete(inflightKey);
    }
  };

  // 日付タップ: 1回目はその日を選んで予定一覧を表示、選択中の日をもう一度タップすると追加画面
  const lastDateTapRef = useRef<{ key: string; at: number } | null>(null);
  const selectDate = (date: Date) => {
    const key = format(date, "yyyy-MM-dd");
    const now = currentTimeMs();
    const last = lastDateTapRef.current;
    // pointerup と click が連続して届くので二重発火は無視する。
    // 選択でパネルの高さが変わると、後から届く click が別の日付に当たることがあるため、日付が違っても短時間なら無視
    // まとめて入力中は、日付ボタンとマスの両方から届く遅れたタップも同じ1回として扱う
    const sameKeyWindow = bulkMode ? 1500 : 450;
    if (last && now - last.at < (last.key === key ? sameKeyWindow : 350)) return;
    lastDateTapRef.current = { key, at: now };

    if (bulkMode) {
      void registerPatternOn(date);
      return;
    }

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
  // 予定の帯を押したとき
  // - 月表示: 詳細は開かず、その日を選んで下（PCは右）の一覧に予定を出す。
  //   予定の帯がマスの大半を占めて日付を押しにくいため、帯を押しても「日付を選んだ」扱いにする
  // - 週・日表示: これまでどおり詳細を開く
  const handleSelectCalendarEvent = (event: CalendarEvent) => {
    const now = currentTimeMs();
    const last = lastDateTapRef.current;
    if (last && now - last.at < 450) return;

    if (calendarView !== "month") {
      openDetailEvent(event);
      return;
    }

    // 何日にもまたがる予定は、いま選んでいる日がその中ならそのまま、違えば開始日（表示中の月にかかるように）を選ぶ
    const current = dayDetail?.date;
    let date = startOfDay(event.start);
    if (current && current >= startOfDay(event.start) && current <= event.end) {
      date = current;
    } else if (date.getMonth() !== calendarDate.getMonth() && event.end >= new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1)) {
      date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    }
    lastDateTapRef.current = { key: format(date, "yyyy-MM-dd"), at: now };

    if (bulkMode) {
      void registerPatternOn(date);
      return;
    }
    setDayDetail({ date, events: [] });
    setIsDayEventsOpen(true);
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

  // 予定の帯: 色はだれの予定か（わたし／相手／ふたり）。分類がある予定だけ左に分類の色を細く出す
  const calendarEventPropGetter = (event: CalendarEvent) => ({
    className: `${event.displayKind}-event`,
    style: {
      backgroundColor: getDisplayStyle(event.displayKind).background,
      borderLeft: event.categoryColor ? `3px solid ${event.categoryColor}` : "0",
      color: getDisplayStyle(event.displayKind).text,
    },
  });

  const calendarDayPropGetter = (date: Date) => {
    const classes: string[] = [];
    if (dayDetail && isSameDay(date, dayDetail.date)) classes.push("is-selected-day");
    const dow = date.getDay();
    if (isJapaneseHoliday(date) || dow === 0) classes.push("is-holiday");
    else if (dow === 6) classes.push("is-saturday");
    // 期間限定デザインの間だけ、CSS で飾りが付く（クリスマスは星、元日は日の出、三が日はうすい色）
    if (date.getMonth() === 11 && (date.getDate() === 24 || date.getDate() === 25)) classes.push("is-xmas-day");
    if (date.getMonth() === 0 && date.getDate() <= 3) classes.push(date.getDate() === 1 ? "is-newyear-day" : "is-sanganichi");
    const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (birthdayPeople.some((p) => p.birthday.slice(5) === md)) classes.push("is-birthday");
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
    { kind: "own", label: "わたし" },
    { kind: "incoming", label: "相手の予定" },
    { kind: "together", label: "ふたりの予定" },
  ];

  const filterKindColor = (value: CalendarFilter) =>
    value === "all" ? "var(--fg)"
    : value === "own" ? "var(--accent)"
    : value.startsWith("person:") ? "#c2410c"
    : "#6d3fd8";

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
        if (bulkMode) { setBulkMode(false); return; }
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
  }, [calendarDate, calendarView, isEventModalOpen, isSearchOpen, detailEvent, dayDetail, showTutorial, bulkMode]);

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
    const timeLabel = event.allDay ? "終日" : format(event.start, "H:mm");
    const until = event.allDay
      ? multiDay ? `〜${format(event.end, "M/d")}` : ""
      : multiDay ? `〜${format(event.end, "M/d H:mm")}` : `〜${format(event.end, "H:mm")}`;
    const who = event.isShared
      ? event.displayKind === "together" ? "ふたり" : `${event.ownerName}さん`
      : event.displayKind === "together" ? "ふたり"
      : event.sharedWith.length > 0 ? `${event.sharedWith.map((u) => u.username).join("、")}に共有`
      : "わたし";
    return (
      <button
        key={`${event.id}-${event.start.toISOString()}`}
        className="day-event-row"
        onClick={() => openDetailEvent(event)}
        type="button"
      >
        <span className="day-event-time">{timeLabel}</span>
        <span className="day-event-bar" style={{ backgroundColor: style.border === "var(--uncategorized-event)" ? "var(--accent)" : style.border }} />
        <span className="min-w-0 flex-1">
          <span className="day-event-title">
            {event.hasUnread && <span className="unread-dot unread-dot-inline" aria-label="新しいひとことがあります" />}
            {event.title}
          </span>
          <span className="day-event-meta">
            {[until, who, event.categoryName && event.categoryName !== "未分類" ? event.categoryName : "", event.recurringRule && event.recurringRule !== "none" ? "繰り返し" : ""]
              .filter(Boolean)
              .join(" ・ ")}
          </span>
        </span>
      </button>
    );
  };


  const renderBulkBar = () => (
    <div className="bulk-bar" role="region" aria-label="まとめて入力">
      <div className="bulk-bar-head">
        <div className="min-w-0 flex-1">
          <p className="bulk-bar-title">まとめて入力</p>
          <p className={`bulk-bar-hint ${bulkStatus ? (bulkStatus.ok ? "is-ok" : "is-warn") : ""}`} aria-live="polite">
            {bulkStatus
              ? `${bulkStatus.ok ? "✓ " : ""}${bulkStatus.text}`
              : patterns.length === 0
              ? "よく使う予定がまだありません"
              : bulkPattern
                ? `日付をタップすると「${bulkPattern.label}」を登録します`
                : "登録する予定を選んでください"}
          </p>
        </div>
        <button className="bulk-done" onClick={stopBulkMode} type="button">完了</button>
      </div>
      {patterns.length === 0 ? (
        <button className="text-link mt-2" onClick={() => router.push("/patterns")} type="button">
          よく使う予定を登録する →
        </button>
      ) : (
        <div className="bulk-chips">
          {patterns.map((p) => (
            <button
              key={p.id}
              type="button"
              className="bulk-chip"
              data-active={bulkPatternId === p.id ? "true" : undefined}
              aria-pressed={bulkPatternId === p.id}
              onClick={() => {
                setBulkPatternId(p.id);
                setBulkStatus(null);
              }}
            >
              <span className="bulk-chip-label">{p.label}</span>
              <span className="bulk-chip-time">
                {p.start_time.slice(0, 5)}〜{p.next_day_end ? "翌" : ""}{p.end_time.slice(0, 5)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

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

        {!bulkMode && !loading && <BirthdayBanner people={birthdayPeople} me={currentUserId} />}

        {!bulkMode && !loading && connections.length === 0 && !connectHintDismissed && (
          <div className="connect-hint">
            <a href="/settings?p=partner" className="connect-hint-link">
              <span className="min-w-0">相手とつながると、予定を共有できます</span>
              <b>設定する ›</b>
            </a>
            <button
              type="button"
              className="connect-hint-close"
              aria-label="案内を閉じる"
              onClick={() => {
                window.localStorage.setItem("sharecal_connect_hint_dismissed", "1");
                setConnectHintDismissed(true);
              }}
            >
              ×
            </button>
          </div>
        )}

        {bulkMode && renderBulkBar()}

        {/* 検索 + 絞り込み（モバイル） */}
        <div className={`flex items-center gap-2 ${bulkMode ? "hidden" : ""}`}>
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
        <div className={`calendar-section-mobile calendar-card ${bulkMode ? "is-bulk" : ""}`} ref={mobileCalendarRef}>
          <div
            className="calendar-shell h-full"
            onTouchStart={handleCalendarTouchStart}
            onTouchEnd={handleCalendarTouchEnd}
          >
            {/* スマホの月表示は、日付の数字だけでなくマス全体のどこを押してもその日を選ぶ */}
            <BulkTapContext.Provider value={selectDate}>
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
              selectable={bulkMode ? false : "ignoreEvents"}
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
                dateCellWrapper: BulkCellWrapper,
                week: { event: TimeEventBlock },
                day: { event: TimeEventBlock },
              }}
              onDrillDown={(date) => selectDate(date)}
              onShowMore={(_shownEvents, date) => showDayFromMore(date)}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectCalendarEvent}
            />
            </BulkTapContext.Provider>
          </div>
        </div>

        {/* 選択した日の予定（モバイル） */}
        <section className={`day-panel ${bulkMode ? "hidden" : ""}`} aria-label="選択した日の予定">
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
            <button className="ghost-btn" onClick={startBulkMode} type="button">
              まとめて
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
        <header className="page-header home-header glass-card flex items-center justify-between gap-3 p-3">
          <div className="xl:hidden"><ShareCalLogo compact /></div>
          <div className="hidden xl:block"><ShareCalLogo /></div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2 lg:hidden">
              <button className="ghost-btn" onClick={bulkMode ? stopBulkMode : startBulkMode} type="button">
                {bulkMode ? "終了" : "まとめて入力"}
              </button>
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

        {!bulkMode && !loading && <BirthdayBanner people={birthdayPeople} me={currentUserId} />}

        {!bulkMode && !loading && connections.length === 0 && !connectHintDismissed && (
          <div className="connect-hint">
            <a href="/settings?p=partner" className="connect-hint-link">
              <span className="min-w-0">相手とつながると、予定を共有できます</span>
              <b>設定する ›</b>
            </a>
            <button
              type="button"
              className="connect-hint-close"
              aria-label="案内を閉じる"
              onClick={() => {
                window.localStorage.setItem("sharecal_connect_hint_dismissed", "1");
                setConnectHintDismissed(true);
              }}
            >
              ×
            </button>
          </div>
        )}

        {bulkMode && renderBulkBar()}

        <div className={`home-grid ${bulkMode ? "is-bulk" : ""}`}>
          {/* カレンダー本体 */}
          <section className="calendar-card home-grid-main p-2 sm:p-3">
            <div className="calendar-shell desktop-calendar">
              <BulkTapContext.Provider value={bulkMode ? selectDate : null}>
              <DnDCalendar
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
                selectable={bulkMode ? false : "ignoreEvents"}
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
                dateCellWrapper: BulkCellWrapper,
                  week: { event: TimeEventBlock },
                  day: { event: TimeEventBlock },
                }}
                onDrillDown={(date) => selectDate(date)}
                onShowMore={(_shownEvents, date) => showDayFromMore(date)}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectCalendarEvent}
                onEventDrop={handleEventDrop}
                onEventResize={handleEventResize}
                draggableAccessor={canDragEvent}
                resizableAccessor={(event: CalendarEvent) =>
                  // 月表示で時間指定の予定を横に伸ばすと日をまたいでしまうので、終日予定だけ伸ばせるようにする
                  canDragEvent(event) && (calendarView !== "month" || event.allDay)
                }
                resizable
              />
              </BulkTapContext.Provider>
            </div>
          </section>

          {/* サイドバー */}
          <aside className="home-sidebar">
            <div className="hidden flex-col gap-2 lg:flex">
              <button className="ghost-btn h-10" onClick={bulkMode ? stopBulkMode : startBulkMode} type="button">
                {bulkMode ? "まとめて入力を終了" : "よく使う予定をまとめて入力"}
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
          className="fixed inset-0 z-[60] flex items-start justify-center bg-[#1b2421]/40 p-3 pt-[8vh]"
          onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#dfe4e2] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[#e5e9e7] p-3">
              <span className="text-lg">🔍</span>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="予定を検索（タイトル・メモ・分類）"
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[#1b2421] placeholder:text-[#8e958f] focus:outline-none"
              />
              <button
                className="shrink-0 rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-bold text-[#4d5753]"
                onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }}
                type="button"
              >
                閉じる
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {searchQuery.trim() === "" ? (
                <p className="px-3 py-6 text-center text-sm text-[#8e958f]">キーワードを入力してください</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-[#8e958f]">「{searchQuery}」に一致する予定はありません</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {searchResults.map((event) => (
                    <li key={`${event.id}-${event.start.toISOString()}`}>
                      <button
                        className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                        onClick={() => openSearchResult(event)}
                        type="button"
                      >
                        <span
                          className="h-9 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: event.categoryColor ?? getDisplayStyle(event.displayKind).border }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#1b2421]">{event.title}</span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-[#66706c]">
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
          className="add-sheet-overlay fixed inset-0 z-50 flex items-center justify-center bg-[#1b2421]/45 p-4"
          onClick={() => setIsEventModalOpen(false)}
        >
          <div
            className="add-sheet max-h-[88vh] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-5 pt-3 shadow-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="add-sheet-handle" aria-hidden="true" />
            {/* ── ヘッダー ── */}
            <div className="mb-5 flex items-center gap-2">
              <h2 className="add-sheet-title">新しい予定</h2>
              <div
                key={dateMovedKey}
                className={`relative ml-auto flex items-center gap-0.5 rounded-full bg-[#eef1f0] p-0.5 ${dateMovedKey > 0 ? "date-moved-flash" : ""}`}
              >
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[#1b2421] transition hover:bg-white active:scale-90"
                  aria-label="前の日"
                  onClick={() => shiftFormDays(-1)}
                  type="button"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="px-1 text-sm font-bold text-[#1b2421]">
                  {format(new Date(eventForm.start), "M/d（E）", { locale: ja })}
                </span>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[#1b2421] transition hover:bg-white active:scale-90"
                  aria-label="次の日"
                  onClick={() => shiftFormDays(+1)}
                  type="button"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                {showDateMoved && (
                  <span className="date-moved-badge absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[11px] font-bold text-white shadow">
                    次の日に移動しました
                  </span>
                )}
              </div>
              <button
                className="hidden h-9 w-9 items-center justify-center rounded-full text-[#66706c] transition hover:bg-[#eef1f0] sm:flex"
                onClick={() => setIsEventModalOpen(false)}
                aria-label="閉じる"
                type="button"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mb-5">
              <p className="field-label mb-2">よく使う予定（タップで入力）</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
              {patterns.map((pattern) => (
                <button
                  key={pattern.id}
                  className="pattern-card"
                  onClick={() => setConfirmPattern(pattern)}
                  type="button"
                >
                  <span className="pattern-card-label">{pattern.label}</span>
                  <span className="pattern-card-time">
                    {pattern.start_time.slice(0, 5)}〜{pattern.next_day_end ? "翌" : ""}{pattern.end_time.slice(0, 5)}
                  </span>
                </button>
              ))}
              {patterns.length === 0 && (
                <p className="text-sm text-[#66706c]">
                  「夜勤」「休み」などを
                  <button type="button" className="mx-1 font-bold text-[var(--accent)] underline" onClick={() => router.push("/patterns")}>よく使う予定</button>
                  に登録すると、ここからすぐ入力できます。
                </p>
              )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="field-label">タイトル</span>
                <input
                  className="add-title-input w-full outline-none transition"
                  placeholder="例：ごはん、歯医者、打ち合わせ"
                  enterKeyHint="done"
                  value={eventForm.title}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </label>
              {wishChips.length > 0 && (
                <div className="wish-pick sm:col-span-2">
                  <p className="wish-pick-label">行きたいお店から選ぶ</p>
                  <div className="wish-pick-row">
                    {wishChips.map((opt) => {
                      const on = normalizeLinkUrl(eventForm.url).toLowerCase() === normalizeLinkUrl(opt.url).toLowerCase();
                      return (
                        <button
                          key={opt.url}
                          type="button"
                          className={`wish-pick-chip ${on ? "is-on" : ""}`}
                          aria-pressed={on}
                          onClick={() =>
                            on ? setEventForm((current) => ({ ...current, url: "" })) : chooseWish(opt)
                          }
                        >
                          {opt.label.startsWith("http") ? opt.host || opt.label : opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 py-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-bold text-[#1b2421]">終日の予定</p>
                  <p className="mt-1 text-xs text-[#66706c]">時間を指定しない予定として登録します。</p>
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
                  <span className="h-7 w-12 rounded-full bg-[#d5dad8] transition peer-checked:bg-[var(--accent)]" />
                  <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                </label>
              </div>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#66706c]">分類</span>
                <select
                  className="h-11 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
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
              <RemindSelect
                allDay={eventForm.allDay}
                value={eventForm.remindMinutes ?? ""}
                onChange={(v) => setEventForm((current) => ({ ...current, remindMinutes: v }))}
              />
              <label className="space-y-1">
                <span className="text-xs font-semibold text-[#66706c]">開始</span>
                <input
                  className="h-11 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
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
                <span className="text-xs font-semibold text-[#66706c]">終了</span>
                <input
                  className="h-11 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  type="datetime-local"
                  value={eventForm.end}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, end: event.target.value }))
                  }
                />
                <button
                  className="mt-2 rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 py-2 text-xs font-bold text-[#3a4440]"
                  type="button"
                  onClick={() => toggleEndNextDay("new")}
                >
                  {isEndOnNextDay(eventForm) ? "終了日を当日に戻す" : "終了日を翌日にする"}
                </button>
              </label>
              {!(showMoreFields || eventForm.note || eventForm.imageUrl || eventForm.url) ? (
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#d5dad8] py-3 text-sm font-bold text-[#4d5753] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] sm:col-span-2"
                  onClick={() => setShowMoreFields(true)}
                >
                  <PlusIcon />
                  メモ・画像・URLを追加
                </button>
              ) : (
              <>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#66706c]">メモ</span>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] p-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
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
                  <span className="text-xs font-semibold text-[#66706c]">URL（お店・予約ページなど）</span>
                  <button
                    type="button"
                    className="rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]"
                    onClick={() => openLinkPicker("new")}
                  >
                    📍 スポットから選択
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="url"
                  className="w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] p-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  value={eventForm.url}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, url: event.target.value }))
                  }
                  onPaste={(event) => {
                    const extracted = extractUrlFromClipboard(event.clipboardData);
                    if (!extracted) return; // URLが無ければそのまま貼り付け
                    event.preventDefault();
                    setEventForm((current) => ({ ...current, url: extracted }));
                  }}
                  placeholder="https://..."
                />
              </label>
              </>
              )}
            </div>

            {connections.length === 1 ? (() => {
              // 相手が1人のとき: 「わたしだけ／相手に共有／ふたりの予定」から選ぶだけ
              const partner = connections[0];
              const who = eventForm.selectedUserIds.length === 0 ? "me" : eventForm.shareType === "partner" ? "partner" : "together";
              const pick = (value: "me" | "partner" | "together") =>
                setEventForm((current) => ({
                  ...current,
                  selectedUserIds: value === "me" ? [] : [partner.id],
                  shareType: value === "partner" ? "partner" : "together",
                }));
              return (
                <div className="mt-5 space-y-2">
                  <p className="field-label">だれの予定？</p>
                  <div className="who-segment" role="radiogroup" aria-label="だれの予定">
                    {([
                      { value: "me", label: "わたしだけ" },
                      { value: "partner", label: `${partner.username}に共有` },
                      { value: "together", label: "ふたりの予定" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={who === option.value}
                        className="who-segment-btn"
                        data-kind={option.value}
                        data-active={who === option.value ? "true" : undefined}
                        onClick={() => pick(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })() : (
            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-[#66706c]">共有する相手 <span className="font-normal">（選ばなければ自分だけの予定）</span></p>
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
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[#dfe4e2] bg-[var(--surface-alt)]"
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
                      <span className="block text-sm font-black text-[#1b2421]">{option.title}</span>
                      <span className="mt-1 block text-xs font-semibold text-[#66706c]">{option.desc}</span>
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
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[#d5dad8] bg-white text-[#3a4440] hover:border-[#8e958f]"
                    }`}
                  >
                    <input
                      className="h-4 w-4 accent-[var(--accent)]"
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
                  <p className="text-sm text-[#66706c]">
                    共有相手はいません。先に「ふたり」から申請してください。
                  </p>
                )}
              </div>
            </div>
            )}

            <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 mt-6 border-t border-[#e5e9e7] bg-white/95 px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur sm:-bottom-7 sm:-mx-7 sm:-mb-7 sm:px-7">
              <div className="flex gap-2">
                <button
                  className="h-11 shrink-0 rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-4 text-sm font-bold text-[#4d5753] transition hover:bg-[var(--surface-alt)]"
                  onClick={() => setIsEventModalOpen(false)}
                  type="button"
                >
                  キャンセル
                </button>
                <button
                  className="h-12 flex-1 rounded-2xl bg-[var(--accent)] px-5 text-base font-bold text-white shadow-sm transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className={`fixed inset-0 z-50 flex items-start overflow-hidden bg-[#1b2421]/45 p-3 pt-4 sm:items-center sm:justify-center ${isDetailEditing ? "add-sheet-overlay" : ""}`} onClick={() => { setDetailEvent(null); setIsDetailEditing(false); setDetailImageOpen(false); }}>
          {detailImageOpen && detailEvent.imageUrl && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
              onClick={(event) => { event.stopPropagation(); setDetailImageOpen(false); }}
            >
              <StoredImage
                src={detailEvent.imageUrl}
                alt="元画像"
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          )}
          <div
            className={isDetailEditing
              ? "add-sheet max-h-[88vh] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-[28px] bg-white p-5 pt-3 shadow-2xl sm:p-7"
              : "detail-sheet max-h-[88vh] w-full max-w-full overflow-y-auto overflow-x-hidden rounded-[28px] p-4 shadow-2xl sm:max-w-lg sm:p-6"}
            onClick={(e) => e.stopPropagation()}
          >
            {isDetailEditing && <span className="add-sheet-handle" aria-hidden="true" />}
            <div className={`flex items-center gap-2 ${isDetailEditing ? "mb-5" : "mb-3"}`}>
              {isDetailEditing ? (
                <h2 className="add-sheet-title flex-1">予定を編集</h2>
              ) : (
                <span className="flex-1 text-sm font-bold text-[#66706c]">
                  {format(detailEvent.start, "M月d日（E）", { locale: ja })}
                </span>
              )}
              {detailEvent.canDelete && !isDetailEditing && (
                <button
                  type="button"
                  className="h-9 rounded-full border border-[#d5dad8] bg-white px-4 text-sm font-bold text-[#1b2421]"
                  onClick={() => { setShowEditMoreFields(false); setIsDetailEditing(true); }}
                >
                  編集
                </button>
              )}
              <button
                type="button"
                aria-label="閉じる"
                className="flex h-10 w-10 items-center justify-center rounded-full text-[#4d5753] hover:bg-white"
                onClick={() => { setDetailEvent(null); setIsDetailEditing(false); setDetailImageOpen(false); }}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {detailEvent.canDelete && isDetailEditing ? (
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="field-label">タイトル</span>
                  <input
                    className="add-title-input w-full outline-none transition"
                    placeholder="例：ごはん、歯医者、打ち合わせ"
                    value={editForm.title}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </label>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 py-3 sm:col-span-2">
                  <div>
                    <p className="text-sm font-bold text-[#1b2421]">終日の予定</p>
                    <p className="mt-1 text-xs text-[#66706c]">時間を指定しない予定として保存します。</p>
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
                    <span className="h-7 w-12 rounded-full bg-[#d5dad8] transition peer-checked:bg-[var(--accent)]" />
                    <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                  </label>
                </div>
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="field-label">分類</span>
                  <select
                    className="h-11 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
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
                <RemindSelect
                  allDay={editForm.allDay}
                  value={editForm.remindMinutes ?? ""}
                  onChange={(v) => setEditForm((current) => ({ ...current, remindMinutes: v }))}
                  disabledReason={detailEvent?.recurringId ? "くり返しの予定には、今は通知を付けられません" : undefined}
                />
                <label className="space-y-1.5">
                  <span className="field-label">開始</span>
                  <input
                    className="h-11 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
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
                <label className="space-y-1.5">
                  <span className="field-label">終了</span>
                  <input
                    className="h-11 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                    type="datetime-local"
                    value={editForm.end}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, end: event.target.value }))
                    }
                  />
                  <button
                    className="mt-2 rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 py-2 text-xs font-bold text-[#3a4440]"
                    type="button"
                    onClick={() => toggleEndNextDay("edit")}
                  >
                    {isEndOnNextDay(editForm) ? "終了日を当日に戻す" : "終了日を翌日にする"}
                  </button>
                </label>
                {!(showEditMoreFields || editForm.note || editForm.imageUrl || editForm.url) ? (
                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#d5dad8] py-3 text-sm font-bold text-[#4d5753] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] sm:col-span-2"
                    onClick={() => setShowEditMoreFields(true)}
                  >
                    <PlusIcon />
                    メモ・画像・URLを追加
                  </button>
                ) : (
                <>
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="field-label">メモ</span>
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] p-3 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
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
                <label className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="field-label">URL（お店・予約ページなど）</span>
                    <button
                      type="button"
                      className="rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]"
                      onClick={() => openLinkPicker("edit")}
                    >
                      📍 スポットから選択
                    </button>
                  </div>
                  <input
                    type="text"
                    inputMode="url"
                    className="w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] p-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                    value={editForm.url}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, url: event.target.value }))
                    }
                    onPaste={(event) => {
                      const extracted = extractUrlFromClipboard(event.clipboardData);
                      if (!extracted) return; // URLが無ければそのまま貼り付け
                      event.preventDefault();
                      setEditForm((current) => ({ ...current, url: extracted }));
                    }}
                    placeholder="https://..."
                  />
                </label>
                </>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                {(() => {
                  const ds = getDisplayStyle(detailEvent.displayKind);
                  const kindLabel =
                    detailEvent.displayKind === "together" ? "ふたりの予定"
                    : detailEvent.displayKind === "incoming" ? `${detailEvent.ownerName}さんの予定`
                    : detailEvent.displayKind === "partner" ? `${detailEvent.sharedWith.map((u) => u.username).join("、")}に共有`
                    : "わたしの予定";
                  const people = detailEvent.isShared
                    ? [{ id: detailEvent.ownerId, name: detailEvent.ownerName }]
                    : detailEvent.sharedWith.map((u) => ({ id: u.id, name: u.username }));
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="detail-kind-pill" style={{ backgroundColor: ds.background, color: ds.text }}>{kindLabel}</span>
                        {detailEvent.categoryName && detailEvent.categoryName !== "未分類" && (
                          <span className="detail-kind-pill flex items-center gap-1.5 bg-white text-[#4d5753]">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: detailEvent.categoryColor ?? "#8e958f" }} />
                            {detailEvent.categoryName}
                          </span>
                        )}
                        {people.length > 0 && (
                          <span className="ml-auto flex">
                            <span className="avatar" style={{ backgroundColor: "var(--accent)" }} title="わたし">わ</span>
                            {people.map((p) => (
                              <span key={p.id} className="avatar" style={{ backgroundColor: partnerColor(p.id) }} title={p.name}>
                                {p.name.slice(0, 1)}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                      <h2 className="detail-title">{detailEvent.title}</h2>
                      <p className="detail-row">
                        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                        {detailEvent.allDay
                          ? isSameDay(detailEvent.start, detailEvent.end) ? "終日" : `終日（〜${format(detailEvent.end, "M月d日", { locale: ja })}）`
                          : isSameDay(detailEvent.start, detailEvent.end)
                            ? `${format(detailEvent.start, "H:mm")} 〜 ${format(detailEvent.end, "H:mm")}`
                            : `${format(detailEvent.start, "M/d H:mm")} 〜 ${format(detailEvent.end, "M/d H:mm")}`}
                        {detailEvent.recurringRule && detailEvent.recurringRule !== "none" && (
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#66706c]">繰り返し</span>
                        )}
                      </p>
                      {(detailEvent.prefecture || detailEvent.city) && (
                        <p className="detail-row">
                          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                          {[detailEvent.prefecture, detailEvent.city].filter(Boolean).join(" ")}
                        </p>
                      )}
                      {detailEvent.note && <div className="detail-note">{detailEvent.note}</div>}
                    </>
                  );
                })()}
                {detailEvent.imageUrl && (
                  <div className="rounded-xl bg-[var(--surface-alt)] p-3">
                    <p className="text-xs font-semibold text-[#66706c]">画像</p>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        className="shrink-0"
                        onClick={() => setDetailImageOpen(true)}
                        aria-label="元画像を表示"
                      >
                        <StoredImage
                          src={detailEvent.imageUrl}
                          alt="添付画像"
                          className="h-20 w-20 rounded-md object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-bold text-[#3a4440]"
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
                    className="block rounded-xl border border-[#e5e9e7] bg-[var(--surface-alt)] p-3 transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                  >
                    {ogLoading && (
                      <div className="flex items-center gap-2 text-xs text-[#8e958f]">
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
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white">
                                  {ogData.main.emoji} {ogData.main.label}
                                </span>
                              )}
                              {(ogData.subs ?? []).map((s) => (
                                <span key={s.label} className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                                  {s.emoji} {s.label}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="truncate text-sm font-bold text-[#1b2421]">{ogData.title}</p>
                          {ogData.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-[#66706c]">{ogData.description}</p>
                          )}
                          <p className="mt-1 truncate text-[10px] text-[#8e958f]">{detailEvent.url}</p>
                        </div>
                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        </svg>
                      </div>
                    ) : !ogLoading && (
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-[var(--accent)]">{detailEvent.url}</p>
                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        </svg>
                      </div>
                    )}
                  </a>
                  );
                })()}
                {detailEvent.ownerDeleted && (
                  <div className="rounded-2xl bg-[#fffbeb] p-3 text-[#92400e]">削除されたアカウントから共有された予定です</div>
                )}
                {!detailEvent.ownerDeleted && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="copy-btn"
                      disabled={copyingEvent}
                      onClick={() => void copyEventToNextWeek(detailEvent)}
                    >
                      <span className="copy-btn-title">{copyingEvent ? "コピー中…" : "来週も同じ"}</span>
                      <span className="copy-btn-sub">{format(addDays(detailEvent.start, 7), "M/d(E)", { locale: ja })}に登録</span>
                    </button>
                    <button type="button" className="copy-btn" onClick={() => openCopyEditor(detailEvent)}>
                      <span className="copy-btn-title">複製して編集</span>
                      <span className="copy-btn-sub">日付・時間を変えて登録</span>
                    </button>
                  </div>
                )}
                {isCommentable(detailEvent) && (() => {
                  const messages = comments.filter((c) => c.body);
                  const reactionSummary = QUICK_REACTIONS.map((r) => {
                    const rows = comments.filter((c) => c.reaction === r.emoji);
                    return {
                      ...r,
                      users: rows.map((c) => c.user_id),
                      mine: rows.some((c) => c.user_id === currentUserId),
                    };
                  }).filter((r) => r.users.length > 0);
                  const reactors = Array.from(new Set(comments.filter((c) => c.reaction).map((c) => c.user_id)));
                  return (
                    <section className="chat-box" aria-label="ひとこと・リアクション">
                      <div className="chat-head">
                        <p className="chat-title">ひとこと</p>
                        {messages.length > 0 && <span className="chat-count">{messages.length}</span>}
                      </div>
                      {commentsState === "unavailable" ? (
                        <p className="chat-empty">
                          この機能を使うには、Supabase で <code>supabase-event-comments.sql</code> を実行してください。
                        </p>
                      ) : (
                        <>
                          {/* リアクション: 押されているものだけ表示し、＋から追加 */}
                          <div className="reaction-bar">
                            {reactionSummary.map((r) => (
                              <button
                                key={r.emoji}
                                type="button"
                                className="reaction-pill"
                                data-active={r.mine ? "true" : undefined}
                                disabled={commentSending}
                                title={`${r.label}：${r.users.map((uid) => commenterName(uid, detailEvent)).join("、")}`}
                                onClick={() => void toggleReaction(detailEvent, r.emoji)}
                              >
                                <span className="reaction-pill-emoji">{r.emoji}</span>
                                <span className="reaction-pill-count">{r.users.length}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="reaction-add"
                              aria-label="リアクションを追加"
                              aria-expanded={reactionPickerOpen}
                              onClick={() => setReactionPickerOpen((v) => !v)}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
                              </svg>
                              <span>＋</span>
                            </button>
                            {reactionPickerOpen && (
                              <div className="reaction-picker" role="menu">
                                {QUICK_REACTIONS.map((r) => {
                                  const mine = comments.some((c) => c.reaction === r.emoji && c.user_id === currentUserId);
                                  return (
                                    <button
                                      key={r.emoji}
                                      type="button"
                                      role="menuitem"
                                      className="reaction-picker-btn"
                                      data-active={mine ? "true" : undefined}
                                      title={r.label}
                                      onClick={() => {
                                        setReactionPickerOpen(false);
                                        void toggleReaction(detailEvent, r.emoji);
                                      }}
                                    >
                                      <span className="text-2xl leading-none">{r.emoji}</span>
                                      <span className="reaction-picker-label">{r.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {reactors.length > 0 && (
                            <p className="reaction-who">
                              {reactors.map((uid) => commenterName(uid, detailEvent)).join("、")}がリアクションしました
                            </p>
                          )}

                          {/* メッセージ: 相手は左、自分は右の吹き出し */}
                          <div className="chat-list">
                            {commentsState === "loading" && <p className="chat-empty">読み込み中…</p>}
                            {commentsState === "ready" && messages.length === 0 && (
                              <p className="chat-empty">まだメッセージはありません。ひとこと送ってみましょう</p>
                            )}
                            {messages.map((c, i) => {
                              const mine = c.user_id === currentUserId;
                              const prev = messages[i - 1];
                              const grouped =
                                !!prev &&
                                prev.user_id === c.user_id &&
                                new Date(c.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
                              const name = commenterName(c.user_id, detailEvent);
                              return (
                                <div
                                  key={c.id}
                                  className={`chat-row ${mine ? "is-mine" : ""} ${grouped ? "is-grouped" : ""}`}
                                >
                                  {!mine && (
                                    <span
                                      className="chat-avatar"
                                      style={{ backgroundColor: partnerColor(c.user_id), visibility: grouped ? "hidden" : "visible" }}
                                      aria-hidden="true"
                                    >
                                      {name.slice(0, 1)}
                                    </span>
                                  )}
                                  <div className="chat-col">
                                    {!mine && !grouped && <span className="chat-name">{name}</span>}
                                    <div className="chat-line">
                                      <button
                                        type="button"
                                        className="chat-bubble"
                                        onClick={() => mine && setSelectedCommentId((cur) => (cur === c.id ? null : c.id))}
                                        aria-label={mine ? "メッセージ（タップで削除メニュー）" : undefined}
                                        tabIndex={mine ? 0 : -1}
                                      >
                                        {c.body}
                                      </button>
                                      <span className="chat-time">{formatChatTime(c.created_at)}</span>
                                    </div>
                                    {mine && selectedCommentId === c.id && (
                                      <button
                                        type="button"
                                        className="chat-delete"
                                        onClick={() => {
                                          setSelectedCommentId(null);
                                          void deleteComment(c.id);
                                        }}
                                      >
                                        送信を取り消す
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <form
                            className="chat-input"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const body = commentDraft.trim();
                              if (body) void sendComment(detailEvent, { body });
                            }}
                          >
                            <input
                              className="chat-input-field"
                              value={commentDraft}
                              maxLength={500}
                              placeholder="メッセージを送る"
                              onChange={(e) => setCommentDraft(e.target.value)}
                              enterKeyHint="send"
                            />
                            <button
                              type="submit"
                              className="chat-send"
                              aria-label="送信"
                              disabled={!commentDraft.trim() || commentSending}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
                              </svg>
                            </button>
                          </form>
                        </>
                      )}
                    </section>
                  );
                })()}
                {(detailEvent.canDelete || detailEvent.ownerDeleted) && (
                  <button
                    type="button"
                    className="mx-auto block h-10 rounded-full px-4 text-sm font-bold text-[#be123c] hover:bg-[#fff1f2]"
                    onClick={() => deleteEvent(detailEvent)}
                  >
                    {detailEvent.ownerDeleted ? "表示から削除" : "この予定を削除"}
                  </button>
                )}
              </div>
            )}

            {detailEvent.canDelete && isDetailEditing && (
              <div className="mt-5 space-y-5">
                {detailEvent.recurringId && (
                  <div className="space-y-2">
                    <p className="field-label">変更する範囲</p>
                    <div className="who-segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }} role="radiogroup" aria-label="変更する範囲">
                      {[
                        { value: "single" as const, label: "この日だけ" },
                        { value: "all" as const, label: "すべての繰り返し" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={recurringEditScope === option.value}
                          className="who-segment-btn"
                          data-active={recurringEditScope === option.value ? "true" : undefined}
                          onClick={() => setRecurringEditScope(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[#66706c]">
                      {recurringEditScope === "single"
                        ? "この日の予定だけを変更します。ほかの回はそのままです。"
                        : "変更内容が繰り返し予定のすべての回に反映されます。"}
                    </p>
                  </div>
                )}

                {connections.length === 1 ? (() => {
                  // 相手が1人のとき: 追加画面と同じ「だれの予定？」
                  const partner = connections[0];
                  const who = shareDraftIds.length === 0 ? "me" : editForm.shareType === "partner" ? "partner" : "together";
                  const pick = (value: "me" | "partner" | "together") => {
                    setShareDraftIds(value === "me" ? [] : [partner.id]);
                    setEditForm((current) => ({ ...current, shareType: value === "partner" ? "partner" : "together" }));
                  };
                  return (
                    <div className="space-y-2">
                      <p className="field-label">だれの予定？</p>
                      <div className="who-segment" role="radiogroup" aria-label="だれの予定">
                        {([
                          { value: "me", label: "わたしだけ" },
                          { value: "partner", label: `${partner.username}に共有` },
                          { value: "together", label: "ふたりの予定" },
                        ] as const).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={who === option.value}
                            className="who-segment-btn"
                            data-kind={option.value}
                            data-active={who === option.value ? "true" : undefined}
                            onClick={() => pick(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })() : (
                <div>
                  <p className="field-label mb-2">共有する相手</p>
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
                              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                              : "border-[#dfe4e2] bg-[var(--surface-alt)]"
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
                          <span className="block text-sm font-black text-[#1b2421]">{option.title}</span>
                          <span className="mt-1 block text-xs font-semibold text-[#66706c]">{option.desc}</span>
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
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[#d5dad8] text-[#3a4440]"
                        }`}
                      >
                        <input
                          className="h-4 w-4 accent-[var(--accent)]"
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
                      <p className="text-sm text-[#66706c]">共有できる相手がいません。</p>
                    )}
                  </div>
                </div>
                )}

                <button
                  type="button"
                  className="mx-auto block h-10 rounded-full px-4 text-sm font-bold text-[#be123c] hover:bg-[#fff1f2] disabled:opacity-50"
                  onClick={() => deleteEvent(detailEvent)}
                  disabled={ocrBusy}
                >
                  この予定を削除
                </button>

                <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 border-t border-[#e5e9e7] bg-white/95 px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur sm:-bottom-7 sm:-mx-7 sm:-mb-7 sm:px-7">
                  <div className="flex gap-2">
                    <button
                      className="h-12 shrink-0 rounded-2xl border border-[#d5dad8] bg-[var(--surface-alt)] px-4 text-sm font-bold text-[#4d5753] transition hover:bg-white"
                      onClick={() => setIsDetailEditing(false)}
                      type="button"
                    >
                      キャンセル
                    </button>
                    <button
                      className="h-12 flex-1 rounded-2xl bg-[var(--accent)] px-5 text-base font-bold text-white shadow-sm transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={updateEvent}
                      disabled={ocrBusy || !editForm.title.trim()}
                      type="button"
                    >
                      {ocrBusy ? "画像を処理中…" : !editForm.title.trim() ? "タイトルを入力してください" : "保存する"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {sharedNotification && (
        <div className="fixed right-4 top-4 z-[60] max-w-sm rounded-2xl border border-[#bae6fd] bg-white p-4 text-[#1b2421] shadow-2xl">
          <p className="text-sm font-black text-[#075985]">予定が共有されました</p>
          <p className="mt-1 text-sm text-[#4d5753]">
            {sharedNotification.ownerName}さんから「{sharedNotification.title}」
          </p>
        </div>
      )}
      {showTutorial && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1b2421]/45 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#66706c]">
              Quick Tutorial
            </p>
            <h2 className="mt-2 text-2xl font-black text-[#1b2421]">
              最初にここだけ覚えれば大丈夫
            </h2>
            <div className="mt-5 grid gap-3 text-sm text-[#4d5753]">
              <div className="rounded-2xl bg-[var(--surface-alt)] p-3">
                <p className="font-bold text-[#1b2421]">1. 日付を押して予定を確認・登録</p>
                <p className="mt-1">日付や予定を押すと、その日の予定が下に出ます。予定の中身は下の一覧から開けます。登録は「＋」か、同じ日付をもう一度押すと開きます。</p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-alt)] p-3">
                <p className="font-bold text-[#1b2421]">2. よく使う予定で時短</p>
                <p className="mt-1">夜勤や休みはよく使う予定にしておくと、ワンタップで入力できます。</p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-alt)] p-3">
                <p className="font-bold text-[#1b2421]">3. 必要な予定だけ共有</p>
                <p className="mt-1">登録時や編集時に、共有する相手を選べます。</p>
              </div>
            </div>
            <button
              className="mt-5 h-11 w-full rounded-xl bg-[var(--accent)] px-4 font-bold text-white"
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

      {/* スポットから選択 */}
      {linkPickerTarget && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-[#1b2421]/40 p-3 sm:items-center"
          onClick={() => setLinkPickerTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-black text-[#1b2421]">スポットから選択</p>
              <button className="text-[#8e958f]" onClick={() => setLinkPickerTarget(null)}>
                ✕
              </button>
            </div>
            <input
              className="mt-3 w-full rounded-xl border border-[#dfe4e2] bg-[var(--surface-alt)] p-2.5 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="店名・URLで検索"
              value={linkPickerQuery}
              onChange={(e) => setLinkPickerQuery(e.target.value)}
            />
            <div className="mt-3 max-h-[50vh] space-y-1.5 overflow-y-auto">
              {!linkOptionsLoaded ? (
                <p className="p-4 text-center text-sm text-[#8e958f]">読み込み中…</p>
              ) : filteredLinkOptions.length === 0 ? (
                <p className="p-4 text-center text-sm text-[#8e958f]">
                  {linkOptions.length === 0
                    ? "URL付きの予定がまだありません。"
                    : "一致するスポットがありません。"}
                </p>
              ) : (
                filteredLinkOptions.map((opt) => (
                  <button
                    key={opt.url}
                    type="button"
                    onClick={() => {
                      if (opt.isWish && linkPickerTarget === "new") {
                        chooseWish(opt);
                        setLinkPickerTarget(null);
                      } else {
                        chooseLink(opt.url);
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-[#e5e9e7] p-2.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                  >
                    <span className="text-base">{opt.isWish ? "📍" : opt.isFavorite ? "⭐" : "🔗"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#1b2421]">{opt.label}</span>
                      <span className="block truncate text-xs text-[#8e958f]">{opt.host || opt.url}</span>
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
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66706c]">確認</p>
              <p className="mt-2 text-base font-black text-[#1b2421]">この内容で登録しますか？</p>
              <dl className="mt-4 space-y-2 rounded-xl border border-[#e5e9e7] bg-[var(--surface-alt)] p-3 text-sm">
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#66706c]">日付</dt>
                  <dd className="text-lg font-black text-[var(--accent)]">
                    {format(start, "M月d日(E)", { locale: ja })}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#66706c]">予定</dt>
                  <dd className="font-bold text-[#1b2421]">{f.title}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#66706c]">時間</dt>
                  <dd className="font-bold text-[#1b2421]">
                    {format(start, "HH:mm")} 〜 {crossesDay ? "翌" : ""}{format(end, "HH:mm")}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#66706c]">分類</dt>
                  <dd className="font-bold text-[#1b2421]">{categoryName}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-14 shrink-0 font-semibold text-[#66706c]">共有</dt>
                  <dd className="font-bold text-[#1b2421]">{shareCount > 0 ? `${shareCount}人` : "自分のみ"}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-[#66706c]">登録後は次の日の入力に進みます。</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  className="h-11 rounded-xl border border-[#d5dad8] font-bold text-[#3a4440] transition hover:bg-[var(--surface-alt)] disabled:opacity-50"
                  disabled={savingPattern}
                  onClick={() => setConfirmPattern(null)}
                >
                  キャンセル
                </button>
                <button
                  className="h-11 rounded-xl bg-[var(--accent)] font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
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
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66706c]">確認</p>
            <p className="mt-2 text-base font-black text-[#1b2421]">
              {confirmDeleteEvent.recurringId
                ? `「${confirmDeleteEvent.title}」の${format(confirmDeleteEvent.start, "M月d日", { locale: ja })}の予定を削除しますか？`
                : `「${confirmDeleteEvent.title}」を削除しますか？`}
            </p>
            {confirmDeleteEvent.recurringId && (
              <p className="mt-1 text-sm text-[#66706c]">
                この日のみ削除します（繰り返し予定は残ります）。すべて削除する場合は 設定 → 繰り返し予定 から行ってください。
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="h-11 rounded-xl border border-[#d5dad8] font-bold text-[#3a4440] transition hover:bg-[var(--surface-alt)]"
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

      {lastMove && (
        <div className="undo-bar" role="status">
          <span className="min-w-0 flex-1 truncate">「{lastMove.title}」を動かしました</span>
          <button type="button" className="undo-bar-btn" onClick={() => void undoLastMove()}>元に戻す</button>
        </div>
      )}
      <ToastStack toasts={toasts} />
      <MobileNavigation />
    </main>
  );
}
