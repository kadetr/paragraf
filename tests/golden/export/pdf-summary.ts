// tests/golden/export/pdf-summary.ts
// Test helper (not shipped): reads a PDF and returns a summary of what a
// printer or a viewer would act on, so that two PDFs can be compared without
// comparing bytes.
//
// The summary holds, per page: the page boxes, the colour operators with
// their values, the text-showing operators with position, font and decoded
// text, and a digest of the vector path data. For the whole file: the fonts
// (BaseFont), the OutputIntents and the Info dictionary without its dates.
//
// It is a small reader for the PDFs pdfkit writes (PDF 1.3, no object
// streams, no cross-reference streams). Streams compressed with FlateDecode
// are inflated, so a compressed and an uncompressed render give the same
// summary. It is not a general PDF parser.

import { createHash } from 'crypto';
import { inflateSync } from 'zlib';

// ─── PDF objects ──────────────────────────────────────────────────────────────

export interface PdfRef {
  ref: [number, number];
}
export interface PdfName {
  name: string;
}
export type PdfValue =
  | number
  | boolean
  | null
  | string // a string object, decoded
  | PdfName
  | PdfRef
  | PdfValue[]
  | PdfDict;
export interface PdfDict {
  [key: string]: PdfValue;
}

const isRef = (v: unknown): v is PdfRef =>
  typeof v === 'object' && v !== null && 'ref' in v;
const isName = (v: unknown): v is PdfName =>
  typeof v === 'object' && v !== null && 'name' in v;
const isDict = (v: unknown): v is PdfDict =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  !isRef(v) &&
  !isName(v);

const WHITESPACE = new Set([' ', '\n', '\r', '\t', '\f', '\0']);
const DELIMITERS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);

/** Decode the bytes of a PDF string: UTF-16BE with a BOM, else Latin-1. */
const decodePdfString = (bytes: string): string => {
  if (bytes.startsWith('\xfe\xff')) {
    let s = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      s += String.fromCharCode(
        (bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1),
      );
    }
    return s;
  }
  return bytes;
};

/**
 * A token reader over a Latin-1 string. Used both for the file structure and
 * for content streams.
 */
class Lexer {
  pos = 0;
  constructor(readonly src: string) {}

  skipSpace(): void {
    const s = this.src;
    while (this.pos < s.length) {
      const c = s[this.pos];
      if (WHITESPACE.has(c)) this.pos++;
      else if (c === '%') {
        while (
          this.pos < s.length &&
          s[this.pos] !== '\n' &&
          s[this.pos] !== '\r'
        )
          this.pos++;
      } else break;
    }
  }

