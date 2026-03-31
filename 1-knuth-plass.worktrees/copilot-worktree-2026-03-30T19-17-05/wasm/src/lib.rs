use std::cell::RefCell;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use unicode_bidi::BidiInfo;
use unicode_segmentation::UnicodeSegmentation;
use wasm_bindgen::prelude::*;

// ─── Phase 0 — toolchain smoke test ─────────────────────────────────────────

#[wasm_bindgen]
pub fn hello(name: &str) -> String {
    format!("hello from Rust, {}", name)
}

// ─── Phase 1 — data types ────────────────────────────────────────────────────

/// Mirror of TypeScript `Font`. All optional fields use `skip_serializing_if`
/// so absent fields are omitted rather than written as `null`.
#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Font {
    pub id: String,
    pub size: f64,
    pub weight: u16,
    pub style: String,
    pub stretch: String,
    #[serde(rename = "letterSpacing", skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct BoxNode {
    pub width: f64,
    pub content: String,
    pub font: Font,
    #[serde(rename = "verticalOffset", skip_serializing_if = "Option::is_none")]
    pub vertical_offset: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct GlueNode {
    pub kind: String,
    pub width: f64,
    pub stretch: f64,
    pub shrink: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<Font>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct PenaltyNode {
    pub width: f64,
    pub penalty: f64,
    pub flagged: bool,
}

/// Mirror of TypeScript `Node = Box | Glue | Penalty`.
/// The `type` field acts as the discriminant tag, matching TypeScript JSON shape.
#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(tag = "type")]
pub enum Node {
    #[serde(rename = "box")]
    Box(BoxNode),
    #[serde(rename = "glue")]
    Glue(GlueNode),
    #[serde(rename = "penalty")]
    Penalty(PenaltyNode),
}

/// Mirror of TypeScript `Paragraph` (the linebreaker input).
#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct ParagraphInput {
    pub nodes: Vec<Node>,
    #[serde(rename = "lineWidth")]
    pub line_width: f64,
    #[serde(rename = "lineWidths", skip_serializing_if = "Option::is_none")]
    pub line_widths: Option<Vec<f64>>,
    pub tolerance: f64,
    #[serde(rename = "emergencyStretch", skip_serializing_if = "Option::is_none")]
    pub emergency_stretch: Option<f64>,
    #[serde(rename = "firstLineIndent", skip_serializing_if = "Option::is_none")]
    pub first_line_indent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alignment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub looseness: Option<i32>,
    #[serde(rename = "justifyLastLine", skip_serializing_if = "Option::is_none")]
    pub justify_last_line: Option<bool>,
    #[serde(
        rename = "consecutiveHyphenLimit",
        skip_serializing_if = "Option::is_none"
    )]
    pub consecutive_hyphen_limit: Option<u32>,
    #[serde(rename = "widowPenalty", skip_serializing_if = "Option::is_none")]
    pub widow_penalty: Option<f64>,
    #[serde(rename = "orphanPenalty", skip_serializing_if = "Option::is_none")]
    pub orphan_penalty: Option<f64>,
}

/// Internal forward-pass state; stored in a Vec<BreakpointNode> arena.
/// `previous` is an Option<usize> index into that arena (not an object reference).
/// Not serialized across the WASM boundary in Phase 1.
pub struct BreakpointNode {
    pub position: usize,
    pub line: usize,
    pub total_demerits: f64,
    pub ratio: f64,
    pub previous: Option<usize>,
    pub flagged: bool,
    pub consecutive_hyphens: u32,
}

/// One break in the traceback result. Mirrors TypeScript `LineBreak` in traceback.ts.
/// Crosses the WASM boundary starting in Phase 3.
#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct LineBreak {
    pub position: usize,
    pub ratio: f64,
    pub flagged: bool,
    pub line: usize,
}

// ─── Phase 1 — round-trip boundary functions ─────────────────────────────────

/// Deserialize a single Node from JSON and re-serialize it.
/// Used by tests to verify the TypeScript ↔ Rust JSON contract.
#[wasm_bindgen]
pub fn round_trip_node(node_json: &str) -> String {
    let parsed: Node =
        serde_json::from_str(node_json).expect("round_trip_node: invalid JSON input");
    serde_json::to_string(&parsed).expect("round_trip_node: serialization failed")
}

/// Deserialize a full ParagraphInput from JSON and re-serialize it.
/// Used by tests to verify the TypeScript ↔ Rust JSON contract.
#[wasm_bindgen]
pub fn round_trip_paragraph(input_json: &str) -> String {
    let parsed: ParagraphInput =
        serde_json::from_str(input_json).expect("round_trip_paragraph: invalid JSON input");
    serde_json::to_string(&parsed).expect("round_trip_paragraph: serialization failed")
}

// ─── Phase 2 — constants ─────────────────────────────────────────────────────
//
// Finite sentinels matching the bridge convention in `scripts/wasm-demo.ts` and
// tests/wasm.test.ts.  TypeScript's ±Infinity is replaced with these before
// serialisation; Rust uses the same values for its own comparisons.

