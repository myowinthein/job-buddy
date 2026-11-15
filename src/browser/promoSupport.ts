import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/** Visible pointer and paced real browser input, installed only in the recording context. */
export async function recordingPointer(page: Page) {
  await page.evaluate(() => {
    if (document.querySelector('[data-promo-pointer]')) return;
    const pointer = document.createElement('div');
    pointer.dataset.promoPointer = '';
    pointer.setAttribute('aria-hidden', 'true');
    pointer.style.cssText =
      'position:fixed;left:640px;top:360px;pointer-events:none;z-index:2147483647;width:23px;height:30px';
    pointer.innerHTML =
      '<svg viewBox="0 0 25 32"><path d="M2 1v24l6-6 5 11 5-2-5-10h9Z" fill="white" stroke="#111827" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.append(pointer);
    document.addEventListener('pointermove', (event) => {
      pointer.style.left = `${event.clientX}px`;
      pointer.style.top = `${event.clientY}px`;
    });
  });
}

export class PresentationInput {
  private position = { x: 640, y: 360 };
  constructor(readonly page: Page) {}
  async point(target: Locator) {
    await expect(target).toBeVisible();
    await target.evaluate((element) =>
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }),
    );
    await this.page.waitForTimeout(450);
    const box = await target.boundingBox();
    if (!box) throw new Error('Presentation control is outside the page.');
    const next = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      const eased = t * t * (3 - 2 * t);
      await this.page.mouse.move(
        this.position.x + (next.x - this.position.x) * eased,
        this.position.y + (next.y - this.position.y) * eased,
      );
      await this.page.waitForTimeout(22);
    }
    this.position = next;
  }
  async click(target: Locator) {
    await this.point(target);
    await target.click();
    await this.page.waitForTimeout(280);
  }
  async type(target: Locator, text: string) {
    await this.click(target);
    await target.fill('');
    await target.pressSequentially(text, { delay: 55 });
    await this.page.waitForTimeout(250);
  }
}

/** Capture Chrome's live rendered frames throughout an interaction, retaining real timing. */
export async function recordScene(
  page: Page,
  info: TestInfo,
  scene: { id: string; audioDuration: number },
  action: () => Promise<void>,
) {
  await page.bringToFront();
  await recordingPointer(page);
  await mkdir(info.outputPath(), { recursive: true });
  const session = await page.context().newCDPSession(page);
  const frames: { file: string; time: number }[] = [];
  const writes: Promise<void>[] = [];
  let failure: unknown;
  const started = performance.now();
  const save = (buffer: Buffer, time: number) => {
    const file = `scene-${scene.id}-${String(frames.length).padStart(5, '0')}.jpg`;
    frames.push({ file, time });
    writes.push(
      writeFile(info.outputPath(file), buffer).catch((error) => {
        failure = error;
      }),
    );
  };
  save(await page.screenshot({ type: 'jpeg', quality: 92 }), 0);
  session.on('Page.screencastFrame', (event) => {
    save(Buffer.from(event.data, 'base64'), (performance.now() - started) / 1000);
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  try {
    await session.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 1,
    });
    await action();
    const elapsed = (performance.now() - started) / 1000;
    // Narration starts 300 ms into the scene, followed by at least 800 ms of reading time.
    await page.waitForTimeout(Math.max(800, (scene.audioDuration + 1.1 - elapsed) * 1000));
    await session.send('Page.stopScreencast');
    const duration = (performance.now() - started) / 1000;
    await Promise.all(writes);
    if (failure) throw failure;
    return { id: scene.id, duration, frames };
  } finally {
    await session.send('Page.stopScreencast').catch(() => {});
    await session.detach();
    await Promise.all(writes);
  }
}
