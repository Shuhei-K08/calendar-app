// Geminiの無料枠は太平洋時間(America/Los_Angeles)の0時に日次リセットされる。
// 夏時間(DST)の切り替わりがあるため、Intl APIで正確に次回リセット時刻を求める。

const PACIFIC_TZ = "America/Los_Angeles";

type WallParts = { year: number; month: number; day: number; hour: number; minute: number };

const pacificParts = (date: Date): WallParts => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
  };
};

// 太平洋の壁時計時刻(y,m,d,h,min)に対応するUTCのDateを返す
const pacificWallToUtc = (y: number, m: number, d: number, h: number, min: number): Date => {
  const asUtc = Date.UTC(y, m - 1, d, h, min);
  const probe = pacificParts(new Date(asUtc));
  const probeAsUtc = Date.UTC(probe.year, probe.month - 1, probe.day, probe.hour, probe.minute);
  const offset = probeAsUtc - asUtc; // 太平洋がUTCより進んでいる量（通常は負）
  return new Date(asUtc - offset);
};

// 次に無料枠がリセットされる時刻(UTCのDate)を返す
export const nextPacificMidnight = (from: Date = new Date()): Date => {
  const now = pacificParts(from);
  const todayMidnight = pacificWallToUtc(now.year, now.month, now.day, 0, 0);
  // 翌日の太平洋日付を求める（DSTで23h/25hになる日も+25hで安全に跨ぐ）
  const probe = pacificParts(new Date(todayMidnight.getTime() + 25 * 3600 * 1000));
  return pacificWallToUtc(probe.year, probe.month, probe.day, 0, 0);
};

// 日本時間で「M月D日 HH:mm」形式に整形
export const formatJst = (date: Date): string => {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(date);
};