const FORCED_BREAK: f64 = -1e30;
const PROHIBITED: f64 = 1e30;
const DOUBLE_HYPHEN_PENALTY: f64 = 3000.0;

// ─── Phase 2 — algorithm helpers ─────────────────────────────────────────────

struct PrefixSums {
    widths: Vec<f64>,
    stretches: Vec<f64>,
    shrinks: Vec<f64>,
}

fn build_prefix_sums(nodes: &[Node]) -> PrefixSums {
    let len = nodes.len() + 1;
    let mut widths = vec![0.0f64; len];
    let mut stretches = vec![0.0f64; len];
    let mut shrinks = vec![0.0f64; len];
    for i in 0..nodes.len() {
        widths[i + 1] = widths[i];
        stretches[i + 1] = stretches[i];
        shrinks[i + 1] = shrinks[i];
        match &nodes[i] {
            Node::Box(b) => widths[i + 1] += b.width,
            Node::Glue(g) => {
                widths[i + 1] += g.width;
                stretches[i + 1] += g.stretch;
                shrinks[i + 1] += g.shrink;
            }
            Node::Penalty(_) => {}
        }
    }
    PrefixSums {
        widths,
        stretches,
        shrinks,
    }
}

fn is_feasible(ratio: f64, tolerance: f64) -> bool {
    ratio >= -1.0 && ratio <= tolerance
}

fn compute_badness(ratio: f64) -> f64 {
    (100.0 * ratio.abs().powi(3)).round()
}

fn compute_demerits(badness: f64, penalty: f64, prev_flagged: bool, curr_flagged: bool) -> f64 {
    let d = if penalty >= 0.0 {
        (1.0 + badness + penalty).powi(2)
    } else if penalty != FORCED_BREAK {
        (1.0 + badness).powi(2) - penalty.powi(2)
    } else {
        (1.0 + badness).powi(2)
    };
    if prev_flagged && curr_flagged {
        d + DOUBLE_HYPHEN_PENALTY
    } else {
        d
    }
}

fn is_valid_break(nodes: &[Node], index: usize) -> bool {
    match &nodes[index] {
        Node::Penalty(p) => p.penalty < PROHIBITED,
        Node::Glue(_) => index > 0 && matches!(&nodes[index - 1], Node::Box(_)),
        Node::Box(_) => false,
    }
}

fn compute_ratio(
    line_width: f64,
    penalty_width: f64,
    sum_width: f64,
    sum_stretch: f64,
    sum_shrink: f64,
    emergency_stretch: f64,
) -> f64 {
    let target = line_width - sum_width - penalty_width;
    if target > 0.0 {
        let ts = sum_stretch + emergency_stretch;
        // ts >= PROHIBITED means the glue stretch is the ∞-sentinel (mapped from
        // JavaScript's Infinity by toWasmJson).  Mirror JS: n / Infinity = 0.
        if ts >= PROHIBITED {
            0.0
        } else if ts > 0.0 {
            target / ts
        } else {
            f64::INFINITY
        }
    } else if target < 0.0 {
        if sum_shrink > 0.0 {
            target / sum_shrink
        } else {
            f64::NEG_INFINITY
        }
    } else {
        0.0
    }
}

fn count_content_boxes(nodes: &[Node], from: usize, to: usize) -> usize {
    let start = if from == 0 { 0 } else { from + 1 };
    (start..=to)
        .filter(|&i| i < nodes.len())
        .filter(|&i| matches!(&nodes[i], Node::Box(b) if !b.content.is_empty()))
        .count()
}

// ─── Phase 2 — forward pass (arena-allocated) ────────────────────────────────

