# Knuth-Plass Algorithm — Code Reference

This document maps the Knuth-Plass algorithm as described in the 1981 paper to the TypeScript implementation in `src/linebreak.ts`. Familiarity with the paper is assumed; this document explains what was implemented, what was extended, and where the code deviates.

**Reference:** Knuth, D.E. & Plass, M.F. (1981). *Breaking Paragraphs into Lines*. Software: Practice and Experience, 11(11), 1119–1184.

---

## 1. The problem

Given a sequence of boxes (fixed-width content), glue (flexible space), and penalties (breakpoints with costs), find the set of line breaks that minimises total demerits across the paragraph — subject to each line fitting within `lineWidth`.

The Knuth-Plass algorithm solves this as dynamic programming over feasible breakpoints, keeping a set of *active* candidate line-starts at each position.

---

## 2. Ratio and feasibility

The **adjustment ratio** `r` for a line from active breakpoint `a` to candidate breakpoint `i` measures how much the glue must be stretched or compressed:

```
L   = sum of natural widths   (boxes + glue)  from a+1 to i
Y   = sum of glue stretch     from a+1 to i
Z   = sum of glue shrink      from a+1 to i
w   = lineWidth (or lineWidths[a.line] if per-line widths are set)
p_w = penalty width at i (non-zero only for hyphen penalties)

target = w − L − p_w

r = target / Y   if target > 0   (line needs stretching)
r = target / Z   if target < 0   (line needs shrinking)
r = 0            if target = 0
```

When `Y = 0` and `target > 0`, the line cannot be stretched: `r = +∞`. When `Z = 0` and `target < 0`, it cannot be shrunk: `r = −∞`.

*Implementation:* `computeRatio` in `linebreak.ts`. The sums `L`, `Y`, `Z` are computed in O(1) using prefix arrays built by `buildPrefixSums`.

A break is **feasible** if:

```
−1 ≤ r ≤ tolerance
```

`r = −1` means the line is compressed to its minimum (glue fully shrunk). `r = tolerance` (default 2) is a configurable upper bound. The paper uses `tolerance = ∞` and achieves paragraph-global optimality; the finite tolerance here prunes breaks that would produce visually unacceptable lines.

*Implementation:* `isFeasible` in `linebreak.ts`.

---

## 3. Badness

```
b = round(100 × |r|³)
```

Badness is zero at natural spacing, 100 when glue is stretched or shrunk by one full unit, and grows cubically. The cubic exponent penalises extreme ratios severely relative to moderate ones.

*Implementation:* `computeBadness` in `linebreak.ts`.

---

## 4. Demerits

Demerits accumulate across the paragraph. The formula branches on the penalty value at the break position:

```
penalty ≥ 0:         d = (1 + b + p)²
penalty < 0
  (not forced):      d = (1 + b)² − p²
forced break (−∞):   d = (1 + b)²
```

When both the previous line and the current line end with a flagged break (hyphen), an additional `DOUBLE_HYPHEN_PENALTY = 3000` is added. This discourages two consecutive hyphenated lines.

*Implementation:* `computeDemerits` in `linebreak.ts`.

TeX uses the same three-case formula. The negative-penalty branch rewards breaks at discouraged positions (the subtraction of `p²` reduces total demerits). The forced-break branch ignores the forced penalty value because `−∞` would make the arithmetic undefined.

---

## 5. Valid break positions

A node at index `i` is a valid break position if:
- It is a `penalty` node with `penalty < PROHIBITED` (i.e. not `+∞`), **or**
- It is a `glue` node immediately preceded by a `box` node

The glue-after-box rule implements TeX's convention: a line can break at a space, but only if content precedes it on the line (so a line cannot begin with a space).

*Implementation:* `isValidBreak` in `linebreak.ts`.

---

## 6. The forward pass

The forward pass maintains an **active list** — the set of breakpoints that could start a future line. Initially it contains only the paragraph-start node (`position = 0, line = 0, totalDemerits = 0`).

For each valid break position `i`:

```
nextActive = []
bestAtI    = Map<lineNumber, BreakpointNode>    // best candidate per line count at this position

for each active node a:
    compute r for the line (a.position, i)
    if r >= -1 and not forced break:
        add a to nextActive    // a is still potentially useful for future lines

    if isFeasible(r, tolerance):
        compute demerits d
        create candidate c = { position: i, line: a.line + 1, totalDemerits: a.totalDemerits + d, ... }
        if c is better than bestAtI[c.line]:
            bestAtI[c.line] = c

for each winner in bestAtI:
    add winner to nextActive

active = nextActive
```

