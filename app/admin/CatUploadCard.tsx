"use client";

// 管理画面：ねこの絵を追加する（背景を消して PNG にし、Storage の cat-sprites に置く）
//  - 追加した絵は、みんなの画面に遊びに来るようになり、ねこ図鑑にも並ぶ
//  - 「止める」と出なくなり、図鑑からも隠れる（見つけた記録は残る）
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CAT_NAMES, CAT_SPRITE_BUCKET, loadCustomSprites, nextCustomNo, previewCat, spriteNoLabel, type CatKey } from "@/lib/catVisitor";
import { CAT_SPRITES_CHANGED, useCatSprites } from "@/lib/useCatSprites";

type Season = "" | "xmas" | "newyear";
const SEASONS: { value: Season; label: string }[] = [
  { value: "", label: "いつでも" },
  { value: "xmas", label: "クリスマス限定" },
  { value: "newyear", label: "お正月限定" },
];
const SEASON_LABEL = { xmas: "クリスマス限定", newyear: "お正月限定" } as const;
const MAX_WORK = 900; // 背景を消すときの大きさ（これより大きい絵は縮めてから）
const MAX_OUT = 420; // できあがりの大きさ（長いほうの辺）

/** 背景を消す：四隅の色に近く、ふちからつながっている部分を透明にする。境目は少しぼかす */
function removeBackground(src: ImageData, tolerance: number): ImageData {
  const { width: w, height: h } = src;
  const d = new Uint8ClampedArray(src.data);
  const px = (x: number, y: number) => (y * w + x) * 4;
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + d[i + c], 0) / 4);
  const dist = (i: number) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
  const isBg = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const k = y * w + x;
    if (isBg[k]) return;
    const i = k * 4;
    if (d[i + 3] < 16 || dist(i) <= tolerance) {
      isBg[k] = 1;
      stack.push(k);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const k = stack.pop() as number;
    const x = k % w;
    const y = (k - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const i = k * 4;
      if (isBg[k]) {
        d[i + 3] = 0;
        continue;
      }
      // 背景のとなりは、背景の色に近いほど薄く
      const edge = (x > 0 && isBg[k - 1]) || (x < w - 1 && isBg[k + 1]) || (y > 0 && isBg[k - w]) || (y < h - 1 && isBg[k + w]);
      if (edge) d[i + 3] = Math.min(d[i + 3], Math.max(0, Math.min(255, ((dist(i) - tolerance * 0.3) * 255) / (tolerance * 1.3 + 1))));
    }
  }
  dropSpecks(d, w, h);
  return new ImageData(d, w, h);
}

/** 離れた小さなかけら（文字やゴミ）を消す：いちばん大きいかたまりの2%より小さいものは透明に */
function dropSpecks(d: Uint8ClampedArray, w: number, h: number) {
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || d[start * 4 + 3] <= 8) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop() as number;
      size++;
      const x = k % w;
      const next = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w];
      for (const n of next) {
        if (n < 0 || n >= w * h || label[n] !== -1 || d[n * 4 + 3] <= 8) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    sizes.push(size);
  }
  if (sizes.length < 2) return;
  const min = Math.max(...sizes) * 0.02;
  for (let k = 0; k < w * h; k++) if (label[k] >= 0 && sizes[label[k]] < min) d[k * 4 + 3] = 0;
}

