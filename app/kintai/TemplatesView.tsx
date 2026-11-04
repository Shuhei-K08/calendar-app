"use client";

// 勤怠のテンプレート（通常・午後から など）の一覧と、追加・編集・削除・並べ替え
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtH, fmtHM, timeOptions, workMinutes, type WorkProject, type WorkTemplate } from "@/lib/kintai";

type Show = (m: string, t?: "success" | "error" | "info") => void;
type Draft = { id?: string; label: string; start: string; end: string; breakMin: number };

const COLS = "id, label, start_time, end_time, break_min, sort_order";
const BREAKS = [0, 30, 45, 60, 75, 90, 120];
const hhmm = (t: string) => t.slice(0, 5);

export default function TemplatesView({
  templates,
  project,
  step,
  onChange,
  show,
}: {
  templates: WorkTemplate[];
  project: WorkProject | null;
  step: number;
  onChange: (list: WorkTemplate[]) => void;
  show: Show;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const options = timeOptions(step);

  const startNew = () =>
    setDraft({
      label: "",
      start: hhmm(project?.default_start ?? "10:00"),
      end: hhmm(project?.default_end ?? "19:00"),
      breakMin: project?.default_break_min ?? 60,
    });

  const save = async () => {
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) {
      show("名前を入れてください", "error");
      return;
    }
    setSaving(true);
    const payload = { label, start_time: draft.start, end_time: draft.end, break_min: draft.breakMin };
    const res = draft.id
      ? await supabase.from("work_templates").update(payload).eq("id", draft.id).select(COLS).single()
      : await supabase.from("work_templates").insert({ ...payload, sort_order: templates.length }).select(COLS).single();
    setSaving(false);
    if (res.error || !res.data) {
      show("保存できませんでした", "error");
      return;
    }
    const saved = res.data as WorkTemplate;
    onChange(draft.id ? templates.map((t) => (t.id === saved.id ? saved : t)) : [...templates, saved]);
    setDraft(null);
    show(draft.id ? `「${label}」を更新しました` : `「${label}」を追加しました`);
  };

  const remove = async (t: WorkTemplate) => {
    const { error } = await supabase.from("work_templates").delete().eq("id", t.id);
    if (error) {
      show("消せませんでした", "error");
      return;
    }
    onChange(templates.filter((x) => x.id !== t.id));
    setConfirmDel(null);
    if (draft?.id === t.id) setDraft(null);
    show(`「${t.label}」を削除しました`, "info");
  };

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= templates.length) return;
    const list = [...templates];
    [list[index], list[j]] = [list[j], list[index]];
    const renumbered = list.map((t, i) => ({ ...t, sort_order: i }));
    onChange(renumbered);
    const changed = renumbered.filter((t, i) => templates[i]?.id !== t.id);
    const results = await Promise.all(changed.map((t) => supabase.from("work_templates").update({ sort_order: t.sort_order }).eq("id", t.id)));
    if (results.some((r: { error: unknown }) => r.error)) show("並び順を保存できませんでした", "error");
  };

  const form = draft && (
    <div className="kt-tpl-form">
      <label className="kt-field">
        <span className="kt-label">名前</span>
        <input
          className="kt-input"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="例：通常、午後から、出社日"
          autoFocus
        />
      </label>
      <div className="kt-three">
        <label className="kt-field">
          <span className="kt-label">開始</span>
          <select className="kt-input" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })}>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="kt-field">
          <span className="kt-label">終了</span>
          <select className="kt-input" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })}>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="kt-field">
          <span className="kt-label">休憩</span>
          <select className="kt-input" value={draft.breakMin} onChange={(e) => setDraft({ ...draft, breakMin: Number(e.target.value) })}>
            {BREAKS.map((b) => <option key={b} value={b}>{b ? fmtHM(b) : "なし"}</option>)}
          </select>
        </label>
      </div>
      <p className="kt-muted">稼働 {fmtH(workMinutes(draft.start, draft.end, draft.breakMin))}h</p>
      <div className="kt-entry-actions">
        <button type="button" className="kt-btn is-ghost" onClick={() => setDraft(null)}>やめる</button>
        <button type="button" className="kt-btn is-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "保存中…" : draft.id ? "変更を保存" : "追加する"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="kt-projects">
      <section className="kt-card">
        <div className="kt-tpl-head">
          <h2 className="kt-section-title">テンプレート</h2>
          {!draft && (
            <button type="button" className="kt-btn is-primary is-small" onClick={startNew}>
              ＋ 追加
            </button>
          )}
        </div>
        <p className="kt-muted kt-tpl-lead">よく使う時間を登録しておくと、1日の記入やカレンダーの「まとめて入力」でワンタップで入れられます。</p>

        {draft && !draft.id && form}

        {templates.length === 0 && !draft ? (
          <p className="kt-plain kt-muted">まだありません。「＋ 追加」から登録できます。</p>
        ) : (
          <ul className="kt-plist">
            {templates.map((t, i) => (
              <li key={t.id} className="kt-tpl-li">
                {draft?.id === t.id ? (
                  form
                ) : (
                  <div className="kt-tpl-item">
                    <div className="kt-tpl-order">
                      <button type="button" aria-label={`${t.label}を上へ`} disabled={i === 0} onClick={() => void move(i, -1)}>▲</button>
                      <button type="button" aria-label={`${t.label}を下へ`} disabled={i === templates.length - 1} onClick={() => void move(i, 1)}>▼</button>
                    </div>
                    <span className="kt-row-main">
                      <b>{t.label}</b>
                      <small>
                        {hhmm(t.start_time)}〜{hhmm(t.end_time)} · 休憩 {t.break_min ? fmtHM(t.break_min) : "なし"} · {fmtH(workMinutes(t.start_time, t.end_time, t.break_min))}h
                      </small>
                    </span>
                    {confirmDel === t.id ? (
                      <span className="kt-tpl-actions">
                        <button type="button" className="kt-link-danger" onClick={() => void remove(t)}>削除する</button>
                        <button type="button" className="kt-text-btn" onClick={() => setConfirmDel(null)}>戻る</button>
                      </span>
                    ) : (
                      <span className="kt-tpl-actions">
                        <button
                          type="button"
                          className="kt-text-btn"
                          onClick={() => setDraft({ id: t.id, label: t.label, start: hhmm(t.start_time), end: hhmm(t.end_time), breakMin: t.break_min })}
                        >
                          編集
                        </button>
                        <button type="button" className="kt-link-danger" onClick={() => setConfirmDel(t.id)}>削除</button>
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="kt-plain kt-muted">テンプレートを変えても、すでに記録した日の時間は変わりません。</p>
    </div>
  );
}
