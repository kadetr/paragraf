// render.ts

import { ComposedParagraph, Font, Measurer } from '@paragraf/types';
import { FontEngine } from '@paragraf/font-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PositionedSegment {
  text: string;
  font: Font;
  x: number; // absolute x on page
  y: number; // absolute y on page (baseline − verticalOffset)
}

export interface RenderedLine {
  segments: PositionedSegment[];
  baseline: number; // absolute y of baseline on page
  lineHeight: number;
}

export type RenderedParagraph = RenderedLine[];

// ─── Layout pass ──────────────────────────────────────────────────────────────

export const layoutParagraph = (
  composed: ComposedParagraph,
  measurer: Measurer,
  origin: { x: number; y: number },
): RenderedParagraph => {
  const rendered: RenderedParagraph = [];
  let lineY = origin.y;

  for (const line of composed) {
    const baseline: number = lineY + line.baseline;
    const segments: PositionedSegment[] = [];

    if (line.direction === 'rtl') {
      // RTL visual reordering: render words in reverse logical order, right-to-left.
      // Pre-compute word widths to determine start positions.
      const wordWidths = line.wordRuns.map((segs) =>
        segs.reduce(
          (sum, seg) => sum + measurer.measure(seg.text, seg.font),
          0,
        ),
      );

      let rightEdge = origin.x + line.lineWidth + (line.xOffset ?? 0);
      for (let wi = line.wordRuns.length - 1; wi >= 0; wi--) {
        const wordStart = rightEdge - wordWidths[wi];
        let segX = wordStart;
        for (const seg of line.wordRuns[wi]) {
          segments.push({
            text: seg.text,
            font: seg.font,
            x: segX,
            y: baseline - (seg.verticalOffset ?? 0),
          });
          segX += measurer.measure(seg.text, seg.font);
        }
        rightEdge = wordStart - (wi > 0 ? line.wordSpacing : 0);
      }
    } else {
      // LTR layout (original behavior); xOffset shifts the line for OMA
      let wordX = origin.x + (line.xOffset ?? 0);
      for (let wi = 0; wi < line.wordRuns.length; wi++) {
        for (const seg of line.wordRuns[wi]) {
          segments.push({
            text: seg.text,
            font: seg.font,
            x: wordX,
            y: baseline - (seg.verticalOffset ?? 0),
          });
          wordX += measurer.measure(seg.text, seg.font);
        }
        if (wi < line.wordRuns.length - 1) {
          wordX += line.wordSpacing;
        }
      }
    }

    rendered.push({ segments, baseline, lineHeight: line.lineHeight });
    lineY += line.lineHeight;
  }

  return rendered;
};

// ─── Helper: Render glyphs with GSUB features ─────────────────────────────────

const getAndSubstituteGlyphs = (
  fontEngine: FontEngine,
  fontId: string,
  text: string,
  font?: Font,
) => {
  let glyphs = fontEngine.glyphsForString(fontId, text, font);
  glyphs = fontEngine.applyLigatures(fontId, glyphs);
  if (font?.variant === 'superscript') {
    glyphs = fontEngine.applySingleSubstitution(fontId, glyphs, 'sups');
  } else if (font?.variant === 'subscript') {
    glyphs = fontEngine.applySingleSubstitution(fontId, glyphs, 'subs');
  }
  return glyphs;
};

// ─── Metrics cache to avoid repeated getFontMetrics calls ──────────────────────

// unitsPerEm is a font-level property (not size-dependent); cache by fontId only
const metricsCache = new Map<string, number>();

export function clearRenderCaches(): void {
  metricsCache.clear();
}

const getUnitsPerEm = (
  fontEngine: FontEngine,
  fontId: string,
  fontSize: number,
): number => {
  if (!metricsCache.has(fontId)) {
    metricsCache.set(
      fontId,
      fontEngine.getFontMetrics(fontId, fontSize).unitsPerEm,
    );
  }
  return metricsCache.get(fontId)!;
};

// ─── SVG renderer ─────────────────────────────────────────────────────────────

