import { test, expect, chromium, type Worker, type Page } from '@playwright/test';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { DEV_PROFILE } from '../utils/devProfile';
import { openPinnedPopup, stubEmptyGemini } from './fixtures';
import { publicURL, serveDemo } from './demoSupport';

let directory: string;
let paths: string[];
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'jb-coexistence-'));
  paths = await Promise.all(
    ['live', 'dev'].map(async (name) => {
      const path = join(directory, name);
      await cp(resolve('.output/chrome-mv3'), path, { recursive: true });
      const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
      manifest.name = `Job Buddy coexistence ${name}`;
      manifest.key = generateKeyPairSync('rsa', { modulusLength: 2048 })
        .publicKey.export({ type: 'spki', format: 'der' })
        .toString('base64');
      await writeFile(join(path, 'manifest.json'), JSON.stringify(manifest));
      return path;
    }),
  );
});
test.afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function pauseScan(worker: Worker) {
  await worker.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      releaseScan?: () => void;
      scanCount?: number;
    };
    state.scanCount = 0;
    const pause = new Promise<void>((resolve) => {
      state.releaseScan = resolve;
    });
    const send = chrome.tabs.sendMessage.bind(chrome.tabs);
    chrome.tabs.sendMessage = (async (
      tabId: number,
      message: { action?: string },
      options: chrome.tabs.MessageSendOptions,
    ) => {
      const reply = await send(tabId, message, options);
      if (message.action === 'AUTOFILL_SCAN') {
        state.scanCount = (state.scanCount ?? 0) + 1;
        await pause;
      }
      return reply;
    }) as typeof chrome.tabs.sendMessage;
  });
}
async function releaseScan(worker: Worker) {
  await worker.evaluate(() =>
    (globalThis as typeof globalThis & { releaseScan?: () => void }).releaseScan?.(),
  );
}
/** Hold a real reply after the content work, without changing profile or result data. */
async function pauseReply(worker: Worker, action: string) {
  await worker.evaluate((action) => {
    const state = globalThis as typeof globalThis & {
      releaseReply?: () => void;
      heldReplies?: number;
    };
    state.heldReplies = 0;
    const pause = new Promise<void>((resolve) => {
      state.releaseReply = resolve;
    });
    const send = chrome.tabs.sendMessage.bind(chrome.tabs);
    chrome.tabs.sendMessage = (async (...args: Parameters<typeof send>) => {
      const reply = await send(...args);
      if ((args[1] as { action?: string })?.action === action) {
        state.heldReplies = (state.heldReplies ?? 0) + 1;
        await pause;
      }
      return reply;
    }) as typeof chrome.tabs.sendMessage;
  }, action);
}
async function releaseReply(worker: Worker) {
  await worker.evaluate(() =>
    (globalThis as typeof globalThis & { releaseReply?: () => void }).releaseReply?.(),
  );
}
async function start(popup: Page, tabId: number) {
  return popup.evaluate(
    (id) => chrome.runtime.sendMessage({ action: 'AUTOFILL_RUN_START', tabId: id }),
    tabId,
  );
}
async function launch(embedded = false) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${paths.join(',')}`, `--load-extension=${paths.join(',')}`],
  });
  await context.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await stubEmptyGemini(context);
  const form =
    '<h1>Job application</h1><form><label>First Name<input name="firstName"></label><label>Email<input name="email" type="email"></label><label>Resume<input name="resume" type="file"></label></form>';
  await context.route(/^http:\/\/127\.0\.0\.1(?::\d+)?\//, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        embedded && !route.request().url().includes('/frame')
          ? '<iframe src="http://127.0.0.1:9981/frame"></iframe>'
          : form,
    }),
  );
  await expect.poll(() => context.serviceWorkers().length).toBe(2);
  const workers = await Promise.all(
    context.serviceWorkers().map(async (worker) => ({
      worker,
      name: await worker.evaluate(() => chrome.runtime.getManifest().name),
    })),
  );
  const live = workers.find((item) => item.name.endsWith('live'))!.worker;
  const dev = workers.find((item) => item.name.endsWith('dev'))!.worker;
  for (const [worker, firstName] of [
    [live, 'Live'],
    [dev, 'Dev'],
  ] as const) {
    await worker.evaluate(
      ({ profile, firstName }) =>
        chrome.storage.local.set({
          profile: { ...profile, personal: { ...profile.personal, firstName } },
          geminiApiKey: 'synthetic-key',
          geminiModel: 'gemini-3.8-flash',
          learnedMappings: {},
        }),
      { profile: DEV_PROFILE, firstName },
    );
  }
  const page = await context.newPage();
  await page.goto('http://127.0.0.1/application');
  const tabId = await live.evaluate(
    async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id!,
  );
  const livePopup = await openPinnedPopup(context, live.url(), tabId);
  const devPopup = await openPinnedPopup(context, dev.url(), tabId);
  await expect(devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeEnabled();
  return { context, page, live, dev, livePopup, devPopup, tabId };
}

test('blocks the competing popup and widget, protects Undo and resumes after completion', async () => {
  test.setTimeout(60_000);
  const h = await launch();
  try {
    await pauseScan(h.live);
    await h.livePopup.getByRole('button', { name: 'Fill Form', exact: true }).click();
    await expect
      .poll(() =>
        h.live.evaluate(() => (globalThis as typeof globalThis & { scanCount?: number }).scanCount),
      )
      .toBe(1);
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeDisabled();
    const devId = new URL(h.dev.url()).hostname;
    const widget = h.page.locator(`[data-job-buddy-owner="${devId}"]`);
    await expect(widget.locator('.fill')).toBeDisabled();
    expect((await start(h.devPopup, h.tabId)).error).toBe('other_version_busy');
    expect(
      await h.devPopup.evaluate(
        (id) => chrome.runtime.sendMessage({ action: 'AUTOFILL_RUN_UNDO', tabId: id }),
        h.tabId,
      ),
    ).toBe(false);
    await h.livePopup.close();
    await releaseScan(h.live);
    await expect(h.page.getByLabel('First Name')).toHaveValue('Live');
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeEnabled();
    await expect(widget.locator('.fill')).toBeEnabled();
    for (let i = 0; i < 4; i++) await widget.locator('.grip').press('Shift+ArrowUp');
    const reopened = await openPinnedPopup(h.context, h.live.url(), h.tabId);
    await expect(reopened.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await pauseScan(h.dev);
    await widget.locator('.fill').click();
    await expect(reopened.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await expect(reopened.getByRole('button', { name: 'Fill Form', exact: true })).toBeDisabled();
    await releaseScan(h.dev);
    await expect(h.page.getByLabel('First Name')).toHaveValue('Dev');
    await expect
      .poll(() => h.page.locator('html').getAttribute('data-job-buddy-activity'))
      .toBeNull();
  } finally {
    await h.context.close();
  }
});

test('blocks older floating controls on the demo and restores them after completion', async () => {
  const h = await launch();
  try {
    await serveDemo(h.context);
    await h.page.goto(publicURL);
    await h.page.evaluate(() => {
      // v2.0.0 has these controls but predates the shared activity protocol.
      const host = document.createElement('div');
      host.setAttribute('data-job-buddy-ui', '');
      host.style.cssText = 'position:fixed;top:12px;left:12px;z-index:2147483647';
      host.attachShadow({ mode: 'open' }).innerHTML =
        '<button class="fill">Fill Form</button><button class="undo">Undo</button><button class="details">View details</button>';
      document.documentElement.append(host);
    });
    const legacy = h.page.locator('[data-job-buddy-ui]:not([data-job-buddy-owner])');
    await pauseScan(h.dev);
    const pending = start(h.devPopup, h.tabId);
    void pending.catch(() => {});
    await expect(legacy.locator('.fill')).toBeDisabled();
    await expect(legacy.locator('.undo')).toBeDisabled();
    await expect(legacy.locator('.details')).toBeEnabled();
    await expect(h.livePopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeDisabled();
    await releaseScan(h.dev);
    expect((await pending).stage).toBe('completed');
    await expect(legacy.locator('.fill')).toBeEnabled();
    await expect(legacy.locator('.undo')).toBeEnabled();

    await legacy.evaluate((host) => {
      const fill = host.shadowRoot!.querySelector<HTMLButtonElement>('.fill')!;
      fill.disabled = true;
      fill.insertAdjacentHTML('afterbegin', '<span class="spin"></span>');
    });
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeDisabled();
    await legacy.evaluate((host) => {
      host.shadowRoot!.querySelector('.spin')!.remove();
      host.shadowRoot!.querySelector<HTMLButtonElement>('.fill')!.disabled = false;
    });
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeEnabled();
  } finally {
    await h.context.close();
  }
});

test('recovers from an abandoned lease without refreshing the form', async () => {
  const h = await launch();
  try {
    await h.page.evaluate(() =>
      document.documentElement.setAttribute(
        'data-job-buddy-activity',
        JSON.stringify({
          owner: 'closed-extension',
          token: 'abandoned',
          until: Date.now() + 1500,
        }),
      ),
    );
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeDisabled();
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeEnabled();
    expect((await start(h.devPopup, h.tabId)).stage).toBe('completed');
    await expect(h.page.getByLabel('First Name')).toHaveValue('Dev');
  } finally {
    await h.context.close();
  }
});

test('simultaneous starts choose one owner before scanning and cancellation frees the tab', async () => {
  const h = await launch();
  try {
    await pauseScan(h.live);
    await pauseScan(h.dev);
    const liveRun = start(h.livePopup, h.tabId);
    const devRun = start(h.devPopup, h.tabId);
    const loser = await Promise.race([liveRun, devRun]);
    expect(loser.error).toBe('other_version_busy');
    const marker = JSON.parse(
      (await h.page.locator('html').getAttribute('data-job-buddy-activity'))!,
    );
    const owner = new URL(h.live.url()).hostname === marker.owner ? h.livePopup : h.devPopup;
    await owner.evaluate(
      ({ tabId, runId }) =>
        chrome.runtime.sendMessage({ action: 'AUTOFILL_RUN_CANCEL', tabId, runId }),
      { tabId: h.tabId, runId: marker.token },
    );
    await expect
      .poll(() => h.page.locator('html').getAttribute('data-job-buddy-activity'))
      .toBeNull();
    await releaseScan(h.live);
    await releaseScan(h.dev);
    await Promise.all([liveRun, devRun]);
    await expect(h.livePopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeEnabled();
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeEnabled();
  } finally {
    await h.context.close();
  }
});

test('uses the top document guard for embedded forms and permits another tab', async () => {
  test.setTimeout(60_000);
  const h = await launch(true);
  try {
    await pauseScan(h.live);
    const pending = start(h.livePopup, h.tabId);
    void pending.catch(() => {});
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeDisabled();
    expect((await start(h.devPopup, h.tabId)).error).toBe('other_version_busy');
    const second = await h.context.newPage();
    await second.goto('http://127.0.0.1/second');
    const secondId = await h.dev.evaluate(
      async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id!,
    );
    const secondPopup = await openPinnedPopup(h.context, h.dev.url(), secondId);
    expect((await start(secondPopup, secondId)).stage).toBe('completed');
    await expect(second.frameLocator('iframe').getByLabel('First Name')).toHaveValue('Dev');
    await releaseScan(h.live);
    expect((await pending).stage).toBe('completed');
    await expect(h.page.frameLocator('iframe').getByLabel('First Name')).toHaveValue('Live');
  } finally {
    await h.context.close();
  }
});

test('nearly simultaneous popup clicks send only one scan', async () => {
  const h = await launch();
  try {
    await pauseScan(h.live);
    await pauseScan(h.dev);
    await h.page.bringToFront();
    await expect(h.page.locator('[data-job-buddy-owner]')).toHaveCount(2);
    // Dispatch trusted clicks through both real popup controls without waiting
    // for the competing run's result or for its disabled-state notification.
    await Promise.all([
      h.livePopup.getByRole('button', { name: 'Fill Form', exact: true }).click({ force: true }),
      h.devPopup.getByRole('button', { name: 'Fill Form', exact: true }).click({ force: true }),
    ]);
    const count = (worker: Worker) =>
      worker.evaluate(
        () => (globalThis as typeof globalThis & { scanCount?: number }).scanCount ?? 0,
      );
    await expect.poll(async () => (await count(h.live)) + (await count(h.dev))).toBe(1);
    // The winner displays its scanning status inside the primary button.
    await expect(h.livePopup.locator('button[aria-busy]')).toBeDisabled();
    await expect(h.devPopup.locator('button[aria-busy]')).toBeDisabled();
    for (const host of await h.page.locator('[data-job-buddy-owner]').all())
      await expect(host.locator('.fill')).toBeDisabled();
    const marker = JSON.parse(
      (await h.page.locator('html').getAttribute('data-job-buddy-activity'))!,
    );
    const expected = new URL(h.live.url()).hostname === marker.owner ? 'Live' : 'Dev';
    await releaseScan(h.live);
    await releaseScan(h.dev);
    await expect(h.page.getByLabel('First Name')).toHaveValue(expected);
    await expect(h.page.locator('html')).not.toHaveAttribute('data-job-buddy-activity');
    expect((await count(h.live)) + (await count(h.dev))).toBe(1);
  } finally {
    await h.context.close();
  }
});

for (const owner of ['live', 'dev'] as const) {
  test(`keeps prior results and disables peer Undo during ${owner} filling`, async () => {
    const h = await launch();
    try {
      const peer = owner === 'live' ? 'dev' : 'live';
      expect((await start(h[`${peer}Popup`], h.tabId)).stage).toBe('completed');
      await h[`${peer}Popup`].close();
      const peerPopup = await openPinnedPopup(h.context, h[peer].url(), h.tabId);
      const previous = await peerPopup.getByRole('region', { name: 'Fill results' }).textContent();
      const peerWidget = h.page.locator(
        `[data-job-buddy-owner="${new URL(h[peer].url()).hostname}"]`,
      );
      await h.page.bringToFront();
      await expect(peerWidget.locator('.undo')).toBeVisible();
      await pauseReply(h[owner], 'AUTOFILL_FILL');
      const ownerWidget = h.page.locator(
        `[data-job-buddy-owner="${new URL(h[owner].url()).hostname}"]`,
      );
      // These fixtures are two production builds; automatic dev-only placement
      // does not separate them. Move one through its real keyboard control.
      for (let count = 0; count < 4; count++)
        await ownerWidget.locator('.grip').press('Shift+ArrowUp');
      await ownerWidget.locator('.fill').click();
      await expect
        .poll(() =>
          h[owner].evaluate(
            () => (globalThis as typeof globalThis & { heldReplies?: number }).heldReplies,
          ),
        )
        .toBe(1);
      await expect(
        peerPopup.getByRole('button', { name: 'Fill Form', exact: true }),
      ).toBeDisabled();
      await expect(peerPopup.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
      await expect(peerWidget.locator('.fill')).toBeDisabled();
      await expect(peerWidget.locator('.undo')).toBeDisabled();
      expect(await peerPopup.getByRole('region', { name: 'Fill results' }).textContent()).toBe(
        previous,
      );
      expect(
        await peerPopup.evaluate(
          (tabId) =>
            chrome.runtime.sendMessage({
              action: 'AUTOFILL_RUN_UNDO',
              tabId,
            }),
          h.tabId,
        ),
      ).toBe(false);
      await expect(h.page.getByLabel('First Name')).toHaveValue(owner === 'live' ? 'Live' : 'Dev');
      await releaseReply(h[owner]);
      await expect(peerPopup.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
      await expect(peerWidget.locator('.fill')).toBeEnabled();
    } finally {
      await h.context.close();
    }
  });
}

test('holds the guard through actual Undo controls and releases after a failed scan', async () => {
  const h = await launch();
  try {
    expect((await start(h.livePopup, h.tabId)).stage).toBe('completed');
    await h.livePopup.close();
    const popup = await openPinnedPopup(h.context, h.live.url(), h.tabId);
    await pauseReply(h.live, 'CLEAR');
    await popup.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeDisabled();
    expect((await start(h.devPopup, h.tabId)).error).toBe('other_version_busy');
    await releaseReply(h.live);
    await expect(h.devPopup.getByRole('button', { name: 'Fill Form', exact: true })).toBeEnabled();
    await expect(h.page.getByLabel('First Name')).toHaveValue('');
    await h.live.evaluate(() => {
      const send = chrome.tabs.sendMessage.bind(chrome.tabs);
      chrome.tabs.sendMessage = (async (...args: Parameters<typeof send>) =>
        (args[1] as { action?: string })?.action === 'AUTOFILL_SCAN'
          ? { error: 'autofill_failed' }
          : send(...args)) as typeof chrome.tabs.sendMessage;
    });
    expect((await start(popup, h.tabId)).stage).toBe('error');
    await expect(h.page.locator('html')).not.toHaveAttribute('data-job-buddy-activity');
    expect((await start(h.devPopup, h.tabId)).stage).toBe('completed');
    await expect(h.page.getByLabel('First Name')).toHaveValue('Dev');
  } finally {
    await h.context.close();
  }
});