  /** Next raw token, or null at the end. Strings come back already decoded. */
  next():
    | { kind: 'num'; value: number }
    | { kind: 'name'; value: string }
    | { kind: 'str'; value: string; hex: string }
    | { kind: 'punct'; value: string }
    | { kind: 'word'; value: string }
    | null {
    this.skipSpace();
    const s = this.src;
    if (this.pos >= s.length) return null;
    const c = s[this.pos];

    if (c === '<' && s[this.pos + 1] === '<') {
      this.pos += 2;
      return { kind: 'punct', value: '<<' };
    }
    if (c === '>' && s[this.pos + 1] === '>') {
      this.pos += 2;
      return { kind: 'punct', value: '>>' };
    }
    if (c === '[' || c === ']' || c === '{' || c === '}') {
      this.pos++;
      return { kind: 'punct', value: c };
    }
    if (c === '<') {
      const end = s.indexOf('>', this.pos);
      const hex = s.slice(this.pos + 1, end).replace(/\s+/g, '');
      this.pos = end + 1;
      const padded = hex.length % 2 ? hex + '0' : hex;
      let bytes = '';
      for (let i = 0; i < padded.length; i += 2)
        bytes += String.fromCharCode(parseInt(padded.slice(i, i + 2), 16));
      return {
        kind: 'str',
        value: decodePdfString(bytes),
        hex: hex.toLowerCase(),
      };
    }
    if (c === '(') {
      let depth = 0;
      let out = '';
      this.pos++;
      while (this.pos < s.length) {
        const ch = s[this.pos++];
        if (ch === '\\') {
          const e = s[this.pos++];
          const map: Record<string, string> = {
            n: '\n',
            r: '\r',
            t: '\t',
            b: '\b',
            f: '\f',
          };
          if (e in map) out += map[e];
          else if (/[0-7]/.test(e)) {
            let oct = e;
            while (oct.length < 3 && /[0-7]/.test(s[this.pos]))
              oct += s[this.pos++];
            out += String.fromCharCode(parseInt(oct, 8));
          } else if (e === '\r' || e === '\n') {
            if (e === '\r' && s[this.pos] === '\n') this.pos++;
          } else out += e;
        } else if (ch === '(') {
          depth++;
          out += ch;
        } else if (ch === ')') {
          if (depth === 0) break;
          depth--;
          out += ch;
        } else out += ch;
      }
      let hex = '';
      for (let i = 0; i < out.length; i++)
        hex += out.charCodeAt(i).toString(16).padStart(2, '0');
      return { kind: 'str', value: decodePdfString(out), hex };
    }
    if (c === '/') {
      let j = this.pos + 1;
      while (j < s.length && !WHITESPACE.has(s[j]) && !DELIMITERS.has(s[j]))
        j++;
      const raw = s.slice(this.pos + 1, j);
      this.pos = j;
      return {
        kind: 'name',
        value: raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) =>
          String.fromCharCode(parseInt(h, 16)),
        ),
      };
    }
    let j = this.pos;
    while (j < s.length && !WHITESPACE.has(s[j]) && !DELIMITERS.has(s[j])) j++;
    if (j === this.pos) {
      // A stray delimiter such as ')' or '>'; skip it.
      this.pos++;
      return { kind: 'punct', value: c };
    }
    const word = s.slice(this.pos, j);
    this.pos = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word))
      return { kind: 'num', value: Number(word) };
    return { kind: 'word', value: word };
  }

  /** Parse one value (with `n g R` references). */
  value(): PdfValue | undefined {
    const t = this.next();
    if (!t) return undefined;
    return this.valueFrom(t);
  }

  private valueFrom(t: NonNullable<ReturnType<Lexer['next']>>): PdfValue {
    if (t.kind === 'num') {
      // Lookahead for "n g R".
      const save = this.pos;
      const t2 = this.next();
      if (t2?.kind === 'num' && Number.isInteger(t.value)) {
        const t3 = this.next();
        if (t3?.kind === 'word' && t3.value === 'R')
          return { ref: [t.value, t2.value] };
      }
      this.pos = save;
      return t.value;
    }
    if (t.kind === 'name') return { name: t.value };
    if (t.kind === 'str') return t.value;
    if (t.kind === 'word') {
      if (t.value === 'true') return true;
      if (t.value === 'false') return false;
      return null;
    }
    if (t.value === '[') {
      const arr: PdfValue[] = [];
      for (;;) {
        const n = this.next();
        if (!n || (n.kind === 'punct' && n.value === ']')) break;
        arr.push(this.valueFrom(n));
      }
      return arr;
    }
    if (t.value === '<<') {
      const dict: PdfDict = {};
      for (;;) {
        const k = this.next();
        if (!k || (k.kind === 'punct' && k.value === '>>')) break;
        if (k.kind !== 'name') continue;
        const v = this.value();
        if (v !== undefined) dict[k.value] = v;
      }
      return dict;
    }
    return null;
  }
}

interface PdfObject {
  value: PdfValue;
  stream?: Buffer;
}

interface ParsedPdf {
  objects: Map<number, PdfObject>;
  trailer: PdfDict;
}

const parsePdf = (pdf: Buffer): ParsedPdf => {
  const src = pdf.toString('latin1');
  const objects = new Map<number, PdfObject>();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const lex = new Lexer(src);
    lex.pos = m.index + m[0].length;
    const value = lex.value() ?? null;
    const obj: PdfObject = { value };
    lex.skipSpace();
    if (src.startsWith('stream', lex.pos)) {
      let start = lex.pos + 'stream'.length;
      if (src[start] === '\r') start++;
      if (src[start] === '\n') start++;
      const length =
        isDict(value) && typeof value.Length === 'number' ? value.Length : -1;
      const end =
        length >= 0 && src.startsWith('endstream', skipWs(src, start + length))
          ? start + length
          : src.indexOf('endstream', start);
      let raw = Buffer.from(src.slice(start, end), 'latin1');
      const filter = isDict(value) ? value.Filter : undefined;
      const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
      for (const f of filters) {
        if (isName(f) && f.name === 'FlateDecode') raw = inflateSync(raw);
      }
      obj.stream = raw;
      re.lastIndex = end + 'endstream'.length;
    } else {
      re.lastIndex = lex.pos;
    }
    objects.set(Number(m[1]), obj);
  }
  const tIdx = src.lastIndexOf('trailer');
  let trailer: PdfDict = {};
  if (tIdx >= 0) {
    const lex = new Lexer(src);
    lex.pos = tIdx + 'trailer'.length;
    const v = lex.value();
    if (isDict(v)) trailer = v;
  }
  return { objects, trailer };
};