/** まわりの透明な部分を切り落として、ちょうどいい大きさの PNG にする */
function finish(img: ImageData): HTMLCanvasElement | null {
  const { width: w, height: h, data } = img;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  full.getContext("2d")?.putImageData(img, 0, 0);
  const scale = Math.min(1, MAX_OUT / Math.max(cw, ch));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * scale));
  out.height = Math.max(1, Math.round(ch * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out;
}

type Rect = { x: number; y: number; w: number; h: number };
type Handle = "move" | "new" | "nw" | "ne" | "sw" | "se";
const MIN_CROP = 12;

/** 切り取る範囲を決める：ドラッグで囲む／枠をドラッグで動かす／四隅で大きさを変える */
function CropBox({ url, width, height, value, onChange }: { url: string; width: number; height: number; value: Rect; onChange: (r: Rect) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Rect>(value);
  const drag = useRef<{ mode: Handle; sx: number; sy: number; start: Rect } | null>(null);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const toPx = (clientX: number, clientY: number) => {
    const b = ref.current?.getBoundingClientRect();
    if (!b) return { x: 0, y: 0 };
    return { x: clamp(((clientX - b.left) / b.width) * width, 0, width), y: clamp(((clientY - b.top) / b.height) * height, 0, height) };
  };
  const begin = (e: React.PointerEvent, handle: Handle) => {
    // 範囲が絵の全体のとき（最初）は、枠の中をドラッグしても新しく囲む
    const mode: Handle = handle === "move" && draft.w >= width - 1 && draft.h >= height - 1 ? "new" : handle;
    e.preventDefault();
    e.stopPropagation();
    ref.current?.setPointerCapture(e.pointerId);
    const p = toPx(e.clientX, e.clientY);
    drag.current = { mode, sx: p.x, sy: p.y, start: mode === "new" ? { x: p.x, y: p.y, w: 0, h: 0 } : draft };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toPx(e.clientX, e.clientY);
    const dx = p.x - d.sx;
    const dy = p.y - d.sy;
    const st = d.start;
    if (d.mode === "move") {
      setDraft({ ...st, x: clamp(st.x + dx, 0, width - st.w), y: clamp(st.y + dy, 0, height - st.h) });
      return;
    }
    if (d.mode === "new") {
      setDraft({ x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(dx), h: Math.abs(dy) });
      return;
    }
    let left = st.x;
    let top = st.y;
    let right = st.x + st.w;
    let bottom = st.y + st.h;
    if (d.mode === "nw" || d.mode === "sw") left = clamp(left + dx, 0, right - MIN_CROP);
    if (d.mode === "ne" || d.mode === "se") right = clamp(right + dx, left + MIN_CROP, width);
    if (d.mode === "nw" || d.mode === "ne") top = clamp(top + dy, 0, bottom - MIN_CROP);
    if (d.mode === "sw" || d.mode === "se") bottom = clamp(bottom + dy, top + MIN_CROP, height);
    setDraft({ x: left, y: top, w: right - left, h: bottom - top });
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // ちょっと押しただけ（囲んでいない）なら、元の範囲のまま
    if (draft.w < MIN_CROP || draft.h < MIN_CROP) {
      setDraft(value);
      return;
    }
    const r = { x: Math.round(draft.x), y: Math.round(draft.y), w: Math.round(draft.w), h: Math.round(draft.h) };
    setDraft(r);
    onChange(r);
  };
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="cat-crop-wrap">
      <div
        ref={ref}
        className="cat-crop"
        style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, ${(300 * width) / height}px)` }}
        onPointerDown={(e) => begin(e, "new")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="もとの絵" draggable={false} />
        <div
          className="cat-crop-box"
          style={{ left: pct(draft.x, width), top: pct(draft.y, height), width: pct(draft.w, width), height: pct(draft.h, height) }}
          onPointerDown={(e) => begin(e, "move")}
        >
          {(["nw", "ne", "sw", "se"] as const).map((h) => (
            <span key={h} className={`cat-crop-h is-${h}`} onPointerDown={(e) => begin(e, h)} />
          ))}
        </div>
      </div>
    </div>
  );
}

const newId = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function CatUploadCard({ show }: { show: (message: string, tone?: "success" | "error" | "info") => void }) {
  const sprites = useCatSprites(true).filter((s) => s.custom);
  const [source, setSource] = useState<ImageData | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [crop, setCrop] = useState<Rect | null>(null); // 切り取る範囲（もとの絵の上の位置）
  const [cropKey, setCropKey] = useState(0);
  const [srcSize, setSrcSize] = useState<{ w: number; h: number } | null>(null);
  const srcCanvas = useRef<HTMLCanvasElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [removeBg, setRemoveBg] = useState(true);
  const [tolerance, setTolerance] = useState(40);
  const [preview, setPreview] = useState<{ url: string; canvas: HTMLCanvasElement } | null>(null);
  const [label, setLabel] = useState("");
  const [cat, setCat] = useState<CatKey>("a");
  const [season, setSeason] = useState<Season>("");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 表があるか（supabase-cat-sprites.sql を実行したか）
  useEffect(() => {
    void supabase
      .from("cat_sprites")
      .select("id")
      .limit(1)
      .then(({ error }) => setMissing(!!error && ["42P01", "PGRST205"].includes(error.code ?? "")));
  }, []);

  // 背景を消して、できあがりを作り直す
  useEffect(() => {
    if (!source) return;
    const t = window.setTimeout(() => {
      const ctx = srcCanvas.current?.getContext("2d", { willReadFrequently: true });
      const part = crop && ctx ? ctx.getImageData(crop.x, crop.y, crop.w, crop.h) : source;
      const canvas = finish(removeBg ? removeBackground(part, tolerance) : part);
      setPreview(canvas ? { url: canvas.toDataURL("image/png"), canvas } : null);
    }, 120);
    return () => window.clearTimeout(t);
  }, [source, crop, removeBg, tolerance]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      show("画像を選んでください", "error");
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_WORK / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      // 最初から背景が透明な PNG は、消さなくてよいことが多い
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const transparent = data.data[3] < 16 && data.data[data.data.length - 1] < 16;
      setRemoveBg(!transparent);
      srcCanvas.current = c;
      setSrcSize({ w: c.width, h: c.height });
      setSourceUrl(c.toDataURL("image/png"));
      setCrop({ x: 0, y: 0, w: c.width, h: c.height });
      setCropKey((k) => k + 1);
      setSource(data);
      setFileName(file.name);
      if (!label) setLabel(file.name.replace(/\.[^.]+$/, "").slice(0, 20));
    } catch {
      show("画像を読み込めませんでした", "error");
    }
  };

  const reset = () => {
    setSource(null);
    setSourceUrl("");
    setCrop(null);
    srcCanvas.current = null;
    setSrcSize(null);
    setPreview(null);
    setFileName("");
    setLabel("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const changed = () => window.dispatchEvent(new Event(CAT_SPRITES_CHANGED));

  const add = async () => {
    if (!preview || !label.trim()) return;
    setSaving(true);
    const id = newId();
    const path = `${id}.png`;
    const blob = await new Promise<Blob | null>((r) => preview.canvas.toBlob(r, "image/png"));
    if (!blob) {
      setSaving(false);
      show("画像を作れませんでした", "error");
      return;
    }
    const up = await supabase.storage.from(CAT_SPRITE_BUCKET).upload(path, blob, { contentType: "image/png", upsert: false });
    if (up.error) {
      setSaving(false);
      show(`アップロードできませんでした（${up.error.message}）`, "error");
      return;
    }
    // 番号はもとからの絵の続き。ほかの追加とかぶったら、読み直して付け直す
    let error: { message: string; code?: string } | null = null;
    let no = 0;
    for (let tries = 0; tries < 3; tries++) {
      await loadCustomSprites(true);
      no = nextCustomNo();
      ({ error } = await supabase.from("cat_sprites").insert({ id, no, cat, label: label.trim(), season: season || null, image_path: path }));
      if (error?.code === "42703" || error?.code === "PGRST204") {
        // 番号の列がまだ無い（SQL を実行し直していない）ときは、番号なしで
        no = 0;
        ({ error } = await supabase.from("cat_sprites").insert({ id, cat, label: label.trim(), season: season || null, image_path: path }));
      }
      if (error?.code !== "23505") break;
    }
    setSaving(false);
    if (error) {
      void supabase.storage.from(CAT_SPRITE_BUCKET).remove([path]);
      show(`登録できませんでした（${error.message}）`, "error");
      return;
    }
    show(`${no ? `No.${no}` : ""}「${label.trim()}」を追加しました`);
    reset();
    changed();
  };

  const toggle = async (id: string, enabled: boolean) => {
    const { error } = await supabase.from("cat_sprites").update({ enabled }).eq("id", id);
    if (error) {
      show("変更できませんでした", "error");
      return;
    }
    show(enabled ? "出るようにしました" : "止めました（図鑑からも隠れます）", "info");
    changed();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("cat_sprites").delete().eq("id", id);
    setConfirmDel(null);
    if (error) {
      show("削除できませんでした", "error");
      return;
    }
    void supabase.storage.from(CAT_SPRITE_BUCKET).remove([`${id}.png`]);
    show("削除しました", "info");
    changed();
  };

  return (
    <section className="glass-card p-4">
      <p className="eyebrow">うちのねこ</p>
      <h2 className="mt-1 text-lg font-black text-[var(--fg-strong)]">ねこの絵を追加</h2>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        追加した絵は、みんなの画面に遊びに来るようになり、ねこ図鑑にも並びます。背景が1色の絵なら、背景は自動で消せます。
      </p>

      {missing ? (
        <p className="cat-up-note">
          使うには、Supabase の SQL Editor で <b>supabase-cat-sprites.sql</b> を1回実行してください。
        </p>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="cat-up-file" onChange={(e) => void pick(e.target.files?.[0])} />
          {!source ? (
            <label htmlFor="cat-up-file" className="cat-up-drop">
              <b>＋ 絵を選ぶ</b>
              <span>PNG・JPG など。1匹ずつの絵がおすすめ</span>
            </label>
          ) : (
            <div className="cat-up-edit">
              {sourceUrl && srcSize && crop && (
                <div className="cat-up-step">
                  <div className="cat-up-step-head">
                    <b>切り取る</b>
                    <span>ドラッグで囲む・枠を動かす・四隅で大きさを変える</span>
                    {(crop.x > 0 || crop.y > 0 || crop.w < srcSize.w || crop.h < srcSize.h) && (
                      <button
                        type="button"
                        className="kt-text-btn"
                        onClick={() => {
                          setCrop({ x: 0, y: 0, w: srcSize.w, h: srcSize.h });
                          setCropKey((k) => k + 1);
                        }}
                      >
                        全体に戻す
                      </button>
                    )}
                  </div>
                  <CropBox key={cropKey} url={sourceUrl} width={srcSize.w} height={srcSize.h} value={crop} onChange={setCrop} />
                </div>
              )}
              <div className="cat-up-step-head">
                <b>できあがり</b>
                <span>市松模様のところが透明になります</span>
              </div>
              <div className="cat-up-previews">
                <figure className="cat-up-canvas" aria-label="できあがり（市松模様のところが透明）">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.url} alt="できあがり" />
                  ) : (
                    <span className="cat-up-empty">絵が残りませんでした。消す強さを弱くしてください</span>
                  )}
                </figure>
                <figure className="cat-up-sample" aria-label="図鑑での見え方">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {preview && <img src={preview.url} alt="" />}
                  <figcaption>{label.trim() || "名前"}</figcaption>
                </figure>
              </div>
              <p className="cat-up-file">{fileName}</p>

              <label className="cat-up-check">
                <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />
                背景を消す
              </label>
              {removeBg && (
                <label className="cat-up-range">
                  <span>消す強さ</span>
                  <input type="range" min={8} max={120} step={2} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} aria-label="背景を消す強さ" />
                  <small>{tolerance <= 30 ? "弱め" : tolerance <= 70 ? "ふつう" : "強め"}</small>
                </label>
              )}

              <label className="cat-up-field">
                <span>名前</span>
                <input className="kt-input" value={label} maxLength={20} onChange={(e) => setLabel(e.target.value)} placeholder="例：箱に入る" />
              </label>
              <div className="cat-up-field">
                <span>どの子</span>
                <div className="cat-up-seg" role="radiogroup" aria-label="どの子">
                  {(["a", "b", "both"] as CatKey[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={cat === k} onClick={() => setCat(k)}>
                      {k === "both" ? "2匹いっしょ" : CAT_NAMES[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cat-up-field">
                <span>出る時期</span>
                <div className="cat-up-seg" role="radiogroup" aria-label="出る時期">
                  {SEASONS.map((s) => (
                    <button key={s.value} type="button" role="radio" aria-checked={season === s.value} onClick={() => setSeason(s.value)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cat-up-actions">
                <button type="button" className="kt-btn is-ghost" onClick={reset}>
                  やめる
                </button>
                <label htmlFor="cat-up-file" className="kt-btn is-ghost cat-up-again">
                  別の絵
                </label>
                <button type="button" className="kt-btn is-primary" disabled={!preview || !label.trim() || saving} onClick={() => void add()}>
                  {saving ? "追加中…" : "追加する"}
                </button>
              </div>
            </div>
          )}

          {sprites.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-black">追加した絵（{sprites.length}）</p>
              <ul className="cat-up-list">
                {sprites.map((s) => (
                  <li key={s.id} className={`cat-up-item ${s.enabled === false ? "is-off" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.src} alt="" />
                    <div className="cat-up-item-body">
                      <b>
                        <small className="cat-up-no">{spriteNoLabel(s)}</small>
                        {s.label}
                      </b>
                      <span>
                        {s.cat === "both" ? "2匹いっしょ" : CAT_NAMES[s.cat]}
                        {s.season ? `・${SEASON_LABEL[s.season]}` : ""}
                        {s.enabled === false ? "・停止中" : ""}
                      </span>
                    </div>
                    <div className="cat-up-item-actions">
                      <button type="button" className="kt-text-btn" onClick={() => previewCat(s.id)}>
                        お試し
                      </button>
                      <button type="button" className="kt-text-btn" onClick={() => void toggle(s.id, s.enabled === false)}>
                        {s.enabled === false ? "出す" : "止める"}
                      </button>
                      {confirmDel === s.id ? (
                        <button type="button" className="kt-link-danger" onClick={() => void remove(s.id)}>
                          本当に削除
                        </button>
                      ) : (
                        <button type="button" className="kt-link-danger" onClick={() => setConfirmDel(s.id)}>
                          削除
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="cat-up-note">削除すると、見つけた記録があっても図鑑から消えます。一時的に出したくないときは「止める」を使ってください。</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
