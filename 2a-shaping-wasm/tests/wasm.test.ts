import { createRequire } from 'module';
import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import { computeBreakpoints, traceback } from '@paragraf/linebreak';
import { FORCED_BREAK, PROHIBITED } from '@paragraf/types';
import { createMeasurer } from '@paragraf/font-engine';
import { serializeNodesToBinary } from '../src/wasm-binary.js';

const require = createRequire(import.meta.url);

// ─── shared setup ────────────────────────────────────────────────────────────

let wasm: any;

function loadWasm() {
  if (!wasm) wasm = require('../wasm/pkg/paragraf_shaping_wasm.js');
  return wasm;
}

const FONT = {
  id: 'liberation-serif',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

// ─── Phase 2 shared helpers ───────────────────────────────────────────────────

/** Replace ±Infinity with finite sentinels before JSON serialization */
function toWasmJson(para: object): string {
  return JSON.stringify(para, (_k, v) => {
    if (v === -Infinity) return -1e30;
    if (v === Infinity) return 1e30;
    return v;
  });
}

// Mock paragraphs (no font loading needed)
const box = (w: number, t: string) => ({
  type: 'box',
  width: w,
  content: t,
  font: FONT,
});
const glue = (w: number, st: number, sh: number) => ({
  type: 'glue',
  kind: 'word',
  width: w,
  stretch: st,
  shrink: sh,
});
const termination = () => ({
  type: 'glue',
  kind: 'termination',
  width: 0,
  stretch: 1e6,
  shrink: 0,
});
const forced = () => ({
  type: 'penalty',
  width: 0,
  penalty: FORCED_BREAK,
  flagged: false,
});

// 4 words, natural widths: The(30) + q(6) + quick(25) + q(6) + brown(35) = 102 total
// lineWidth=80, stretch=8 per glue → break after "quick" (pos 3):
//   sumWidth=61, sumStretch=8, target=19, ratio=19/8=2.375 ≤ tol(3) ✓
const MOCK_PARA_2LINE = {
  nodes: [
    box(30, 'The'),
    glue(6, 8, 2),
    box(25, 'quick'),
    glue(6, 8, 2),
    box(35, 'brown'),
    glue(6, 8, 2),
    box(20, 'fox'),
    termination(),
    forced(),
  ],
  lineWidth: 80,
  tolerance: 3,
};

// Same content but per-line widths: line 1=70, fallback=80
// With lineWidth1=70: target=70−61=9, ratio=9/8=1.125 ✓
const MOCK_PARA_LINEWIDTHS = {
  ...MOCK_PARA_2LINE,
  lineWidths: [70, 80],
};

// Single line: "hello world" fits in lineWidth=200, so one break at the forced penalty
const MOCK_PARA_1LINE = {
  nodes: [
    box(30, 'hello'),
    glue(6, 3, 2),
    box(25, 'world'),
    termination(),
    forced(),
  ],
  lineWidth: 200,
  tolerance: 3,
};

// ─── Phase 0 — toolchain smoke test ─────────────────────────────────────────

describe('Phase 0 — WASM hello (toolchain smoke test)', () => {
  beforeAll(() => loadWasm());

  it('hello() returns greeting from Rust', () => {
    expect(wasm.hello('world')).toBe('hello from Rust, world');
  });

  it('hello() with empty string', () => {
    expect(wasm.hello('')).toBe('hello from Rust, ');
  });
});

// ─── Phase 1 — Node round-trip ───────────────────────────────────────────────

describe('Phase 1 — Box node round-trip', () => {
  beforeAll(() => loadWasm());

  it('minimal Box node survives round-trip', () => {
    const node = { type: 'box', width: 10.5, content: 'word', font: FONT };
    expect(JSON.parse(wasm.round_trip_node(JSON.stringify(node)))).toEqual(
      node,
    );
  });

  it('Box node with verticalOffset survives round-trip', () => {
    const node = {
      type: 'box',
      width: 8.0,
      content: '2',
      font: { ...FONT, size: 8, variant: 'superscript' },
      verticalOffset: 3.2,
    };
    expect(JSON.parse(wasm.round_trip_node(JSON.stringify(node)))).toEqual(
      node,
    );
  });

  it('Box node with letterSpacing survives round-trip', () => {
    const node = {
      type: 'box',
      width: 11.0,
      content: 'hi',
      font: { ...FONT, letterSpacing: 0.5 },
    };
    expect(JSON.parse(wasm.round_trip_node(JSON.stringify(node)))).toEqual(
      node,
    );
  });

  it('absent optional fields are not added by round-trip', () => {
    const node = { type: 'box', width: 5, content: 'a', font: FONT };
    const result = JSON.parse(wasm.round_trip_node(JSON.stringify(node)));
    expect(result.verticalOffset).toBeUndefined();
    expect(result.font.variant).toBeUndefined();
    expect(result.font.letterSpacing).toBeUndefined();
  });
});

describe('Phase 1 — Glue node round-trip', () => {
  beforeAll(() => loadWasm());

  it('word-spacing Glue survives round-trip', () => {
    const node = {
      type: 'glue',
      kind: 'word',
      width: 4.0,
      stretch: 2.0,
      shrink: 1.0,
    };
    expect(JSON.parse(wasm.round_trip_node(JSON.stringify(node)))).toEqual(
      node,
    );
  });

  it('termination Glue survives round-trip', () => {
    const node = {
      type: 'glue',
      kind: 'termination',
      width: 0,
      stretch: 1e6,
      shrink: 0,
    };
    expect(JSON.parse(wasm.round_trip_node(JSON.stringify(node)))).toEqual(
      node,
    );
  });

  it('absent font field is not added by round-trip', () => {
    const node = {
      type: 'glue',
      kind: 'word',
      width: 4,
      stretch: 2,
      shrink: 1,
    };
    const result = JSON.parse(wasm.round_trip_node(JSON.stringify(node)));
    expect(result.font).toBeUndefined();
  });
});

describe('Phase 1 — Penalty node round-trip', () => {
  beforeAll(() => loadWasm());

  it('hyphen penalty survives round-trip', () => {
    const node = { type: 'penalty', width: 5.0, penalty: 50, flagged: true };
    expect(JSON.parse(wasm.round_trip_node(JSON.stringify(node)))).toEqual(
      node,
    );
  });

  it('forced break (large negative penalty) survives round-trip', () => {
    // -Infinity is not valid JSON; use a large finite sentinel per roadmap contract
    const node = { type: 'penalty', width: 0, penalty: -1e30, flagged: false };
    expect(JSON.parse(wasm.round_trip_node(JSON.stringify(node)))).toEqual(
      node,
    );
  });

  it('prohibited break (large positive penalty) survives round-trip', () => {
    const node = { type: 'penalty', width: 0, penalty: 1e30, flagged: false };
    expect(JSON.parse(wasm.round_trip_node(JSON.stringify(node)))).toEqual(
      node,
    );
  });
});

// ─── Phase 1 — ParagraphInput round-trip ─────────────────────────────────────

describe('Phase 1 — ParagraphInput round-trip', () => {
  beforeAll(() => loadWasm());

  it('minimal paragraph (text + tolerance) survives round-trip', () => {
    const para = {
      nodes: [
        { type: 'box', width: 30, content: 'hello', font: FONT },
        { type: 'glue', kind: 'word', width: 6, stretch: 3, shrink: 2 },
        { type: 'box', width: 25, content: 'world', font: FONT },
        {
          type: 'glue',
          kind: 'termination',
          width: 0,
          stretch: 1e6,
          shrink: 0,
        },
        { type: 'penalty', width: 0, penalty: -1e30, flagged: false },
      ],
      lineWidth: 200,
      tolerance: 3,
    };
    const result = JSON.parse(wasm.round_trip_paragraph(JSON.stringify(para)));
    expect(result.nodes).toHaveLength(5);
    expect(result.nodes[0].content).toBe('hello');
    expect(result.nodes[2].content).toBe('world');
    expect(result.lineWidth).toBe(200);
    expect(result.tolerance).toBe(3);
  });

  it('paragraph with all optional parameters survives round-trip', () => {
    const para = {
      nodes: [{ type: 'box', width: 10, content: 'x', font: FONT }],
      lineWidth: 400,
      tolerance: 2,
      emergencyStretch: 10,
      looseness: -1,
      consecutiveHyphenLimit: 2,
      widowPenalty: 150,
      orphanPenalty: 150,
      justifyLastLine: false,
      alignment: 'justified',
    };
    expect(JSON.parse(wasm.round_trip_paragraph(JSON.stringify(para)))).toEqual(
      para,
    );
  });

  it('paragraph with per-line widths survives round-trip', () => {
    const para = {
      nodes: [{ type: 'box', width: 10, content: 'x', font: FONT }],
      lineWidth: 400,
      lineWidths: [380, 400, 400],
      tolerance: 3,
    };
    const result = JSON.parse(wasm.round_trip_paragraph(JSON.stringify(para)));
    expect(result.lineWidths).toEqual([380, 400, 400]);
  });

  it('absent optional params are not added by round-trip', () => {
    const para = { nodes: [], lineWidth: 200, tolerance: 3 };
    const result = JSON.parse(wasm.round_trip_paragraph(JSON.stringify(para)));
    expect(result.emergencyStretch).toBeUndefined();
    expect(result.looseness).toBeUndefined();
    expect(result.lineWidths).toBeUndefined();
  });
});

// ─── Phase 2 — result shape ───────────────────────────────────────────────────

describe('Phase 2 — compute_breakpoints_wasm result shape', () => {
  beforeAll(() => loadWasm());

  it('returns ok object with active list', () => {
    const result = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(MOCK_PARA_2LINE)),
    );
    expect(result.ok).toBeDefined();
    expect(result.error).toBeUndefined();
    expect(result.ok.active).toBeInstanceOf(Array);
    expect(typeof result.ok.optimalIndex).toBe('number');
    expect(typeof result.ok.usedEmergency).toBe('boolean');
  });

  it('active list has at least one node', () => {
    const result = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(MOCK_PARA_2LINE)),
    );
    expect(result.ok.active.length).toBeGreaterThan(0);
  });

  it('each active node has required fields', () => {
    const result = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(MOCK_PARA_2LINE)),
    );
    for (const node of result.ok.active) {
      expect(typeof node.position).toBe('number');
      expect(typeof node.line).toBe('number');
      expect(typeof node.totalDemerits).toBe('number');
      expect(typeof node.ratio).toBe('number');
      expect(typeof node.flagged).toBe('boolean');
    }
  });

  it('returns error object when paragraph cannot be set', () => {
    const impossible = { ...MOCK_PARA_2LINE, lineWidth: 10, tolerance: 0.1 };
    const result = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(impossible)),
    );
    expect(result.error).toBeDefined();
    expect(result.ok).toBeUndefined();
  });
});