const skipWs = (s: string, i: number): number => {
  while (i < s.length && WHITESPACE.has(s[i])) i++;
  return i;
};

// ─── Summary ──────────────────────────────────────────────────────────────────

const DECIMALS = 4;
const round = (n: number, d = DECIMALS): number => {
  const f = 10 ** d;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

export interface TextRun {
  font: string;
  size: number;
  /** Text rendering mode (Tr); 3 is invisible. */
  mode: number;
  x: number;
  y: number;
  /** Text decoded through the font's ToUnicode map; glyph codes if absent. */
  text: string;
}

export interface PageSummary {
  boxes: Record<
    'MediaBox' | 'CropBox' | 'BleedBox' | 'TrimBox' | 'ArtBox',
    number[] | null
  >;
  /** Resource name → BaseFont of every font the page uses. */
  fonts: Record<string, string>;
  /**
   * Every distinct colour operator with its operands, in order of first use,
   * and how often it occurs: e.g. "0 0 0 1 scn": 512.
   */
  colourOperators: Record<string, number>;
  /** Fill colour in effect at each fill, grouped: "DeviceCMYK 0 0 0 1": 512. */
  fills: Record<string, number>;
  /** Stroke colour in effect at each stroke, grouped the same way. */
  strokes: Record<string, number>;
  text: TextRun[];
  paths: {
    /** Path-painting operators (f, S, B, …) by name. */
    painting: Record<string, number>;
    /** Path-construction operators (m, l, c, …). */
    segments: number;
    /** sha256 (first 16 hex digits) of the path data, numbers to 2 decimals. */
    digest: string;
  };
}

export interface OutputIntentSummary {
  /** The intent's /S, e.g. GTS_PDFX. */
  subtype: string | null;
  OutputConditionIdentifier: string | null;
  OutputCondition?: string;
  RegistryName?: string;
  Info?: string;
  profile: { N: number | null; bytes: number } | null;
}

export interface PdfSummary {
  version: string;
  pageCount: number;
  info: Record<string, string>;
  /** Present in the trailer (its value is not compared). */
  hasId: boolean;
  fonts: { BaseFont: string; Subtype: string; toUnicode: boolean }[];
  outputIntents: OutputIntentSummary[];
  pages: PageSummary[];
}

const COLOUR_OPS = new Set([
  'CS',
  'cs',
  'SC',
  'SCN',
  'sc',
  'scn',
  'G',
  'g',
  'RG',
  'rg',
  'K',
  'k',
]);
const PATH_CONSTRUCTION = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're']);
const PATH_PAINTING = new Set([
  'f',
  'F',
  'f*',
  'S',
  's',
  'B',
  'B*',
  'b',
  'b*',
  'n',
]);
const FILLS = new Set(['f', 'F', 'f*', 'B', 'B*', 'b', 'b*']);
const STROKES = new Set(['S', 's', 'B', 'B*', 'b', 'b*']);
const DATE_KEYS = new Set(['CreationDate', 'ModDate']);

const isHex = (v: unknown): v is { hex: string } =>
  typeof v === 'object' && v !== null && 'hex' in v;

const fmt = (v: PdfValue | undefined): string => {
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'number') return String(round(v));
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  if (isName(v)) return `/${v.name}`;
  if (isRef(v)) return `${v.ref[0]} ${v.ref[1]} R`;
  if (Array.isArray(v)) return `[${v.map(fmt).join(' ')}]`;
  return '<<…>>';
};

