/**
 * Binary serialization for WASM boundary optimization.
 * Converts Node[] to compact binary format (Float64Array + Uint8Array) to
 * avoid JSON serialization/deserialization overhead.
 */

import { Node } from '@paragraf/types';

/**
 * Serialize nodes to binary format for traceback_wasm_binary.
 *
 * Returns [f64Array, u8Array] where:
 * - f64Array: 4 f64 values per node [width, param1, param2, param3, ...]
 *   - Box: [width, 0, 0, 0]
 *   - Glue: [width, stretch, shrink, 0]
 *   - Penalty: [width, penalty, 0, 0]
 *
 * - u8Array: Type and flags per node
 *   - Bits 0-3: type (0=box, 1=glue, 2=penalty)
 *   - Bits 4-7: flags (kind for glue, flagged for penalty)
 *
 * ±Infinity is mapped to ±1e30 (PROHIBITED/FORCED_BREAK sentinels) so that
 * Rust prefix-sum subtraction never produces NaN (∞ − ∞ = NaN corrupts ratios).
 */
const sentinel = (v: number): number => {
  if (v === Infinity) return 1e30;
  if (v === -Infinity) return -1e30;
  return v;
};
export function serializeNodesToBinary(
  nodes: Node[],
): [Float64Array, Uint8Array] {
  const f64s = new Float64Array(nodes.length * 4);
  const u8s = new Uint8Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const f64Idx = i * 4;

    if (node.type === 'box') {
      // Box: [width, 0, 0, 0], type=0
      f64s[f64Idx] = node.width;
      f64s[f64Idx + 1] = 0;
      f64s[f64Idx + 2] = 0;
      f64s[f64Idx + 3] = 0;
      u8s[i] = 0; // type=box
    } else if (node.type === 'glue') {
      // Glue: [width, stretch, shrink, 0], type=1, kind in upper nibble
      f64s[f64Idx] = node.width;
      f64s[f64Idx + 1] = sentinel(node.stretch);
      f64s[f64Idx + 2] = sentinel(node.shrink);
      f64s[f64Idx + 3] = 0;
      const kindFlag = node.kind === 'word' ? 0 : 1;
      u8s[i] = 1 | (kindFlag << 4); // type=1, kind in upper nibble
    } else if (node.type === 'penalty') {
      // Penalty: [width, penalty, 0, 0], type=2, flagged in upper nibble
      f64s[f64Idx] = node.width;
      f64s[f64Idx + 1] = sentinel(node.penalty);
      f64s[f64Idx + 2] = 0;
      f64s[f64Idx + 3] = 0;
      const flaggedFlag = node.flagged ? 1 : 0;
      u8s[i] = 2 | (flaggedFlag << 4); // type=2, flagged in upper nibble
    }
  }

  return [f64s, u8s];
}

/**
 * Call WASM traceback with binary node serialization.
 * Avoids JSON overhead compared to traceback_wasm(json).
 *
 * Returns { ok: { breaks: LineBreak[], usedEmergency: bool } } or { error: string }
 */
export function tracebackWasmBinary(
  wasm: any,
  nodes: Node[],
  lineWidth: number,
  tolerance: number,
  emergencyStretch: number = 0,
  looseness: number = 0,
  widowPenalty: number = 0,
  orphanPenalty: number = 0,
  consecutiveHyphenLimit: number = 0,
  lineWidths: number[] = [],
): any {
  const [f64s, u8s] = serializeNodesToBinary(nodes);
  const result = JSON.parse(
    wasm.traceback_wasm_binary(
      f64s,
      u8s,
      new Float64Array(lineWidths),
      lineWidth,
      tolerance,
      emergencyStretch,
      looseness,
      widowPenalty,
      orphanPenalty,
      consecutiveHyphenLimit,
    ),
  );
  // The termination glue has stretch=1e30 (Infinity serialized for WASM).
  // Rust's compute_ratio returns target/1e30 ≈ 1e-28 instead of exactly 0.
  // Clamp the last break's ratio to 0 — the last line is always a forced break.
  if (!('error' in result) && result.ok.breaks.length > 0) {
    result.ok.breaks[result.ok.breaks.length - 1].ratio = 0;
  }
  return result;
}
