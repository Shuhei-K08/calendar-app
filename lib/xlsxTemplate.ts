// 勤怠表テンプレート（.xlsx）への書き込み
// Excel ファイルを丸ごと作り直すと、保護・非表示シート・条件付き書式などが崩れることがあるため、
// ファイルの中の「書き込むセル」だけを直接書き換え、それ以外には一切触れない。
import JSZip from "jszip";

/* ── 設定（どこに何を書くか） ── */
export type TemplateMapping = {
  sheet: string; // 書き込むシート名
  firstRow: number; // 1日の行
  yearCell: string | null; // 年を書くセル（例 B1）
  monthCell: string | null; // 月を書くセル（例 E1）
  nameCell: string | null; // 氏名を書くセル
  cols: {
    start: string | null; // 開始時刻の列（例 J）
    end: string | null; // 終了時刻の列
    break: string | null; // 休憩の列（無い表もある）
    memo: string | null; // 作業内容の列
    note: string | null; // 備考の列（休みの理由などはこちらへ。無ければ作業内容の列）
    kind: string | null; // 勤怠区分の列（出勤／欠勤 など）
  };
  kindWork: string; // 働いた日に書く区分（例 出勤）
  kindOff: string; // 平日に休んだ日に書く区分（空なら書かない）
  kindPaid: string; // メモに「有給・年休」とある休みの日に書く区分（空なら kindOff）
  clearOtherDays: boolean; // 記録の無い日のセルを空にする
  fileName?: string; // 書き出すファイル名（{年}{月} が書き出す月に変わる。拡張子なし）
};

export type DetectResult = {
  sheets: string[];
  mapping: TemplateMapping;
  found: Record<string, string>; // 見つけた見出し（画面の説明用）
  grid: { sheet: string; rows: (string | null)[][]; startRow: number; startCol: number }; // プレビュー用
};

export type DayWrite = {
  day: number; // 1〜31
  start: string | null; // HH:MM
  end: string | null;
  breakMin: number;
  off: boolean;
  business: boolean; // 平日（土日祝ではない）
  memo: string | null;
};

/* ── セル番地 ── */
export const colToNum = (col: string) => col.toUpperCase().split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
export const numToCol = (n: number) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
const splitAddr = (addr: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(addr.toUpperCase());
  if (!m) throw new Error(`セル番地が正しくありません: ${addr}`);
  return { col: m[1], row: Number(m[2]) };
};

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const xmlUnescape = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");

/* ── ブックの中身を読む ── */
type Book = { zip: JSZip; sheets: { name: string; path: string }[]; shared: string[] };

async function openBook(data: ArrayBuffer | Uint8Array): Promise<Book> {
  const zip = await JSZip.loadAsync(data);
  const wb = await zip.file("xl/workbook.xml")?.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wb || !rels) throw new Error("Excel（.xlsx）ファイルとして読み込めませんでした");
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) relMap.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const sheets: Book["sheets"] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1];
    const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    if (name && rid && relMap.get(rid)) sheets.push({ name: xmlUnescape(name), path: relMap.get(rid) as string });
  }
  const shared: string[] = [];
  const ss = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (ss) {
    for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      // ふりがな（<rPh>）は見出しの文字に含めない
      const body = m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
      const texts = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlUnescape(t[1]));
      shared.push(texts.join(""));
    }
  }
  return { zip, sheets, shared };
}

type CellInfo = { addr: string; col: string; row: number; text: string | null; formula: boolean; num: number | null };

function readCells(xml: string, shared: string[]): CellInfo[] {
  const out: CellInfo[] = [];
  for (const m of xml.matchAll(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const addr = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!addr) continue;
    const inner = m[3] ?? "";
    const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
    const formula = /<f\b/.test(inner);
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    let text: string | null = null;
    let num: number | null = null;
    if (t === "s" && v !== undefined) text = shared[Number(v)] ?? null;
    else if (t === "inlineStr") text = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlUnescape(x[1])).join("");
    else if (t === "str" && v !== undefined) text = xmlUnescape(v);
    else if (v !== undefined && v !== "") {
      num = Number(v);
      text = v;
    }
    const { col, row } = splitAddr(addr);
    out.push({ addr, col, row, text, formula, num });
  }
  return out;
}

