"use client";

// 勤怠のテンプレート（通常・午後から など）の一覧と、追加・編集・削除・並べ替え
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtH, fmtHM, timeOptions, workMinutes, type MemoTemplate, type WorkProject, type WorkTemplate } from "@/lib/kintai";

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
  memoTemplates,
  memoMissing,
  onMemoChange,
  show,
}: {
  templates: WorkTemplate[];
  project: WorkProject | null;
  step: number;
  onChange: (list: WorkTemplate[]) => void;
  memoTemplates: MemoTemplate[];
  memoMissing: boolean;
  onMemoChange: (list: MemoTemplate[]) => void;
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
          <h2 className="kt-section-title">時間</h2>
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
      <MemoSection list={memoTemplates} missing={memoMissing} onChange={onMemoChange} show={show} />
      <p className="kt-plain kt-muted">テンプレートを変えても、すでに記録した日の内容は変わりません。</p>
    </div>
  );
}

/* ── 作業内容のテンプレート ── */
function MemoSection({
  list,
  missing,
  onChange,
  show,
}: {
  list: MemoTemplate[];
  missing: boolean;
  onChange: (list: MemoTemplate[]) => void;
  show: Show;
}) {
  const [draft, setDraft] = useState<{ id?: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const save = async () => {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) {
      show("作業内容を入れてください", "error");
      return;
    }
    if (list.some((m) => m.text === text && m.id !== draft.id)) {
      show("同じ作業内容がもうあります", "error");
      return;
    }
    setSaving(true);
    const res = draft.id
      ? await supabase.from("work_memo_templates").update({ text }).eq("id", draft.id).select("id, text, sort_order").single()
      : await supabase.from("work_memo_templates").insert({ text, sort_order: list.length }).select("id, text, sort_order").single();
    setSaving(false);
    if (res.error || !res.data) {
      show("保存できませんでした", "error");
      return;
    }
    const saved = res.data as MemoTemplate;
    onChange(draft.id ? list.map((m) => (m.id === saved.id ? saved : m)) : [...list, saved]);
    setDraft(null);
    show(draft.id ? "作業内容を更新しました" : `「${text}」を追加しました`);
  };

  const remove = async (m: MemoTemplate) => {
    const { error } = await supabase.from("work_memo_templates").delete().eq("id", m.id);
    if (error) {
      show("消せませんでした", "error");
      return;
    }
    onChange(list.filter((x) => x.id !== m.id));
    setConfirmDel(null);
    show(`「${m.text}」を削除しました`, "info");
  };

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[index], next[j]] = [next[j], next[index]];
    const renumbered = next.map((m, i) => ({ ...m, sort_order: i }));
    onChange(renumbered);
    const changed = renumbered.filter((m, i) => list[i]?.id !== m.id);
    const results = await Promise.all(changed.map((m) => supabase.from("work_memo_templates").update({ sort_order: m.sort_order }).eq("id", m.id)));
    if (results.some((r: { error: unknown }) => r.error)) show("並び順を保存できませんでした", "error");
  };

  const form = draft && (
    <div className="kt-tpl-form">
      <label className="kt-field">
        <span className="kt-label">作業内容</span>
        <input
          className="kt-input"
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && void save()}
          placeholder="例：API改修、レビュー対応、定例MTG"
          autoFocus
        />
      </label>
      <div className="kt-entry-actions">
        <button type="button" className="kt-btn is-ghost" onClick={() => setDraft(null)}>やめる</button>
        <button type="button" className="kt-btn is-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "保存中…" : draft.id ? "変更を保存" : "追加する"}
        </button>
      </div>
    </div>
  );

  return (
    <section className="kt-card">
      <div className="kt-tpl-head">
        <h2 className="kt-section-title">作業内容</h2>
        {!draft && !missing && (
          <button type="button" className="kt-btn is-primary is-small" onClick={() => setDraft({ text: "" })}>
            ＋ 追加
          </button>
        )}
      </div>
      {missing ? (
        <p className="kt-plain kt-muted">Supabase で supabase-kintai-memo.sql を実行すると使えます。</p>
      ) : (
        <>
          <p className="kt-muted kt-tpl-lead">1日の記入でタップすると作業内容に入ります。Excel の「作業内容」の欄に書き出されます。</p>
          {draft && !draft.id && form}
          {list.length === 0 && !draft ? (
            <p className="kt-plain kt-muted">まだありません。1日の記入で作業内容を書いて「この作業内容を保存」でも追加できます。</p>
          ) : (
            <ul className="kt-plist">
              {list.map((m, i) => (
                <li key={m.id} className="kt-tpl-li">
                  {draft?.id === m.id ? (
                    form
                  ) : (
                    <div className="kt-tpl-item">
                      <div className="kt-tpl-order">
                        <button type="button" aria-label={`${m.text}を上へ`} disabled={i === 0} onClick={() => void move(i, -1)}>▲</button>
                        <button type="button" aria-label={`${m.text}を下へ`} disabled={i === list.length - 1} onClick={() => void move(i, 1)}>▼</button>
                      </div>
                      <span className="kt-row-main">
                        <b>{m.text}</b>
                      </span>
                      {confirmDel === m.id ? (
                        <span className="kt-tpl-actions">
                          <button type="button" className="kt-link-danger" onClick={() => void remove(m)}>削除する</button>
                          <button type="button" className="kt-text-btn" onClick={() => setConfirmDel(null)}>戻る</button>
                        </span>
                      ) : (
                        <span className="kt-tpl-actions">
                          <button type="button" className="kt-text-btn" onClick={() => setDraft({ id: m.id, text: m.text })}>編集</button>
                          <button type="button" className="kt-link-danger" onClick={() => setConfirmDel(m.id)}>削除</button>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
