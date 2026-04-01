// manual/fixtures/text.ts
// Shared text corpora reused across all MT scripts.
// Same input → comparable output → visible deltas between configurations.

// ─── EN_BODY ─────────────────────────────────────────────────────────────────
// ~200-word English body text. Used by: MT-01, MT-07, MT-08, MT-11, MT-15.
// Deliberately contains lines that would cause widows, consecutive hyphens,
// and margin punctuation (commas, periods, hyphens, quotes).

export const EN_BODY =
  'The Knuth–Plass algorithm finds the globally optimal set of line breaks for a ' +
  'paragraph, minimising a cost function based on how tightly or loosely each line ' +
  'is fitted. Unlike first-fit greedy algorithms, it considers all feasible ' +
  'breakpoints simultaneously. The result is a more even "colour" across the ' +
  'paragraph — no very loose lines followed by very tight ones, no unsightly rivers ' +
  'of white space running through the justified text. Difficult ligatures such as ' +
  '"fi", "fl", and "ffi" are resolved automatically through GSUB lookup tables. ' +
  'Hyphenation is applied using language-specific dictionaries, and consecutive ' +
  'hyphenated lines are limited to avoid a distracting ladder effect at the ' +
  'right-hand margin. Widow and orphan control ensures that a single short word ' +
  'never appears alone on the last line of a paragraph, and a single line never ' +
  'stands isolated at the top of a column. The algorithm was described by Donald ' +
  'Knuth and Michael Plass in their 1981 paper "Breaking Paragraphs into Lines".';

// ─── EN_NARROW ───────────────────────────────────────────────────────────────
// Short English text for narrow-column tests. Used by: MT-06, MT-08.

export const EN_NARROW =
  'Optical margin alignment protrudes punctuation slightly beyond the column edge, ' +
  'making the text block appear more flush. This technique is used in high-quality ' +
  'book typography. A very long URL like https://www.example.com/path/to/resource?query=value ' +
  'will cause overflow in a narrow column unless emergency stretch is enabled.';

// ─── HE_PARAGRAPH ────────────────────────────────────────────────────────────
// Hebrew paragraph (~50 words). Used by MT-02.
// Source: Genesis 1:1–3 (public domain).

export const HE_PARAGRAPH =
  'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ. ' +
  'וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ וְחֹשֶׁךְ עַל-פְּנֵי תְהוֹם ' +
  'וְרוּחַ אֱלֹהִים מְרַחֶפֶת עַל-פְּנֵי הַמָּיִם. ' +
  'וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר וַיְהִי-אוֹר. ' +
  'וַיַּרְא אֱלֹהִים אֶת-הָאוֹר כִּי-טוֹב וַיַּבְדֵּל אֱלֹהִים בֵּין הָאוֹר וּבֵין הַחֹשֶׁךְ.';

// ─── AR_PARAGRAPH ─────────────────────────────────────────────────────────────
// Arabic paragraph. Used by MT-03.
// Source: Bismillah + Surah Al-Fatiha opening (public domain).

export const AR_PARAGRAPH =
  'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ ' +
  'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ' +
  'الرَّحْمَنِ الرَّحِيمِ ' +
  'مَالِكِ يَوْمِ الدِّينِ ' +
  'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ ' +
  'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ ' +
  'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ.';

// ─── DOCUMENT_PARA_1/2/3 ─────────────────────────────────────────────────────
// Three paragraphs of varying length for document/grid tests. Used by MT-14, MT-13.

export const DOCUMENT_PARA_1 =
  'Typography is the art and technique of arranging type to make written language ' +
  'legible, readable, and appealing when displayed. The arrangement of type involves ' +
  'selecting typefaces, point sizes, line lengths, line-spacing, and letter-spacing.';

export const DOCUMENT_PARA_2 =
  'A baseline grid is an invisible set of horizontal lines that helps designers ' +
  'align text and elements consistently across a layout. When body text is set on ' +
  'a baseline grid, the baselines of text in adjacent columns align perfectly, ' +
  'creating a sense of order and rhythm throughout the page.';

export const DOCUMENT_PARA_3 =
  'Optical margin alignment, also known as hanging punctuation, is a typographic ' +
  'technique where punctuation marks and the thin strokes of letters are extended ' +
  'slightly into the margin so that the text block appears more aligned to the eye. ' +
  'It is supported in professional publishing software and is considered a mark ' +
  'of high-quality typesetting.';
