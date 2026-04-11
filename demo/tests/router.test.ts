import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRouter } from '../src/router.js';
import type { Page, PageKey, BootContext } from '../src/router.js';

function makeCtx(): BootContext {
  return {} as BootContext;
}

function makePage(): Page {
  return { mount: vi.fn(), unmount: vi.fn() };
}

describe('router', () => {
  let container: HTMLElement;
  let pages: Record<PageKey, Page>;
  let ctx: BootContext;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    pages = {
      layout: makePage(),
      linebreak: makePage(),
      typography: makePage(),
      i18n: makePage(),
    };
    ctx = makeCtx();
    // reset hash
    window.location.hash = '';
  });

  it('navigateTo("layout") sets location.hash to "#/layout"', () => {
    const router = createRouter(pages, container, ctx);
    router.navigateTo('layout');
    expect(window.location.hash).toBe('#/layout');
  });

  it('navigateTo unknown route defaults to "#/linebreak"', () => {
    const router = createRouter(pages, container, ctx);
    // @ts-expect-error — passing invalid key intentionally
    router.navigateTo('nonexistent');
    expect(window.location.hash).toBe('#/linebreak');
  });

  it("mount() calls the page's mount function with the container element", () => {
    const router = createRouter(pages, container, ctx);
    router.navigateTo('layout');
    expect(pages.layout.mount).toHaveBeenCalledWith(container, ctx);
  });

  it('navigating away calls unmount() on the previous page', () => {
    const router = createRouter(pages, container, ctx);
    router.navigateTo('layout');
    router.navigateTo('linebreak');
    expect(pages.layout.unmount).toHaveBeenCalledOnce();
  });

  it('hashchange event triggers mount of new page', () => {
    const router = createRouter(pages, container, ctx);
    router.start();
    window.location.hash = '#/typography';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(pages.typography.mount).toHaveBeenCalled();
  });

  it('currentPage() returns the active route key', () => {
    const router = createRouter(pages, container, ctx);
    router.navigateTo('i18n');
    expect(router.currentPage()).toBe('i18n');
  });
});
