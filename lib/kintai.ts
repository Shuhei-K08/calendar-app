// 勤怠（フリーランスの稼働管理）の計算まわり。画面から切り離して、同じ計算をどこでも使えるようにする
import * as HolidayJp from "@holiday-jp/holiday_jp";

export type WorkProject = {
  id: string;
  name: string;
  start_month: string; // YYYY-MM-01
  end_month: string | null;
  range_min: number;
  range_max: number;
  rounding_min: number;
  default_start: string; // HH:MM(:SS)
  default_end: string;
  default_break_min: number;
  monthly_rate: number | null;
  deduction_rate: number | null;
  excess_rate: number | null;
  price_tax?: "excluded" | "included" | null; // 単価・控除・超過が 税抜 か 税込 か（未設定は税抜）
};

export type WorkTemplate = {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
  break_min: number;
  sort_order: number;
};

// 作業内容のテンプレート（API改修・レビュー対応 など）
export type MemoTemplate = { id: string; text: string; sort_order: number };

export type WorkDay = {
  id?: string;
  work_date: string; // YYYY-MM-DD
  start_time: string | null;
  end_time: string | null;
  break_min: number;
  is_off: boolean;
  memo: string | null;
};

// 予定（カレンダー）から見込んだその日の時間
export type PlannedDay = { start: string; end: string; breakMin: number; source: string } | { off: true; source: string };

/* ── 時刻・日付 ── */

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const ymKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** "HH:MM" or "HH:MM:SS" → 分 */
export const toMin = (t: string | null | undefined) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** 分 → "H:MM" */
export const fmtHM = (min: number) => `${Math.floor(min / 60)}:${pad2(Math.round(min % 60))}`;
/** 分 → "HH:MM"（入力欄用） */
export const toTime = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
/** 分 → "8.5" のような時間表示 */
export const fmtH = (min: number) => {
  const h = min / 60;
  return Number.isInteger(h) ? h.toFixed(1) : String(Number(h.toFixed(2)));
};
export const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** 稼働（分）。終了が開始より前なら日をまたいだとみなす */
export const workMinutes = (start: string | null, end: string | null, breakMin: number) => {
  if (!start || !end) return 0;
  const s = toMin(start);
  let e = toMin(end);
  if (e <= s) e += 24 * 60;
  return Math.max(0, e - s - (breakMin || 0));
};

/** 時間帯の長さから休憩を決める（6時間以上なら案件のいつもの休憩） */
export const defaultBreakFor = (start: string, end: string, project: WorkProject | null) => {
  const span = workMinutes(start, end, 0);
  return span >= 6 * 60 ? project?.default_break_min ?? 60 : 0;
};

export const isHolidayJp = (d: Date) => HolidayJp.isHoliday(d);
export const holidayName = (d: Date) => {
  const list = HolidayJp.between(d, d);
  return list[0]?.name ?? "";
};
export const isBusinessDay = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 && !isHolidayJp(d);

export const daysOfMonth = (month: Date) => {
  const y = month.getFullYear();
  const m = month.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
};

/** その月に有効な案件 */
export const projectForMonth = (projects: WorkProject[], month: Date) => {
  const key = `${ymKey(month)}-01`;
  return (
    projects
      .filter((p) => p.start_month <= key && (!p.end_month || p.end_month >= key))
      .sort((a, b) => (a.start_month < b.start_month ? 1 : -1))[0] ?? null
  );
};

/* ── 月のまとめ ── */

export type DayInfo = {
  date: Date;
  key: string;
  business: boolean;
  holiday: string;
  record: WorkDay | null;
  recordedMin: number; // 記録済みの稼働（休みは0）
  plannedMin: number; // 記録が無い日の見込み
  planSource: string; // 見込みの出どころ（「出社」の予定 / いつもの時間 など）
  state: "done" | "off" | "missing" | "planned" | "none";
};

export const buildMonth = (
  month: Date,
  todayKey: string,
  records: Record<string, WorkDay>,
  planned: Record<string, PlannedDay>,
  project: WorkProject | null,
): DayInfo[] =>
  daysOfMonth(month).map((date) => {
    const key = ymd(date);
    const business = isBusinessDay(date);
    const holiday = isHolidayJp(date) ? holidayName(date) : "";
    const record = records[key] ?? null;
    const plan = planned[key];
    let recordedMin = 0;
    let plannedMin = 0;
    let planSource = "";
    let state: DayInfo["state"] = "none";
    if (record) {
      if (record.is_off) {
        state = "off";
      } else {
        recordedMin = workMinutes(record.start_time, record.end_time, record.break_min);
        state = "done";
      }
    } else if (plan && "off" in plan) {
      planSource = plan.source;
      state = key < todayKey ? "none" : "planned";
    } else if (plan) {
      plannedMin = workMinutes(plan.start, plan.end, plan.breakMin);
      planSource = plan.source;
      state = key < todayKey ? "missing" : "planned";
    } else if (business && project) {
      plannedMin = workMinutes(project.default_start, project.default_end, project.default_break_min);
      planSource = "いつもの時間";
      state = key < todayKey ? "missing" : "planned";
    }
    return { date, key, business, holiday, record, recordedMin, plannedMin, planSource, state };
  });

export type MonthSummary = {
  recordedMin: number;
  projectedMin: number; // 記録済み＋これからの見込み
  remainingDays: number; // 今日以降でまだ記録していない、働く予定の日
  needPerDayMin: number | null; // 下限に届くための1日平均（丸め単位で切り上げ）
  toMinMin: number; // 下限まであと何分
  missingDays: DayInfo[]; // 今日より前で未記入の日
};

