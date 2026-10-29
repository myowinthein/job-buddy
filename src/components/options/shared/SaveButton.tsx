import { useContext } from 'react';
import { SectionSaveStatusContext } from './draftStatus';
import { deferPointerFocus, focusOnClick } from './stableControlFocus';

interface Props {
  onClick: () => void;
  saving: boolean;
  label: string;
}

export function SaveButton({ onClick, saving, label }: Props) {
  const status = useContext(SectionSaveStatusContext);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onMouseDown={deferPointerFocus}
        onClick={(event) => {
          focusOnClick(event);
          const section =
            event.currentTarget.closest('[data-profile-section]') ??
            event.currentTarget.parentElement?.parentElement?.parentElement;
          onClick();
          // Validation and collapsed-card expansion must commit before focusing.
          window.setTimeout(() => {
            const group = section?.querySelector('[data-field-error="true"]');
            const details = group?.closest('details');
            if (details) details.open = true;
            const invalid =
              group?.querySelector<HTMLElement>(
                'input:not(:disabled):not([type="file"]), select:not(:disabled), textarea:not(:disabled)',
              ) ?? group?.querySelector<HTMLElement>('button:not(:disabled)');
            invalid?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
            invalid?.focus({ preventScroll: true });
          }, 0);
        }}
        disabled={saving}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
      >
        {saving ? 'Saving...' : label}
      </button>
      <span
        role="status"
        aria-atomic="true"
        className={`min-h-5 w-28 text-xs ${status === 'saved' ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}
      >
        {saving ? '' : status === 'unsaved' ? 'Unsaved changes' : status === 'saved' ? 'Saved' : ''}
      </span>
    </div>
  );
}