/* ── 見出しを探して、どこに何を書くかの候補を作る ── */
const LABELS = {
  date: /^(日|日付|年月日)$/,
  start: /開始|始業|出勤時刻|出社|^出勤$/,
  end: /終了|終業|退勤|退社/,
  break: /休憩|控除/,
  memo: /作業内容|業務内容|作業内容\/備考/,
  note: /備考/,
  kind: /勤怠区分|^区分$|勤務区分/,
  name: /^氏\s*名$|^名前$/,
};

export async function detectTemplate(data: ArrayBuffer | Uint8Array): Promise<DetectResult> {
  const book = await openBook(data);
  let best: { score: number; result: DetectResult } | null = null;

  for (const sh of book.sheets) {
    const xml = await book.zip.file(sh.path)?.async("string");
    if (!xml) continue;
    const cells = readCells(xml, book.shared);
    const byAddr = new Map(cells.map((c) => [c.addr, c]));
    const labelCells = (re: RegExp) => cells.filter((c) => c.text && !c.formula && re.test(c.text.replace(/\s|\n/g, "")));

    // 日付の見出し → その下で最初に日付（数式 or 数値）が入っている行を 1日 とみなす
    let firstRow = 0;
    let headerRow = 0;
    for (const h of labelCells(LABELS.date)) {
      for (let r = h.row + 1; r <= h.row + 4; r++) {
        const c = byAddr.get(`${h.col}${r}`);
        if (c && (c.formula || (c.num !== null && c.num > 30000))) {
          firstRow = r;
          headerRow = h.row;
          break;
        }
      }
      if (firstRow) break;
    }
    if (!firstRow) continue;

    // 見出しの候補のうち、日付の行に「数式ではない入力欄」がある列を選ぶ
    const pickCol = (re: RegExp) => {
      // 見出しの行のものだけ。短い見出しほど優先（「開始時刻切上単位」のような設定欄より「開始時刻」）
      const cands = labelCells(re)
        .filter((c) => c.row >= headerRow && c.row < firstRow)
        .sort((a, b) => (a.text ?? "").length - (b.text ?? "").length || colToNum(a.col) - colToNum(b.col));
      for (const c of cands) {
        let formulas = 0;
        for (let r = firstRow; r < firstRow + 31; r++) if (byAddr.get(`${c.col}${r}`)?.formula) formulas++;
        if (formulas < 5) return c;
      }
      return null;
    };
    const start = pickCol(LABELS.start);
    const end = pickCol(LABELS.end);
    if (!start || !end) continue;
    const brk = pickCol(LABELS.break);
    const memoLabel = pickCol(LABELS.memo);
    const noteLabel = pickCol(LABELS.note);
    const memo = memoLabel ?? noteLabel;
    const note = memoLabel && noteLabel && noteLabel.col !== memoLabel.col ? noteLabel : null;
    const kind = pickCol(LABELS.kind);

    // 年・月のセル（「年」「月」の文字の左にある数値）
    const leftNumber = (re: RegExp) => {
      for (const l of labelCells(re).filter((c) => c.row < headerRow)) {
        for (let k = 1; k <= 3; k++) {
          const n = colToNum(l.col) - k;
          if (n < 1) break;
          const c = byAddr.get(`${numToCol(n)}${l.row}`);
          if (c && c.num !== null && !c.formula) return c.addr;
        }
      }
      return null;
    };
    const yearCell = leftNumber(/^年$/);
    const monthCell = leftNumber(/^(月|月度)$/);

    // 氏名（見出しの右か下の、数式ではないセル）
    let nameCell: string | null = null;
    for (const l of labelCells(LABELS.name).filter((c) => c.row < headerRow)) {
      const cands = [
        ...Array.from({ length: 6 }, (_, k) => `${numToCol(colToNum(l.col) + k + 1)}${l.row}`),
        `${l.col}${l.row + 1}`,
      ];
      const hit = cands.map((a) => byAddr.get(a)).find((c) => c && c.text && c.text.replace(/[\s\u3000]/g, "") && !c.formula);
      const formulaHit = cands.map((a) => byAddr.get(a)).find((c) => c && c.formula);
      if (hit) nameCell = hit.addr;
      else if (!formulaHit) nameCell = `${l.col}${l.row + 1}`;
      break;
    }

    const found: Record<string, string> = {
      シート: sh.name,
      "1日の行": `${firstRow}行目`,
      開始: `${start.col}列（${start.text}）`,
      終了: `${end.col}列（${end.text}）`,
    };
    if (brk) found["休憩"] = `${brk.col}列（${brk.text?.replace(/\n/g, "")}）`;
    if (memo) found["作業内容"] = `${memo.col}列（${memo.text}）`;
    if (note) found["備考"] = `${note.col}列（${note.text}）`;
    if (kind) found["勤怠区分"] = `${kind.col}列（${kind.text}）`;
    if (yearCell) found["年"] = yearCell;
    if (monthCell) found["月"] = monthCell;
    if (nameCell) found["氏名"] = nameCell;

    const score = 2 + (brk ? 1 : 0) + (memo ? 1 : 0) + (yearCell ? 1 : 0) + (monthCell ? 1 : 0);
    const result: DetectResult = {
      sheets: book.sheets.map((s) => s.name),
      found,
      mapping: {
        sheet: sh.name,
        firstRow,
        yearCell,
        monthCell,
        nameCell,
        cols: { start: start.col, end: end.col, break: brk?.col ?? null, memo: memo?.col ?? null, note: note?.col ?? null, kind: kind?.col ?? null },
        kindWork: "出勤",
        kindOff: kind ? "欠勤" : "",
        kindPaid: kind ? "有給休暇" : "",
        clearOtherDays: true,
      },
      grid: buildGrid(cells, sh.name, Math.max(1, headerRow - 1), firstRow + 31),
    };
    if (!best || score > best.score) best = { score, result };
  }
  if (!best) throw new Error("日付と「開始」「終了」の見出しが見つかりませんでした。行と列を手で指定してください。");
  return best.result;
}