// ─── Phase 2 — equivalence with TypeScript computeBreakpoints ────────────────

describe('Phase 2 — equivalence with TypeScript computeBreakpoints', () => {
  beforeAll(() => loadWasm());

  it('optimal break position matches TypeScript', () => {
    const ts = computeBreakpoints(MOCK_PARA_2LINE as any);
    const rs = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(MOCK_PARA_2LINE)),
    );
    expect(rs.ok.active[rs.ok.optimalIndex].position).toBe(ts.node.position);
  });

  it('optimal line count matches TypeScript', () => {
    const ts = computeBreakpoints(MOCK_PARA_2LINE as any);
    const rs = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(MOCK_PARA_2LINE)),
    );
    expect(rs.ok.active[rs.ok.optimalIndex].line).toBe(ts.node.line);
  });

  it('totalDemerits matches TypeScript within 1e-6', () => {
    const ts = computeBreakpoints(MOCK_PARA_2LINE as any);
    const rs = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(MOCK_PARA_2LINE)),
    );
    const diff = Math.abs(
      rs.ok.active[rs.ok.optimalIndex].totalDemerits - ts.node.totalDemerits,
    );
    expect(diff).toBeLessThan(1e-6);
  });

  it('ratio matches TypeScript within 1e-6', () => {
    const ts = computeBreakpoints(MOCK_PARA_2LINE as any);
    const rs = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(MOCK_PARA_2LINE)),
    );
    const diff = Math.abs(
      rs.ok.active[rs.ok.optimalIndex].ratio - ts.node.ratio,
    );
    expect(diff).toBeLessThan(1e-6);
  });

  it('usedEmergency is false when first pass succeeds', () => {
    const rs = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(MOCK_PARA_2LINE)),
    );
    expect(rs.ok.usedEmergency).toBe(false);
  });

  it('usedEmergency is true when emergencyStretch rescues a tight paragraph', () => {
    const tight = { ...MOCK_PARA_2LINE, lineWidth: 45, emergencyStretch: 30 };
    const rs = JSON.parse(wasm.compute_breakpoints_wasm(toWasmJson(tight)));
    expect(rs.ok.usedEmergency).toBe(true);
  });

  it('per-line lineWidths: optimal position matches TypeScript', () => {
    const ts = computeBreakpoints(MOCK_PARA_LINEWIDTHS as any);
    const rs = JSON.parse(
      wasm.compute_breakpoints_wasm(toWasmJson(MOCK_PARA_LINEWIDTHS)),
    );
    expect(rs.ok.active[rs.ok.optimalIndex].position).toBe(ts.node.position);
    expect(rs.ok.active[rs.ok.optimalIndex].line).toBe(ts.node.line);
  });

  it('looseness matches TypeScript line count', () => {
    const paraLoose = { ...MOCK_PARA_2LINE, looseness: -1 };
    const ts = computeBreakpoints(paraLoose as any);
    const rs = JSON.parse(wasm.compute_breakpoints_wasm(toWasmJson(paraLoose)));
    expect(rs.ok.active[rs.ok.optimalIndex].line).toBe(ts.node.line);
  });
});