/** ToUnicode CMap → code (hex) → text. */
const parseToUnicode = (cmap: string): Map<string, string> => {
  const map = new Map<string, string>();
  const hexToText = (h: string): string => {
    let s = '';
    for (let i = 0; i + 3 < h.length; i += 4)
      s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    return s;
  };
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g))
      map.set(m[1].toLowerCase(), hexToText(m[2]));
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const lines = block[1].matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]*>)/g,
    );
    for (const m of lines) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const width = m[1].length;
      if (m[3].startsWith('[')) {
        const dsts = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((d) => d[1]);
        for (let c = lo; c <= hi; c++)
          map.set(
            c.toString(16).padStart(width, '0'),
            hexToText(dsts[c - lo] ?? ''),
          );
      } else {
        const base = parseInt(m[3].slice(1, -1), 16);
        for (let c = lo; c <= hi; c++)
          map.set(
            c.toString(16).padStart(width, '0'),
            String.fromCharCode(base + (c - lo)),
          );
      }
    }
  }
  return map;
};

export const summarisePdf = (pdf: Buffer): PdfSummary => {
  const { objects, trailer } = parsePdf(pdf);
  const get = (v: PdfValue | undefined): PdfValue | undefined =>
    isRef(v) ? objects.get(v.ref[0])?.value : v;
  const dict = (v: PdfValue | undefined): PdfDict =>
    (isDict(get(v)) ? get(v) : {}) as PdfDict;
  const name = (v: PdfValue | undefined): string | null => {
    const r = get(v);
    return isName(r) ? r.name : typeof r === 'string' ? r : null;
  };
  const numbers = (v: PdfValue | undefined): number[] | null => {
    const r = get(v);
    return Array.isArray(r)
      ? r.map((x) =>
          typeof get(x) === 'number' ? round(get(x) as number) : NaN,
        )
      : null;
  };

  const version =
    /^%PDF-(\d\.\d)/.exec(pdf.subarray(0, 16).toString('latin1'))?.[1] ?? '?';
  const root = dict(trailer.Root);

  // Info without dates.
  const info: Record<string, string> = {};
  for (const [k, v] of Object.entries(dict(trailer.Info))) {
    if (DATE_KEYS.has(k)) continue;
    const r = get(v);
    info[k] = typeof r === 'string' ? r : fmt(r);
  }

  // Fonts, and a code → text map per font object.
  const toUnicode = new Map<number, Map<string, string>>();
  const fonts: PdfSummary['fonts'] = [];
  for (const [num, obj] of objects) {
    const d = obj.value;
    if (!isDict(d) || name(d.Type) !== 'Font') continue;
    if (
      name(d.Subtype) === 'CIDFontType2' ||
      name(d.Subtype) === 'CIDFontType0'
    )
      continue; // descendant of a Type0 font, reported through its parent
    const tu = isRef(d.ToUnicode) ? objects.get(d.ToUnicode.ref[0]) : undefined;
    if (tu?.stream)
      toUnicode.set(num, parseToUnicode(tu.stream.toString('latin1')));
    fonts.push({
      BaseFont: name(d.BaseFont) ?? '?',
      Subtype: name(d.Subtype) ?? '?',
      toUnicode: !!tu,
    });
  }
  fonts.sort((a, b) => a.BaseFont.localeCompare(b.BaseFont));

  // OutputIntents.
  const intents = get(root.OutputIntents);
  const outputIntents: OutputIntentSummary[] = (
    Array.isArray(intents) ? intents : []
  ).map((ref) => {
    const d = dict(ref);
    const prof = isRef(d.DestOutputProfile)
      ? objects.get(d.DestOutputProfile.ref[0])
      : undefined;
    const pd = prof && isDict(prof.value) ? prof.value : undefined;
    const s: OutputIntentSummary = {
      subtype: name(d.S),
      OutputConditionIdentifier: name(d.OutputConditionIdentifier),
      profile: pd
        ? {
            N: typeof get(pd.N) === 'number' ? (get(pd.N) as number) : null,
            bytes: prof!.stream?.length ?? 0,
          }
        : null,
    };
    for (const k of ['OutputCondition', 'RegistryName', 'Info'] as const) {
      const v = name(d[k]);
      if (v !== null) s[k] = v;
    }
    return s;
  });

  // Pages in /Kids order.
  const pageDicts: PdfDict[] = [];
  const walk = (node: PdfValue | undefined, inherited: PdfDict): void => {
    const d = dict(node);
    const merged: PdfDict = { ...inherited };
    for (const k of ['MediaBox', 'CropBox', 'Resources'])
      if (d[k] !== undefined) merged[k] = d[k];
    if (name(d.Type) === 'Pages') {
      const kids = get(d.Kids);
      for (const k of Array.isArray(kids) ? kids : []) walk(k, merged);
    } else {
      pageDicts.push({ ...d, ...merged });
    }
  };
  walk(root.Pages, {});

  const pages = pageDicts.map((page): PageSummary => {
    const res = dict(page.Resources);
    const fontRes = dict(res.Font);
    const pageFonts: Record<string, string> = {};
    const fontMaps = new Map<string, Map<string, string> | undefined>();
    for (const [rn, ref] of Object.entries(fontRes)) {
      pageFonts[rn] = name(dict(ref).BaseFont) ?? '?';
      fontMaps.set(rn, isRef(ref) ? toUnicode.get(ref.ref[0]) : undefined);
    }

    const contents = get(page.Contents);
    const streams = (Array.isArray(contents) ? contents : [page.Contents])
      .map((r) => (isRef(r) ? objects.get(r.ref[0])?.stream : undefined))
      .filter((b): b is Buffer => !!b);
    const content = streams.map((b) => b.toString('latin1')).join('\n');

    const colourOperators: Record<string, number> = {};
    const fills: Record<string, number> = {};
    const strokes: Record<string, number> = {};
    const painting: Record<string, number> = {};
    const text: TextRun[] = [];
    let segments = 0;
    const hash = createHash('sha256');

    // Graphics state that matters here, with q/Q.
    interface State {
      fillSpace: string;
      fill: string;
      strokeSpace: string;
      stroke: string;
    }
    let gs: State = {
      fillSpace: 'DeviceGray',
      fill: '0',
      strokeSpace: 'DeviceGray',
      stroke: '0',
    };
    const stack: State[] = [];
    let font = '';
    let fontMap: Map<string, string> | undefined;
    let size = 0;
    let mode = 0;
    let tm = [1, 0, 0, 1, 0, 0];
    let tlm = [1, 0, 0, 1, 0, 0];
    let leading = 0;

    const show = (codes: string): void => {
      let decoded = '';
      if (fontMap && fontMap.size) {
        // pdfkit's embedded fonts use 2-byte codes.
        for (let i = 0; i < codes.length; i += 4)
          decoded += fontMap.get(codes.slice(i, i + 4)) ?? '�';
      } else decoded = `<${codes}>`;
      text.push({
        font: pageFonts[font] ?? font,
        size: round(size),
        mode,
        x: round(tm[4], 3),
        y: round(tm[5], 3),
        text: decoded,
      });
    };

    const lex = new Lexer(content);
    const operands: (PdfValue | { hex: string })[] = [];
    for (;;) {
      const t = lex.next();
      if (!t) break;
      if (t.kind === 'num') operands.push(t.value);
      else if (t.kind === 'name') operands.push({ name: t.value });
      else if (t.kind === 'str') operands.push({ hex: t.hex });
      else if (t.kind === 'punct') {
        if (t.value === '[') {
          // TJ array: keep strings and numbers flat.
          const arr: (number | { hex: string })[] = [];
          for (;;) {
            const n = lex.next();
            if (!n || (n.kind === 'punct' && n.value === ']')) break;
            if (n.kind === 'num') arr.push(n.value);
            else if (n.kind === 'str') arr.push({ hex: n.hex });
          }
          operands.push(arr as PdfValue[]);
        } else if (t.value === '<<') {
          // Inline dictionary (marked content); parse and keep as operand.
          lex.pos -= 2;
          operands.push(lex.value() ?? null);
        }
      } else {
        const op = t.value;
        const nums = operands.filter((o): o is number => typeof o === 'number');
        const args = operands.map((o) =>
          typeof o === 'object' && o !== null && 'hex' in o
            ? `<${o.hex}>`
            : fmt(o as PdfValue),
        );
        if (COLOUR_OPS.has(op)) {
          const key = `${args.join(' ')} ${op}`.trim();
          colourOperators[key] = (colourOperators[key] ?? 0) + 1;
          const values = nums.map((n) => String(round(n))).join(' ');
          if (op === 'cs')
            gs = { ...gs, fillSpace: args[0]?.slice(1) ?? '?', fill: '' };
          else if (op === 'CS')
            gs = { ...gs, strokeSpace: args[0]?.slice(1) ?? '?', stroke: '' };
          else if (op === 'sc' || op === 'scn') gs = { ...gs, fill: values };
          else if (op === 'SC' || op === 'SCN') gs = { ...gs, stroke: values };
          else if (op === 'g')
            gs = { ...gs, fillSpace: 'DeviceGray', fill: values };
          else if (op === 'G')
            gs = { ...gs, strokeSpace: 'DeviceGray', stroke: values };
          else if (op === 'rg')
            gs = { ...gs, fillSpace: 'DeviceRGB', fill: values };
          else if (op === 'RG')
            gs = { ...gs, strokeSpace: 'DeviceRGB', stroke: values };
          else if (op === 'k')
            gs = { ...gs, fillSpace: 'DeviceCMYK', fill: values };
          else if (op === 'K')
            gs = { ...gs, strokeSpace: 'DeviceCMYK', stroke: values };
        } else if (op === 'q') stack.push(gs);
        else if (op === 'Q') gs = stack.pop() ?? gs;
        else if (PATH_CONSTRUCTION.has(op)) {
          segments++;
          hash.update(`${nums.map((n) => n.toFixed(2)).join(' ')} ${op}\n`);
        } else if (PATH_PAINTING.has(op)) {
          painting[op] = (painting[op] ?? 0) + 1;
          hash.update(`${op}\n`);
          if (FILLS.has(op)) {
            const k = `${gs.fillSpace} ${gs.fill}`.trim();
            fills[k] = (fills[k] ?? 0) + 1;
          }
          if (STROKES.has(op)) {
            const k = `${gs.strokeSpace} ${gs.stroke}`.trim();
            strokes[k] = (strokes[k] ?? 0) + 1;
          }
        } else if (op === 'BT') {
          tm = [1, 0, 0, 1, 0, 0];
          tlm = [1, 0, 0, 1, 0, 0];
        } else if (op === 'Tf') {
          const n = operands[0];
          font = isName(n) ? n.name : '';
          fontMap = fontMaps.get(font);
          size = nums[0] ?? 0;
        } else if (op === 'Tr') mode = nums[0] ?? 0;
        else if (op === 'TL') leading = nums[0] ?? 0;
        else if (op === 'Tm') {
          tm = nums.slice(0, 6);
          tlm = [...tm];
        } else if (op === 'Td' || op === 'TD') {
          const [tx = 0, ty = 0] = nums;
          if (op === 'TD') leading = -ty;
          tlm = [
            tlm[0],
            tlm[1],
            tlm[2],
            tlm[3],
            tx * tlm[0] + ty * tlm[2] + tlm[4],
            tx * tlm[1] + ty * tlm[3] + tlm[5],
          ];
          tm = [...tlm];
        } else if (op === 'T*' || op === "'" || op === '"') {
          tlm = [
            tlm[0],
            tlm[1],
            tlm[2],
            tlm[3],
            -leading * tlm[2] + tlm[4],
            -leading * tlm[3] + tlm[5],
          ];
          tm = [...tlm];
          if (op !== 'T*') {
            const s = operands[operands.length - 1];
            if (isHex(s)) show(s.hex);
          }
        } else if (op === 'Tj') {
          const s = operands[0];
          if (isHex(s)) show(s.hex);
        } else if (op === 'TJ') {
          const arr = operands[0];
          if (Array.isArray(arr))
            show(
              (arr as unknown[])
                .map((a) =>
                  a && typeof a === 'object' && 'hex' in a
                    ? (a as { hex: string }).hex
                    : '',
                )
                .join(''),
            );
        }
        operands.length = 0;
      }
    }

    const box = (k: string): number[] | null => numbers(page[k]);
    return {
      boxes: {
        MediaBox: box('MediaBox'),
        CropBox: box('CropBox'),
        BleedBox: box('BleedBox'),
        TrimBox: box('TrimBox'),
        ArtBox: box('ArtBox'),
      },
      fonts: pageFonts,
      colourOperators,
      fills,
      strokes,
      text,
      paths: {
        painting,
        segments,
        digest: hash.digest('hex').slice(0, 16),
      },
    };
  });

  return {
    version,
    pageCount: pages.length,
    info,
    hasId: Array.isArray(get(trailer.ID)),
    fonts,
    outputIntents,
    pages,
  };
};
