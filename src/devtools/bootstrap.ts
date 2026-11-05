import { DevSimulation } from './simulation';
import { scenarioById, sampleResumeText, type Scenario } from './scenarios';
import { installDevDiagnostics } from './diagnostics';
import {
  cleanupPreviewSeeds,
  loadPreviewSeed,
  PROFILE_PRESETS,
  readQuickPreview,
} from './quickPreview';

let simulation: DevSimulation | undefined;
export const getSimulation = () => simulation;

export function initializeDevTools() {
  if (!import.meta.env.DEV) return;
  let stopBackground = () => {};
  const params = new URLSearchParams(location.search);
  const requested = params.get('devScenario');
  const quick = readQuickPreview();
  if (quick && requested) throw new Error('Choose one development preview');
  const scenario = quick
    ? scenarioById(
        PROFILE_PRESETS.find((item) => item.id === quick.preset)?.scenario ?? 'workspace',
      )
    : scenarioById(requested);
  if (requested && !scenario) throw new Error('Unknown development scenario. Return to Dev Tools.');
  if (scenario) {
    const extensionId = chrome.runtime.id ?? 'localhost-preview';
    const version = chrome.runtime.getManifest?.().version ?? 'preview';
    const seed = quick ? loadPreviewSeed(quick) : undefined;
    const instance = new DevSimulation(scenario, extensionId, version, {
      ...seed,
      noKey: quick?.missingKey,
    });
    // A fresh document gets an isolated Chrome surface before app modules load.
    // Never swap storage beneath an already-running live App.
    Object.defineProperty(window, 'chrome', { configurable: true, value: instance.chrome });
    globalThis.__JB_DEV_CONTEXT__ = {
      scenario: scenario.id,
      id: crypto.randomUUID(),
      extensionId,
      version,
      ...(quick ? { quickPreview: quick.preset } : {}),
    };
    simulation = instance;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? String(input) : input.url,
        location.href,
      );
      // Local assets still work; every provider request is answered in memory.
      if (url.origin === location.origin) return originalFetch(input, init);
      return instance.fetch(input, init);
    };
    if (!quick) sessionStorage.setItem('jb:ui:section', scenario.page);
    instance.onAlarm = async (name) => {
      const drive = await import('@/src/utils/driveSync');
      if (name === drive.DRIVE_RETRY_ALARM) await drive.retryPendingDriveSync();
      if (name === drive.DRIVE_AUTH_ALARM) await drive.refreshDriveConnection();
    };
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (
        area !== 'local' ||
        (changes.profile?.newValue == null && changes.learnedMappings?.newValue == null)
      )
        return;
      clearTimeout(syncTimer);
      void import('@/src/utils/driveSync').then((drive) => drive.markDriveBackupPending());
      syncTimer = setTimeout(() => {
        void import('@/src/utils/driveSync').then((drive) => drive.syncIfConnected());
      }, 5_000);
    };
    instance.chrome.storage.onChanged.addListener(changed);
    stopBackground = () => {
      clearTimeout(syncTimer);
      instance.chrome.storage.onChanged.removeListener(changed);
      instance.dispose();
    };
  }
  cleanupPreviewSeeds(quick?.seedId ?? null);
  const stopDiagnostics = installDevDiagnostics();
  const stop = () => {
    stopBackground();
    stopDiagnostics();
    window.removeEventListener('pagehide', stop);
  };
  window.addEventListener('pagehide', stop, { once: true });
  return stop;
}

export function startScenario(root: HTMLElement) {
  const context = globalThis.__JB_DEV_CONTEXT__;
  const scenario = scenarioById(context?.scenario ?? null);
  if (!scenario?.action) return;
  const observer = new MutationObserver(() => advance(scenario));
  let selectedFile = false;
  let complete = false;
  const stop = () => {
    complete = true;
    observer.disconnect();
  };
  const click = (names: string[]) => {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => names.includes(button.textContent?.trim() ?? '') && !button.disabled,
    );
    if (button) {
      stop();
      button.click();
    }
  };
  function advance(current: Scenario) {
    if (complete) return;
    if (current.action === 'resume') {
      const input = root.querySelector<HTMLInputElement>('input[type="file"]');
      if (!selectedFile && input) {
        selectedFile = true;
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([sampleResumeText()], 'sample-resume.pdf', { type: 'application/pdf' }),
        );
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (selectedFile) click(['Analyze Resume']);
    } else if (current.action === 'check-key') click(['Check again', 'Check Key']);
    else if (current.action === 'connect-drive') click(['Connect Google Drive']);
    else if (current.action === 'back-up') click(['Back Up Now']);
  }
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  advance(scenario);
  window.addEventListener('pagehide', stop, { once: true });
}