// ─── Phase 3 — traceback result shape ────────────────────────────────────────

describe('Phase 3 — traceback_wasm result shape', () => {
  beforeAll(() => loadWasm());

  it('returns ok.breaks array', () => {
    const result = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_2LINE)));
    expect(result.ok).toBeDefined();
    expect(result.error).toBeUndefined();
    expect(result.ok.breaks).toBeInstanceOf(Array);
  });

  it('2-line paragraph yields 2 breaks', () => {
    const result = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_2LINE)));
    expect(result.ok.breaks).toHaveLength(2);
  });

  it('1-line paragraph yields 1 break', () => {
    const result = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_1LINE)));
    expect(result.ok.breaks).toHaveLength(1);
  });

  it('each break has required fields', () => {
    const result = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_2LINE)));
    for (const b of result.ok.breaks) {
      expect(typeof b.position).toBe('number');
      expect(typeof b.ratio).toBe('number');
      expect(typeof b.flagged).toBe('boolean');
      expect(typeof b.line).toBe('number');
    }
  });

  it('line numbers are sequential starting at 1', () => {
    const result = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_2LINE)));
    expect(result.ok.breaks[0].line).toBe(1);
    expect(result.ok.breaks[1].line).toBe(2);
  });

  it('returns error for impossible paragraph', () => {
    const impossible = { ...MOCK_PARA_2LINE, lineWidth: 10, tolerance: 0.1 };
    const result = JSON.parse(wasm.traceback_wasm(toWasmJson(impossible)));
    expect(result.error).toBeDefined();
    expect(result.ok).toBeUndefined();
  });
});

