"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DesktopNavigation, MobileNavigation, OPEN_KINTAI_ENTRY, ShareCalLogo } from "@/app/components/AppNavigation";
import {
  parseYmd,
  buildMonth,
  buildSheet,
  defaultBreakFor,
  fmtH,
  fmtHM,
  monthlyPay,
  pad2,
  projectForMonth,
  sheetToTsv,
  summarize,
  timeOptions,
  workMinutes,
  yen,
  ymd,
  ymKey,
  type DayInfo,
  type PlannedDay,
  type WorkDay,
  type WorkProject,
  type WorkTemplate,
  type MemoTemplate,
} from "@/lib/kintai";
import TemplatesView from "./TemplatesView";
import { setKintaiEnabled, useKintaiEnabled } from "@/lib/features";
import { ExportTemplateList, exportFileName, exportWithTemplate, loadExportTemplates, type ExportTemplate } from "./ExcelTemplates";

/* ── 小さな道具 ── */
type ToastItem = { id: number; msg: string; type: "success" | "error" | "info" };
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const nowDate = () => new Date(Date.now());
const hhmm = (t: string | null | undefined) => (t ?? "").slice(0, 5);
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";
const NOTICE_KEY = "sharecal_kintai_notice_closed";
const planKey = (p?: PlannedDay) => (!p ? "" : "off" in p ? "off" : `${p.start}-${p.end}`);

const PROJECT_COLS =
  "id, name, start_month, end_month, range_min, range_max, rounding_min, default_start, default_end, default_break_min, monthly_rate, deduction_rate, excess_rate";
// 税込・税抜の列（SQL を実行するまでは無いので、無ければ外して読み書きする）
const PROJECT_COLS_TAX = `${PROJECT_COLS}, price_tax`;
const isMissingColumn = (code?: string) => code === "42703" || code === "PGRST204";

type ProjectDraft = {
  id?: string;
  name: string;
  startMonth: string; // YYYY-MM
  endMonth: string; // YYYY-MM or ""
  rangeMin: string;
  rangeMax: string;
  roundingMin: string;
  defaultStart: string;
  defaultEnd: string;
  defaultBreak: string;
  monthlyRate: string;
  deductionRate: string;
  excessRate: string;
  priceTax: "excluded" | "included";
};

const blankProject = (month: Date, prev?: WorkProject | null): ProjectDraft => ({
  name: "",
  startMonth: ymKey(month),
  endMonth: "",
  rangeMin: String(prev?.range_min ?? 140),
  rangeMax: String(prev?.range_max ?? 180),
  roundingMin: String(prev?.rounding_min ?? 15),
  defaultStart: hhmm(prev?.default_start) || "10:00",
  defaultEnd: hhmm(prev?.default_end) || "19:00",
  defaultBreak: String(prev?.default_break_min ?? 60),
  monthlyRate: prev?.monthly_rate ? String(prev.monthly_rate) : "",
  deductionRate: prev?.deduction_rate ? String(prev.deduction_rate) : "",
  excessRate: prev?.excess_rate ? String(prev.excess_rate) : "",
  priceTax: prev?.price_tax === "included" ? "included" : "excluded",
});

const draftFromProject = (p: WorkProject): ProjectDraft => ({
  id: p.id,
  name: p.name,
  startMonth: p.start_month.slice(0, 7),
  endMonth: p.end_month ? p.end_month.slice(0, 7) : "",
  rangeMin: String(p.range_min),
  rangeMax: String(p.range_max),
  roundingMin: String(p.rounding_min),
  defaultStart: hhmm(p.default_start),
  defaultEnd: hhmm(p.default_end),
  defaultBreak: String(p.default_break_min),
  monthlyRate: p.monthly_rate ? String(p.monthly_rate) : "",
  deductionRate: p.deduction_rate ? String(p.deduction_rate) : "",
  excessRate: p.excess_rate ? String(p.excess_rate) : "",
  priceTax: p.price_tax === "included" ? "included" : "excluded",
});

const numOrNull = (s: string) => {
  const n = Number(String(s).replace(/[,，円\s]/g, ""));
  return s.trim() && Number.isFinite(n) ? n : null;
};

const BREAK_CHOICES = [0, 30, 45, 60, 75, 90];

/* ── 1日の記入（スマホはシート、PCは右側に常に表示） ── */
type EntryState = { start: string; end: string; breakMin: number; memo: string };

