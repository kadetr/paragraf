// demo/src/pages/i18n.ts
// Page 4 — i18n: multi-script paragraph rendering with language/direction controls.

import { loadHyphenator, hyphenateParagraph } from '@paragraf/compile';
import type { Language } from '@paragraf/compile';
import type { Page, BootContext } from '../router.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type LocaleDirection = 'ltr' | 'rtl';
export type DirectionOverride = 'auto' | 'force-ltr' | 'force-rtl';

export interface LocaleEntry {
  label: string;
  direction: LocaleDirection;
  sampleText: string;
  fontId: string; // matches FONTS entry id
  hyphenatorLocale: string; // passed to loadHyphenator()
}

// ─── Locale data (exported for unit tests) ───────────────────────────────────────

export const LOCALE_MAP: Record<string, LocaleEntry> = {
  'en-us': {
    label: 'English (US)',
    direction: 'ltr',
    fontId: 'liberation-serif',
    hyphenatorLocale: 'en-us',
    sampleText:
      'Far out in the uncharted backwaters of the unfashionable end of the Western Spiral Arm of the Galaxy lies a small unregarded yellow sun.' +
      'Orbiting this at a distance of roughly ninety-two million miles is an utterly insignificant little blue-green planet whose ape-descended life forms are so amazingly primitive that they still think digital watches are a pretty neat idea.' +
      'This planet has – or rather had – a problem, which was this: most of the people living on it were unhappy for pretty much of the time. Many solutions were suggested for this problem, but most of these were largely concerned with the movements of small green pieces of paper, which is odd because on the whole it was not the small green pieces of paper that were unhappy.' +
      'And so the problem remained; lots of the people were mean, and most of them were miserable, even the ones with digital watches.',
  },
  de: {
    label: 'Deutsch',
    direction: 'ltr',
    fontId: 'liberation-serif',
    hyphenatorLocale: 'de',
    sampleText:
      'Typographie ist die Kunst und Technik, Schriftzeichen so anzuordnen, dass geschriebene ' +
      'Sprache lesbar, gut lesbar und ansprechend erscheint. Die Anordnung von Schriftzeichen ' +
      'umfasst die Auswahl von Schriftarten, Schriftgrößen, Zeilenlängen und Abständen.',
  },
  fr: {
    label: 'Français',
    direction: 'ltr',
    fontId: 'liberation-serif',
    hyphenatorLocale: 'fr',
    sampleText:
      'La typographie est l\u2019art et la technique de l\u2019arrangement des caract\u00e8res d\u2019imprimerie pour ' +
      'rendre le langage \u00e9crit lisible, lisible et attrayant. L\u2019arrangement des caract\u00e8res ' +
      'comprend le choix des polices, des tailles de points, des longueurs de lignes et des espacements.',
  },
  nl: {
    label: 'Nederlands',
    direction: 'ltr',
    fontId: 'liberation-serif',
    hyphenatorLocale: 'nl',
    sampleText:
      'Typografie is de kunst en techniek van het rangschikken van tekens om geschreven taal ' +
      'leesbaar, goed leesbaar en aantrekkelijk te maken. De rangschikking van tekens omvat de ' +
      'selectie van lettertypen, puntgroottes, regellengte en spatiëring.',
  },
  ar: {
    label: 'ar — العربية (Arabic)',
    direction: 'rtl',
    fontId: 'noto-arabic',
    hyphenatorLocale: 'ar',
    sampleText:
      'الطباعة هي فن وتقنية ترتيب حروف الطباعة لجعل اللغة المكتوبة مقروءة وجذابة. ' +
      'يتضمن ترتيب الأحرف اختيار الخطوط وأحجام النقاط وأطوال الأسطر والمسافات بين الأسطر.',
  },
  tr: {
    label: 'Türkçe',
    direction: 'ltr',
    fontId: 'liberation-serif',
    hyphenatorLocale: 'tr',
    sampleText:
      'Tipografi, yazılı dilin okunabilir, akıcı ve çekici görünmesi için tip düzenleme sanatı ' +
      've tekniğidir. Tip düzenlemesi, yazı tipi seçimi, punto boyutları, satır uzunlukları ' +
      've satır aralıklarını kapsar.',
  },
};

// ─── Pure helpers (exported for unit tests) ──────────────────────────────────────

/**
 * Determine the rendered text direction.
 * 'auto' defers to the locale's natural direction.
 * 'force-ltr' / 'force-rtl' overrides unconditionally.
 */
export function forcedDirection(
  override: DirectionOverride,
  localeDefault: LocaleDirection,
): LocaleDirection {
  if (override === 'force-ltr') return 'ltr';
  if (override === 'force-rtl') return 'rtl';
  return localeDefault;
}

/** Return a human-readable label for a locale id. */
export function buildLocaleLabel(localeId: string): string {
  return LOCALE_MAP[localeId]?.label ?? localeId;
}

/** Return all locale ids in declaration order. */
export function extractLocaleIds(): string[] {
  return Object.keys(LOCALE_MAP);
}

// ─── Page implementation ─────────────────────────────────────────────────────────

