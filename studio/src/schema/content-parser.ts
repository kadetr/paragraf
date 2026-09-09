// studio/src/schema/content-parser.ts
// Parses a studio content.xml string into StudioContentSlot[].
// Uses @xmldom/xmldom DOMParser — no global DOMParser in Node.
// Frame sections are reordered by frame position in the active page's frames[],
// not by XML document order.

import { DOMParser } from '@xmldom/xmldom';
import type {
  StudioTemplate,
  StudioContentSlot,
  ValidationError,
} from './types.js';

// ─── Return type ─────────────────────────────────────────────────────────────

export interface ParseContentResult {
  slots: StudioContentSlot[];
  errors: ValidationError[];
}

// ─── Helpers (defined before main function to avoid hoisting issues) ──────────

/** Check if the document has a <parsererror> anywhere in the tree. */
function hasParseerror(doc: ReturnType<DOMParser['parseFromString']>): boolean {
  return doc.getElementsByTagName('parsererror').length > 0;
}

/** Extract the text content of the first <parsererror> element. */
function extractParseerrorMessage(
  doc: ReturnType<DOMParser['parseFromString']>,
): string {
  const el = doc.getElementsByTagName('parsererror')[0];
  return el ? (el.textContent ?? 'unknown parse error') : 'unknown parse error';
}

/** Get all direct <p> children of a section element. */
function getParagraphs(section: Element): Element[] {
  const result: Element[] = [];
  const children = section.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (
      child.nodeType === 1 /* ELEMENT_NODE */ &&
      (child as Element).tagName === 'p'
    ) {
      result.push(child as Element);
    }
  }
  return result;
}

/** Serialize an element back to its XML string representation. */
function serializeElement(el: Element): string {
  const attrs: string[] = [];
  const attributes = el.attributes;
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    attrs.push(`${attr.name}="${attr.value}"`);
  }
  const openTag =
    attrs.length > 0 ? `<${el.tagName} ${attrs.join(' ')}>` : `<${el.tagName}>`;
  const inner = extractText(el); // recurse
  return `${openTag}${inner}</${el.tagName}>`;
}

/**
 * Serialize the text content of a <p> element, preserving inline markup
 * (e.g. <span style="...">text</span>) but excluding <image> elements.
 * Whitespace is normalised: all runs of whitespace (including newlines from
 * indented XML) are collapsed to a single space and leading/trailing
 * whitespace is trimmed.
 */
function extractText(p: Element): string {
  const parts: string[] = [];
  const children = p.childNodes;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === 3 /* TEXT_NODE */) {
      parts.push(child.nodeValue ?? '');
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as Element;
      if (el.tagName === 'image') {
        // Excluded from ContentSlot text
        continue;
      }
      // Preserve inline markup verbatim (e.g. <span style="...">text</span>)
      parts.push(serializeElement(el));
    }
  }

  // Collapse whitespace runs (newlines, multiple spaces) to single spaces
  // so the composer sees clean word sequences.
  return parts.join('').replace(/\s+/g, ' ').trim();
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Parse a studio content.xml string into StudioContentSlot[].
 *
 * Sections are ordered ascending by frameIndex (the 0-based position of the
 * frame in the active page's `frames[]` array), not by XML document order.
 * Multiple <p> elements in one section share the same frameIndex and appear
 * consecutively.
 *
 * @param xml           — content.xml string
 * @param studioTemplate — validated StudioTemplate (for frame/style lookups)
 * @param pageKey        — which page to resolve frame names against (default: "default")
 * @returns ParseContentResult — slots[] and errors[]. If XML is malformed,
 *          slots is empty and errors contains the parse error.
 */
export function parseContentXml(
  xml: string,
  studioTemplate: StudioTemplate,
  pageKey = 'default',
): ParseContentResult {
  const errors: ValidationError[] = [];
  const slots: StudioContentSlot[] = [];

  // ── Parse XML ──────────────────────────────────────────────────────────

  const parser = new DOMParser();
  let doc: ReturnType<DOMParser['parseFromString']>;
  try {
    doc = parser.parseFromString(xml, 'text/xml');
  } catch (err) {
    errors.push({
      field: '',
      message: `Malformed XML: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { slots, errors };
  }

  // xmldom may also report parse errors as a <parsererror> child of the document
  const root = doc.documentElement;
  if (root && (root.tagName === 'parsererror' || hasParseerror(doc))) {
    errors.push({
      field: '',
      message: `Malformed XML: ${extractParseerrorMessage(doc)}`,
    });
    return { slots, errors };
  }

  // ── Resolve page frame order ─────────────────────────────────────────

  const activePage =
    studioTemplate.pages[pageKey] ??
    studioTemplate.pages[Object.keys(studioTemplate.pages)[0]];

  if (!activePage) {
    errors.push({ field: 'pageKey', message: 'No pages defined in template' });
    return { slots, errors };
  }

  // Build a global frame ordering from ALL frames defined in the template
  // registry, not just the active page's frame list. A section in content.xml
  // may reference a frame that only appears on a specific page (e.g.
  // "title-block" on "first" but not on "default"). Using the registry order
  // (Object.keys preserves insertion order) ensures every section is included.
  const allFrameNames = Object.keys(studioTemplate.frames);
  const frameIndexMap = new Map<string, number>();
  for (let i = 0; i < allFrameNames.length; i++) {
    frameIndexMap.set(allFrameNames[i], i);
  }

  const styleNames = new Set(Object.keys(studioTemplate.styles));

  // ── Collect sections by frame ─────────────────────────────────────────

  const sectionsByFrame = new Map<
    number,
    { frameName: string; paragraphs: Element[] }
  >();

  const sections = doc.getElementsByTagName('section');
  for (let s = 0; s < sections.length; s++) {
    const section = sections[s] as Element;
    const frameName = section.getAttribute('frame');

    if (!frameName) {
      errors.push({
        field: `section[${s}]`,
        message: `<section> at index ${s} is missing required "frame" attribute`,
      });
      continue;
    }

    if (!frameIndexMap.has(frameName)) {
      errors.push({
        field: `section[${s}].frame`,
        message: `Frame "${frameName}" is not defined in the template frames registry`,
      });
      continue;
    }

    const frameIndex = frameIndexMap.get(frameName)!;
    const existing = sectionsByFrame.get(frameIndex);
    const pElements = getParagraphs(section);

    if (existing) {
      existing.paragraphs.push(...pElements);
    } else {
      sectionsByFrame.set(frameIndex, { frameName, paragraphs: pElements });
    }
  }

  // ── Emit slots ordered ascending by frameIndex ────────────────────────

  const sortedFrameIndices = [...sectionsByFrame.keys()].sort((a, b) => a - b);

  for (const frameIndex of sortedFrameIndices) {
    const { frameName, paragraphs } = sectionsByFrame.get(frameIndex)!;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const p = paragraphs[pIdx] as Element;
      const style = p.getAttribute('style');

      if (!style) {
        errors.push({
          field: `section[frame="${frameName}"].p[${pIdx}]`,
          message: `<p> at index ${pIdx} in frame "${frameName}" is missing required "style" attribute`,
        });
        continue;
      }

      if (!styleNames.has(style)) {
        errors.push({
          field: `section[frame="${frameName}"].p[${pIdx}].style`,
          message: `Style "${style}" not found in template styles registry`,
        });
        continue;
      }

      const text = extractText(p);
      slots.push({ style, text, frameIndex });
    }
  }

  return { slots, errors };
}