function EntryForm({
  day,
  project,
  templates,
  planned,
  step,
  saving,
  onSave,
  onOff,
  onClear,
  onSaveTemplate,
  memoTemplates,
  recentMemos,
  onSaveMemo,
  onClose,
}: {
  day: DayInfo;
  project: WorkProject | null;
  templates: WorkTemplate[];
  planned: PlannedDay | undefined;
  step: number;
  saving: boolean;
  onSave: (v: EntryState) => void;
  onOff: (memo: string) => void;
  onClear: () => void;
  onSaveTemplate: (label: string, v: EntryState) => void;
  memoTemplates: MemoTemplate[];
  recentMemos: string[];
  onSaveMemo: (text: string) => void;
  onClose?: () => void;
}) {
  const initial = (): EntryState => {
    const r = day.record;
    if (r && !r.is_off && r.start_time && r.end_time) {
      return { start: hhmm(r.start_time), end: hhmm(r.end_time), breakMin: r.break_min, memo: r.memo ?? "" };
    }
    if (planned && !("off" in planned)) return { start: planned.start, end: planned.end, breakMin: planned.breakMin, memo: r?.memo ?? "" };
    return {
      start: hhmm(project?.default_start) || "10:00",
      end: hhmm(project?.default_end) || "19:00",
      breakMin: project?.default_break_min ?? 60,
      memo: r?.memo ?? "",
    };
  };
  const [v, setV] = useState<EntryState>(initial);
  const [tplName, setTplName] = useState<string | null>(null);
  const [pickedTpl, setPickedTpl] = useState<string | null>(null); // 最後に押したテンプレート（同じ時間のものが複数あっても押した方を光らせる）
  const options = useMemo(() => timeOptions(step), [step]);
  const minutes = workMinutes(v.start, v.end, v.breakMin);
  const breakChoices = BREAK_CHOICES.includes(v.breakMin) ? BREAK_CHOICES : [...BREAK_CHOICES, v.breakMin].sort((a, b) => a - b);
  const sameTime = (t: WorkTemplate) => hhmm(t.start_time) === v.start && hhmm(t.end_time) === v.end && t.break_min === v.breakMin;
  const picked = templates.find((t) => t.id === pickedTpl);
  const activeTpl = picked && sameTime(picked) ? picked : templates.find(sameTime);
  const d = day.date;
  const status =
    day.state === "done" ? "記入済み" : day.state === "off" ? "休み" : day.state === "missing" ? "未記入" : day.planSource ? `予定：${day.planSource}` : "";

  return (
    <div className="kt-entry">
      <div className="kt-entry-head">
        <h2>
          {d.getMonth() + 1}月{d.getDate()}日（{DOW[d.getDay()]}）
        </h2>
        {status && <span className={`kt-badge ${day.state === "missing" ? "is-warn" : day.state === "done" ? "is-ok" : ""}`}>{status}</span>}
        {onClose && (
          <button type="button" className="kt-close" onClick={onClose}>
            閉じる
          </button>
        )}
      </div>

      {templates.length > 0 && (
        <div className="kt-field">
          <span className="kt-label">テンプレート（タップで入力）</span>
          <div className="kt-tpl-row">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`kt-tpl ${activeTpl?.id === t.id ? "is-on" : ""}`}
                aria-pressed={activeTpl?.id === t.id}
                onClick={() => {
                  setPickedTpl(t.id);
                  setV((cur) => ({ ...cur, start: hhmm(t.start_time), end: hhmm(t.end_time), breakMin: t.break_min }));
                }}
              >
                <b>{t.label}</b>
                <small>
                  {hhmm(t.start_time)}〜{hhmm(t.end_time)} 休{fmtHM(t.break_min)}
                </small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="kt-three">
        <label className="kt-field">
          <span className="kt-label">開始</span>
          <select className="kt-input" value={v.start} onChange={(e) => setV((c) => ({ ...c, start: e.target.value }))}>
            {!options.includes(v.start) && <option value={v.start}>{v.start}</option>}
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="kt-field">
          <span className="kt-label">終了</span>
          <select className="kt-input" value={v.end} onChange={(e) => setV((c) => ({ ...c, end: e.target.value }))}>
            {!options.includes(v.end) && <option value={v.end}>{v.end}</option>}
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="kt-field">
          <span className="kt-label">休憩</span>
          <select className="kt-input" value={v.breakMin} onChange={(e) => setV((c) => ({ ...c, breakMin: Number(e.target.value) }))}>
            {breakChoices.map((b) => (
              <option key={b} value={b}>{fmtHM(b)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="kt-total">
        <span>この日の稼働</span>
        <b>
          {fmtH(minutes)}
          <small> h</small>
        </b>
      </div>

      <label className="kt-field">
        <span className="kt-label">作業内容（任意・Excelの作業内容に入ります）</span>
        <input
          className="kt-input"
          value={v.memo}
          placeholder="例：API改修、レビュー対応"
          onChange={(e) => setV((c) => ({ ...c, memo: e.target.value }))}
        />
      </label>
      {(memoTemplates.length > 0 || recentMemos.length > 0 || v.memo.trim()) && (
        <div className="kt-memo-chips" aria-label="作業内容のテンプレート">
          {memoTemplates.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`kt-chip ${v.memo === m.text ? "is-on" : ""}`}
              aria-pressed={v.memo === m.text}
              onClick={() => setV((c) => ({ ...c, memo: c.memo === m.text ? "" : m.text }))}
            >
              {m.text}
            </button>
          ))}
          {recentMemos
            .filter((r) => !memoTemplates.some((m) => m.text === r))
            .map((r) => (
              <button
                key={`r-${r}`}
                type="button"
                className={`kt-chip is-recent ${v.memo === r ? "is-on" : ""}`}
                aria-pressed={v.memo === r}
                title="最近使った作業内容"
                onClick={() => setV((c) => ({ ...c, memo: c.memo === r ? "" : r }))}
              >
                {r}
              </button>
            ))}
          {v.memo.trim() && !memoTemplates.some((m) => m.text === v.memo.trim()) && (
            <button type="button" className="kt-chip is-edit" onClick={() => onSaveMemo(v.memo.trim())}>
              ＋ この作業内容を保存
            </button>
          )}
        </div>
      )}

      {tplName === null ? (
        <button type="button" className="kt-text-btn" onClick={() => setTplName(activeTpl ? "" : "")}>
          ＋ この時間をテンプレートに保存
        </button>
      ) : (
        <div className="kt-inline-form">
          <input
            className="kt-input"
            autoFocus
            value={tplName}
            placeholder="名前（例：通常、午後から）"
            onChange={(e) => setTplName(e.target.value)}
          />
          <button
            type="button"
            className="kt-btn is-small"
            disabled={!tplName.trim()}
            onClick={() => {
              onSaveTemplate(tplName.trim(), v);
              setTplName(null);
            }}
          >
            保存
          </button>
          <button type="button" className="kt-btn is-ghost is-small" onClick={() => setTplName(null)}>
            やめる
          </button>
        </div>
      )}

      <div className="kt-entry-actions">
        <button type="button" className="kt-btn is-ghost" onClick={() => onOff(v.memo)} disabled={saving}>
          休みにする
        </button>
        <button type="button" className="kt-btn is-primary" onClick={() => onSave(v)} disabled={saving || minutes <= 0}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
      {day.record && (
        <button type="button" className="kt-link-danger" onClick={onClear} disabled={saving}>
          この日の記録を消す
        </button>
      )}
    </div>
  );
}

/* ── ページ本体 ── */
export default function KintaiPage() {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = useCallback((msg: string, type: ToastItem["type"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, type }]);
    window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const [month, setMonth] = useState(() => {
    const d = nowDate();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const todayKey = useMemo(() => ymd(nowDate()), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [templates, setTemplates] = useState<WorkTemplate[]>([]);
  const [memoTemplates, setMemoTemplates] = useState<MemoTemplate[]>([]);
  const [memoMissing, setMemoMissing] = useState(false);
  const [bulkMemo, setBulkMemo] = useState<string>(""); // まとめて入力で入れる作業内容（空＝そのまま）
  const [records, setRecords] = useState<Record<string, WorkDay>>({});
  const [planned, setPlanned] = useState<Record<string, PlannedDay>>({});
  const [view, setView] = useState<"list" | "calendar">("calendar");
  const [page, setPage] = useState<"main" | "projects" | "templates">("main");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkTpl, setBulkTpl] = useState<string | null>(null); // テンプレートid or "off"
  const [simOpen, setSimOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [noticeClosed, setNoticeClosed] = useState("");
  const { enabled: kintaiOn } = useKintaiEnabled();

  /* 読み込み */
  const loadBase = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return null;
    }
    setUserId(user.id);
    const loadProjects = async () => {
      const r = await supabase.from("work_projects").select(PROJECT_COLS_TAX).order("start_month", { ascending: false });
      return isMissingColumn(r.error?.code)
        ? await supabase.from("work_projects").select(PROJECT_COLS).order("start_month", { ascending: false })
        : r;
    };
    const [proj, tpl, prof] = await Promise.all([
      loadProjects(),
      supabase.from("work_templates").select("id, label, start_time, end_time, break_min, sort_order").order("sort_order").order("created_at"),
      supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
    ]);
    if (isMissingTable(proj.error?.code) || isMissingTable(tpl.error?.code)) {
      setMissing(true);
      setLoading(false);
      return null;
    }
    setProjects(((proj.data ?? []) as WorkProject[]).map((p) => ({ ...p, range_min: Number(p.range_min), range_max: Number(p.range_max) })));
    setTemplates((tpl.data ?? []) as WorkTemplate[]);
    setUserName(prof.data?.username ?? "");
    // 作業内容のテンプレート（表がまだ無ければ使わないだけ）
    const memo = await supabase.from("work_memo_templates").select("id, text, sort_order").order("sort_order").order("created_at");
    setMemoMissing(!!memo.error);
    setMemoTemplates(memo.error ? [] : ((memo.data ?? []) as MemoTemplate[]));
    return user.id;
  }, [router]);

  const loadMonth = useCallback(
    async (uid: string, m: Date) => {
      const first = ymd(m);
      const last = ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0));
      const startIso = new Date(m.getFullYear(), m.getMonth(), 1).toISOString();
      const endIso = new Date(m.getFullYear(), m.getMonth() + 1, 1).toISOString();
      const [wd, ev, pat] = await Promise.all([
        supabase.from("work_days").select("id, work_date, start_time, end_time, break_min, is_off, memo").gte("work_date", first).lte("work_date", last),
        supabase.from("events").select("title, start_at, end_at, all_day").eq("user_id", uid).gte("start_at", startIso).lt("start_at", endIso),
        supabase.from("schedule_patterns").select("label, title").eq("user_id", uid),
      ]);
      if (isMissingTable(wd.error?.code)) {
        setMissing(true);
        return;
      }
      const map: Record<string, WorkDay> = {};
      for (const r of (wd.data ?? []) as WorkDay[]) map[r.work_date] = r;
      setRecords(map);

      // よく使う予定（出社・午後出社・非稼働日など）から、その日の見込みを作る
      const names = new Set<string>();
      for (const p of (pat.data ?? []) as { label: string | null; title: string | null }[]) {
        if (p.label) names.add(p.label.trim());
        if (p.title) names.add(p.title.trim());
      }
      const plans: Record<string, PlannedDay> = {};
      const currentProject = projectForMonth(projects, m);
      for (const e of (ev.data ?? []) as { title: string; start_at: string; end_at: string; all_day: boolean | null }[]) {
        const title = (e.title ?? "").trim();
        if (!names.has(title)) continue;
        const s = new Date(e.start_at);
        const key = ymd(s);
        if (/非稼働|休み|休日|有給|有休/.test(title)) {
          plans[key] = { off: true, source: title };
          continue;
        }
        if (e.all_day) continue;
        const en = new Date(e.end_at);
        const start = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
        const end = `${pad2(en.getHours())}:${pad2(en.getMinutes())}`;
        plans[key] = { start, end, breakMin: defaultBreakFor(start, end, currentProject), source: title };
      }
      setPlanned(plans);
    },
    [projects],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      await loadBase();
      if (alive) setLoading(false);
    })();
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoticeClosed(window.localStorage.getItem(NOTICE_KEY) ?? "");
    } catch {
      /* 保存できない環境 */
    }
    return () => {
      alive = false;
    };
  }, [loadBase]);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMonth(userId, month);
  }, [userId, month, loadMonth]);

  /* 月のまとめ */
  const project = useMemo(() => projectForMonth(projects, month), [projects, month]);
  const days = useMemo(() => buildMonth(month, todayKey, records, planned, project), [month, todayKey, records, planned, project]);
  // 最近使った作業内容（この月の記録から新しい順・5つまで）
  const recentMemos = useMemo(() => {
    const out: string[] = [];
    for (const r of Object.values(records).sort((a, b) => (a.work_date < b.work_date ? 1 : -1))) {
      const m = r.memo?.trim();
      if (m && !r.is_off && !out.includes(m)) out.push(m);
      if (out.length >= 5) break;
    }
    return out;
  }, [records]);
  const sum = useMemo(() => summarize(days, todayKey, project), [days, todayKey, project]);
  const pay = useMemo(() => monthlyPay(project, sum.projectedMin), [project, sum.projectedMin]);
  const step = project?.rounding_min || 15;
  const isThisMonth = ymKey(month) === todayKey.slice(0, 7);

  // スマホの下の＋（勤怠画面では「今日の勤怠を記入」）
  useEffect(() => {
    const open = () => {
      const today = parseYmd(todayKey);
      setPage("main");
      setBulkTpl(null);
      setMonth((m) => (ymKey(m) === todayKey.slice(0, 7) ? m : new Date(today.getFullYear(), today.getMonth(), 1)));
      setSelectedKey(todayKey);
      setSheetOpen(true);
    };
    window.addEventListener(OPEN_KINTAI_ENTRY, open);
    return () => window.removeEventListener(OPEN_KINTAI_ENTRY, open);
  }, [todayKey]);
  const selected = days.find((d) => d.key === selectedKey) ?? days.find((d) => d.key === todayKey) ?? days[0];

  /* 保存まわり */
  const upsertDay = async (key: string, patch: Partial<WorkDay>) => {
    if (!userId) return false;
    const row = {
      user_id: userId,
      work_date: key,
      start_time: patch.start_time ?? null,
      end_time: patch.end_time ?? null,
      break_min: patch.break_min ?? 0,
      is_off: patch.is_off ?? false,
      memo: patch.memo ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("work_days")
      .upsert(row, { onConflict: "user_id,work_date" })
      .select("id, work_date, start_time, end_time, break_min, is_off, memo")
      .single();
    if (error) {
      show(isMissingTable(error.code) ? "勤怠を使うにはSQL（supabase-kintai.sql）を実行してください" : "保存に失敗しました", "error");
      return false;
    }
    setRecords((prev) => ({ ...prev, [key]: data as WorkDay }));
    return true;
  };

  const saveEntry = async (key: string, v: EntryState) => {
    setSaving(true);
    const ok = await upsertDay(key, { start_time: v.start, end_time: v.end, break_min: v.breakMin, memo: v.memo.trim() || null });
    setSaving(false);
    if (ok) {
      show(`${Number(key.slice(5, 7))}/${Number(key.slice(8))} を記録しました（${fmtH(workMinutes(v.start, v.end, v.breakMin))}h）`);
      setSheetOpen(false);
    }
  };

  const markOff = async (key: string, memo: string) => {
    setSaving(true);
    const ok = await upsertDay(key, { is_off: true, memo: memo.trim() || null });
    setSaving(false);
    if (ok) {
      show("休みにしました", "info");
      setSheetOpen(false);
    }
  };

  const clearDay = async (key: string) => {
    setSaving(true);
    const { error } = await supabase.from("work_days").delete().eq("work_date", key);
    setSaving(false);
    if (error) {
      show("消せませんでした", "error");
      return;
    }
    setRecords((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    show("記録を消しました", "info");
    setSheetOpen(false);
  };

  const saveTemplate = async (label: string, v: EntryState) => {
    const { data, error } = await supabase
      .from("work_templates")
      .insert({ label, start_time: v.start, end_time: v.end, break_min: v.breakMin, sort_order: templates.length })
      .select("id, label, start_time, end_time, break_min, sort_order")
      .single();
    if (error) {
      show("テンプレートを保存できませんでした", "error");
      return;
    }
    setTemplates((p) => [...p, data as WorkTemplate]);
    show(`テンプレート「${label}」を保存しました`);
  };

  const saveMemoTemplate = async (text: string) => {
    if (memoMissing) {
      show("Supabase で supabase-kintai-memo.sql を実行すると保存できます", "error");
      return;
    }
    const { data, error } = await supabase
      .from("work_memo_templates")
      .insert({ text, sort_order: memoTemplates.length })
      .select("id, text, sort_order")
      .single();
    if (error) {
      show("保存できませんでした", "error");
      return;
    }
    setMemoTemplates((p) => [...p, data as MemoTemplate]);
    show(`作業内容「${text}」を保存しました`);
  };

  const openDay = (key: string) => {
    if (bulkTpl) {
      void applyBulk(key);
      return;
    }
    setSelectedKey(key);
    setSheetOpen(true);
  };

  // まとめて入力: テンプレート（または休み）を選んで日付をタップ
  const applyBulk = async (key: string) => {
    if (!bulkTpl) return;
    if (bulkTpl === "off") {
      await upsertDay(key, { is_off: true, memo: records[key]?.memo ?? null });
      return;
    }
    const t = templates.find((x) => x.id === bulkTpl);
    if (!t) return;
    await upsertDay(key, { start_time: hhmm(t.start_time), end_time: hhmm(t.end_time), break_min: t.break_min, memo: bulkMemo || (records[key]?.memo ?? null) });
  };

  // 未記入の日を、予定（またはいつもの時間）どおりにまとめて記入
  const fillMissing = async () => {
    let n = 0;
    for (const d of sum.missingDays) {
      const plan = planned[d.key];
      const start = plan && !("off" in plan) ? plan.start : hhmm(project?.default_start);
      const end = plan && !("off" in plan) ? plan.end : hhmm(project?.default_end);
      const brk = plan && !("off" in plan) ? plan.breakMin : project?.default_break_min ?? 60;
      if (!start || !end) continue;
      if (await upsertDay(d.key, { start_time: start, end_time: end, break_min: brk })) n += 1;
    }
    if (n) show(`${n}日分を予定どおり記入しました`);
  };

  const closeNotice = (id: string) => {
    const v = `${todayKey}:${id}`;
    setNoticeClosed(v);
    try {
      window.localStorage.setItem(NOTICE_KEY, v);
    } catch {
      /* 保存できない環境 */
    }
  };

  /* お知らせ（必要なときだけ1つ） */
  const notice = useMemo(() => {
    if (!project || !isThisMonth) return null;
    const lastDay = days[days.length - 1];
    const lastBusiness = [...days].reverse().find((d) => d.business);
    let n: { id: string; tone: "warn" | "ok" | "danger"; title: string; sub: string; action?: { label: string; run: () => void } } | null = null;
    if (sum.missingDays.length > 0) {
      n = {
        id: "missing",
        tone: "warn",
        title: `未記入の日が${sum.missingDays.length}日あります`,
        sub: sum.missingDays
          .slice(0, 4)
          .map((d) => `${d.date.getMonth() + 1}/${d.date.getDate()}（${DOW[d.date.getDay()]}）`)
          .join("・"),
        action: { label: "予定どおり記入", run: () => void fillMissing() },
      };
    } else if (todayKey === lastDay.key || todayKey === lastBusiness?.key) {
      n = {
        id: "monthend",
        tone: "ok",
        title: "今月の締めです",
        sub: `${month.getMonth() + 1}月の作業報告書を書き出しましょう（${fmtH(sum.recordedMin)}h）`,
        action: { label: "書き出す", run: () => setExportOpen(true) },
      };
    } else if (sum.projectedMin < project.range_min * 60) {
      const short = project.range_min * 60 - sum.projectedMin;
      const p = monthlyPay(project, sum.projectedMin);
      n = {
        id: "short",
        tone: "danger",
        title: `このままだと下限を${fmtH(short)}h下回ります`,
        sub: `${p && p.deduction ? `控除 約${yen(p.deduction)}。` : ""}残り${sum.remainingDays}日を1日平均${fmtH(sum.needPerDayMin ?? 0)}hにすれば届きます`,
      };
    }
    if (n && noticeClosed === `${todayKey}:${n.id}`) return null;
    return n;
    // fillMissing は毎回作り直されるが、表示内容は sum で決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, isThisMonth, days, sum, todayKey, noticeClosed, month]);

  /* ── 画面 ── */
  // 設定で「勤怠を使う」がオフのとき（初期値）
  if (kintaiOn === false) {
    return (
      <main className="page-shell min-h-screen px-4 pb-28 pt-4 sm:px-6 sm:pb-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <ShareCalLogo compact />
              <h1 className="text-2xl font-black">勤怠</h1>
            </div>
            <DesktopNavigation />
          </header>
          <div className="kt-card kt-off">
            <h2>勤怠はオフになっています</h2>
            <p className="kt-plain kt-muted">
              契約で月の稼働時間が決まっている人向けの機能です。毎日の稼働を記録して、精算幅に届くかの見込みを出したり、現場の勤怠表（Excel）に書き出したりできます。つながっている相手には見えません。
            </p>
            <div className="kt-entry-actions">
              <button type="button" className="kt-btn is-primary" onClick={() => void setKintaiEnabled(true)}>
                勤怠を使う
              </button>
            </div>
            <p className="kt-muted">あとから「設定 › 機能」でオフに戻せます。</p>
          </div>
        </div>
        <MobileNavigation />
      </main>
    );
  }

  if (missing) {
    return (
      <main className="page-shell min-h-screen px-4 pb-28 pt-4 sm:px-6 sm:pb-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <ShareCalLogo compact />
              <h1 className="text-2xl font-black">勤怠</h1>
            </div>
            <DesktopNavigation />
          </header>
          <div className="kt-card">
            <p className="kt-plain">
              勤怠を使うには、Supabase の SQL Editor で <b>supabase-kintai.sql</b> を1回実行してください。
            </p>
          </div>
        </div>
        <MobileNavigation />
      </main>
    );
  }

  const rangeMax = Math.max((project?.range_max ?? 180) * 1.12, sum.projectedMin / 60 + 5);
  const pct = (h: number) => `${Math.min(100, (h / rangeMax) * 100)}%`;

  return (
    <main className="page-shell min-h-screen px-4 pb-28 pt-4 text-[var(--fg)] sm:px-6 sm:pb-6">
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
        ))}
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="page-header glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {page === "main" ? (
              <>
                <ShareCalLogo compact />
                <h1 className="text-2xl font-black">勤怠</h1>
              </>
            ) : (
              <>
                <button type="button" className="kt-back" onClick={() => setPage("main")}>
                  ‹ 勤怠
                </button>
                <h1 className="text-xl font-black">{page === "templates" ? "テンプレート" : "案件"}</h1>
              </>
            )}
          </div>
          <DesktopNavigation />
        </header>

        {page === "templates" ? (
          <TemplatesView
            templates={templates}
            project={project}
            step={step}
            onChange={setTemplates}
            memoTemplates={memoTemplates}
            memoMissing={memoMissing}
            onMemoChange={setMemoTemplates}
            show={show}
          />
        ) : page === "projects" ? (
          <ProjectsView
            projects={projects}
            templates={templates}
            month={month}
            onChanged={(list) => setProjects(list)}
            onTemplateAdded={(t) => setTemplates((p) => [...p, t])}
            onOpenTemplates={() => setPage("templates")}
            show={show}
          />
        ) : loading ? (
          <div className="kt-card"><p className="kt-plain">読み込み中…</p></div>
        ) : (
          <>
            {/* 月の切り替えと案件 */}
            <div className="kt-toolbar">
              <div className="kt-month">
                <button type="button" aria-label="前の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
                <span>
                  <b>{month.getMonth() + 1}</b>月<small>{month.getFullYear()}</small>
                </span>
                <button type="button" aria-label="次の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
              </div>
              <button type="button" className="kt-project-chip" onClick={() => setPage("projects")}>
                {project ? `${project.name} · 精算幅 ${project.range_min}〜${project.range_max}h` : "案件を登録する"} ›
              </button>
              <div className="kt-toolbar-actions">
                <button type="button" className="kt-btn is-ghost is-small" onClick={() => setPage("templates")}>
                  テンプレート
                </button>
                <button type="button" className="kt-btn is-ghost is-small" onClick={() => setSimOpen(true)} disabled={!project}>
                  休んで大丈夫？
                </button>
                <button type="button" className="kt-btn is-primary is-small" onClick={() => setExportOpen(true)}>
                  Excelに書き出す
                </button>
              </div>
            </div>

            {!project && (
              <div className="kt-card kt-setup">
                <b>案件を登録すると、月末の見込みが出ます</b>
                <p>精算幅（例：140〜180h）や、いつもの時間を入れておくと、月末の見込みや下限まであと何時間かが自動で出ます。記録だけなら、このまま下の一覧やカレンダーから入れられます。</p>
                <button type="button" className="kt-btn is-primary" onClick={() => setPage("projects")}>
                  案件を登録する
                </button>
              </div>
            )}
            <>
                {project && notice && (
                  <div className={`kt-notice is-${notice.tone}`}>
                    <span className="kt-notice-text">
                      <b>{notice.title}</b>
                      <small>{notice.sub}</small>
                    </span>
                    {notice.action && (
                      <button type="button" className="kt-btn is-small" onClick={notice.action.run}>
                        {notice.action.label}
                      </button>
                    )}
                    <button type="button" className="kt-notice-close" aria-label="お知らせを閉じる" onClick={() => closeNotice(notice.id)}>
                      ×
                    </button>
                  </div>
                )}

                {/* 今月のまとめ */}
                {project && (
                <section className="kt-summary">
                  <div className="kt-card kt-main-stat">
                    <div className="kt-stat-top">
                      <span className="kt-label">{isThisMonth ? "今月の稼働" : `${month.getMonth() + 1}月の稼働`}</span>
                      <span className={`kt-pill ${sum.toMinMin > 0 ? "is-warn" : "is-ok"}`}>
                        {sum.toMinMin > 0 ? `下限まで あと${fmtH(sum.toMinMin)}h` : sum.recordedMin > project.range_max * 60 ? "上限を超えています" : "精算幅に届きました"}
                      </span>
                    </div>
                    <div className="kt-big">
                      {fmtH(sum.recordedMin)}
                      <small>h</small>
                    </div>
                    <div className="kt-bar" aria-hidden="true">
                      <span className="kt-bar-range" style={{ left: pct(project.range_min), width: `calc(${pct(project.range_max)} - ${pct(project.range_min)})` }} />
                      <span className="kt-bar-plan" style={{ width: pct(sum.projectedMin / 60) }} />
                      <span className="kt-bar-done" style={{ width: pct(sum.recordedMin / 60) }} />
                    </div>
                    <div className="kt-bar-scale" aria-hidden="true">
                      <span style={{ left: pct(project.range_min) }}>{project.range_min}</span>
                      <span style={{ left: pct(project.range_max) }}>{project.range_max}</span>
                    </div>
                  </div>
                  <div className="kt-card kt-mini">
                    <span className="kt-label">月末の見込み</span>
                    <b className={sum.projectedMin < project.range_min * 60 ? "is-danger" : "is-accent"}>約{fmtH(sum.projectedMin)}h</b>
                    <small>記録{fmtH(sum.recordedMin)}h ＋ 予定{fmtH(sum.projectedMin - sum.recordedMin)}h</small>
                  </div>
                  <div className="kt-card kt-mini">
                    <span className="kt-label">下限に必要</span>
                    <b>{sum.toMinMin === 0 ? "達成" : sum.needPerDayMin === null ? "—" : `${fmtH(sum.needPerDayMin)}h/日`}</b>
                    <small>残り{sum.remainingDays}日</small>
                  </div>
                  {pay && (
                    <div className="kt-card kt-mini is-soft">
                      <span className="kt-label">見込み月給（税込）</span>
                      <b className={pay.deduction ? "is-danger" : "is-accent"}>{yen(pay.total)}</b>
                      <small>
                        税抜 {yen(pay.totalExcl)} ＋ 消費税 {yen(pay.tax)}
                      </small>
                      <small>
                        {pay.deduction
                          ? `控除 −${yen(pay.deduction)}（${fmtH(Math.round(pay.shortHours * 60))}h不足）`
                          : project.deduction_rate
                            ? `下限割れ 1hごと −${yen(project.deduction_rate)}`
                            : "月額単価"}
                      </small>
                    </div>
                  )}
                </section>
                )}

                <div className="kt-columns">
                  <section className="kt-card kt-days">
                    <div className="kt-days-head">
                      <div className="kt-seg" role="tablist" aria-label="表示">
                        <button type="button" role="tab" aria-selected={view === "list"} onClick={() => setView("list")}>一覧</button>
                        <button type="button" role="tab" aria-selected={view === "calendar"} onClick={() => setView("calendar")}>カレンダー</button>
                      </div>
                      {isThisMonth && (
                        <button type="button" className="kt-btn is-primary is-small" onClick={() => openDay(todayKey)}>
                          今日を記入
                        </button>
                      )}
                    </div>

                    {view === "calendar" && (
                      <div className="kt-bulk">
                        <span className="kt-label">まとめて入力：</span>
                        <div className="kt-bulk-row">
                          {templates.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              className={`kt-chip ${bulkTpl === t.id ? "is-on" : ""}`}
                              aria-pressed={bulkTpl === t.id}
                              onClick={() => setBulkTpl(bulkTpl === t.id ? null : t.id)}
                            >
                              {t.label} {fmtH(workMinutes(t.start_time, t.end_time, t.break_min))}h
                            </button>
                          ))}
                          <button
                            type="button"
                            className={`kt-chip ${bulkTpl === "off" ? "is-on" : ""}`}
                            aria-pressed={bulkTpl === "off"}
                            onClick={() => setBulkTpl(bulkTpl === "off" ? null : "off")}
                          >
                            休み
                          </button>
                          <button type="button" className="kt-chip is-edit" onClick={() => setPage("templates")}>
                            {templates.length === 0 ? "＋ テンプレートを作る" : "編集"}
                          </button>
                        </div>
                        {bulkTpl && bulkTpl !== "off" && (memoTemplates.length > 0 || recentMemos.length > 0) && (
                          <label className="kt-bulk-memo">
                            <span className="kt-label">作業内容：</span>
                            <select className="kt-input" value={bulkMemo} onChange={(e) => setBulkMemo(e.target.value)}>
                              <option value="">そのまま（入れない）</option>
                              {[...memoTemplates.map((m) => m.text), ...recentMemos.filter((r) => !memoTemplates.some((m) => m.text === r))].map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        {bulkTpl && <small className="kt-muted">日付をタップすると入ります。終わったら選んだボタンをもう一度押してください。</small>}
                      </div>
                    )}

                    {view === "list" ? (
                      <ul className="kt-list">
                        {days.map((d) => (
                          <li key={d.key}>
                            <button
                              type="button"
                              className={`kt-row is-${d.state} ${d.key === todayKey ? "is-today" : ""} ${selected?.key === d.key ? "is-selected" : ""}`}
                              onClick={() => openDay(d.key)}
                            >
                              <span className={`kt-row-date ${d.date.getDay() === 0 || d.holiday ? "is-sun" : d.date.getDay() === 6 ? "is-sat" : ""}`}>
                                <b>{d.date.getMonth() + 1}/{d.date.getDate()}</b>
                                <small>{DOW[d.date.getDay()]}</small>
                              </span>
                              <span className="kt-row-main">
                                {d.state === "done" && d.record ? (
                                  <>
                                    <b>
                                      {hhmm(d.record.start_time)}〜{hhmm(d.record.end_time)}
                                    </b>
                                    <small>
                                      休憩 {fmtHM(d.record.break_min)}
                                      {d.record.memo ? ` · ${d.record.memo}` : ""}
                                    </small>
                                  </>
                                ) : d.state === "off" ? (
                                  <b className="kt-muted">休み{d.record?.memo ? ` · ${d.record.memo}` : ""}</b>
                                ) : d.holiday ? (
                                  <b className="kt-muted">祝日（{d.holiday}）</b>
                                ) : d.state === "missing" ? (
                                  <>
                                    <b className="is-warn">未記入</b>
                                    <small>{d.planSource ? `予定：${d.planSource}` : ""}</small>
                                  </>
                                ) : d.state === "planned" ? (
                                  <>
                                    <b className={d.key === todayKey && d.plannedMin > 0 ? "is-warn" : "kt-muted"}>
                                      {d.plannedMin > 0 ? (d.key === todayKey ? "今日はまだ未記入" : "これから") : "休みの予定"}
                                    </b>
                                    <small>{d.planSource ? `予定：${d.planSource}` : ""}</small>
                                  </>
                                ) : (
                                  <b className="kt-muted">{d.business ? "—" : "休み"}</b>
                                )}
                              </span>
                              <span className={`kt-row-hours ${d.state === "done" ? "is-done" : ""}`}>
                                {d.state === "done" ? `${fmtH(d.recordedMin)}h` : d.state === "planned" && d.plannedMin > 0 ? `${fmtH(d.plannedMin)}h` : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="kt-cal">
                        {["月", "火", "水", "木", "金", "土", "日"].map((w, i) => (
                          <span key={w} className={`kt-cal-dow ${i === 6 ? "is-sun" : i === 5 ? "is-sat" : ""}`}>{w}</span>
                        ))}
                        {Array.from({ length: (days[0].date.getDay() + 6) % 7 }, (_, i) => (
                          <span key={`b${i}`} />
                        ))}
                        {days.map((d) => (
                          <button
                            key={d.key}
                            type="button"
                            className={`kt-cell is-${d.state} ${d.key === todayKey ? "is-today" : ""} ${selected?.key === d.key && !bulkTpl ? "is-selected" : ""} ${d.holiday ? "is-holiday" : ""}`}
                            aria-label={`${d.date.getMonth() + 1}月${d.date.getDate()}日`}
                            onClick={() => openDay(d.key)}
                          >
                            <span className={`kt-cell-num ${d.date.getDay() === 0 || d.holiday ? "is-sun" : d.date.getDay() === 6 ? "is-sat" : ""}`}>{d.date.getDate()}</span>
                            <span className="kt-cell-h">
                              {d.state === "done" ? fmtH(d.recordedMin) : d.state === "off" ? "休" : d.holiday ? "祝" : d.state === "planned" && d.plannedMin > 0 ? fmtH(d.plannedMin) : d.state === "missing" ? "!" : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* PC: 右側に選んだ日の記入欄 */}
                  {selected && (
                    <aside className="kt-card kt-side-entry">
                      <EntryForm
                        key={`side-${selected.key}-${selected.record?.id ?? "new"}-${selected.record?.start_time ?? ""}-${selected.record?.is_off ?? ""}-${planKey(planned[selected.key])}-${project?.id ?? ""}`}
                        day={selected}
                        project={project}
                        templates={templates}
                        planned={planned[selected.key]}
                        step={step}
                        saving={saving}
                        onSave={(v) => void saveEntry(selected.key, v)}
                        onOff={(m) => void markOff(selected.key, m)}
                        onClear={() => void clearDay(selected.key)}
                        onSaveTemplate={(l, v) => void saveTemplate(l, v)}
                        memoTemplates={memoTemplates}
                        recentMemos={recentMemos}
                        onSaveMemo={(t) => void saveMemoTemplate(t)}
                      />
                    </aside>
                  )}
                </div>
            </>
          </>
        )}
      </div>

      {/* スマホ: 1日の記入シート */}
      {sheetOpen && selected && (
        <div className="kt-overlay kt-mobile-only" onClick={() => setSheetOpen(false)}>
          <div className="kt-sheet" role="dialog" aria-modal="true" aria-label="1日の勤怠" onClick={(e) => e.stopPropagation()}>
            <span className="kt-handle" aria-hidden="true" />
            <EntryForm
              key={`sheet-${selected.key}-${planKey(planned[selected.key])}`}
              day={selected}
              project={project}
              templates={templates}
              planned={planned[selected.key]}
              step={step}
              saving={saving}
              onSave={(v) => void saveEntry(selected.key, v)}
              onOff={(m) => void markOff(selected.key, m)}
              onClear={() => void clearDay(selected.key)}
              onSaveTemplate={(l, v) => void saveTemplate(l, v)}
              memoTemplates={memoTemplates}
              recentMemos={recentMemos}
              onSaveMemo={(t) => void saveMemoTemplate(t)}
              onClose={() => setSheetOpen(false)}
            />
          </div>
        </div>
      )}

      {simOpen && project && (
        <SimulateSheet
          days={days}
          todayKey={todayKey}
          project={project}
          recordedMin={sum.recordedMin}
          projectedMin={sum.projectedMin}
          onClose={() => setSimOpen(false)}
          onApply={async (keys) => {
            for (const k of keys) await upsertDay(k, { is_off: true });
            setSimOpen(false);
            show(`${keys.length}日を休みにしました`);
          }}
        />
      )}

      {exportOpen && (
        <ExportSheet
          days={days}
          project={project}
          userName={userName}
          month={month}
          onClose={() => setExportOpen(false)}
          show={show}
        />
      )}

      <MobileNavigation />
    </main>
  );
}

/* ── 休んで大丈夫？チェック ── */
function SimulateSheet({
  days,
  todayKey,
  project,
  recordedMin,
  projectedMin,
  onClose,
  onApply,
}: {
  days: DayInfo[];
  todayKey: string;
  project: WorkProject;
  recordedMin: number;
  projectedMin: number;
  onClose: () => void;
  onApply: (keys: string[]) => void | Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const candidates = days.filter((d) => d.state === "planned" && d.plannedMin > 0 && d.key >= todayKey);
  const pickedMin = candidates.filter((d) => picked.includes(d.key)).reduce((s, d) => s + d.plannedMin, 0);
  const after = projectedMin - pickedMin;
  const minMin = project.range_min * 60;
  const remain = candidates.length - picked.length;
  const step = project.rounding_min || 15;
  const need = remain > 0 ? Math.ceil(Math.max(0, minMin - recordedMin) / remain / step) * step : null;
  const usual = workMinutes(project.default_start, project.default_end, project.default_break_min);
  const payBefore = monthlyPay(project, projectedMin);
  const payAfter = monthlyPay(project, after);
  const ok = after >= minMin;
  const margin = after - minMin;
  // あと1日休んだら（いちばん長い見込みの日を休んだとして）
  const nextMax = candidates.filter((d) => !picked.includes(d.key)).reduce((m, d) => Math.max(m, d.plannedMin), 0);

  return (
    <div className="kt-overlay" onClick={onClose}>
      <div className="kt-sheet is-wide" role="dialog" aria-modal="true" aria-label="休んで大丈夫？" onClick={(e) => e.stopPropagation()}>
        <span className="kt-handle" aria-hidden="true" />
        <div className="kt-entry-head">
          <h2>休んで大丈夫？</h2>
          <button type="button" className="kt-close" onClick={onClose}>閉じる</button>
        </div>
        <p className="kt-muted">休みたい日をタップしてください（オレンジ＝休む日）。</p>
        <div className="kt-sim-cal">
          {["月", "火", "水", "木", "金", "土", "日"].map((w) => (
            <span key={w} className="kt-cal-dow">{w}</span>
          ))}
          {Array.from({ length: (days[0].date.getDay() + 6) % 7 }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {days.map((d) => {
            const can = candidates.some((c) => c.key === d.key);
            const on = picked.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                disabled={!can}
                aria-pressed={on}
                className={`kt-sim-day ${on ? "is-on" : ""}`}
                onClick={() => setPicked((p) => (on ? p.filter((k) => k !== d.key) : [...p, d.key]))}
              >
                {d.date.getDate()}
              </button>
            );
          })}
        </div>

        <div className="kt-sim-compare">
          <div>
            <small>いまの見込み</small>
            <b>{fmtH(projectedMin)}h</b>
            {payBefore && <small>{yen(payBefore.total)}</small>}
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <small>{picked.length ? `${picked.length}日休むと` : "休む日を選ぶと"}</small>
            <b className={ok ? "is-accent" : "is-danger"}>{fmtH(after)}h</b>
            {payAfter && <small className={payAfter.deduction ? "is-danger" : ""}>{yen(payAfter.total)}{payAfter.deduction ? `（−${yen(payAfter.deduction)}）` : "（控除なし）"}</small>}
          </div>
        </div>

        <div className={`kt-need ${need !== null && need > usual ? "is-over" : ""}`}>
          <small>下限（{project.range_min}h）に届くには</small>
          <div>
            残り{remain}日を 1日平均 <b>{need === null ? "—" : `${fmtH(need)}h`}</b> 以上
          </div>
          <small>
            いつもの時間は {fmtH(usual)}h。
            {need === null ? "残りの日がありません。" : need > usual ? "いつもより長く働く必要があります。" : "いつもどおり働けば届きます。"}
          </small>
        </div>

        {picked.length > 0 && (
          <p className={`kt-sim-msg ${ok ? "is-ok" : "is-danger"}`}>
            {ok
              ? `大丈夫です。下限まであと${fmtH(margin)}hの余裕があります。${nextMax && margin - nextMax < 0 ? `もう1日休むと${fmtH(nextMax - margin)}h足りなくなります。` : ""}`
              : `下限を${fmtH(-margin)}h下回ります。${payAfter?.deduction ? `控除は約${yen(payAfter.deduction)}です。` : ""}`}
          </p>
        )}

        <div className="kt-entry-actions">
          <button type="button" className="kt-btn is-ghost" onClick={onClose}>見るだけ</button>
          <button type="button" className="kt-btn is-primary" disabled={!picked.length} onClick={() => void onApply(picked)}>
            {picked.length ? `この${picked.length}日を休みにする` : "休みにする"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Excel書き出し ── */
function ExportSheet({
  days,
  project,
  userName,
  month,
  onClose,
  show,
}: {
  days: DayInfo[];
  project: WorkProject | null;
  userName: string;
  month: Date;
  onClose: () => void;
  show: (m: string, t?: ToastItem["type"]) => void;
}) {
  const [includeMoney, setIncludeMoney] = useState(false);
  const [name, setName] = useState(userName);
  const [busy, setBusy] = useState(false);
  const [xts, setXts] = useState<ExportTemplate[]>([]);
  const [choice, setChoice] = useState<string>("standard"); // テンプレートid or "standard"
  const sheet = buildSheet(days, project, { name, includeMoney });

  // 案件の勤怠表テンプレート。前回使ったものを最初に選んでおく
  useEffect(() => {
    if (!project) return;
    let alive = true;
    void loadExportTemplates(project.id).then(({ list }) => {
      if (!alive || !list.length) return;
      setXts(list);
      const last = [...list].sort((a, b) => (b.last_used_at ?? "").localeCompare(a.last_used_at ?? ""))[0];
      setChoice(last.id);
    });
    return () => {
      alive = false;
    };
  }, [project]);
  const chosen = xts.find((t) => t.id === choice) ?? null;

  const fillAndSave = async (list: ExportTemplate[]) => {
    setBusy(true);
    try {
      for (const t of list) await exportWithTemplate(t, month, days, name);
      show(list.length > 1 ? `${list.length}つのファイルを保存しました` : "勤怠表を保存しました");
    } catch {
      show("書き出しに失敗しました", "error");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sheetToTsv([sheet.header, ...sheet.rows]));
      show("表をコピーしました。Excelに貼り付けてください", "info");
    } catch {
      show("コピーできませんでした", "error");
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${month.getMonth() + 1}月`);
      sheet.info.forEach((r) => ws.addRow(r));
      const headerRow = ws.addRow(sheet.header);
      headerRow.font = { bold: true };
      headerRow.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF5F2" } };
      });
      sheet.rows.forEach((r) => ws.addRow(r));
      sheet.footer.forEach((r) => {
        const row = ws.addRow(r);
        row.font = { bold: true };
      });
      ws.getRow(1).font = { bold: true, size: 14 };
      [14, 6, 8, 8, 8, 8, 10, 40].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      ws.getColumn(7).numFmt = "0.00";
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `作業報告書_${month.getFullYear()}${pad2(month.getMonth() + 1)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      show("Excelファイルを保存しました");
    } catch {
      show("書き出しに失敗しました", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kt-overlay" onClick={onClose}>
      <div className="kt-sheet is-wide" role="dialog" aria-modal="true" aria-label="Excelに書き出す" onClick={(e) => e.stopPropagation()}>
        <span className="kt-handle" aria-hidden="true" />
        <div className="kt-entry-head">
          <h2>{month.getMonth() + 1}月の作業報告書</h2>
          <button type="button" className="kt-close" onClick={onClose}>閉じる</button>
        </div>
        {xts.length > 0 && (
          <div className="kt-field">
            <span className="kt-label">書き出す形</span>
            <select className="kt-input" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="書き出す形">
              {xts.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value="standard">標準の作業報告書（このアプリの形）</option>
            </select>
          </div>
        )}
        {(!chosen || chosen.mapping.nameCell) && (
          <label className="kt-field">
            <span className="kt-label">氏名</span>
            <input className="kt-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {chosen && (
          <p className="kt-xt-status is-ok">
            「{chosen.name}」（シート「{chosen.mapping.sheet}」）に{month.getMonth() + 1}月の記録を書き込み、
            <span className="kt-xt-fname">{exportFileName(chosen, month)}</span> で保存します。表の見た目と計算式はそのままです。
          </p>
        )}
        <div className="kt-preview" role="region" aria-label="書き出す表の見本">
          <table>
            <thead>
              <tr>
                {sheet.header.map((h) => (
                  <th key={String(h)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r, i) => (
                <tr key={i} className={r[2] === "稼働" ? "" : "is-off"}>
                  {r.map((c, j) => (
                    <td key={j}>{typeof c === "number" ? c.toFixed(2) : c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              {sheet.footer.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{typeof c === "number" ? (i === 0 ? c.toFixed(2) : `${c.toLocaleString("ja-JP")}円`) : c}</td>
                  ))}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
        {!chosen && project?.monthly_rate ? (
          <label className="kt-check">
            <input type="checkbox" checked={includeMoney} onChange={(e) => setIncludeMoney(e.target.checked)} />
            金額の行も書き出す
          </label>
        ) : null}
        <div className="kt-entry-actions">
          {xts.length > 1 ? (
            <button type="button" className="kt-btn is-ghost" disabled={busy} onClick={() => void fillAndSave(xts)}>
              {xts.length}つとも保存
            </button>
          ) : (
            <button type="button" className="kt-btn is-ghost" onClick={() => void copy()}>表をコピー</button>
          )}
          <button type="button" className="kt-btn is-primary" disabled={busy} onClick={() => void (chosen ? fillAndSave([chosen]) : download())}>
            {busy ? "作成中…" : chosen ? "勤怠表に書き込んで保存" : ".xlsx で保存"}
          </button>
        </div>
        <p className="kt-muted">
          {xts.length
            ? "勤怠表テンプレートは「案件」画面で、案件ごとに登録・変更できます。"
            : "現場の勤怠表をお持ちなら、「案件」画面で登録するとその表に直接書き込めます。"}
        </p>
      </div>
    </div>
  );
}

/* ── 案件とテンプレート ── */
function ProjectsView({
  projects,
  templates,
  month,
  onChanged,
  onTemplateAdded,
  onOpenTemplates,
  show,
}: {
  projects: WorkProject[];
  templates: WorkTemplate[];
  month: Date;
  onChanged: (list: WorkProject[]) => void;
  onTemplateAdded: (t: WorkTemplate) => void;
  onOpenTemplates: () => void;
  show: (m: string, t?: ToastItem["type"]) => void;
}) {
  const current = projectForMonth(projects, month);
  const [draft, setDraft] = useState<ProjectDraft | null>(projects.length === 0 ? blankProject(month) : null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const set = (patch: Partial<ProjectDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    if (!draft) return;
    const rangeMin = numOrNull(draft.rangeMin);
    const rangeMax = numOrNull(draft.rangeMax);
    if (!draft.name.trim() || !draft.startMonth || rangeMin === null || rangeMax === null) {
      show("案件名・開始月・精算幅を入れてください", "error");
      return;
    }
    if (draft.endMonth && draft.endMonth < draft.startMonth) {
      show("終わりの月は、始まりの月より後にしてください", "error");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      start_month: `${draft.startMonth}-01`,
      end_month: draft.endMonth ? `${draft.endMonth}-01` : null,
      range_min: rangeMin,
      range_max: rangeMax,
      rounding_min: numOrNull(draft.roundingMin) ?? 15,
      default_start: draft.defaultStart,
      default_end: draft.defaultEnd,
      default_break_min: numOrNull(draft.defaultBreak) ?? 60,
      monthly_rate: numOrNull(draft.monthlyRate),
      deduction_rate: numOrNull(draft.deductionRate),
      excess_rate: numOrNull(draft.excessRate),
      price_tax: draft.priceTax,
    };
    setSaving(true);
    const write = (body: Record<string, unknown>, cols: string) =>
      draft.id
        ? supabase.from("work_projects").update(body).eq("id", draft.id).select(cols).single()
        : supabase.from("work_projects").insert(body).select(cols).single();
    let res = await write(payload, PROJECT_COLS_TAX);
    if (isMissingColumn(res.error?.code)) {
      // まだ SQL を実行していない：税込・税抜以外を保存して知らせる
      const { price_tax: _omit, ...rest } = payload;
      void _omit;
      res = await write(rest, PROJECT_COLS);
      if (!res.error) show("税込・税抜の設定は supabase-kintai-tax.sql を実行すると保存されます", "info");
    }
    setSaving(false);
    if (res.error) {
      show("保存できませんでした", "error");
      return;
    }
    const row = res.data as unknown as WorkProject;
    const saved = { ...row, range_min: Number(row.range_min), range_max: Number(row.range_max) };
    const list = draft.id ? projects.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...projects];
    onChanged(list.sort((a, b) => (a.start_month < b.start_month ? 1 : -1)));
    // はじめての案件なら、いつもの時間を「通常」テンプレートにしておく
    if (!draft.id && templates.length === 0) {
      const t = await supabase
        .from("work_templates")
        .insert({ label: "通常", start_time: payload.default_start, end_time: payload.default_end, break_min: payload.default_break_min, sort_order: 0 })
        .select("id, label, start_time, end_time, break_min, sort_order")
        .single();
      if (!t.error && t.data) onTemplateAdded(t.data as WorkTemplate);
    }
    setDraft(null);
    show(draft.id ? "案件を更新しました" : "案件を登録しました");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("work_projects").delete().eq("id", id);
    if (error) {
      show("消せませんでした", "error");
      return;
    }
    onChanged(projects.filter((p) => p.id !== id));
    setConfirmDel(null);
    setDraft(null);
    show("案件を削除しました", "info");
  };

  const label = (m: string | null) => (m ? `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月` : "未定");

  return (
    <div className="kt-projects">
      {!draft && (
        <button type="button" className="kt-add" onClick={() => setDraft(blankProject(month, projects[0]))}>
          ＋ 新しい案件を追加
        </button>
      )}

      {draft && (
        <section className="kt-card kt-form">
          <h2>{draft.id ? "案件を編集" : "新しい案件"}</h2>
          <label className="kt-field">
            <span className="kt-label">案件名</span>
            <input className="kt-input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="例：〇〇社 業務システム開発" />
          </label>
          <div className="kt-two">
            <label className="kt-field">
              <span className="kt-label">何月から</span>
              <input className="kt-input" type="month" value={draft.startMonth} onChange={(e) => set({ startMonth: e.target.value })} />
            </label>
            <label className="kt-field">
              <span className="kt-label">何月まで（空なら未定）</span>
              <input className="kt-input" type="month" value={draft.endMonth} onChange={(e) => set({ endMonth: e.target.value })} />
            </label>
          </div>
          <div className="kt-two">
            <label className="kt-field">
              <span className="kt-label">精算幅 下限（h）</span>
              <input className="kt-input" inputMode="decimal" value={draft.rangeMin} onChange={(e) => set({ rangeMin: e.target.value })} />
            </label>
            <label className="kt-field">
              <span className="kt-label">精算幅 上限（h）</span>
              <input className="kt-input" inputMode="decimal" value={draft.rangeMax} onChange={(e) => set({ rangeMax: e.target.value })} />
            </label>
          </div>
          <div className="kt-three">
            <label className="kt-field">
              <span className="kt-label">いつもの開始</span>
              <select className="kt-input" value={draft.defaultStart} onChange={(e) => set({ defaultStart: e.target.value })}>
                {timeOptions(15).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="kt-field">
              <span className="kt-label">いつもの終了</span>
              <select className="kt-input" value={draft.defaultEnd} onChange={(e) => set({ defaultEnd: e.target.value })}>
                {timeOptions(15).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="kt-field">
              <span className="kt-label">休憩</span>
              <select className="kt-input" value={draft.defaultBreak} onChange={(e) => set({ defaultBreak: e.target.value })}>
                {BREAK_CHOICES.map((b) => <option key={b} value={b}>{fmtHM(b)}</option>)}
              </select>
            </label>
          </div>
          <label className="kt-field">
            <span className="kt-label">時間の単位</span>
            <select className="kt-input" value={draft.roundingMin} onChange={(e) => set({ roundingMin: e.target.value })}>
              {[1, 5, 10, 15, 30].map((r) => <option key={r} value={r}>{r}分</option>)}
            </select>
          </label>

          <div className="kt-money">
            <span className="kt-label">お金（任意）</span>
            <div className="kt-tax-toggle" role="radiogroup" aria-label="金額は税抜か税込か">
              {(["excluded", "included"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={draft.priceTax === t}
                  className={`kt-chip ${draft.priceTax === t ? "is-on" : ""}`}
                  onClick={() => set({ priceTax: t })}
                >
                  {t === "excluded" ? "税抜で入力" : "税込で入力"}
                </button>
              ))}
              <small className="kt-muted">注文書・契約書に書いてある方を選んでください。消費税は10%・円未満切り捨てで計算します。</small>
            </div>
            <div className="kt-three">
              <label className="kt-field">
                <small>月額単価（{draft.priceTax === "included" ? "税込" : "税抜"}）</small>
                <input className="kt-input" inputMode="numeric" value={draft.monthlyRate} onChange={(e) => set({ monthlyRate: e.target.value })} placeholder="650000" />
              </label>
              <label className="kt-field">
                <small>控除/h（{draft.priceTax === "included" ? "税込" : "税抜"}）</small>
                <input className="kt-input" inputMode="numeric" value={draft.deductionRate} onChange={(e) => set({ deductionRate: e.target.value })} placeholder="なし" />
              </label>
              <label className="kt-field">
                <small>超過/h（{draft.priceTax === "included" ? "税込" : "税抜"}）</small>
                <input className="kt-input" inputMode="numeric" value={draft.excessRate} onChange={(e) => set({ excessRate: e.target.value })} placeholder="なし" />
              </label>
            </div>
            {numOrNull(draft.monthlyRate) && numOrNull(draft.rangeMin) ? (
              <button
                type="button"
                className="kt-text-btn"
                onClick={() => {
                  const rate = numOrNull(draft.monthlyRate) ?? 0;
                  const min = numOrNull(draft.rangeMin) ?? 1;
                  const max = numOrNull(draft.rangeMax) ?? 1;
                  // 1円未満は切り捨て（例：550,000 ÷ 150h = 3,666円）
                  set({ deductionRate: String(Math.floor(rate / min)), excessRate: String(Math.floor(rate / max)) });
                }}
              >
                控除・超過を「単価 ÷ 下限・上限」で計算する
              </button>
            ) : null}
          </div>

          {draft.id ? (
            <ExportTemplateList projectId={draft.id} show={show} />
          ) : (
            <p className="kt-muted">登録すると、現場の勤怠表（Excel）をこの案件のテンプレートとして追加できます。</p>
          )}

          <div className="kt-entry-actions">
            <button type="button" className="kt-btn is-ghost" onClick={() => setDraft(null)} disabled={projects.length === 0}>やめる</button>
            <button type="button" className="kt-btn is-primary" onClick={() => void save()} disabled={saving}>
              {saving ? "保存中…" : draft.id ? "変更を保存" : "登録する"}
            </button>
          </div>
          {draft.id &&
            (confirmDel === draft.id ? (
              <div className="kt-entry-actions">
                <button type="button" className="kt-btn is-danger" onClick={() => void remove(draft.id as string)}>本当に削除する</button>
                <button type="button" className="kt-btn is-ghost" onClick={() => setConfirmDel(null)}>戻る</button>
              </div>
            ) : (
              <button type="button" className="kt-link-danger" onClick={() => setConfirmDel(draft.id as string)}>この案件を削除</button>
            ))}
        </section>
      )}

      <section className="kt-card">
        <h2 className="kt-section-title">案件</h2>
        {projects.length === 0 ? (
          <p className="kt-plain kt-muted">まだありません。</p>
        ) : (
          <ul className="kt-plist">
            {projects.map((p) => (
              <li key={p.id}>
                <button type="button" className={`kt-prow ${current?.id === p.id ? "is-current" : ""}`} onClick={() => setDraft(draftFromProject(p))}>
                  <span className="kt-row-main">
                    <b>
                      {p.name}
                      {current?.id === p.id && <span className="kt-pill is-ok">この月の案件</span>}
                    </b>
                    <small>
                      {label(p.start_month)} 〜 {label(p.end_month)}
                    </small>
                    <small>
                      精算幅 {p.range_min}〜{p.range_max}h · {hhmm(p.default_start)}〜{hhmm(p.default_end)}
                      {p.monthly_rate ? ` · 月${(p.monthly_rate / 10000).toLocaleString("ja-JP")}万円` : ""}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="kt-card">
        <div className="kt-tpl-head">
          <h2 className="kt-section-title">テンプレート</h2>
          <button type="button" className="kt-text-btn" onClick={onOpenTemplates}>追加・編集 ›</button>
        </div>
        {templates.length === 0 ? (
          <p className="kt-plain kt-muted">まだありません。「追加・編集」から登録できます。</p>
        ) : (
          <p className="kt-plain kt-muted">{templates.map((t) => `${t.label}（${hhmm(t.start_time)}〜${hhmm(t.end_time)}）`).join("、")}</p>
        )}
      </section>
      <p className="kt-plain kt-muted">勤怠のデータは自分だけが見られます（つながっている相手には見えません）。</p>
    </div>
  );
}
