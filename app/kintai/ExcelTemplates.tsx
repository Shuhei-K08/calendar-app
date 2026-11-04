"use client";

// 現場の勤怠表（Excel）をテンプレートとして登録し、その表に1か月分を書き込む
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtH, isBusinessDay, pad2, workMinutes, type DayInfo } from "@/lib/kintai";
import type { DayWrite, DetectResult, TemplateMapping } from "@/lib/xlsxTemplate";

export type ExportTemplate = {
  id: string;
  project_id: string;
  name: string;
  file_name: string;
  storage_path: string;
  mapping: TemplateMapping;
  last_used_at: string | null;
  created_at: string;
};

type Show = (m: string, t?: "success" | "error" | "info") => void;

const BUCKET = "work-templates";
const COLS = "id, project_id, name, file_name, storage_path, mapping, last_used_at, created_at";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const lib = () => import("@/lib/xlsxTemplate");
const thisMonth = () => new Date(Date.now());

/** 案件のテンプレート一覧（よく使う順） */
export async function loadExportTemplates(projectId: string): Promise<{ list: ExportTemplate[]; missing: boolean }> {
  const { data, error } = await supabase.from("work_export_templates").select(COLS).eq("project_id", projectId).order("created_at");
  if (error) return { list: [], missing: error.code === "42P01" || error.code === "PGRST205" };
  return { list: (data ?? []) as ExportTemplate[], missing: false };
}

const downloadOriginal = async (t: ExportTemplate) => {
  const { data, error } = await supabase.storage.from(BUCKET).download(t.storage_path);
  if (error || !data) throw new Error("テンプレートのファイルを読み込めませんでした");
  return new Uint8Array(await (data as Blob).arrayBuffer());
};

const saveBlob = (bytes: Uint8Array | ArrayBuffer, fileName: string) => {
  const blob = new Blob([bytes as BlobPart], { type: XLSX_TYPE });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/** 元のファイル名から、書き出すファイル名のひな形を作る。
 *  「202610」「2026年10月」「0000年00月」「YYYY-MM」などを {年}{月} にし、無ければ末尾に付ける */
export const suggestFileName = (original: string) => {
  const base = original.replace(/\.xlsx$/i, "");
  const re = /(0000|YYYY|yyyy|20\d{2})([-_.年]?)(00|MM|mm|0[1-9]|1[0-2])(?!\d)/;
  return re.test(base) ? base.replace(re, (_m, _y, sep: string) => `{年}${sep}{月}`) : `${base}_{年}{月}`;
};

/** ひな形の {年}{月} を書き出す月にして、ファイル名にする */
export const outputFileName = (pattern: string, month: Date) => {
  const name = (pattern.trim() || "勤怠表_{年}{月}")
    .replace(/\{年\}/g, String(month.getFullYear()))
    .replace(/\{月\}/g, pad2(month.getMonth() + 1))
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.xlsx$/i, "");
  return `${name}.xlsx`;
};

/** テンプレートの書き出しファイル名（設定が無い古いものは元のファイル名から作る） */
export const exportFileName = (t: ExportTemplate, month: Date) => outputFileName(t.mapping.fileName || suggestFileName(t.file_name), month);

/** 画面の1か月分 → 書き込む内容 */
export const toDayWrites = (days: DayInfo[]): DayWrite[] =>
  days.flatMap((d) => {
    const r = d.record;
    if (!r) return [];
    return [
      {
        day: d.date.getDate(),
        start: r.is_off ? null : (r.start_time ?? "").slice(0, 5) || null,
        end: r.is_off ? null : (r.end_time ?? "").slice(0, 5) || null,
        breakMin: r.break_min,
        off: r.is_off,
        business: d.business,
        memo: r.memo,
      },
    ];
  });

/** テンプレートに書き込んで保存する */
export async function exportWithTemplate(t: ExportTemplate, month: Date, days: DayInfo[], name: string) {
  const { fillTemplate } = await lib();
  const original = await downloadOriginal(t);
  const out = await fillTemplate(original, t.mapping, month, toDayWrites(days), { name });
  saveBlob(out, exportFileName(t, month));
  await supabase.from("work_export_templates").update({ last_used_at: new Date(Date.now()).toISOString() }).eq("id", t.id);
}


