// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DevToolsPage from './DevToolsPage';
import { createPreviewChrome } from '@/src/preview/chrome';
import { ToastProvider } from '@/src/components/ui/Toast';
import { clearDevEvents } from './diagnostics';

beforeEach(() => {
  vi.stubGlobal('__JB_DEV_CONTEXT__', undefined);
  vi.stubGlobal('chrome', {
    ...createPreviewChrome({ id: 'profile', personal: { firstName: 'Jane' } } as never),
    runtime: { id: 'extension-id', getManifest: () => ({ version: '1.0' }) },
  });
  clearDevEvents();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function openTools() {
  const focus = vi.fn();
  render(
    <ToastProvider>
      <DevToolsPage onFocusField={focus} />
    </ToastProvider>,
  );
  return focus;
}

it('inspects live data and launches presets in a separate tab', async () => {
  const focus = openTools();
  expect(await screen.findByText(/"firstName": "Jane"/)).toBeTruthy();
  expect(screen.getByText(/Live inspection/)).toBeTruthy();
  const scenario = screen.getByLabelText('Scenario');
  fireEvent.change(scenario, { target: { value: 'profile-minimum' } });
  const run = screen.getByRole('link', { name: 'Run Scenario' });
  expect(run.getAttribute('href')).toContain('devScenario=profile-minimum');
  expect(run.getAttribute('target')).toBe('_blank');
  fireEvent.click(screen.getByRole('button', { name: 'Personal: Email' }));
  expect(focus).toHaveBeenCalledWith('personal', 'Email');
});

it('provides the five development sections and distinct scenario choices', () => {
  openTools();
  fireEvent.click(screen.getByRole('button', { name: 'Resume Import' }));
  expect(screen.getByRole('option', { name: 'Malformed AI response' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'AI Features' }));
  expect(screen.getByRole('option', { name: 'Timeout and fallback' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cloud Backup' }));
  expect(screen.getByRole('option', { name: 'Backup failure and retry' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
  expect(screen.getByRole('button', { name: 'Download Log' })).toBeTruthy();
});