// ─── Phase 3 — equivalence with TypeScript traceback ─────────────────────────

describe('Phase 3 — equivalence with TypeScript traceback', () => {
  beforeAll(() => loadWasm());

  it('break positions match TypeScript traceback', () => {
    const ts = traceback(computeBreakpoints(MOCK_PARA_2LINE as any).node);
    const rs = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_2LINE))).ok
      .breaks;
    expect(rs).toHaveLength(ts.length);
    for (let i = 0; i < ts.length; i++) {
      expect(rs[i].position).toBe(ts[i].position);
    }
  });

  it('break ratios match TypeScript within 1e-6', () => {
    const ts = traceback(computeBreakpoints(MOCK_PARA_2LINE as any).node);
    const rs = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_2LINE))).ok
      .breaks;
    for (let i = 0; i < ts.length; i++) {
      expect(Math.abs(rs[i].ratio - ts[i].ratio)).toBeLessThan(1e-6);
    }
  });

  it('break flagged values match TypeScript', () => {
    const ts = traceback(computeBreakpoints(MOCK_PARA_2LINE as any).node);
    const rs = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_2LINE))).ok
      .breaks;
    for (let i = 0; i < ts.length; i++) {
      expect(rs[i].flagged).toBe(ts[i].flagged);
    }
  });

  it('break line numbers match TypeScript', () => {
    const ts = traceback(computeBreakpoints(MOCK_PARA_2LINE as any).node);
    const rs = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_2LINE))).ok
      .breaks;
    for (let i = 0; i < ts.length; i++) {
      expect(rs[i].line).toBe(ts[i].line);
    }
  });

  it('1-line paragraph: single break matches TypeScript', () => {
    const ts = traceback(computeBreakpoints(MOCK_PARA_1LINE as any).node);
    const rs = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_1LINE))).ok
      .breaks;
    expect(rs).toHaveLength(ts.length);
    expect(rs[0].position).toBe(ts[0].position);
    expect(Math.abs(rs[0].ratio - ts[0].ratio)).toBeLessThan(1e-6);
    expect(rs[0].flagged).toBe(ts[0].flagged);
    expect(rs[0].line).toBe(ts[0].line);
  });

  it('per-line lineWidths: positions and ratios match TypeScript', () => {
    const ts = traceback(computeBreakpoints(MOCK_PARA_LINEWIDTHS as any).node);
    const rs = JSON.parse(wasm.traceback_wasm(toWasmJson(MOCK_PARA_LINEWIDTHS)))
      .ok.breaks;
    expect(rs).toHaveLength(ts.length);
    for (let i = 0; i < ts.length; i++) {
      expect(rs[i].position).toBe(ts[i].position);
      expect(Math.abs(rs[i].ratio - ts[i].ratio)).toBeLessThan(1e-6);
    }
  });
});

