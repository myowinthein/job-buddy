import type { Page } from '@playwright/test';

/** True when the page has no horizontal scroll at its current viewport. */
export const fitsViewportWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