export const renderToSvg = (
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  viewport: { width: number; height: number },
): string => {
  const paths: string[] = [];

  for (const line of rendered) {
    for (const seg of line.segments) {
      if (!seg.text) continue;

      const glyphs = getAndSubstituteGlyphs(
        fontEngine,
        seg.font.id,
        seg.text,
        seg.font,
      );

      const unitsPerEm = getUnitsPerEm(fontEngine, seg.font.id, seg.font.size);
      const scale = seg.font.size / unitsPerEm;
      let gx = seg.x;
      for (let i = 0; i < glyphs.length; i++) {
        const glyph = glyphs[i];
        const drawX = gx + (glyph.xOffset ?? 0) * scale;
        const drawY = seg.y - (glyph.yOffset ?? 0) * scale;
        const glyphPath = fontEngine.getGlyphPath(
          seg.font.id,
          glyph,
          drawX,
          drawY,
          seg.font.size,
        );
        paths.push(glyphPath.toSVG(2));

        // Advance x position (advance width + kerning; kern=0 for WasmFontEngine)
        const kern =
          i < glyphs.length - 1
            ? fontEngine.getKerning(seg.font.id, glyph, glyphs[i + 1])
            : 0;
        gx += (glyph.advanceWidth + kern) * scale;

        // Add letter spacing
        const letterSpacing = seg.font.letterSpacing ?? 0;
        if (letterSpacing && i < glyphs.length - 1) {
          gx += letterSpacing;
        }
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}">`,
    ...paths,
    '</svg>',
  ].join('\n');
};

// ─── Canvas renderer ──────────────────────────────────────────────────────────

export const renderToCanvas = (
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  ctx: any,
): void => {
  for (const line of rendered) {
    for (const seg of line.segments) {
      if (!seg.text) continue;

      const glyphs = getAndSubstituteGlyphs(
        fontEngine,
        seg.font.id,
        seg.text,
        seg.font,
      );

      const unitsPerEm = getUnitsPerEm(fontEngine, seg.font.id, seg.font.size);
      const scale = seg.font.size / unitsPerEm;
      let gx = seg.x;
      for (let i = 0; i < glyphs.length; i++) {
        const glyph = glyphs[i];
        const drawX = gx + (glyph.xOffset ?? 0) * scale;
        const drawY = seg.y - (glyph.yOffset ?? 0) * scale;
        const glyphPath = fontEngine.getGlyphPath(
          seg.font.id,
          glyph,
          drawX,
          drawY,
          seg.font.size,
        );

        // Draw path commands to canvas
        ctx.beginPath();
        let hasCommands = false;
        for (const cmd of glyphPath.commands) {
          if (cmd.command === 'moveTo') {
            ctx.moveTo(cmd.args[0], cmd.args[1]);
            hasCommands = true;
          } else if (cmd.command === 'lineTo') {
            ctx.lineTo(cmd.args[0], cmd.args[1]);
          } else if (cmd.command === 'quadraticCurveTo') {
            ctx.quadraticCurveTo(
              cmd.args[0],
              cmd.args[1],
              cmd.args[2],
              cmd.args[3],
            );
          } else if (cmd.command === 'bezierCurveTo') {
            ctx.bezierCurveTo(
              cmd.args[0],
              cmd.args[1],
              cmd.args[2],
              cmd.args[3],
              cmd.args[4],
              cmd.args[5],
            );
          } else if (cmd.command === 'closePath') {
            ctx.closePath();
          }
        }

        if (hasCommands) ctx.fill();

        // Advance x position (advance width + kerning; kern=0 for WasmFontEngine)
        const kern =
          i < glyphs.length - 1
            ? fontEngine.getKerning(seg.font.id, glyph, glyphs[i + 1])
            : 0;
        gx += (glyph.advanceWidth + kern) * scale;

        // Add letter spacing
        const letterSpacing = seg.font.letterSpacing ?? 0;
        if (letterSpacing && i < glyphs.length - 1) {
          gx += letterSpacing;
        }
      }
    }
  }
};