// ─── F005: forced-break last-line ratio must be exactly 0 from Rust ──────────
// Tests the raw WASM output directly (no JS clamp) to confirm Rust emits 0.0
// for forced-break final lines. Fails before the Rust fix; passes after.

describe('F005 — forced-break last-line ratio is exactly 0 from Rust', () => {
  beforeAll(() => loadWasm());

  it('1-line paragraph: raw Rust ratio for forced-break line is exactly 0', () => {
    const [f64s, u8s] = serializeNodesToBinary(MOCK_PARA_1LINE.nodes as any);
    const result = JSON.parse(
      wasm.traceback_wasm_binary(
        f64s,
        u8s,
        new Float64Array([]),
        MOCK_PARA_1LINE.lineWidth,
        MOCK_PARA_1LINE.tolerance,
        0,
        0,
        0,
        0,
        0,
      ),
    );
    expect(result.ok).toBeDefined();
    const breaks = result.ok.breaks;
    expect(breaks.length).toBeGreaterThan(0);
    // Last break is always a forced break — Rust must return ratio 0.0 directly,
    // not a near-zero approximation from target/termination_stretch.
    expect(breaks[breaks.length - 1].ratio).toBe(0);
  });

  it('2-line paragraph: raw Rust ratio for last forced-break line is exactly 0', () => {
    const [f64s, u8s] = serializeNodesToBinary(MOCK_PARA_2LINE.nodes as any);
    const result = JSON.parse(
      wasm.traceback_wasm_binary(
        f64s,
        u8s,
        new Float64Array([]),
        MOCK_PARA_2LINE.lineWidth,
        MOCK_PARA_2LINE.tolerance,
        0,
        0,
        0,
        0,
        0,
      ),
    );
    expect(result.ok).toBeDefined();
    const breaks = result.ok.breaks;
    expect(breaks.length).toBe(2);
    // Non-forced first break may have non-zero ratio — that is fine.
    // Only the last forced-break line must be exactly 0.
    expect(breaks[breaks.length - 1].ratio).toBe(0);
  });
});

