import { expect, type Page } from '@playwright/test';

/** True when the page has no horizontal scroll at its current viewport. */
export const fitsViewportWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

const COLLAPSED_SIDEBAR_WIDTH = 64;

/** Waits for the options sidebar to collapse to its icon rail at a narrow viewport. */
export const expectCollapsedSidebar = (page: Page) =>
  expect
    .poll(() => page.locator('aside').evaluate((el) => el.getBoundingClientRect().width))
    .toBe(COLLAPSED_SIDEBAR_WIDTH);