fn forward_pass(
    nodes: &[Node],
    line_width: f64,
    tolerance: f64,
    sums: &PrefixSums,
    emergency_stretch: f64,
    consecutive_hyphen_limit: u32,
    widow_penalty: f64,
    orphan_penalty: f64,
    line_widths: &[f64],
) -> (Vec<BreakpointNode>, Vec<usize>) {
    let mut arena: Vec<BreakpointNode> = Vec::new();
    arena.push(BreakpointNode {
        position: 0,
        line: 0,
        total_demerits: 0.0,
        ratio: 0.0,
        previous: None,
        flagged: false,
        consecutive_hyphens: 0,
    });
    let mut active: Vec<usize> = vec![0];

    for i in 0..nodes.len() {
        if !is_valid_break(nodes, i) {
            continue;
        }

        let (penalty_width, penalty_value, is_flagged) = match &nodes[i] {
            Node::Penalty(p) => (p.width, p.penalty, p.flagged),
            _ => (0.0, 0.0, false),
        };
        let is_forced = penalty_value <= FORCED_BREAK;

        let mut next_active: Vec<usize> = Vec::new();
        let mut best_at_i: HashMap<usize, usize> = HashMap::new();

        for &a_idx in &active {
            // Copy fields before arena.push to satisfy the borrow checker
            let (a_line, a_td, a_flagged, a_ch, a_pos, a_prev) = {
                let a = &arena[a_idx];
                (
                    a.line,
                    a.total_demerits,
                    a.flagged,
                    a.consecutive_hyphens,
                    a.position,
                    a.previous,
                )
            };

            let eff_lw = line_widths.get(a_line).copied().unwrap_or(line_width);
            let sw = sums.widths[i] - sums.widths[a_pos];
            let ss = sums.stretches[i] - sums.stretches[a_pos];
            let sk = sums.shrinks[i] - sums.shrinks[a_pos];
            let ratio = compute_ratio(eff_lw, penalty_width, sw, ss, sk, emergency_stretch);

            if ratio >= -1.0 && !is_forced {
                next_active.push(a_idx);
            }

            if is_feasible(ratio, tolerance) {
                let consec = if is_flagged { a_ch + 1 } else { 0 };
                if consecutive_hyphen_limit > 0 && consec > consecutive_hyphen_limit {
                    continue;
                }

                let badness = compute_badness(ratio);
                let mut d = compute_demerits(badness, penalty_value, a_flagged, is_flagged);

                if is_forced && widow_penalty > 0.0 {
                    if count_content_boxes(nodes, a_pos, i) == 1 {
                        d += widow_penalty;
                    }
                }
                if is_forced && orphan_penalty > 0.0 && a_prev.is_none() {
                    d += orphan_penalty;
                }

                let cand_line = a_line + 1;
                let cand = BreakpointNode {
                    position: i,
                    line: cand_line,
                    total_demerits: a_td + d,
                    ratio,
                    previous: Some(a_idx),
                    flagged: is_flagged,
                    consecutive_hyphens: consec,
                };
                arena.push(cand);
                let cand_idx = arena.len() - 1;

                match best_at_i.get(&cand_line) {
                    None => {
                        best_at_i.insert(cand_line, cand_idx);
                    }
                    Some(&ex) => {
                        if arena[cand_idx].total_demerits < arena[ex].total_demerits {
                            best_at_i.insert(cand_line, cand_idx);
                        }
                    }
                }
            }
        }

        for &w in best_at_i.values() {
            next_active.push(w);
        }
        active = next_active;
    }

    (arena, active)
}

// ─── Phase 2 — WASM entry point ──────────────────────────────────────────────

/// Parse a `ParagraphInput` and run the forward pass (with emergency-stretch retry).
/// Returns `(arena, active, used_emergency)` or an error string.
/// Shared by `compute_breakpoints_wasm` and `traceback_wasm`.
fn run_forward_pass(
    para: &ParagraphInput,
) -> Result<(Vec<BreakpointNode>, Vec<usize>, bool), String> {
    let nodes = &para.nodes;
    let line_widths = para.line_widths.as_deref().unwrap_or(&[]);
    let emergency_stretch = para.emergency_stretch.unwrap_or(0.0);
    let consec_limit = para.consecutive_hyphen_limit.unwrap_or(0);
    let widow_p = para.widow_penalty.unwrap_or(0.0);
    let orphan_p = para.orphan_penalty.unwrap_or(0.0);

    let sums = build_prefix_sums(nodes);

    let (mut arena, mut active) = forward_pass(
        nodes,
        para.line_width,
        para.tolerance,
        &sums,
        0.0,
        consec_limit,
        widow_p,
        orphan_p,
        line_widths,
    );
    let mut used_emergency = false;

    if active.is_empty() {
        if emergency_stretch > 0.0 {
            let (a2, act2) = forward_pass(
                nodes,
                para.line_width,
                para.tolerance,
                &sums,
                emergency_stretch,
                consec_limit,
                widow_p,
                orphan_p,
                line_widths,
            );
            arena = a2;
            active = act2;
            used_emergency = true;
        }
        if active.is_empty() {
            return Err("Paragraph could not be set within tolerance.".to_string());
        }
    }

    Ok((arena, active, used_emergency))
}

/// Run the full Knuth-Plass forward pass (with multi-pass tolerance ladder) on
/// a serialized ParagraphInput and return JSON.
///
/// **Infinity convention:** TypeScript's `FORCED_BREAK` (-Infinity) and
/// `PROHIBITED` (+Infinity) are not valid JSON.  The caller must replace them
/// with the finite sentinels `-1e30` / `1e30` before serialising.
///
/// Returns `{ ok: { active, usedEmergency, optimalIndex } }` on success or
/// `{ error: "..." }` on failure.
#[wasm_bindgen]
pub fn compute_breakpoints_wasm(input_json: &str) -> String {
    let para: ParagraphInput = match serde_json::from_str(input_json) {
        Ok(p) => p,
        Err(e) => {
            return serde_json::to_string(&serde_json::json!({ "error": e.to_string() })).unwrap()
        }
    };

    let looseness = para.looseness.unwrap_or(0);

    let (arena, active, used_emergency) = match run_forward_pass(&para) {
        Ok(r) => r,
        Err(e) => return serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    };

    let final_arena_idx = select_optimal_arena_idx(&arena, &active, looseness);
    let final_pos = active
        .iter()
        .position(|&idx| idx == final_arena_idx)
        .unwrap_or(0);

    let active_json: Vec<_> = active
        .iter()
        .map(|&idx| {
            let n = &arena[idx];
            serde_json::json!({
                "position":           n.position,
                "line":               n.line,
                "totalDemerits":      n.total_demerits,
                "ratio":              n.ratio,
                "flagged":            n.flagged,
                "consecutiveHyphens": n.consecutive_hyphens,
                "previousIndex":      n.previous,
            })
        })
        .collect();

    serde_json::to_string(&serde_json::json!({
        "ok": {
            "active":        active_json,
            "usedEmergency": used_emergency,
            "optimalIndex":  final_pos,
        }
    }))
    .unwrap()
}