// ─── Phase 4 — font shaping via rustybuzz ────────────────────────────────────

const P4_FONT_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../fonts/LiberationSerif-Regular.ttf',
);
const P4_FONT_ID = 'ls-regular-p4';
const P4_FONT_12 = {
  id: P4_FONT_ID,
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};
const P4_REGISTRY = new Map([[P4_FONT_ID, { filePath: P4_FONT_PATH }]]);
let p4Measurer: ReturnType<typeof createMeasurer>;

describe('Phase 4 — font shaping via rustybuzz', () => {
  beforeAll(() => {
    loadWasm();
    p4Measurer = createMeasurer(P4_REGISTRY);
    wasm.register_font(P4_FONT_ID, readFileSync(P4_FONT_PATH));
  });

  // — registration ————————————————————————————————————————————————————————————

  it('measure_text_wasm succeeds after register_font', () => {
    const rs = JSON.parse(
      wasm.measure_text_wasm('hello', JSON.stringify(P4_FONT_12)),
    );
    expect(rs.ok).toBeDefined();
    expect(rs.error).toBeUndefined();
  });

  it('unregistered font returns error', () => {
    const bad = { ...P4_FONT_12, id: 'does-not-exist' };
    const rs = JSON.parse(wasm.measure_text_wasm('hello', JSON.stringify(bad)));
    expect(rs.error).toBeDefined();
    expect(rs.ok).toBeUndefined();
  });

  // — measure_text_wasm ——————————————————————————————————————————————————————

  it('"hello" width is positive', () => {
    const rs = JSON.parse(
      wasm.measure_text_wasm('hello', JSON.stringify(P4_FONT_12)),
    );
    expect(rs.ok.width).toBeGreaterThan(0);
  });

  it('"hello" width matches TypeScript realMeasure within 0.01 pt per glyph', () => {
    const ts = p4Measurer.measure('hello', P4_FONT_12 as any);
    const rs = JSON.parse(
      wasm.measure_text_wasm('hello', JSON.stringify(P4_FONT_12)),
    );
    expect(Math.abs(rs.ok.width - ts)).toBeLessThan('hello'.length * 0.01);
  });

  it('empty string returns width = 0', () => {
    const rs = JSON.parse(
      wasm.measure_text_wasm('', JSON.stringify(P4_FONT_12)),
    );
    expect(rs.ok.width).toBe(0);
  });

  it('letterSpacing adds between glyphs (not after last)', () => {
    const fontWithLS = { ...P4_FONT_12, letterSpacing: 1.0 };
    const fontNoLS = P4_FONT_12;
    const text = 'ab';
    const rsLS = JSON.parse(
      wasm.measure_text_wasm(text, JSON.stringify(fontWithLS)),
    ).ok.width;
    const rsNo = JSON.parse(
      wasm.measure_text_wasm(text, JSON.stringify(fontNoLS)),
    ).ok.width;
    // 2 glyphs → letterSpacing applied 1 time (= 1.0 pt difference)
    expect(Math.abs(rsLS - rsNo - 1.0)).toBeLessThan(1e-10);
  });

  // — space_metrics_wasm ——————————————————————————————————————————————————————

  it('space_metrics_wasm returns ok with width, stretch, shrink', () => {
    const rs = JSON.parse(wasm.space_metrics_wasm(JSON.stringify(P4_FONT_12)));
    expect(rs.ok).toBeDefined();
    expect(typeof rs.ok.width).toBe('number');
    expect(typeof rs.ok.stretch).toBe('number');
    expect(typeof rs.ok.shrink).toBe('number');
  });

  it('space width matches TypeScript realSpace within 1e-10', () => {
    const ts = p4Measurer.space(P4_FONT_12 as any);
    const rs = JSON.parse(
      wasm.space_metrics_wasm(JSON.stringify(P4_FONT_12)),
    ).ok;
    expect(Math.abs(rs.width - ts.width)).toBeLessThan(1e-10);
  });

  it('stretch = size/6 and shrink = size/9', () => {
    const rs = JSON.parse(
      wasm.space_metrics_wasm(JSON.stringify(P4_FONT_12)),
    ).ok;
    expect(Math.abs(rs.stretch - 12 / 6)).toBeLessThan(1e-10);
    expect(Math.abs(rs.shrink - 12 / 9)).toBeLessThan(1e-10);
  });

  // — font_metrics_wasm ——————————————————————————————————————————————————————

  it('font_metrics_wasm returns all 7 required fields', () => {
    const rs = JSON.parse(
      wasm.font_metrics_wasm(JSON.stringify(P4_FONT_12)),
    ).ok;
    for (const key of [
      'unitsPerEm',
      'ascender',
      'descender',
      'xHeight',
      'capHeight',
      'lineGap',
      'baselineShift',
    ]) {
      expect(typeof rs[key]).toBe('number');
    }
  });

  it('unitsPerEm = 2048 for LiberationSerif', () => {
    const rs = JSON.parse(
      wasm.font_metrics_wasm(JSON.stringify(P4_FONT_12)),
    ).ok;
    expect(rs.unitsPerEm).toBe(2048);
  });

  it('ascender and descender match TypeScript realMetrics within 1e-10', () => {
    const ts = p4Measurer.metrics(P4_FONT_12 as any);
    const rs = JSON.parse(
      wasm.font_metrics_wasm(JSON.stringify(P4_FONT_12)),
    ).ok;
    expect(Math.abs(rs.ascender - ts.ascender)).toBeLessThan(1e-10);
    expect(Math.abs(rs.descender - ts.descender)).toBeLessThan(1e-10);
  });

  it('superscript baselineShift > 0, subscript < 0, normal = 0', () => {
    const sup = { ...P4_FONT_12, variant: 'superscript' };
    const sub = { ...P4_FONT_12, variant: 'subscript' };
    const rsSup = JSON.parse(wasm.font_metrics_wasm(JSON.stringify(sup))).ok;
    const rsSub = JSON.parse(wasm.font_metrics_wasm(JSON.stringify(sub))).ok;
    const rsNorm = JSON.parse(
      wasm.font_metrics_wasm(JSON.stringify(P4_FONT_12)),
    ).ok;
    expect(rsSup.baselineShift).toBeGreaterThan(0);
    expect(rsSub.baselineShift).toBeLessThan(0);
    expect(rsNorm.baselineShift).toBe(0);
  });
});

// ─── RT-5: F025 paragraf_shaping_wasm rename ─────────────────────────────────

describe('RT-5 — loadShapingWasm loads from renamed paragraf_shaping_wasm path', () => {
  it('wasm module loads successfully from paragraf_shaping_wasm.js', () => {
    const w = loadWasm();
    expect(w).toBeTruthy();
  });

  it('analyze_bidi is callable after loading', () => {
    const w = loadWasm();
    expect(typeof w.analyze_bidi).toBe('function');
  });

  it('hello() returns a greeting string from Rust (smoke test)', () => {
    const w = loadWasm();
    const result = w.hello('world');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
