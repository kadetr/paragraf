// studio/src/schema/validate.ts
// Pure validation of a raw (unknown) studio template.json object.
// Returns an array of ValidationErrors — empty means valid.
// Does NOT parse JSON; caller is responsible for JSON.parse().

import type {
  StudioTemplate,
  StudioFrame,
  StudioPage,
  ValidationError,
} from './types.js';

// ─── Compile key allowlist ────────────────────────────────────────────────────

const COMPILE_KEY_ALLOWLIST = new Set<string>([
  'shaping',
  'selectable',
  'maxPages',
  'onOverflow',
  'opticalMargins',
  'hyphenation',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Validate a raw (already-parsed) studio template.json object.
 *
 * @param raw — the parsed JSON object (type unknown)
 * @returns array of ValidationError. Empty → valid.
 */
export function validateStudioSchema(raw: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isObject(raw)) {
    errors.push({ field: '', message: 'template.json must be a JSON object' });
    return errors;
  }

  // ── Required top-level keys ──────────────────────────────────────────────

  if (!isObject(raw['layout'])) {
    errors.push({
      field: 'layout',
      message: 'Missing required field "layout"',
    });
  } else {
    _validateLayout(raw['layout'], errors);
  }

  if (!isObject(raw['fonts'])) {
    errors.push({ field: 'fonts', message: 'Missing required field "fonts"' });
  }

  if (!isObject(raw['styles'])) {
    errors.push({
      field: 'styles',
      message: 'Missing required field "styles"',
    });
  }

  if (!isObject(raw['frames'])) {
    errors.push({
      field: 'frames',
      message: 'Missing required field "frames"',
    });
    return errors; // cannot validate pages without frames
  }

  if (!isObject(raw['pages'])) {
    errors.push({ field: 'pages', message: 'Missing required field "pages"' });
    return errors; // cannot validate page refs without pages
  }

  const frames = raw['frames'] as Record<string, unknown>;
  const styles = isObject(raw['styles'])
    ? (raw['styles'] as Record<string, unknown>)
    : {};
  const pages = raw['pages'] as Record<string, unknown>;

  // ── Validate each frame ───────────────────────────────────────────────────

  for (const [frameName, frame] of Object.entries(frames)) {
    if (!isObject(frame)) {
      errors.push({
        field: `frames.${frameName}`,
        message: 'Frame must be an object',
      });
    }
  }

  // ── Validate styles: extends references ───────────────────────────────────

  for (const [styleName, style] of Object.entries(styles)) {
    if (isObject(style) && typeof style['extends'] === 'string') {
      if (!(style['extends'] in styles)) {
        errors.push({
          field: `styles.${styleName}.extends`,
          message: `Style "${styleName}" extends undefined style "${style['extends']}"`,
        });
      }
    }
  }

  // ── Validate each page ───────────────────────────────────────────────────

  for (const [pageKey, page] of Object.entries(pages)) {
    if (!isObject(page)) {
      errors.push({
        field: `pages.${pageKey}`,
        message: 'Page must be an object',
      });
      continue;
    }

    const pageFrames = page['frames'];
    if (!Array.isArray(pageFrames)) {
      errors.push({
        field: `pages.${pageKey}.frames`,
        message: 'Page "frames" must be an array',
      });
      continue;
    }

    let autoCount = 0;

    for (let i = 0; i < pageFrames.length; i++) {
      const frameName = pageFrames[i];
      if (typeof frameName !== 'string') {
        errors.push({
          field: `pages.${pageKey}.frames[${i}]`,
          message: 'Frame reference must be a string',
        });
        continue;
      }

      // Frame must exist in frames registry
      if (!(frameName in frames)) {
        errors.push({
          field: `pages.${pageKey}.frames[${i}]`,
          message: `Frame "${frameName}" not found in frames registry`,
        });
        continue;
      }

      // Count auto frames
      const frameObj = frames[frameName];
      if (isObject(frameObj) && frameObj['height'] === 'auto') {
        autoCount++;
      }
    }

    if (autoCount > 1) {
      errors.push({
        field: `pages.${pageKey}`,
        message: `Page "${pageKey}" has ${autoCount} frames with height "auto" — only one is allowed`,
      });
    }
  }

  // ── Validate compile section keys ─────────────────────────────────────────

  if ('compile' in raw && isObject(raw['compile'])) {
    for (const key of Object.keys(raw['compile'])) {
      if (!COMPILE_KEY_ALLOWLIST.has(key)) {
        errors.push({
          field: `compile.${key}`,
          message: `Unknown compile setting "${key}" — allowed keys: ${[...COMPILE_KEY_ALLOWLIST].join(', ')}`,
        });
      }
    }
  }

  return errors;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _validateLayout(
  layout: Record<string, unknown>,
  errors: ValidationError[],
): void {
  if (!layout['size']) {
    errors.push({
      field: 'layout.size',
      message: 'Missing required field "layout.size"',
    });
  }
  if (layout['margins'] === undefined || layout['margins'] === null) {
    errors.push({
      field: 'layout.margins',
      message: 'Missing required field "layout.margins"',
    });
  }
}