/** プレビュー用の表示（0〜1の数は時刻、大きな数は日付として見せる） */
const showValue = (c: CellInfo) => {
  if (c.num === null) return c.text;
  if (c.num >= 0 && c.num < 1) {
    const min = Math.round(c.num * 1440);
    return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
  }
  if (c.num > 30000 && c.num < 80000 && Number.isInteger(c.num)) {
    const d = new Date(Date.UTC(1899, 11, 30) + c.num * 86400000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }
  return c.text;
};

function buildGrid(cells: CellInfo[], sheet: string, fromRow: number, toRow: number): DetectResult["grid"] {
  const used = cells.filter((c) => c.row >= fromRow && c.row <= toRow && c.text);
  const maxCol = Math.min(40, Math.max(1, ...used.map((c) => colToNum(c.col))));
  const rows: (string | null)[][] = [];
  for (let r = fromRow; r <= toRow; r++) {
    const row: (string | null)[] = [];
    for (let k = 1; k <= maxCol; k++) {
      const c = cells.find((x) => x.row === r && x.col === numToCol(k));
      row.push(c?.formula ? "＝" : c ? showValue(c) : null);
    }
    rows.push(row);
  }
  return { sheet, rows, startRow: fromRow, startCol: 1 };
}

/** シート名の一覧 */
export async function listSheets(data: ArrayBuffer | Uint8Array) {
  return (await openBook(data)).sheets.map((s) => s.name);
}

/** 自動で見つからなかったときの空の設定 */
export const blankMapping = (sheet: string): TemplateMapping => ({
  sheet,
  firstRow: 0,
  yearCell: null,
  monthCell: null,
  nameCell: null,
  cols: { start: null, end: null, break: null, memo: null, note: null, kind: null },
  kindWork: "出勤",
  kindOff: "",
  kindPaid: "",
  clearOtherDays: true,
});

/** 別のシートを選び直したとき用：そのシートのプレビューだけ作る */
export async function sheetGrid(data: ArrayBuffer | Uint8Array, sheet: string, fromRow: number, toRow: number) {
  const book = await openBook(data);
  const sh = book.sheets.find((s) => s.name === sheet);
  const xml = sh ? await book.zip.file(sh.path)?.async("string") : null;
  if (!xml) throw new Error("シートが見つかりません");
  return buildGrid(readCells(xml, book.shared), sheet, fromRow, toRow);
}

/* ── 書き込み ── */
type CellValue = { num: number } | { str: string } | null;

function setCell(xml: string, addr: string, value: CellValue): string {
  const { col, row } = splitAddr(addr);
  const render = (style: string) => {
    const s = style ? ` s="${style}"` : "";
    if (value === null) return `<c r="${addr}"${s}/>`;
    if ("num" in value) return `<c r="${addr}"${s}><v>${value.num}</v></c>`;
    return `<c r="${addr}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value.str)}</t></is></c>`;
  };
  // 既にあるセル
  const cellRe = new RegExp(`<c r="${addr}"(?=[\\s/>])([^>]*?)(\\/>|>[\\s\\S]*?<\\/c>)`);
  const hit = cellRe.exec(xml);
  if (hit) {
    if (/<f\b/.test(hit[2])) return xml; // 数式のセルには書き込まない（表の計算を壊さない）
    const style = /\bs="(\d+)"/.exec(hit[1])?.[1] ?? "";
    return xml.slice(0, hit.index) + render(style) + xml.slice(hit.index + hit[0].length);
  }
  if (value === null) return xml;
  // 行はあるがセルが無い → 列の順番を守って差し込む
  const rowRe = new RegExp(`<row r="${row}"(?=[\\s/>])([^>]*?)(\\/>|>([\\s\\S]*?)<\\/row>)`);
  const r = rowRe.exec(xml);
  if (r) {
    if (r[2] === "/>") {
      const replaced = `<row r="${row}"${r[1]}>${render("")}</row>`;
      return xml.slice(0, r.index) + replaced + xml.slice(r.index + r[0].length);
    }
    const inner = r[3] ?? "";
    const target = colToNum(col);
    let insertAt = inner.length;
    for (const m of inner.matchAll(/<c r="([A-Z]+)\d+"/g)) {
      if (colToNum(m[1]) > target) {
        insertAt = m.index ?? inner.length;
        break;
      }
    }
    const newInner = inner.slice(0, insertAt) + render("") + inner.slice(insertAt);
    const replaced = `<row r="${row}"${r[1]}>${newInner}</row>`;
    return xml.slice(0, r.index) + replaced + xml.slice(r.index + r[0].length);
  }
  // 行も無い → 行の順番を守って差し込む
  const sd = /<sheetData\s*\/>|<sheetData>([\s\S]*?)<\/sheetData>/.exec(xml);
  if (!sd) return xml;
  const newRow = `<row r="${row}">${render("")}</row>`;
  if (sd[0].endsWith("/>")) return xml.replace(sd[0], `<sheetData>${newRow}</sheetData>`);
  const inner = sd[1] ?? "";
  let insertAt = inner.length;
  for (const m of inner.matchAll(/<row r="(\d+)"/g)) {
    if (Number(m[1]) > row) {
      insertAt = m.index ?? inner.length;
      break;
    }
  }
  const start = sd.index + "<sheetData>".length;
  return xml.slice(0, start + insertAt) + newRow + xml.slice(start + insertAt);
}

const timeValue = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  // 丸めずにそのまま入れる（丸めると 10:00 が 10:00 よりわずかに大きくなり、表の「15分切り上げ」で 10:15 になる）
  return (h * 60 + m) / 1440;
};

