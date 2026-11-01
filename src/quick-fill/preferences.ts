import { wrapStorageArea } from '@/src/utils/storageArea';

export const QUICK_FILL_KEY = 'quickFillPreferences';
export interface QuickFillPreferences {
  enabled: boolean;
  disabledSites: string[];
  position?: { x: number; y: number };
}
const local = wrapStorageArea(() => chrome.storage.local, 'quick fill', { rejectOnSetError: true });
export function normalizePreferences(value: unknown): QuickFillPreferences {
  const source = (value && typeof value === 'object' ? value : {}) as Partial<QuickFillPreferences>;
  const position = source.position;
  return {
    enabled: source.enabled !== false,
    disabledSites: Array.isArray(source.disabledSites)
      ? [
          ...new Set(
            source.disabledSites.filter((site): site is string => typeof site === 'string'),
          ),
        ]
      : [],
    ...(position && Number.isFinite(position.x) && Number.isFinite(position.y)
      ? {
          position: {
            x: Math.max(0, Math.min(1, position.x)),
            y: Math.max(0, Math.min(1, position.y)),
          },
        }
      : {}),
  };
}
export async function getQuickFillPreferences(): Promise<QuickFillPreferences> {
  return normalizePreferences(
    (await local.get(QUICK_FILL_KEY, { rejectOnError: true }))[QUICK_FILL_KEY],
  );
}
/** Merge under a cross-context lock so moving the button cannot undo a Settings change. */
export async function updateQuickFillPreferences(
  change:
    | Partial<QuickFillPreferences>
    | ((current: QuickFillPreferences) => Partial<QuickFillPreferences>),
): Promise<void> {
  const save = async () => {
    const current = await getQuickFillPreferences();
    await local.set({
      [QUICK_FILL_KEY]: normalizePreferences({
        ...current,
        ...(typeof change === 'function' ? change(current) : change),
      }),
    });
  };
  if (navigator.locks?.request) await navigator.locks.request('jb:quick-fill-preferences', save);
  else await save();
}