// ─── Phase 3 — traceback ──────────────────────────────────────────────────────

/// Walk `previous` arena indices from `final_idx` back to the sentinel (previous=None),
/// collecting LineBreaks. Returns them in chronological order (first line first).
fn traceback_arena(arena: &[BreakpointNode], final_idx: usize) -> Vec<LineBreak> {
    let mut breaks = Vec::new();
    let mut current_idx = final_idx;
    loop {
        let node = &arena[current_idx];
        match node.previous {
            None => break, // sentinel — stop, do not include
            Some(prev_idx) => {
                breaks.push(LineBreak {
                    position: node.position,
                    ratio: node.ratio,
                    flagged: node.flagged,
                    line: node.line,
                });
                current_idx = prev_idx;
            }
        }
    }
    breaks.reverse();
    breaks
}

/// Select the arena index of the optimal (minimum demerits, with looseness) active node.
fn select_optimal_arena_idx(arena: &[BreakpointNode], active: &[usize], looseness: i32) -> usize {
    let opt_pos = active
        .iter()
        .enumerate()
        .min_by(|(_, &a), (_, &b)| arena[a].total_demerits.total_cmp(&arena[b].total_demerits))
        .map(|(pos, _)| pos)
        .unwrap_or(0);

    let final_pos = if looseness != 0 {
        let target = arena[active[opt_pos]].line as i32 + looseness;
        active
            .iter()
            .enumerate()
            .filter(|(_, &idx)| arena[idx].line as i32 == target)
            .min_by(|(_, &a), (_, &b)| arena[a].total_demerits.total_cmp(&arena[b].total_demerits))
            .map(|(pos, _)| pos)
            .unwrap_or(opt_pos)
    } else {
        opt_pos
    };

    active[final_pos]
}

// ─── Binary deserialization (Phase 2 optimization) ──────────────────────────

/// Reconstruct nodes from binary format:
/// - f64s: [w, s1, s2, p for node 0], [w, s1, s2, p for node 1], ...
/// - u8s: [type_code for node 0], [type_code for node 1], ...
///   Type codes: 0=box, 1=glue (with kind in next nibble), 2=penalty
fn deserialize_nodes_binary(f64s: &[f64], u8s: &[u8]) -> Result<Vec<Node>, String> {
    if f64s.len() % 4 != 0 {
        return Err("f64 array length must be multiple of 4".to_string());
    }
    let node_count = f64s.len() / 4;
    if u8s.len() < node_count {
        return Err("u8 array too short for node count".to_string());
    }

    let mut nodes = Vec::with_capacity(node_count);
    for i in 0..node_count {
        let type_byte = u8s[i];
        let node_type = type_byte & 0x0f;
        let width = f64s[i * 4];

        match node_type {
            0 => {
                // Box: just width
                nodes.push(Node::Box(BoxNode {
                    width,
                    content: String::new(),
                    font: Font {
                        id: String::new(),
                        size: 0.0,
                        weight: 400,
                        style: "normal".to_string(),
                        stretch: "normal".to_string(),
                        letter_spacing: None,
                        variant: None,
                    },
                    vertical_offset: None,
                }));
            }
            1 => {
                // Glue: width, stretch, shrink, kind
                let stretch = f64s[i * 4 + 1];
                let shrink = f64s[i * 4 + 2];
                let kind_flag = (type_byte >> 4) & 0x01;
                let kind = if kind_flag == 0 {
                    "word".to_string()
                } else {
                    "termination".to_string()
                };
                nodes.push(Node::Glue(GlueNode {
                    kind,
                    width,
                    stretch,
                    shrink,
                    font: None,
                }));
            }
            2 => {
                // Penalty: width, penalty, flagged
                let penalty = f64s[i * 4 + 1];
                let flagged = (type_byte >> 4) & 0x01 != 0;
                nodes.push(Node::Penalty(PenaltyNode {
                    width,
                    penalty,
                    flagged,
                }));
            }
            _ => return Err(format!("unknown node type: {}", node_type)),
        }
    }

    Ok(nodes)
}