/** テンプレートに1か月分を書き込んだ .xlsx を返す（元のファイルは変えない） */
export async function fillTemplate(
  data: ArrayBuffer | Uint8Array,
  map: TemplateMapping,
  month: Date,
  days: DayWrite[],
  opts: { name?: string } = {},
): Promise<Uint8Array> {
  if (!map.firstRow || !map.cols.start || !map.cols.end) throw new Error("書き込む場所の設定が足りません");
  const book = await openBook(data);
  const sh = book.sheets.find((s) => s.name === map.sheet);
  if (!sh) throw new Error(`シート「${map.sheet}」が見つかりません`);
  let xml = await book.zip.file(sh.path)?.async("string");
  if (!xml) throw new Error("シートを読み込めませんでした");

  if (map.yearCell) xml = setCell(xml, map.yearCell, { num: month.getFullYear() });
  if (map.monthCell) xml = setCell(xml, map.monthCell, { num: month.getMonth() + 1 });
  if (map.nameCell && opts.name) xml = setCell(xml, map.nameCell, { str: opts.name });

  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (let day = 1; day <= 31; day++) {
    const row = map.firstRow + day - 1;
    const d = day <= lastDay ? byDay.get(day) : undefined;
    const worked = d && !d.off && d.start && d.end;
    if (!d && !map.clearOtherDays) continue;
    const put = (col: string | null, v: CellValue) => {
      if (col) xml = setCell(xml as string, `${col}${row}`, v);
    };
    put(map.cols.start, worked ? { num: timeValue(d.start as string) } : null);
    put(map.cols.end, worked ? { num: timeValue(d.end as string) } : null);
    put(map.cols.break, worked ? { num: d.breakMin / 1440 } : null);
    const noteCol = map.cols.note ?? map.cols.memo;
    if (map.cols.note) {
      put(map.cols.memo, worked && d?.memo ? { str: d.memo } : null);
      put(map.cols.note, !worked && d?.memo ? { str: d.memo } : null);
    } else {
      put(noteCol, d?.memo ? { str: d.memo } : null);
    }
    if (map.cols.kind) {
      const paid = /有給|有休|年休/.test(d?.memo ?? "");
      const offKind = paid && map.kindPaid ? map.kindPaid : map.kindOff;
      put(map.cols.kind, worked ? { str: map.kindWork } : d?.off && d.business && offKind ? { str: offKind } : null);
    }
  }
  book.zip.file(sh.path, xml);

  // 開いたときに Excel が計算し直すようにする（合計などの数式を最新にする）
  const wbPath = "xl/workbook.xml";
  let wb = (await book.zip.file(wbPath)?.async("string")) ?? "";
  if (/<calcPr\b/.test(wb)) {
    wb = wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (_m, attrs: string, close: string) =>
      `<calcPr${attrs.replace(/\sfullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"${close}>`,
    );
  } else {
    wb = wb.replace(/<\/workbook>/, `<calcPr fullCalcOnLoad="1"/></workbook>`);
  }
  book.zip.file(wbPath, wb);
  // 数式の計算順の記録は消しておく（Excel が作り直す）
  if (book.zip.file("xl/calcChain.xml")) {
    book.zip.remove("xl/calcChain.xml");
    const ct = (await book.zip.file("[Content_Types].xml")?.async("string")) ?? "";
    book.zip.file("[Content_Types].xml", ct.replace(/<Override[^>]*calcChain[^>]*\/>/, ""));
    const rels = (await book.zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
    book.zip.file("xl/_rels/workbook.xml.rels", rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ""));
  }
  return book.zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