The `bestAtI` map keeps **one candidate per line count** at each position. This enables looseness: the final selection can choose among solutions with different total line counts, each represented by a distinct candidate.

Active nodes are pruned when `r < −1`: the line from `a` to `i` is already too tight, and adding more content to `i` can only make it worse. This pruning bounds the active list size in practice.

*Implementation:* `forwardPass` in `linebreak.ts`.

---

## 7. Optimal selection and looseness

After the forward pass, all remaining active nodes reached the paragraph's forced break. The **optimal** solution is the node with minimum `totalDemerits`.

**Looseness** (`looseness ≠ 0`): Given `optimal.line` as the optimal line count, the algorithm finds all candidates with `line = optimal.line + looseness` and selects the one with minimum `totalDemerits` among them. If no such candidate exists, it falls back to optimal. This faithfully implements Knuth's looseness parameter.

*Implementation:* `computeBreakpoints` in `linebreak.ts`.

---

## 8. Traceback

The optimal `BreakpointNode` is the tail of a linked list via `previous` pointers. `traceback` follows the chain from tail to head, collecting `{ position, ratio, flagged, line }` at each node, then reverses the array.

The result is `LineBreak[]` in paragraph order — one entry per line break, including the forced break at the paragraph end.

*Implementation:* `traceback.ts`.

---

## 9. Extensions beyond the paper

The following features extend the 1981 algorithm.

### 9.1 Emergency stretch

If the forward pass produces an empty active list (no feasible solution within `tolerance`), a second pass runs with all glue stretch budgets increased by `emergencyStretch`. The result is flagged via `usedEmergency: true` in `BreakpointResult`.

This corresponds to TeX's `\emergencystretch` parameter introduced in TeX 3.0.

### 9.2 Consecutive hyphen limit

`consecutiveHyphenLimit > 0` prevents runs of hyphenated lines. During the forward pass, `consecutiveHyphens` is tracked per active node: `flagged ? a.consecutiveHyphens + 1 : 0`. A candidate that would exceed the limit is skipped with `continue` — it is never added to `bestAtI` or `nextActive`.

This is enforced in the DP rather than as a post-processing filter, so the algorithm finds the globally optimal solution that satisfies the constraint.

### 9.3 Widow penalty

At the forced break (`isForcedBreak`), if `widowPenalty > 0`, the candidate's demerits are increased by `widowPenalty` when the last line contains exactly one content box. Content boxes are boxes with `content !== ''` — this excludes the indent box.

### 9.4 Orphan penalty

At the forced break, if `orphanPenalty > 0` and `a.previous === null` (the active node is the paragraph-start node), the candidate's demerits are increased by `orphanPenalty`. This penalises a paragraph that fits on a single line.

### 9.5 Per-line widths

When `lineWidths[]` is provided, `effectiveLineWidth = lineWidths[a.line] ?? lineWidth` replaces the global `lineWidth` in `computeRatio`. This enables runaround text (e.g. lines shortened to wrap around an image), multi-column layouts with different column widths, or first-line offset for drop capitals.

---

## 10. Deviations from TeX

### Space metrics from OS/2, not TFM

TeX derives space width, stretch, and shrink from the font's TFM (TeX Font Metrics) file. This implementation reads the real space glyph advance width from the font and applies TeX conventions for stretch (`em/6`) and shrink (`em/9`) using the OS/2 em size.

### `SOFT_HYPHEN_PENALTY = 0`

TeX does not have explicit soft hyphen support; it uses `\discretionary` which has penalty 0 by default. This implementation treats U+00AD as a penalty-0 break point, consistent with TeX's convention. Algorithmic hyphenation uses `HYPHEN_PENALTY = 50`. Soft hyphens are therefore preferred when they and algorithmic breaks coincide at the same position.

### `letterSpacing` gap count uses post-GSUB glyph count

Letter spacing is applied over `glyphCount - 1` gaps, where `glyphCount` is the number of glyphs **after** GSUB substitution (ligatures collapsed, variants substituted). This matches the visual glyph sequence — ligature components receive one tracking gap, not two. Both the opentype.js measurement path (`getSubstitutedGlyphs` in `measure.ts`) and the WASM rustybuzz path account for GSUB before computing the gap count.

### Badness is integer-rounded

TeX's badness is an integer in [0, 10000]. This implementation rounds `100 × |r|³` to the nearest integer (`Math.round`) but does not clamp at 10000. For `|r| > tolerance`, the break is rejected by `isFeasible` before badness is used, so uncapped badness does not affect the output.