/// Run the forward pass and traceback using binary node format.
/// Returns `{ ok: { breaks: [...], usedEmergency: bool } }` or `{ error: "..." }`.
///
/// f64s: [width, p1, p2, p3, ...] (4 f64 per node)
/// u8s: [type_and_flags, ...] (type in lower 4 bits, flags in upper 4 bits)
#[wasm_bindgen]
pub fn traceback_wasm_binary(
    f64s: &[f64],
    u8s: &[u8],
    line_widths_f64: &[f64],
    line_width: f64,
    tolerance: f64,
    emergency_stretch: f64,
    looseness: i32,
    widow_penalty: f64,
    orphan_penalty: f64,
    consecutive_hyphen_limit: u32,
) -> String {
    let nodes = match deserialize_nodes_binary(f64s, u8s) {
        Ok(n) => n,
        Err(e) => return serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    };

    let para = ParagraphInput {
        nodes,
        line_width,
        line_widths: if line_widths_f64.is_empty() { None } else { Some(line_widths_f64.to_vec()) },
        tolerance,
        emergency_stretch: if emergency_stretch > 0.0 {
            Some(emergency_stretch)
        } else {
            None
        },
        first_line_indent: None,
        alignment: None,
        looseness: if looseness != 0 {
            Some(looseness)
        } else {
            None
        },
        justify_last_line: None,
        consecutive_hyphen_limit: if consecutive_hyphen_limit > 0 {
            Some(consecutive_hyphen_limit)
        } else {
            None
        },
        widow_penalty: if widow_penalty != 0.0 {
            Some(widow_penalty)
        } else {
            None
        },
        orphan_penalty: if orphan_penalty != 0.0 {
            Some(orphan_penalty)
        } else {
            None
        },
    };

    let (arena, active, used_emergency) = match run_forward_pass(&para) {
        Ok(r) => r,
        Err(e) => return serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    };

    let final_arena_idx = select_optimal_arena_idx(&arena, &active, looseness);
    let breaks = traceback_arena(&arena, final_arena_idx);

    serde_json::to_string(
        &serde_json::json!({ "ok": { "breaks": breaks, "usedEmergency": used_emergency } }),
    )
    .unwrap()
}

/// Run the forward pass and traceback, returning an ordered `LineBreak[]`.
///
/// Input JSON shape is identical to `compute_breakpoints_wasm`.
/// Returns `{ ok: { breaks: [...] } }` or `{ error: "..." }`.
#[wasm_bindgen]
pub fn traceback_wasm(input_json: &str) -> String {
    let para: ParagraphInput = match serde_json::from_str(input_json) {
        Ok(p) => p,
        Err(e) => {
            return serde_json::to_string(&serde_json::json!({ "error": e.to_string() })).unwrap()
        }
    };

    let looseness = para.looseness.unwrap_or(0);

    let (arena, active, used_emergency) = match run_forward_pass(&para) {
        Ok(r) => r,
        Err(e) => return serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    };

    let final_arena_idx = select_optimal_arena_idx(&arena, &active, looseness);
    let breaks = traceback_arena(&arena, final_arena_idx);

    serde_json::to_string(
        &serde_json::json!({ "ok": { "breaks": breaks, "usedEmergency": used_emergency } }),
    )
    .unwrap()
}

// ─── Phase 4 — font cache ──────────────────────────────────────────────────────

thread_local! {
    /// WASM-local font byte store. Register once; referenced by font id on every call.
    static FONT_BYTES: RefCell<HashMap<String, Vec<u8>>> = RefCell::new(HashMap::new());
}

/// Register a font's raw bytes under `font_id` in the WASM-local cache.
/// Call once at startup for each font file used by the paragraph composer.
#[wasm_bindgen]
pub fn register_font(font_id: &str, data: &[u8]) {
    FONT_BYTES.with(|cache| {
        cache
            .borrow_mut()
            .insert(font_id.to_string(), data.to_vec());
    });
}

// ─── Phase 4 — internal helpers ───────────────────────────────────────────────

/// Borrow font bytes from the cache and call `f`, or return an Err.
fn with_font_bytes<F, T>(font_id: &str, f: F) -> Result<T, String>
where
    F: FnOnce(&[u8]) -> Result<T, String>,
{
    FONT_BYTES.with(|cache| {
        let cache = cache.borrow();
        match cache.get(font_id) {
            Some(bytes) => f(bytes),
            None => Err(format!(
                "font '{}' not registered; call register_font first",
                font_id
            )),
        }
    })
}

/// Minimal font parameters extracted from a JSON-encoded `Font`.
struct FontParams {
    id: String,
    size: f64,
    letter_spacing: f64,
    variant: Option<String>,
}

fn parse_font_params(font_json: &str) -> Result<FontParams, String> {
    let v: serde_json::Value =
        serde_json::from_str(font_json).map_err(|e| format!("invalid font JSON: {}", e))?;
    Ok(FontParams {
        id: v["id"].as_str().ok_or("missing font.id")?.to_string(),
        size: v["size"].as_f64().ok_or("missing font.size")?,
        letter_spacing: v["letterSpacing"].as_f64().unwrap_or(0.0),
        variant: v["variant"].as_str().map(|s| s.to_string()),
    })
}