export const i18nPage: Page = (() => {
  let host: HTMLElement | null = null;

  let currentLocaleId = 'en-us';
  let currentOverride: DirectionOverride = 'auto';
  let showHyphenPoints = false;

  let svgContainer: HTMLElement | null = null;
  let statusEl: HTMLElement | null = null;

  async function doRender(_ctx: BootContext) {
    const locale = LOCALE_MAP[currentLocaleId];
    if (!locale || !svgContainer) return;

    const direction = forcedDirection(currentOverride, locale.direction);

    if (statusEl)
      statusEl.textContent =
        `${buildLocaleLabel(currentLocaleId)} · ${direction.toUpperCase()}` +
        (showHyphenPoints ? ' · hyphenation on' : '');

    // Render as an HTML block rather than SVG — fills container, wraps naturally
    const previewDiv = document.createElement('div');
    previewDiv.className = 'i18n-preview';
    previewDiv.dir = direction;
    previewDiv.lang = currentLocaleId;

    let displayText = locale.sampleText;
    if (showHyphenPoints) {
      try {
        await loadHyphenator(locale.hyphenatorLocale as Language);
        const words = hyphenateParagraph(locale.sampleText, {
          language: locale.hyphenatorLocale as Language,
          minWordLength: 1,
          fontSize: 14,
          minLeft: 1,
          minRight: 1,
          processCapitalized: true,
          preserveSoftHyphens: true,
        });
        // Join fragments with visible middle-dot markers
        displayText = words.map((w) => w.fragments.join('\u00b7')).join(' ');
      } catch {
        // Hyphenator not available for this locale (e.g. Arabic); show plain text
      }
    }

    previewDiv.textContent = displayText;
    svgContainer.innerHTML = '';
    svgContainer.appendChild(previewDiv);
  }

  return {
    mount(el: HTMLElement, ctx: BootContext) {
      host = el;
      el.className = ''; // clear any class left by a previous page

      const root = document.createElement('div');
      root.className = 'i18n-page';

      // ── Controls ─────────────────────────────────────────────────────────
      const controls = document.createElement('div');
      controls.className = 'controls';

      // Language dropdown
      const langRow = document.createElement('div');
      langRow.className = 'control-row';
      const langLbl = document.createElement('span');
      langLbl.textContent = 'Language';
      const langSelect = document.createElement('select');
      for (const id of extractLocaleIds()) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = buildLocaleLabel(id);
        if (id === currentLocaleId) opt.selected = true;
        langSelect.appendChild(opt);
      }
      langSelect.addEventListener('change', () => {
        currentLocaleId = langSelect.value;
        void doRender(ctx);
      });
      langRow.appendChild(langLbl);
      langRow.appendChild(langSelect);
      controls.appendChild(langRow);

      // Direction override
      const dirRow = document.createElement('div');
      dirRow.className = 'control-row';
      const dirLbl = document.createElement('span');
      dirLbl.textContent = 'Direction';
      const dirBtns = document.createElement('div');
      dirBtns.className = 'toggle-group';
      const dirOptions: { label: string; value: DirectionOverride }[] = [
        { label: 'Auto', value: 'auto' },
        { label: 'Force LTR', value: 'force-ltr' },
        { label: 'Force RTL', value: 'force-rtl' },
      ];
      for (const opt of dirOptions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opt.label;
        btn.dataset['value'] = opt.value;
        btn.setAttribute('aria-pressed', String(opt.value === currentOverride));
        btn.addEventListener('click', () => {
          currentOverride = opt.value;
          dirBtns.querySelectorAll('button').forEach((b) => {
            b.setAttribute(
              'aria-pressed',
              String(b.dataset['value'] === opt.value),
            );
          });
          void doRender(ctx);
        });
        dirBtns.appendChild(btn);
      }
      dirRow.appendChild(dirLbl);
      dirRow.appendChild(dirBtns);
      controls.appendChild(dirRow);

      // Hyphenation points toggle
      const hyphenRow = document.createElement('div');
      hyphenRow.className = 'control-row';
      const hyphenLbl = document.createElement('span');
      hyphenLbl.textContent = 'Show hyphenation points';
      const hyphenBtn = document.createElement('button');
      hyphenBtn.type = 'button';
      hyphenBtn.className = 'toggle-btn';
      hyphenBtn.textContent = showHyphenPoints ? 'On' : 'Off';
      hyphenBtn.setAttribute('aria-pressed', String(showHyphenPoints));
      hyphenBtn.addEventListener('click', () => {
        showHyphenPoints = !showHyphenPoints;
        hyphenBtn.textContent = showHyphenPoints ? 'On' : 'Off';
        hyphenBtn.setAttribute('aria-pressed', String(showHyphenPoints));
        void doRender(ctx);
      });
      hyphenRow.appendChild(hyphenLbl);
      hyphenRow.appendChild(hyphenBtn);
      controls.appendChild(hyphenRow);

      // ── Preview ──────────────────────────────────────────────────────────
      const preview = document.createElement('div');
      preview.className = 'preview-panel';

      svgContainer = document.createElement('div');
      svgContainer.className = 'svg-container';
      preview.appendChild(svgContainer);

      statusEl = document.createElement('div');
      statusEl.className = 'status-bar';
      preview.appendChild(statusEl);

      root.appendChild(controls);
      root.appendChild(preview);
      host.appendChild(root);

      void doRender(ctx);
    },

    unmount() {
      if (host) {
        host.innerHTML = '';
        host = null;
        svgContainer = null;
        statusEl = null;
      }
    },
  };
})();
