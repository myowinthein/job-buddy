import { describe, it, expect, vi } from 'vitest';
import { saveSection } from './saveSection';
import type { Profile } from '@/src/types/profile';

const patch: Partial<Profile> = { personal: { firstName: 'Test' } } as Partial<Profile>;

describe('saveSection', () => {
  it('calls save with the provided patch', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    await saveSection(save, patch, showToast, 'Saved!');
    expect(save).toHaveBeenCalledWith(patch);
  });

  it('shows success toast when save resolves', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    await saveSection(save, patch, showToast, 'Profile saved.');
    expect(showToast).toHaveBeenCalledWith('success', 'Profile saved.');
  });

  it('shows error toast when save rejects', async () => {
    const save = vi.fn().mockRejectedValue(new Error('quota exceeded'));
    const showToast = vi.fn();
    await saveSection(save, patch, showToast, 'Saved!');
    expect(showToast).toHaveBeenCalledWith('error', 'Failed to save. Please try again.');
  });

  it('resolves without a value on success', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    await expect(saveSection(save, patch, showToast, 'Done')).resolves.toBeUndefined();
  });

  it('resolves without a value on failure (error is surfaced via toast, not rejection)', async () => {
    const save = vi.fn().mockRejectedValue(new Error('fail'));
    const showToast = vi.fn();
    await expect(saveSection(save, patch, showToast, 'Done')).resolves.toBeUndefined();
  });
});