/// Build the rustybuzz `Feature` list matching TypeScript `getSubstitutedGlyphs`:
/// `kern`, `liga`, `rlig` always on; `sups`/`subs` added when `Font.variant` is set.
fn shape_features(variant: Option<&str>) -> Vec<rustybuzz::Feature> {
    use rustybuzz::ttf_parser::Tag;
    let mut features = vec![
        rustybuzz::Feature::new(Tag::from_bytes(b"kern"), 1, ..),
        rustybuzz::Feature::new(Tag::from_bytes(b"liga"), 1, ..),
        rustybuzz::Feature::new(Tag::from_bytes(b"rlig"), 1, ..),
    ];
    match variant {
        Some("superscript") => {
            features.push(rustybuzz::Feature::new(Tag::from_bytes(b"sups"), 1, ..))
        }
        Some("subscript") => {
            features.push(rustybuzz::Feature::new(Tag::from_bytes(b"subs"), 1, ..))
        }
        _ => {}
    }
    features
}

// ─── Phase 4 — WASM entry points ──────────────────────────────────────────────

/// Measure the advance width of `text` in pt, applying GSUB (liga, sups/subs) and GPOS kern.
/// Mirrors TypeScript `realMeasure`: letterSpacing added between glyphs, not after the last one.
///
/// Returns `{ ok: { width: number } }` or `{ error: "..." }`.
#[wasm_bindgen]
pub fn measure_text_wasm(text: &str, font_json: &str) -> String {
    let font = match parse_font_params(font_json) {
        Ok(f) => f,
        Err(e) => return serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    };

    let result = with_font_bytes(&font.id, |bytes| {
        let face = rustybuzz::Face::from_slice(bytes, 0)
            .ok_or_else(|| "failed to parse font data".to_string())?;
        let scale = font.size / face.units_per_em() as f64;
        let features = shape_features(font.variant.as_deref());

        let mut buf = rustybuzz::UnicodeBuffer::new();
        buf.push_str(text);
        let output = rustybuzz::shape(&face, &features, buf);

        let n = output.len();
        // letterSpacing between glyphs only (not after last), matching TypeScript realMeasure
        let width: f64 = output
            .glyph_positions()
            .iter()
            .map(|pos| pos.x_advance as f64 * scale)
            .sum::<f64>()
            + font.letter_spacing * n.saturating_sub(1) as f64;

        Ok(width)
    });

    match result {
        Ok(w) => serde_json::to_string(&serde_json::json!({ "ok": { "width": w } })).unwrap(),
        Err(e) => serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    }
}

/// Space glyph metrics in pt: natural width, stretch, shrink.
/// Mirrors TypeScript `realSpace`: width = raw space advance (fallback em/3),
/// stretch = em/6, shrink = em/9.
///
/// Returns `{ ok: { width, stretch, shrink } }` or `{ error: "..." }`.
#[wasm_bindgen]
pub fn space_metrics_wasm(font_json: &str) -> String {
    let font = match parse_font_params(font_json) {
        Ok(f) => f,
        Err(e) => return serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    };

    let result = with_font_bytes(&font.id, |bytes| {
        let face = rustybuzz::Face::from_slice(bytes, 0)
            .ok_or_else(|| "failed to parse font data".to_string())?;
        let scale = font.size / face.units_per_em() as f64;

        // Raw hmtx advance (no shaping), matching TypeScript charToGlyph(' ').advanceWidth
        let space_id = face
            .glyph_index(' ')
            .unwrap_or(rustybuzz::ttf_parser::GlyphId(0));
        let space_advance = face.glyph_hor_advance(space_id).unwrap_or(0) as f64 * scale;
        let safe_width = if space_advance > 0.0 {
            space_advance
        } else {
            font.size / 3.0
        };
        Ok((safe_width, font.size / 6.0, font.size / 9.0))
    });

    match result {
        Ok((w, st, sh)) => serde_json::to_string(&serde_json::json!({
            "ok": { "width": w, "stretch": st, "shrink": sh }
        }))
        .unwrap(),
        Err(e) => serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    }
}