/* ── ダミーデータで試す ── */
export type DummyResult = { fileName: string; workDays: number; totalMin: number; checks: string[]; noBreakCol: boolean };

/** 今月の平日にダミーの勤怠を入れる。最初の4日はわざと形を変えて、表の動きを確かめやすくする */
const dummyDays = (month: Date) => {
  const y = month.getFullYear();
  const m = month.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const patterns = [
    { start: "10:00", end: "19:00", breakMin: 60, memo: "テスト：通常", note: "10:00〜19:00・休憩1:00 → 8.0h" },
    { start: "13:00", end: "19:00", breakMin: 0, memo: "テスト：午後から", note: "13:00〜19:00・休憩なし → 6.0h" },
    { off: true, memo: "有給（テスト）", note: "休み（有給）→ 時刻は空欄" },
    { start: "09:00", end: "22:30", breakMin: 60, memo: "テスト：残業", note: "9:00〜22:30・休憩1:00 → 12.5h" },
  ] as const;
  const days: DayWrite[] = [];
  const checks: string[] = [];
  let n = 0;
  for (let day = 1; day <= last; day++) {
    const date = new Date(y, m, day);
    if (!isBusinessDay(date)) continue;
    const p = patterns[n] ?? { start: "10:00", end: "19:00", breakMin: 60, memo: "テスト入力", note: "" };
    if (n < patterns.length) checks.push(`${m + 1}/${day}　${p.note}`);
    n++;
    if ("off" in p) days.push({ day, start: null, end: null, breakMin: 0, off: true, business: true, memo: p.memo });
    else days.push({ day, start: p.start, end: p.end, breakMin: p.breakMin, off: false, business: true, memo: p.memo });
  }
  return { days, checks };
};

/** ダミーで書き込んだテスト用ファイルを保存する（登録前の設定でも試せる） */
export async function runDummyTest(bytes: Uint8Array, mapping: TemplateMapping, originalName: string): Promise<DummyResult> {
  const { fillTemplate } = await lib();
  const month = new Date(Date.now());
  const { days, checks } = dummyDays(month);
  const out = await fillTemplate(bytes, mapping, month, days, { name: "テスト 太郎" });
  const fileName = `【テスト】${outputFileName(mapping.fileName || suggestFileName(originalName), month)}`;
  saveBlob(out, fileName);
  const worked = days.filter((d) => !d.off);
  return {
    fileName,
    workDays: worked.length,
    totalMin: worked.reduce((sum, d) => sum + workMinutes(d.start, d.end, d.breakMin), 0),
    checks,
    noBreakCol: !mapping.cols.break,
  };
}

export function DummyResultBox({ result, onClose }: { result: DummyResult; onClose: () => void }) {
  return (
    <div className="kt-xt-test" role="status">
      <div className="kt-xt-test-head">
        <b>テスト用ファイルを保存しました</b>
        <button type="button" className="kt-text-btn" onClick={onClose}>閉じる</button>
      </div>
      <small>{result.fileName}</small>
      <p>Excel で開いて、次のようになっていれば成功です。</p>
      <ul>
        {result.checks.map((c) => (
          <li key={c}>{c}</li>
        ))}
        <li>
          合計：{result.workDays}日・<b>{fmtH(result.totalMin)}h</b>
          {result.noBreakCol ? "（休憩の列が無い表なので、表の計算で少し変わることがあります）" : ""}
        </li>
        <li>年・月が今月、氏名（書く設定のとき）が「テスト 太郎」</li>
      </ul>
      <p className="kt-muted">ずれていたら「設定」で列や行を直して、もう一度試してください。登録したテンプレートの中身は変わりません。</p>
    </div>
  );
}