export const summarize = (days: DayInfo[], todayKey: string, project: WorkProject | null): MonthSummary => {
  const recordedMin = days.reduce((s, d) => s + d.recordedMin, 0);
  const future = days.filter((d) => d.state === "planned" && d.plannedMin > 0 && d.key >= todayKey);
  const projectedMin = recordedMin + future.reduce((s, d) => s + d.plannedMin, 0);
  const minMin = (project?.range_min ?? 0) * 60;
  const toMinMin = Math.max(0, minMin - recordedMin);
  const step = project?.rounding_min || 15;
  const needPerDayMin =
    project && future.length > 0 ? Math.ceil(toMinMin / future.length / step) * step : project && toMinMin > 0 ? null : 0;
  return {
    recordedMin,
    projectedMin,
    remainingDays: future.length,
    needPerDayMin,
    toMinMin,
    missingDays: days.filter((d) => d.state === "missing"),
  };
};

export const TAX_RATE = 0.1;

/** 月給の見込み（単価が入っているときだけ）。
 *  total は税込。消費税は円未満切り捨て（税抜で入れた場合）。 */
export const monthlyPay = (project: WorkProject | null, minutes: number) => {
  if (!project?.monthly_rate) return null;
  const hours = minutes / 60;
  let deduction = 0;
  let excess = 0;
  if (hours < project.range_min && project.deduction_rate) {
    deduction = (project.range_min - hours) * project.deduction_rate;
  }
  if (hours > project.range_max && project.excess_rate) {
    excess = (hours - project.range_max) * project.excess_rate;
  }
  const subtotal = Math.round(project.monthly_rate - deduction + excess); // 入れた金額のまま（税抜 or 税込）
  const included = project.price_tax === "included";
  // 税抜で入れた → 消費税を足す（切り捨て）／税込で入れた → 税抜をおおよそ逆算
  const totalExcl = included ? Math.round(subtotal / (1 + TAX_RATE)) : subtotal;
  const tax = included ? subtotal - totalExcl : Math.floor(subtotal * TAX_RATE);
  return {
    base: project.monthly_rate,
    deduction: Math.round(deduction),
    excess: Math.round(excess),
    included,
    totalExcl,
    tax,
    total: totalExcl + tax, // 税込
    shortHours: Math.max(0, project.range_min - hours),
    overHours: Math.max(0, hours - project.range_max),
  };
};

/* ── Excel / コピー用の表 ── */

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export type SheetRow = (string | number)[];

export const buildSheet = (
  days: DayInfo[],
  project: WorkProject | null,
  opts: { name: string; includeMoney: boolean },
) => {
  const month = days[0]?.date ?? new Date();
  const header: SheetRow = ["日付", "曜日", "区分", "開始", "終了", "休憩", "稼働時間", "作業内容"];
  const rows: SheetRow[] = days.map((d) => {
    const r = d.record;
    const base = [`${d.date.getFullYear()}/${d.date.getMonth() + 1}/${d.date.getDate()}`, DOW[d.date.getDay()]];
    if (r && !r.is_off) {
      return [
        ...base,
        "稼働",
        (r.start_time ?? "").slice(0, 5),
        (r.end_time ?? "").slice(0, 5),
        fmtHM(r.break_min),
        Number((d.recordedMin / 60).toFixed(2)),
        r.memo ?? "",
      ];
    }
    const kind = d.holiday ? "祝日" : r?.is_off || !d.business ? "休日" : "";
    return [...base, kind, "", "", "", "", d.holiday || (r?.memo ?? "")];
  });
  const total = days.reduce((s, d) => s + d.recordedMin, 0);
  const workDays = days.filter((d) => d.recordedMin > 0).length;
  const info: SheetRow[] = [
    ["作業報告書"],
    ["対象月", `${month.getFullYear()}年${month.getMonth() + 1}月`, "", "氏名", opts.name],
    ["案件名", project?.name ?? "", "", "精算幅", project ? `${project.range_min}〜${project.range_max}h` : ""],
    [],
  ];
  const footer: SheetRow[] = [["合計", `稼働日数 ${workDays}日`, "", "", "", "", Number((total / 60).toFixed(2)), ""]];
  if (opts.includeMoney) {
    const pay = monthlyPay(project, total);
    if (pay) {
      const tag = pay.included ? "税込" : "税抜";
      footer.push([
        "金額",
        `月額単価 ${pay.base.toLocaleString("ja-JP")}円（${tag}）`,
        pay.deduction ? `控除 −${pay.deduction.toLocaleString("ja-JP")}円` : "",
        pay.excess ? `超過 +${pay.excess.toLocaleString("ja-JP")}円` : "",
        `税抜 ${pay.totalExcl.toLocaleString("ja-JP")}円`,
        `消費税 ${pay.tax.toLocaleString("ja-JP")}円`,
        pay.total,
        "税込",
      ]);
    }
  }
  return { info, header, rows, footer, total };
};

/** 貼り付け用（タブ区切り）。Excel にそのまま貼れる */
export const sheetToTsv = (rows: SheetRow[]) => rows.map((r) => r.map((c) => String(c).replace(/\t|\n/g, " ")).join("\t")).join("\n");

/** 15分刻みなどの時刻の選択肢 */
export const timeOptions = (step = 15) => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) out.push(toTime(m));
  return out;
};