/// OS/2 font metrics scaled to pt. Mirrors TypeScript `realMetrics`.
/// Uses sTypo* values with hhea fallback; baseline shift from ySuperscriptYOffset /
/// ySubscriptYOffset when Font.variant is set.
///
/// Returns `{ ok: { unitsPerEm, ascender, descender, xHeight, capHeight, lineGap, baselineShift } }`
/// or `{ error: "..." }`.
#[wasm_bindgen]
pub fn font_metrics_wasm(font_json: &str) -> String {
    let font = match parse_font_params(font_json) {
        Ok(f) => f,
        Err(e) => return serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    };

    let result = with_font_bytes(&font.id, |bytes| {
        let face = rustybuzz::Face::from_slice(bytes, 0)
            .ok_or_else(|| "failed to parse font data".to_string())?;
        let upm = face.units_per_em();
        let scale = font.size / upm as f64;

        // sTypo* with hhea fallback — matches TypeScript realMetrics
        let asc = face
            .typographic_ascender()
            .unwrap_or_else(|| face.ascender()) as f64
            * scale;
        let desc = face
            .typographic_descender()
            .unwrap_or_else(|| face.descender()) as f64
            * scale;
        let line_gap = face.typographic_line_gap().unwrap_or(0) as f64 * scale;
        let xh_raw = face.x_height().unwrap_or(0) as f64 * scale;
        let cph_raw = face.capital_height().unwrap_or(0) as f64 * scale;
        let x_height = if xh_raw > 0.0 { xh_raw } else { asc * 0.5 };
        let cap_height = if cph_raw > 0.0 { cph_raw } else { asc * 0.7 };

        let baseline_shift = match font.variant.as_deref() {
            Some("superscript") => face
                .superscript_metrics()
                .map(|m| m.y_offset as f64 * scale)
                .unwrap_or(0.0),
            Some("subscript") => face
                .subscript_metrics()
                .map(|m| -(m.y_offset as f64 * scale))
                .unwrap_or(0.0),
            _ => 0.0,
        };

        Ok((
            upm,
            asc,
            desc,
            x_height,
            cap_height,
            line_gap,
            baseline_shift,
        ))
    });

    match result {
        Ok((upm, asc, desc, xh, cph, lg, bs)) => serde_json::to_string(&serde_json::json!({
            "ok": {
                "unitsPerEm":    upm,
                "ascender":      asc,
                "descender":     desc,
                "xHeight":       xh,
                "capHeight":     cph,
                "lineGap":       lg,
                "baselineShift": bs,
            }
        }))
        .unwrap(),
        Err(e) => serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    }
}

// ─── v0.6 — WasmFontEngine: shape + outline ───────────────────────────────────

/// Mirrors TypeScript `PathCommand` — one drawing command with its arguments.
#[derive(Serialize)]
struct PathCommand {
    command: String,
    args: Vec<f64>,
}

/// Per-glyph shape result returned by `shape_text_wasm`.
/// All numeric values are in font units; the caller scales by `fontSize / unitsPerEm`.
#[derive(Serialize)]
struct ShapedGlyph {
    #[serde(rename = "glyphId")]
    glyph_id: u16,
    #[serde(rename = "advanceWidth")]
    advance_width: i32,
    #[serde(rename = "xOffset")]
    x_offset: i32,
    #[serde(rename = "yOffset")]
    y_offset: i32,
}

/// Collects ttf_parser outline callbacks into a `Vec<PathCommand>`.
/// Applies Y-flip so font-space Y (up) becomes screen-space Y (down):
///   screen_y = origin_y - font_y * scale
struct OutlinePathBuilder {
    commands: Vec<PathCommand>,
    scale: f64,
    origin_x: f64,
    origin_y: f64,
}

impl OutlinePathBuilder {
    fn tx(&self, x: f32) -> f64 {
        self.origin_x + x as f64 * self.scale
    }
    fn ty(&self, y: f32) -> f64 {
        self.origin_y - y as f64 * self.scale
    }
}

impl rustybuzz::ttf_parser::OutlineBuilder for OutlinePathBuilder {
    fn move_to(&mut self, x: f32, y: f32) {
        self.commands.push(PathCommand {
            command: "moveTo".to_string(),
            args: vec![self.tx(x), self.ty(y)],
        });
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.commands.push(PathCommand {
            command: "lineTo".to_string(),
            args: vec![self.tx(x), self.ty(y)],
        });
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.commands.push(PathCommand {
            command: "quadraticCurveTo".to_string(),
            args: vec![self.tx(x1), self.ty(y1), self.tx(x), self.ty(y)],
        });
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.commands.push(PathCommand {
            command: "bezierCurveTo".to_string(),
            args: vec![
                self.tx(x1),
                self.ty(y1),
                self.tx(x2),
                self.ty(y2),
                self.tx(x),
                self.ty(y),
            ],
        });
    }
    fn close(&mut self) {
        self.commands.push(PathCommand {
            command: "closePath".to_string(),
            args: vec![],
        });
    }
}

/// Generate an SVG path `d` attribute string from outline commands.
fn commands_to_svg(commands: &[PathCommand]) -> String {
    let mut parts: Vec<String> = Vec::with_capacity(commands.len());
    for cmd in commands {
        match cmd.command.as_str() {
            "moveTo" => parts.push(format!("M {} {}", cmd.args[0], cmd.args[1])),
            "lineTo" => parts.push(format!("L {} {}", cmd.args[0], cmd.args[1])),
            "quadraticCurveTo" => parts.push(format!(
                "Q {} {} {} {}",
                cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3]
            )),
            "bezierCurveTo" => parts.push(format!(
                "C {} {} {} {} {} {}",
                cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3], cmd.args[4], cmd.args[5]
            )),
            "closePath" => parts.push("Z".to_string()),
            _ => {}
        }
    }
    parts.join(" ")
}

