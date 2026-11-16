// german-and-urls.test.ts
//
// v0.7.1 — two causes of overfull lines:
//   1. German nouns were never hyphenated, because the proper-noun rule skips
//      every capitalised word. German now hyphenates capitalised words by
//      default; an explicit `processCapitalized` always wins.
//   2. A URL was one unbreakable box. A URL-like token now gets break points
//      that insert no hyphen and carry a penalty.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  hyphenateWord,
  hyphenateParagraph,
  loadLanguages,
  DEFAULT_HYPHENATE_OPTIONS,
  HyphenateOptions,
} from '../src/hyphenate';
import { buildNodeSequence, URL_BREAK_PENALTY } from '../src/nodes';
import { computeBreakpoints } from '../src/linebreak';
import { traceback } from '../src/traceback';
import { composeParagraph } from '../src/compose';
import { mockMeasure, mockSpace, mockMetrics } from '../src/testing';
import { Font, Measurer, Node, HYPHEN_PENALTY } from '@paragraf/types';

const FONT: Font = {
  id: 'test',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

// mockMeasure: 7.2 pt per character at 12 pt; a space is 3 pt.
const MEASURER: Measurer = {
  measure: mockMeasure,
  space: mockSpace,
  metrics: mockMetrics,
  registry: new Map(),
};

const en: HyphenateOptions = { ...DEFAULT_HYPHENATE_OPTIONS };
const de: HyphenateOptions = { ...DEFAULT_HYPHENATE_OPTIONS, language: 'de' };

beforeAll(async () => {
  await loadLanguages(['en-us', 'de', 'fr']);
});

const compose = (
  text: string,
  opts: HyphenateOptions,
  lineWidth: number,
  tolerance = 3,
) => {
  const words = hyphenateParagraph(text, opts).map((w) => ({
    ...w,
    font: FONT,
  }));
  const nodes = buildNodeSequence(words, MEASURER);
  const result = computeBreakpoints({ nodes, lineWidth, tolerance });
  const breaks = traceback(result.node);
  const lines = composeParagraph(
    nodes,
    breaks,
    'justified',
    false,
    lineWidth,
    [],
    mockMetrics,
  );
  return { nodes, lines, usedFallback: result.usedFallback };
};

// ─── German capitalised words ────────────────────────────────────────────────

describe('German: capitalised words are hyphenated by default', () => {
  it('a capitalised noun in mid-sentence is hyphenated', () => {
    const r = hyphenateWord('Rechtsschutzversicherung', de, false);
    expect(r.hyphenable).toBe(true);
    expect(r.fragments.length).toBeGreaterThan(2);
    expect(r.fragments.join('')).toBe('Rechtsschutzversicherung');
  });

  it('hyphenateParagraph: every long noun in a German sentence gets break points', () => {
    const words = hyphenateParagraph(
      'Die Donaudampfschifffahrtsgesellschaft und die Versicherungsgesellschaften bleiben',
      de,
    );
    const byWord = Object.fromEntries(words.map((w) => [w.original, w]));
    expect(byWord['Donaudampfschifffahrtsgesellschaft'].hyphenable).toBe(true);
    expect(byWord['Versicherungsgesellschaften'].hyphenable).toBe(true);
  });

  it('explicit processCapitalized: false wins over the German default', () => {
    const r = hyphenateWord(
      'Rechtsschutzversicherung',
      { ...de, processCapitalized: false },
      false,
    );
    expect(r.hyphenable).toBe(false);
    expect(r.fragments).toEqual(['Rechtsschutzversicherung']);
  });

  it('explicit processCapitalized: true still works for German', () => {
    const r = hyphenateWord(
      'Rechtsschutzversicherung',
      { ...de, processCapitalized: true },
      false,
    );
    expect(r.hyphenable).toBe(true);
  });

  it('all-caps words stay unhyphenated in German', () => {
    expect(hyphenateWord('UNESCO', de, false).hyphenable).toBe(false);
  });

  it('English keeps the proper-noun rule by default', () => {
    expect(hyphenateWord('London', en, false).hyphenable).toBe(false);
    expect(hyphenateWord('Manchester', en, false).hyphenable).toBe(false);
  });

  it('French keeps the proper-noun rule by default', () => {
    const fr: HyphenateOptions = { ...en, language: 'fr' };
    expect(hyphenateWord('Montpellier', fr, false).hyphenable).toBe(false);
  });

  it('explicit processCapitalized: true hyphenates an English proper noun', () => {
    const r = hyphenateWord(
      'Manchester',
      { ...en, processCapitalized: true },
      false,
    );
    expect(r.hyphenable).toBe(true);
  });

  it('a narrow German column has no overfull line', () => {
    // 21 characters per line; the compounds are 34 and 27 characters long.
    const text =
      'Die Donaudampfschifffahrtsgesellschaft und die Versicherungsgesellschaften bleiben hier';
    const { lines } = compose(text, de, 21 * 7.2, 10);
    expect(lines.filter((l) => l.overfull)).toEqual([]);
    expect(lines.filter((l) => l.hyphenated).length).toBeGreaterThanOrEqual(2);

    // With the proper-noun rule forced back on, both compounds stick out.
    const before = compose(
      text,
      { ...de, processCapitalized: false },
      21 * 7.2,
      10,
    );
    expect(before.lines.filter((l) => l.overfull).length).toBe(2);
  });
});

// ─── Words in capitals ───────────────────────────────────────────────────────

describe('words in capitals are never hyphenated', () => {
  const whole = (word: string, opts: HyphenateOptions, first = false) => {
    const r = hyphenateWord(word, opts, first);
    expect(r.fragments, word).toEqual([word]);
    expect(r.hyphenable, word).toBe(false);
  };

  it('German: with punctuation attached', () => {
    for (const w of [
      'BUNDESREPUBLIK,',
      'BUNDESWEHR.',
      'GROSSBUCHSTABEN;',
      '(NATO)',
      '(UNESCO).',
    ]) {
      whole(w, de);
    }
  });

  it('German: with letters outside A–Z', () => {
    for (const w of ['GRÖSSE', '„ACHTUNG“', 'ÜBERWACHUNG', 'ÄNDERUNGEN']) {
      whole(w, de);
    }
  });

  it('other languages: also at the start of a paragraph or sentence', () => {
    whole('INTERNATIONAL,', en, true);
    whole('"UNBELIEVABLE"', en, true);
    whole('ÉLECTRICITÉ', { ...en, language: 'fr' }, true);
  });

  it('a capitalised word is not a word in capitals', () => {
    expect(hyphenateWord('Überwachung', de, false).hyphenable).toBe(true);
    expect(hyphenateWord('Bundesrepublik,', de, false).hyphenable).toBe(true);
    // One capital with punctuation is not "at least two upper-case letters".
    expect(hyphenateWord('beautiful', en, false).hyphenable).toBe(true);
  });
});

// ─── E-mail addresses ────────────────────────────────────────────────────────

describe('e-mail addresses are never hyphenated', () => {
  it('an address stays in one piece, in any language', () => {
    for (const opts of [en, de]) {
      for (const w of [
        'firstname.lastname@university.example.org',
        'redaktion@zeitungsverlag.example',
        '(support@example.org).',
      ]) {
        const r = hyphenateWord(w, opts, false);
        expect(r.fragments, w).toEqual([w]);
        expect(r.hyphenable, w).toBe(false);
      }
    }
  });

  it('an "@" at the start or end of a token does not make an address', () => {
    expect(hyphenateWord('@beautiful', en, false).hyphenable).toBe(true);
  });
});

// ─── URL break points ────────────────────────────────────────────────────────

describe('URLs: break points without a hyphen', () => {
  const frags = (word: string, opts: HyphenateOptions = en) =>
    hyphenateWord(word, opts, false).fragments;

  it('breaks after "/" and before "."', () => {
    expect(frags('https://example.com/a/very/long/path/index.html')).toEqual([
      'https://',
      'example',
      '.com/',
      'a/',
      'very/',
      'long/',
      'path/',
      'index',
      '.html',
    ]);
  });

  it('never breaks inside "://"', () => {
    for (const f of frags('https://example.com/path/to/page')) {
      expect(f.endsWith(':')).toBe(false);
      expect(f.endsWith(':/')).toBe(false);
    }
    expect(frags('https://example.com/path/to/page')[0]).toBe('https://');
  });

  it('breaks after "?", "=", "&" and "#"', () => {
    expect(frags('https://example.com/search?query=one&lang=de#top')).toEqual([
      'https://',
      'example',
      '.com/',
      'search?',
      'query=',
      'one&',
      'lang=',
      'de#',
      'top',
    ]);
  });

  it('breaks after "_" and "-"', () => {
    expect(frags('www.my-site.org/some_page')).toEqual([
      'www',
      '.my-',
      'site',
      '.org/',
      'some_',
      'page',
    ]);
  });

  it('a URL is not hyphenable: no hyphen is ever inserted', () => {
    const r = hyphenateWord('https://example.com/documentation', en, false);
    expect(r.hyphenable).toBe(false);
    expect(r.hasSoftHyphen).toBe(false);
    // "documentation" would be split by the pattern hyphenator; inside a URL
    // it stays whole.
    expect(r.fragments).toEqual([
      'https://',
      'example',
      '.com/',
      'documentation',
    ]);
  });

  it('a URL that contains digits still gets break points', () => {
    expect(frags('https://example.com/2026/11/report.pdf')).toEqual([
      'https://',
      'example',
      '.com/',
      '2026/',
      '11/',
      'report',
      '.pdf',
    ]);
  });

  it('detects http://, https:// and www.', () => {
    expect(frags('http://example.com/page').length).toBeGreaterThan(1);
    expect(frags('https://example.com/page').length).toBeGreaterThan(1);
    expect(frags('www.example.com').length).toBeGreaterThan(1);
    expect(frags('HTTPS://EXAMPLE.COM/PAGE').length).toBeGreaterThan(1);
  });

  it('detects a bare domain only when a path follows', () => {
    expect(frags('example.com/docs/intro')).toEqual([
      'example',
      '.com/',
      'docs/',
      'intro',
    ]);
  });

  it('punctuation around a URL stays attached and adds no break', () => {
    expect(frags('(https://example.com/docs/intro).')).toEqual([
      '(https://',
      'example',
      '.com/',
      'docs/',
      'intro).',
    ]);
    // The full stop that ends the sentence is not a break point.
    expect(frags('https://example.com/docs/.')).toEqual([
      'https://',
      'example',
      '.com/',
      'docs/.',
    ]);
  });

  it('does not leave a single character on either side of a break', () => {
    expect(frags('https://example.com/a/b')).toEqual([
      'https://',
      'example',
      '.com/',
      'a/b',
    ]);
  });

  it('ordinary words with these characters are not treated as URLs', () => {
    for (const word of [
      'and/or',
      'e.g./i.e.',
      'well-known',
      'state-of-the-art',
      'file_name',
      'example.com',
      'Mr.Smith',
      '3.5/4.5',
      'a=b',
      // A dot and a slash do not make a URL: the bare-host rule needs
      // lower-case labels and a top-level domain from a short list.
      'Node.js/Express',
      'README.md/CHANGELOG.md',
      'index.html/#top',
      'Input.Output/Stream',
      'Mr.Smith/Jones',
      'St.Gallen/Zürich',
      'end.Next/thing',
      'tcp.ip/stack',
      'usw.usf/etc',
      'file.txt/',
      'Example.com/path',
      'look.at/this',
    ]) {
      const on = hyphenateWord(word, en, false);
      const off = hyphenateWord(word, { ...en, breakUrls: false }, false);
      expect(on, word).toEqual(off);
    }
  });

  it('a bare host is detected when its top-level domain is on the list', () => {
    expect(frags('example.com/path')).toEqual(['example', '.com/', 'path']);
    expect(frags('example.org/a/b')).toEqual(['example', '.org/', 'a/b']);
    expect(frags('sub.example.co.uk/xy')).toEqual([
      'sub',
      '.example',
      '.co',
      '.uk/',
      'xy',
    ]);
    expect(frags('example.de:8080/pfad/seite')).toEqual([
      'example',
      '.de:8080/',
      'pfad/',
      'seite',
    ]);
  });

  it('a very long token is handled in linear time', () => {
    // Each of these made the first version's trailing-punctuation regex
    // quadratic: 20,000 dots took 24 seconds.
    const n = 50_000;
    for (const token of [
      '.'.repeat(n),
      'a' + '.'.repeat(n) + 'b',
      'https://example.com/' + '.'.repeat(n) + 'x',
      ')'.repeat(n) + 'x',
      '('.repeat(n),
      'a.'.repeat(n / 2),
      'a-'.repeat(n / 2) + '/',
      'A'.repeat(n) + ',',
      '!?'.repeat(n / 2) + 'A',
    ]) {
      const t0 = performance.now();
      const r = hyphenateWord(token, en, false);
      const ms = performance.now() - t0;
      expect(r.fragments.join(''), token.slice(0, 12)).toBe(token);
      expect(
        ms,
        `${token.slice(0, 12)}… took ${ms.toFixed(0)} ms`,
      ).toBeLessThan(500);
    }
  });

  it('breakUrls: false turns URL breaking off', () => {
    const r = hyphenateWord(
      'https://example.com/a/very/long/path/index.html',
      { ...en, breakUrls: false },
      false,
    );
    expect(r.fragments).toEqual([
      'https://example.com/a/very/long/path/index.html',
    ]);
    expect(r.hyphenable).toBe(false);
  });

  it('URL detection does not depend on the language', () => {
    expect(frags('https://example.com/docs/intro', de)).toEqual(
      frags('https://example.com/docs/intro', en),
    );
  });

  it('fragments rejoin to the original token', () => {
    const url = 'https://example.com/search?query=one&lang=de#top';
    expect(frags(url).join('')).toBe(url);
  });
});

// ─── Nodes ───────────────────────────────────────────────────────────────────

describe('URLs: node sequence', () => {
  const URL = 'https://example.com/docs/intro';

  it('puts an unflagged zero-width penalty between URL fragments', () => {
    const words = hyphenateParagraph(URL, en).map((w) => ({
      ...w,
      font: FONT,
    }));
    const nodes = buildNodeSequence(words, MEASURER);
    // https:// | example | .com/ | docs/ | intro
    // 5 boxes, 4 penalties, then termination glue + forced break
    const inner = nodes.slice(0, -2);
    expect(inner.map((n) => n.type)).toEqual([
      'box',
      'penalty',
      'box',
      'penalty',
      'box',
      'penalty',
      'box',
      'penalty',
      'box',
    ]);
    for (const n of inner) {
      if (n.type !== 'penalty') continue;
      expect(n.width).toBe(0);
      expect(n.flagged).toBe(false);
      expect(n.penalty).toBe(URL_BREAK_PENALTY);
    }
  });

  it('a URL break costs more than a hyphen', () => {
    expect(URL_BREAK_PENALTY).toBeGreaterThan(HYPHEN_PENALTY);
  });

  it('span input: the same penalties between URL fragments', () => {
    const h = hyphenateWord(URL, en, true);
    const nodes: Node[] = buildNodeSequence(
      [
        {
          ...h,
          font: FONT,
          segments: h.fragments.map((f) => [{ text: f, font: FONT }]),
        },
      ],
      MEASURER,
    );
    const penalties = nodes.slice(0, -2).filter((n) => n.type === 'penalty');
    expect(penalties.length).toBe(4);
    for (const p of penalties) {
      expect(p).toMatchObject({ width: 0, flagged: false, penalty: 200 });
    }
  });

  it('an ordinary hyphenated word still gets flagged hyphen penalties', () => {
    const words = hyphenateParagraph('beautiful', en).map((w) => ({
      ...w,
      font: FONT,
    }));
    const penalties = buildNodeSequence(words, MEASURER)
      .slice(0, -2)
      .filter((n) => n.type === 'penalty');
    expect(penalties.length).toBeGreaterThan(0);
    for (const p of penalties) {
      expect(p).toMatchObject({ flagged: true, penalty: HYPHEN_PENALTY });
      expect(p.width).toBeGreaterThan(0);
    }
  });
});

// ─── Composition ─────────────────────────────────────────────────────────────

describe('URLs: composed lines', () => {
  const URL =
    'https://example.com/a/very/long/path/that/cannot/be/hyphenated/index.html';
  const TEXT = `The report is published at ${URL} and is updated every week.`;

  it('a URL wider than the column is broken, with no overfull line and no hyphen', () => {
    // 30 characters per line; the URL has 73.
    const { lines } = compose(TEXT, en, 30 * 7.2, 10);
    expect(lines.filter((l) => l.overfull)).toEqual([]);

    // The URL runs over more than one line …
    const all = lines.map((l) => l.words.join(' '));
    const first = all.findIndex((t) => t.includes('https://'));
    const last = all.findIndex((t) => t.includes('index.html'));
    expect(last).toBeGreaterThan(first);
    // … no line that ends inside it is marked hyphenated or ends in "-" …
    for (let i = first; i < last; i++) {
      expect(lines[i].hyphenated).toBe(false);
      expect(all[i]).not.toMatch(/-$/);
    }
    // … and no character was added or lost: the pieces join to the URL.
    let joined = all[first].slice(all[first].indexOf('https://'));
    for (let i = first + 1; i <= last; i++) joined += all[i];
    expect(joined.startsWith(URL)).toBe(true);
  });

  it('without URL breaking the same paragraph has an overfull line', () => {
    const words = hyphenateParagraph(TEXT, { ...en, breakUrls: false }).map(
      (w) => ({ ...w, font: FONT }),
    );
    const nodes = buildNodeSequence(words, MEASURER);
    const lineWidth = 30 * 7.2;
    const result = computeBreakpoints({ nodes, lineWidth, tolerance: 10 });
    const lines = composeParagraph(
      nodes,
      traceback(result.node),
      'justified',
      false,
      lineWidth,
      [],
      mockMetrics,
    );
    expect(lines.filter((l) => l.overfull).length).toBe(1);
  });

  it('a URL that fits on a line stays one word', () => {
    const { lines } = compose(TEXT, en, 2000);
    expect(lines.length).toBe(1);
    expect(lines[0].words).toEqual(TEXT.split(' '));
    expect(lines[0].wordRuns[5].map((r) => r.text).join('')).toBe(URL);
  });

  it('a URL is only broken when needed', () => {
    // 50 characters per line, with a space that can stretch a lot. The first
    // line could be filled exactly by taking "https://" from the URL (badness
    // 0, plus the URL penalty); leaving the URL whole makes that line loose
    // (ratio 1.06, badness 119). The penalty of 200 outweighs the looseness,
    // so the URL stays in one piece.
    const short = 'https://example.com/docs/intro';
    const text = `Please consult the entire reference manual ${short} for details and examples.`;
    const measurer: Measurer = {
      ...MEASURER,
      space: () => ({ width: 6, stretch: 12, shrink: 2 }),
    };
    const words = hyphenateParagraph(text, en).map((w) => ({
      ...w,
      font: FONT,
    }));
    const nodes = buildNodeSequence(words, measurer);
    const lineWidth = 50 * 7.2;
    const result = computeBreakpoints({ nodes, lineWidth, tolerance: 10 });
    const lines = composeParagraph(
      nodes,
      traceback(result.node),
      'justified',
      false,
      lineWidth,
      [],
      mockMetrics,
    );
    expect(result.usedFallback).toBe(false);
    expect(lines[0].words.join(' ')).toBe(
      'Please consult the entire reference manual',
    );
    expect(lines[1].words[0]).toBe(short);
  });
});
