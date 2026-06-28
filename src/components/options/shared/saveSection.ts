import type { Profile } from '@/src/types/profile';
import type { ToastMessage } from '@/src/components/ui/Toast';

// Shared error copy across every section's save flow — keep one source of truth.
const SAVE_FAILED_MESSAGE = 'Failed to save. Please try again.';

type ToastFn = (type: ToastMessage['type'], message: string, duration?: number) => void;
type SaveFn  = (patch: Partial<Profile>) => Promise<void>;

/**
 * Wraps a section's `onSave` call with the success/error toast pattern that
 * was duplicated across all 9 section components. Returns a promise that
 * resolves once the toast has been shown so callers can chain or await.
 */
export function saveSection(
  save: SaveFn,
  patch: Partial<Profile>,
  showToast: ToastFn,
  successMessage: string,
): Promise<void> {
  return save(patch).then(
    () => showToast('success', successMessage),
    () => showToast('error', SAVE_FAILED_MESSAGE),
  );
}
