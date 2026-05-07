// markup.ts — Inline markup parser for @paragraf/compile.
//
// Converts a paragraph text string containing simple XML-like inline tags
// into an array of TextSpan[] suitable for ParagraphInput.spans.
//
// Supported tags:
//   <b>          — bold: weight 700
//   <i>          — italic: style 'italic'
//   <bi>         — bold italic: weight 700 + style 'italic'
//   <sup>        — superscript: verticalOffset = +size * 0.35
//   <sub>        — subscript:   verticalOffset = -size * 0.25
//   <span cs="NAME">  — named character style from charStyles registry
//
// Unknown/malformed tags are emitted as literal text (non-throwing).
// Nesting is NOT supported — tags must not overlap.

import type { Font, TextSpan } from '@paragraf/types';
import { resolveWeight } from '@paragraf/types';
import type { CharStyleDef } from '@paragraf/style';

// ─── Tag token ───────────────────────────────────────────────────────────────

type OpenTag =
  | { kind: 'b' }
  | { kind: 'i' }
  | { kind: 'bi' }
  | { kind: 'sup' }
  | { kind: 'sub' }
  | { kind: 'span'; csName: string };

type Token =
  | { type: 'text'; value: string }
  | { type: 'open'; tag: OpenTag }
  | { type: 'close'; name: string };

// ─── Tokeniser ───────────────────────────────────────────────────────────────

const TAG_RE = /<(\/?)(\w+)(?:\s+cs="([^"]*)")?>/g;

function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  TAG_RE.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text)) !== null) {
    const [fullMatch, slash, name, csAttr] = m;
    const start = m.index;

    if (start > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, start) });
    }

    if (slash === '/') {
      tokens.push({ type: 'close', name });
    } else {
      const openTag = resolveOpenTag(name, csAttr);
      if (openTag !== null) {
        tokens.push({ type: 'open', tag: openTag });
      } else {
        // Unknown tag — treat as literal text
        tokens.push({ type: 'text', value: fullMatch });
      }
    }

    lastIndex = TAG_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

function resolveOpenTag(
  name: string,
  csAttr: string | undefined,
): OpenTag | null {
  switch (name) {
    case 'b':
      return { kind: 'b' };
    case 'i':
      return { kind: 'i' };
    case 'bi':
      return { kind: 'bi' };
    case 'sup':
      return { kind: 'sup' };
    case 'sub':
      return { kind: 'sub' };
    case 'span':
      return csAttr !== undefined ? { kind: 'span', csName: csAttr } : null;
    default:
      return null;
  }
}

// ─── Font override helpers ────────────────────────────────────────────────────

function applyOpenTag(
  tag: OpenTag,
  base: Font,
  charStyles: Record<string, CharStyleDef> | undefined,
): { font: Font; verticalOffset?: number } {
  switch (tag.kind) {
    case 'b':
      return { font: { ...base, weight: 700 } };
    case 'i':
      return { font: { ...base, style: 'italic' } };
    case 'bi':
      return { font: { ...base, weight: 700, style: 'italic' } };
    case 'sup':
      return { font: base, verticalOffset: base.size * 0.35 };
    case 'sub':
      return { font: base, verticalOffset: -(base.size * 0.25) };
    case 'span': {
      const def = charStyles?.[tag.csName];
      if (!def?.font) return { font: base };
      const spec = def.font;
      const overridden: Font = {
        ...base,
        ...(spec.size !== undefined && { size: spec.size }),
        ...(spec.weight !== undefined && {
          weight: resolveWeight(spec.weight),
        }),
        ...(spec.style !== undefined && { style: spec.style }),
        ...(spec.stretch !== undefined && { stretch: spec.stretch }),
        ...(spec.letterSpacing !== undefined && {
          letterSpacing: spec.letterSpacing,
        }),
        ...(spec.variant !== undefined && { variant: spec.variant }),
        ...(spec.ligatures !== undefined && { ligatures: spec.ligatures }),
      };
      return { font: overridden };
    }
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────

// ─── RTL detection (P2-style first-strong scan) ──────────────────────────────

// Matches a single RTL strong character (Hebrew, Arabic, Syriac, Thaana, NKo,
// Samaritan, Mandaic, Arabic Supplement, Arabic Extended-A/B,
// Arabic Presentation Forms-A/B).
const RTL_STRONG_RE =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07FF\u07C0-\u07FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;

// Matches a single LTR strong character (Latin, Greek, Cyrillic, CJK, etc.).
// Used to identify the first strong character before any RTL match.
const LTR_STRONG_RE =
  /[A-Za-z\u00C0-\u02B8\u0370-\u03FF\u0400-\u04FF\u4E00-\u9FFF]/;

/**
 * Returns `true` if the first strong-directional character in `text` is RTL.
 * Implements Unicode Bidi Algorithm rules P2/P3: scan from the start of the
 * string and return the directionality of the first strong character found.
 * A strong LTR character encountered before any RTL character returns `false`.
 */
export function looksLikeRtl(text: string): boolean {
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    if (RTL_STRONG_RE.test(ch)) return true;
    if (LTR_STRONG_RE.test(ch)) return false;
    i += ch.length;
  }
  return false;
}

/**
 * Parses a paragraph text string containing inline markup tags into an array
 * of {@link TextSpan} objects for use in `ParagraphInput.spans`.
 *
 * If the text contains no `<` characters, returns a single-span array with
 * the original text and base font — zero overhead for the common case.
 *
 * Nesting is not supported. Unknown or malformed tags are emitted as literal
 * text rather than throwing.
 *
 * @param text       - The raw paragraph text, possibly containing inline tags.
 * @param baseFont   - The resolved base font for the paragraph.
 * @param charStyles - Optional map of character style definitions, used to
 *                     resolve `<span cs="NAME">` tags.
 */
export function parseInlineMarkup(
  text: string,
  baseFont: Font,
  charStyles?: Record<string, CharStyleDef>,
): TextSpan[] {
  // Fast path: no tags present
  if (!text.includes('<')) {
    return [{ text, font: baseFont }];
  }

  const tokens = tokenise(text);
  const spans: TextSpan[] = [];

  // Stack of active tag states (flat model — innermost wins)
  type TagState = { tag: OpenTag; font: Font; verticalOffset?: number };
  const stack: TagState[] = [];

  let pendingText = '';

  function flushText(): void {
    if (pendingText === '') return;
    const top = stack.at(-1);
    const span: TextSpan =
      top !== undefined
        ? {
            text: pendingText,
            font: top.font,
            ...(top.verticalOffset !== undefined && {
              verticalOffset: top.verticalOffset,
            }),
          }
        : { text: pendingText, font: baseFont };
    spans.push(span);
    pendingText = '';
  }

  for (const token of tokens) {
    if (token.type === 'text') {
      pendingText += token.value;
    } else if (token.type === 'open') {
      flushText();
      const { font, verticalOffset } = applyOpenTag(
        token.tag,
        baseFont,
        charStyles,
      );
      stack.push({ tag: token.tag, font, verticalOffset });
    } else {
      // close tag — flush accumulated text under current scope, pop matching entry
      flushText();
      // Pop the most recent matching tag from the stack
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.tag.kind === token.name) {
          stack.splice(i, 1);
          break;
        }
      }
    }
  }

  flushText();

  // If parsing produced no spans (e.g. empty string), return single empty span
  if (spans.length === 0) {
    return [{ text, font: baseFont }];
  }

  return spans;
}