/* ── 案件の編集画面に出す一覧 ── */
export function ExportTemplateList({ projectId, show }: { projectId: string; show: Show }) {
  const [list, setList] = useState<ExportTemplate[]>([]);
  const [missing, setMissing] = useState(false);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [reading, setReading] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<DummyResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void loadExportTemplates(projectId).then((r) => {
      if (!alive) return;
      setList(r.list);
      setMissing(r.missing);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const pickFile = async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      show(".xlsx のファイルを選んでください（.xls や .xlsm は使えません）", "error");
      return;
    }
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { detectTemplate, listSheets, blankMapping, sheetGrid } = await lib();
      try {
        const detected = await detectTemplate(bytes);
        setSetup({ bytes, fileName: file.name, name: "", detected, mapping: { ...detected.mapping, fileName: suggestFileName(file.name) }, auto: true });
      } catch {
        const sheets = await listSheets(bytes);
        const mapping = blankMapping(sheets[0] ?? "");
        const grid = await sheetGrid(bytes, mapping.sheet, 1, 40);
        setSetup({
          bytes,
          fileName: file.name,
          name: "",
          detected: { sheets, mapping, found: {}, grid },
          mapping: { ...mapping, fileName: suggestFileName(file.name) },
          auto: false,
        });
      }
    } catch {
      show("このファイルは読み込めませんでした", "error");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const testTemplate = async (t: ExportTemplate) => {
    setTesting(t.id);
    try {
      setTestResult(await runDummyTest(await downloadOriginal(t), t.mapping, t.file_name));
    } catch {
      show("テストの書き出しに失敗しました", "error");
    } finally {
      setTesting(null);
    }
  };

  const editMapping = async (t: ExportTemplate) => {
    setReading(true);
    try {
      const bytes = await downloadOriginal(t);
      const { listSheets, sheetGrid } = await lib();
      const sheets = await listSheets(bytes);
      const grid = await sheetGrid(bytes, t.mapping.sheet, Math.max(1, t.mapping.firstRow - 6), t.mapping.firstRow + 31);
      setSetup({ bytes, fileName: t.file_name, name: t.name, detected: { sheets, mapping: t.mapping, found: {}, grid }, mapping: { ...t.mapping, fileName: t.mapping.fileName || suggestFileName(t.file_name) }, auto: false, editing: t });
    } catch {
      show("テンプレートを開けませんでした", "error");
    } finally {
      setReading(false);
    }
  };

  const remove = async (t: ExportTemplate) => {
    const { error } = await supabase.from("work_export_templates").delete().eq("id", t.id);
    if (error) {
      show("消せませんでした", "error");
      return;
    }
    await supabase.storage.from(BUCKET).remove([t.storage_path]);
    setList((l) => l.filter((x) => x.id !== t.id));
    setConfirmDel(null);
    show("テンプレートを削除しました", "info");
  };

  return (
    <div className="kt-xt">
      <span className="kt-label">勤怠表テンプレート（現場の Excel）</span>
      {missing ? (
        <p className="kt-muted">Supabase で supabase-kintai.sql の最後の部分（勤怠表テンプレート）を実行すると使えます。</p>
      ) : (
        <>
          {list.length > 0 && (
            <ul className="kt-xt-list">
              {list.map((t) => (
                <li key={t.id}>
                  <span className="kt-xt-icon" aria-hidden="true">X</span>
                  <span className="kt-row-main">
                    <b>{t.name}</b>
                    <small>
                      {t.file_name} · シート「{t.mapping.sheet}」
                    </small>
                  </span>
                  {confirmDel === t.id ? (
                    <>
                      <button type="button" className="kt-link-danger" onClick={() => void remove(t)}>削除する</button>
                      <button type="button" className="kt-text-btn" onClick={() => setConfirmDel(null)}>戻る</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="kt-text-btn" disabled={testing === t.id} onClick={() => void testTemplate(t)}>
                        {testing === t.id ? "作成中…" : "試す"}
                      </button>
                      <button type="button" className="kt-text-btn" onClick={() => void editMapping(t)}>設定</button>
                      <button type="button" className="kt-link-danger" onClick={() => setConfirmDel(t.id)}>削除</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {testResult && <DummyResultBox result={testResult} onClose={() => setTestResult(null)} />}
          <button type="button" className="kt-btn is-ghost kt-xt-add" disabled={reading} onClick={() => fileRef.current?.click()}>
            {reading ? "読み込み中…" : "＋ Excel を登録"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickFile(f);
            }}
          />
          <p className="kt-muted">現場で使っている勤怠表をそのまま登録すると、書き出すときにその表へ自動で書き込みます。見た目や計算式はそのまま残ります。</p>
        </>
      )}

      {setup && (
        <TemplateSetupSheet
          state={setup}
          projectId={projectId}
          onClose={() => setSetup(null)}
          onSaved={(t) => {
            setList((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [...l, t]));
            setSetup(null);
            show(setup.editing ? "テンプレートを更新しました" : "テンプレートを登録しました");
          }}
          show={show}
        />
      )}
    </div>
  );
}

/* ── 「どこに書き込むか」の確認画面 ── */
type SetupState = {
  bytes: Uint8Array;
  fileName: string;
  name: string;
  detected: DetectResult;
  mapping: TemplateMapping;
  auto: boolean; // 自動で見つけられたか
  editing?: ExportTemplate;
};

const COL_FIELDS: { key: keyof TemplateMapping["cols"]; label: string; color: string; required?: boolean }[] = [
  { key: "start", label: "開始時刻", color: "#0f7a66", required: true },
  { key: "end", label: "終了時刻", color: "#1e3a8a", required: true },
  { key: "break", label: "休憩", color: "#b5482a" },
  { key: "memo", label: "作業内容", color: "#7c3aed" },
  { key: "note", label: "備考", color: "#a16207" },
  { key: "kind", label: "勤怠区分", color: "#be185d" },
];
const CELL_FIELDS: { key: "yearCell" | "monthCell" | "nameCell"; label: string }[] = [
  { key: "yearCell", label: "年" },
  { key: "monthCell", label: "月" },
  { key: "nameCell", label: "氏名" },
];

const cleanCol = (v: string) => v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || null;
const cleanCell = (v: string) => {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{1,3}\d{1,5}$/.test(s) ? s : null;
};

function TemplateSetupSheet({
  state,
  projectId,
  onClose,
  onSaved,
  show,
}: {
  state: SetupState;
  projectId: string;
  onClose: () => void;
  onSaved: (t: ExportTemplate) => void;
  show: Show;
}) {
  const [name, setName] = useState(state.name);
  const [map, setMap] = useState<TemplateMapping>(state.mapping);
  const [grid, setGrid] = useState(state.detected.grid);
  const [saving, setSaving] = useState(false);
  // 入力途中の文字（「A」→「AK」のように打てるよう、確定前の文字を持っておく）
  const [texts, setTexts] = useState<Record<string, string>>({});

  const setCol = (key: keyof TemplateMapping["cols"], v: string) => {
    setTexts((t) => ({ ...t, [key]: v }));
    setMap((m) => ({ ...m, cols: { ...m.cols, [key]: cleanCol(v) } }));
  };
  const setCellField = (key: "yearCell" | "monthCell" | "nameCell", v: string) => {
    setTexts((t) => ({ ...t, [key]: v }));
    setMap((m) => ({ ...m, [key]: cleanCell(v) }));
  };

  const changeSheet = async (sheet: string) => {
    setMap((m) => ({ ...m, sheet }));
    try {
      const { sheetGrid } = await lib();
      setGrid(await sheetGrid(state.bytes, sheet, Math.max(1, map.firstRow - 6), Math.max(map.firstRow, 1) + 31));
    } catch {
      /* プレビューが出せなくても設定は続けられる */
    }
  };

  const changeFirstRow = async (v: string) => {
    const n = Math.max(1, Math.min(9999, Number(v) || 1));
    setMap((m) => ({ ...m, firstRow: n }));
    if (n < grid.startRow || n > grid.startRow + grid.rows.length - 10) {
      try {
        const { sheetGrid } = await lib();
        setGrid(await sheetGrid(state.bytes, map.sheet, Math.max(1, n - 6), n + 31));
      } catch {
        /* そのまま */
      }
    }
  };

  const valid = !!(map.sheet && map.firstRow && map.cols.start && map.cols.end && name.trim());
  const [testResult, setTestResult] = useState<DummyResult | null>(null);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    try {
      setTestResult(await runDummyTest(state.bytes, map, state.fileName));
    } catch {
      show("テストの書き出しに失敗しました。行と列を確認してください", "error");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!valid) {
      show("名前・シート・1日の行・開始と終了の列を入れてください", "error");
      return;
    }
    setSaving(true);
    try {
      if (state.editing) {
        const { data, error } = await supabase
          .from("work_export_templates")
          .update({ name: name.trim(), mapping: map })
          .eq("id", state.editing.id)
          .select(COLS)
          .single();
        if (error) throw error;
        onSaved(data as ExportTemplate);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("no user");
      const id = crypto.randomUUID();
      const path = `${user.id}/${id}.xlsx`;
      const up = await supabase.storage.from(BUCKET).upload(path, new Blob([state.bytes as BlobPart], { type: XLSX_TYPE }), { contentType: XLSX_TYPE, upsert: false });
      if (up.error) throw up.error;
      const { data, error } = await supabase
        .from("work_export_templates")
        .insert({ id, project_id: projectId, name: name.trim(), file_name: state.fileName, storage_path: path, mapping: map })
        .select(COLS)
        .single();
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      onSaved(data as ExportTemplate);
    } catch {
      show("保存できませんでした", "error");
    } finally {
      setSaving(false);
    }
  };

  // プレビューで色を付ける列
  const colColor = new Map<string, { color: string; label: string }>();
  for (const f of COL_FIELDS) {
    const c = map.cols[f.key];
    if (c && !colColor.has(c)) colColor.set(c, { color: f.color, label: f.label });
  }
  const cellLabel = new Map<string, string>();
  for (const f of CELL_FIELDS) if (map[f.key]) cellLabel.set(map[f.key] as string, f.label);
  const colLetters = grid.rows[0]?.map((_, i) => numToColLocal(grid.startCol + i)) ?? [];
  const shownRows = grid.rows.slice(0, Math.max(0, map.firstRow - grid.startRow) + 8);

  return (
    <div className="kt-overlay" onClick={onClose}>
      <div className="kt-sheet is-wide kt-xt-setup" role="dialog" aria-modal="true" aria-label="どこに書き込むか確認" onClick={(e) => e.stopPropagation()}>
        <span className="kt-handle" aria-hidden="true" />
        <div className="kt-entry-head">
          <h2>{state.editing ? "書き込む場所の設定" : "書き込む場所の確認"}</h2>
          <button type="button" className="kt-close" onClick={onClose}>閉じる</button>
        </div>

        <p className={`kt-xt-status ${state.auto ? "is-ok" : "is-warn"}`}>
          {state.editing
            ? "色の付いた列に書き込みます。違っていたら直してください。"
            : state.auto
              ? "見出しから書き込む場所を見つけました。色の付いた列が合っているか確認してください。"
              : "書き込む場所を見つけられませんでした。下の表を見ながら、行と列を入れてください。"}
        </p>

        <label className="kt-field">
          <span className="kt-label">テンプレートの名前（書き出すときのボタンに出ます）</span>
          <input className="kt-input" value={name} maxLength={20} placeholder="例：A社 勤怠表" onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="kt-field">
          <span className="kt-label">書き出すファイル名（{"{年}"}{"{月}"} が書き出す月になります）</span>
          <input className="kt-input" value={map.fileName ?? ""} onChange={(e) => setMap((m) => ({ ...m, fileName: e.target.value }))} />
          <small className="kt-muted kt-xt-fname">例：{outputFileName(map.fileName ?? "", thisMonth())}</small>
        </label>

        <div className="kt-two">
          <label className="kt-field">
            <span className="kt-label">シート</span>
            <select className="kt-input" value={map.sheet} onChange={(e) => void changeSheet(e.target.value)}>
              {state.detected.sheets.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="kt-field">
            <span className="kt-label">1日の行</span>
            <input className="kt-input" inputMode="numeric" value={map.firstRow || ""} onChange={(e) => void changeFirstRow(e.target.value)} />
          </label>
        </div>

        <div className="kt-xt-fields">
          {COL_FIELDS.map((f) => (
            <label key={f.key} className="kt-field">
              <span className="kt-label">
                <i className="kt-xt-dot" style={{ background: f.color }} aria-hidden="true" />
                {f.label}の列{f.required ? "" : "（任意）"}
              </span>
              <input
                className="kt-input"
                value={texts[f.key] ?? map.cols[f.key] ?? ""}
                placeholder={f.required ? "例：D" : f.key === "note" ? "なし（休みの理由も作業内容へ）" : "なし"}
                onChange={(e) => setCol(f.key, e.target.value)}
                autoCapitalize="characters"
              />
            </label>
          ))}
          {CELL_FIELDS.map((f) => (
            <label key={f.key} className="kt-field">
              <span className="kt-label">{f.label}のセル（任意）</span>
              <input
                className="kt-input"
                value={texts[f.key] ?? map[f.key] ?? ""}
                placeholder={f.key === "nameCell" ? "書かない" : "例：A1"}
                onChange={(e) => setCellField(f.key, e.target.value)}
                autoCapitalize="characters"
              />
            </label>
          ))}
        </div>

        {map.cols.kind && (
          <div className="kt-three">
            <label className="kt-field">
              <span className="kt-label">働いた日</span>
              <input className="kt-input" value={map.kindWork} onChange={(e) => setMap((m) => ({ ...m, kindWork: e.target.value }))} />
            </label>
            <label className="kt-field">
              <span className="kt-label">平日に休んだ日</span>
              <input className="kt-input" value={map.kindOff} onChange={(e) => setMap((m) => ({ ...m, kindOff: e.target.value }))} placeholder="書かない" />
            </label>
            <label className="kt-field">
              <span className="kt-label">メモが有給・年休</span>
              <input className="kt-input" value={map.kindPaid} onChange={(e) => setMap((m) => ({ ...m, kindPaid: e.target.value }))} placeholder="上と同じ" />
            </label>
          </div>
        )}

        {!map.cols.break && (
          <p className="kt-muted">この表には休憩の列がありません。休憩は表の中の計算に任せます（アプリの合計と少しずれることがあります）。</p>
        )}

        <div className="kt-xt-grid" role="region" aria-label={`シート「${grid.sheet}」の見本`}>
          <table>
            <thead>
              <tr>
                <th />
                {colLetters.map((c) => (
                  <th key={c} style={colColor.get(c) ? { background: colColor.get(c)?.color, color: "#fff" } : undefined} title={colColor.get(c)?.label}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownRows.map((row, i) => {
                const r = grid.startRow + i;
                const day = r - map.firstRow + 1;
                return (
                  <tr key={r} className={day === 1 ? "is-first" : ""}>
                    <th>{day >= 1 && day <= 31 ? `${r}（${day}日）` : r}</th>
                    {row.map((v, j) => {
                      const col = colLetters[j];
                      const tag = colColor.get(col);
                      const cl = cellLabel.get(`${col}${r}`);
                      const inBody = r >= map.firstRow && r < map.firstRow + 31;
                      return (
                        <td
                          key={j}
                          className={cl ? "is-cell" : ""}
                          style={tag && inBody ? { background: `color-mix(in srgb, ${tag.color} 14%, #fff)` } : undefined}
                        >
                          {cl ? <b>{cl}</b> : v}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="kt-muted">「＝」は計算式のセルです。計算式のセルには書き込みません。</p>

        {testResult ? (
          <DummyResultBox result={testResult} onClose={() => setTestResult(null)} />
        ) : (
          <button type="button" className="kt-btn is-ghost kt-xt-try" disabled={!valid || testing} onClick={() => void test()}>
            {testing ? "作成中…" : "ダミーデータで試す（テスト用ファイルを保存）"}
          </button>
        )}

        <div className="kt-entry-actions">
          <button type="button" className="kt-btn is-ghost" onClick={onClose}>やめる</button>
          <button type="button" className="kt-btn is-primary" disabled={!valid || saving} onClick={() => void save()}>
            {saving ? "保存中…" : state.editing ? "設定を保存" : "この設定で登録"}
          </button>
        </div>
      </div>
    </div>
  );
}

const numToColLocal = (n: number) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