/// Shape `text` and return per-glyph info in font units.
/// Applies GSUB features (liga, rlig, sups/subs via Font.variant) and GPOS kern.
/// Values are in font units so callers scale with `fontSize / unitsPerEm`.
///
/// Returns `{ ok: { glyphs: ShapedGlyph[], unitsPerEm: number } }` or `{ error: "..." }`.
#[wasm_bindgen]
pub fn shape_text_wasm(text: &str, font_json: &str) -> String {
    let font = match parse_font_params(font_json) {
        Ok(f) => f,
        Err(e) => return serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    };

    let result = with_font_bytes(&font.id, |bytes| {
        let face = rustybuzz::Face::from_slice(bytes, 0)
            .ok_or_else(|| "failed to parse font data".to_string())?;
        let upm = face.units_per_em();
        let features = shape_features(font.variant.as_deref());

        let mut buf = rustybuzz::UnicodeBuffer::new();
        buf.push_str(text);
        let output = rustybuzz::shape(&face, &features, buf);

        let glyphs: Vec<ShapedGlyph> = output
            .glyph_infos()
            .iter()
            .zip(output.glyph_positions().iter())
            .map(|(info, pos)| ShapedGlyph {
                glyph_id: info.glyph_id as u16,
                advance_width: pos.x_advance,
                x_offset: pos.x_offset,
                y_offset: pos.y_offset,
            })
            .collect();

        Ok((glyphs, upm))
    });

    match result {
        Ok((glyphs, upm)) => serde_json::to_string(&serde_json::json!({
            "ok": { "glyphs": glyphs, "unitsPerEm": upm }
        }))
        .unwrap(),
        Err(e) => serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    }
}

/// Extract the outline path for a single glyph at position (x, y) scaled to fontSize.
/// Y-flip is applied: font-space Y (up) -> screen-space Y (down).
///
/// Returns `{ ok: { commands: PathCommand[], d: string } }` or `{ error: "..." }`.
#[wasm_bindgen]
pub fn get_glyph_path(font_id: &str, glyph_id: u16, x: f64, y: f64, font_size: f64) -> String {
    let result = with_font_bytes(font_id, |bytes| {
        let face = rustybuzz::Face::from_slice(bytes, 0)
            .ok_or_else(|| "failed to parse font data".to_string())?;
        let scale = font_size / face.units_per_em() as f64;

        let mut builder = OutlinePathBuilder {
            commands: Vec::new(),
            scale,
            origin_x: x,
            origin_y: y,
        };

        face.outline_glyph(rustybuzz::ttf_parser::GlyphId(glyph_id), &mut builder);

        let d = commands_to_svg(&builder.commands);
        Ok((builder.commands, d))
    });

    match result {
        Ok((commands, d)) => serde_json::to_string(&serde_json::json!({
            "ok": { "commands": commands, "d": d }
        }))
        .unwrap(),
        Err(e) => serde_json::to_string(&serde_json::json!({ "error": e })).unwrap(),
    }
}

// ─── Phase: BiDi run analysis ────────────────────────────────────────────────

#[derive(Serialize)]
struct BidiRun {
    text: String,
    level: u8,
    #[serde(rename = "isRtl")]
    is_rtl: bool,
}

/// Analyse `text` into Unicode BiDi runs (auto-detected paragraph level).
///
/// Run boundaries are snapped to grapheme cluster boundaries.  In practice the
/// UBA already handles Non-Spacing Marks (Arabic harakat, Hebrew nikud) via
/// rule W1, so the snap is a safety net for unusual edge cases.
///
/// Returns `{ ok: [ { text, level, isRtl }, … ] }` or `{ error: "…" }`.
#[wasm_bindgen]
pub fn analyze_bidi(text: &str) -> String {
    if text.is_empty() {
        return serde_json::to_string(&serde_json::json!({ "ok": [] })).unwrap();
    }

    let bidi = BidiInfo::new(text, None);
    let levels = &bidi.levels;

    // char_bytes[i] = byte offset of the i-th Unicode scalar value.
    let char_bytes: Vec<usize> = text.char_indices().map(|(b, _)| b).collect();

    // Assign each grapheme cluster the BiDi level of its first scalar value.
    // This guarantees run boundaries always fall on grapheme cluster boundaries.
    let clusters: Vec<(usize, unicode_bidi::Level)> =
        text.grapheme_indices(true)
            .map(|(g_start, _g_str)| {
                let ci = char_bytes.partition_point(|&b| b < g_start);
                let level = if ci < levels.len() {
                    levels[ci]
                } else {
                    unicode_bidi::Level::ltr()
                };
                (g_start, level)
            })
            .collect();

    if clusters.is_empty() {
        return serde_json::to_string(&serde_json::json!({ "ok": [] })).unwrap();
    }

    let mut runs: Vec<BidiRun> = Vec::new();
    let mut run_start = clusters[0].0;
    let mut cur_level = clusters[0].1;

    for &(g_start, level) in clusters.iter().skip(1) {
        if level != cur_level {
            runs.push(BidiRun {
                text: text[run_start..g_start].to_string(),
                level: cur_level.number(),
                is_rtl: cur_level.is_rtl(),
            });
            run_start = g_start;
            cur_level = level;
        }
    }
    // Final run
    runs.push(BidiRun {
        text: text[run_start..].to_string(),
        level: cur_level.number(),
        is_rtl: cur_level.is_rtl(),
    });

    serde_json::to_string(&serde_json::json!({ "ok": runs })).unwrap()
}
