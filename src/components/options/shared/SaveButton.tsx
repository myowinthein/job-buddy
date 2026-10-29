interface Props {
  onClick: () => void;
  saving: boolean;
  label: string;
}

export function SaveButton({ onClick, saving, label }: Props) {
  return (
    <button
      type="button"
      onClick={(event) => {
        const section =
          event.currentTarget.closest('[data-profile-section]') ??
          event.currentTarget.parentElement?.parentElement;
        onClick();
        // Validation and collapsed-card expansion must commit before focusing.
        window.setTimeout(() => {
          const group = section?.querySelector('[data-field-error="true"]');
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
  );
}
