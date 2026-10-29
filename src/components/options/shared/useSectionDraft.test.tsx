// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { DraftStatusContext } from './draftStatus';
import { useSectionDraft } from './useSectionDraft';
import type { ReactNode } from 'react';

afterEach(cleanup);

it('keeps edits made during a slow save marked as unsaved', async () => {
  const report = vi.fn();
  let finish!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DraftStatusContext.Provider value={report}>{children}</DraftStatusContext.Provider>
  );
  const { result, rerender } = renderHook(({ text }) => useSectionDraft(text, save), {
    initialProps: { text: 'Original' },
    wrapper,
  });
  rerender({ text: 'Submitted' });
  expect(report).toHaveBeenLastCalledWith(expect.any(String), true);
  let pending!: Promise<void>;
  act(() => {
    pending = result.current({});
  });
  rerender({ text: 'Further edit' });
  await act(async () => {
    finish();
    await pending;
  });
  expect(report).toHaveBeenLastCalledWith(expect.any(String), true);
  rerender({ text: 'Submitted' });
  expect(report).toHaveBeenLastCalledWith(expect.any(String), false);
});

it('does not acknowledge drafts when saving fails', async () => {
  const report = vi.fn();
  const save = vi.fn().mockRejectedValue(new Error('storage full'));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DraftStatusContext.Provider value={report}>{children}</DraftStatusContext.Provider>
  );
  const { result, rerender } = renderHook(({ text }) => useSectionDraft(text, save), {
    initialProps: { text: 'Original' },
    wrapper,
  });
  rerender({ text: 'Edited' });
  await expect(result.current({})).rejects.toThrow('storage full');
  expect(report).toHaveBeenLastCalledWith(expect.any(String), true);
});
