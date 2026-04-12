// demo/src/router.ts
// Hash-based single-page router. Maps #/<key> → Page lifecycle (mount/unmount).

export type PageKey = 'layout' | 'linebreak' | 'typography' | 'i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface BootContext {
  engine: unknown;
  loadFont: (id: string) => Promise<void>;
}

export interface Page {
  mount(container: HTMLElement, ctx: BootContext): void;
  unmount(): void;
}

const VALID_KEYS = new Set<PageKey>([
  'layout',
  'linebreak',
  'typography',
  'i18n',
]);
const DEFAULT_KEY: PageKey = 'linebreak';

function parseHash(hash: string): PageKey {
  const key = hash.replace(/^#\//, '');
  return VALID_KEYS.has(key as PageKey) ? (key as PageKey) : DEFAULT_KEY;
}

export function createRouter(
  pages: Record<PageKey, Page>,
  container: HTMLElement,
  ctx: BootContext,
): {
  navigateTo(key: PageKey): void;
  start(): void;
  currentPage(): PageKey;
} {
  let current: PageKey | null = null;

  function activate(key: PageKey): void {
    if (key === current) return;
    if (current !== null) pages[current].unmount();
    current = key;
    window.location.hash = `#/${key}`;
    pages[key].mount(container, ctx);

    // Update aria-selected on nav tabs (if present in DOM)
    document.querySelectorAll('[role="tab"][data-page]').forEach((btn) => {
      const el = btn as HTMLElement;
      el.setAttribute(
        'aria-selected',
        el.dataset['page'] === key ? 'true' : 'false',
      );
    });
  }

  function navigateTo(key: PageKey): void {
    const safeKey = VALID_KEYS.has(key) ? key : DEFAULT_KEY;
    activate(safeKey);
  }

  function start(): void {
    window.addEventListener('hashchange', () => {
      const key = parseHash(window.location.hash);
      if (key !== current) activate(key);
    });

    // Boot on current hash (or default)
    const initial = parseHash(window.location.hash);
    activate(initial);
  }

  function currentPage(): PageKey {
    return current ?? DEFAULT_KEY;
  }

  return { navigateTo, start, currentPage };
}
