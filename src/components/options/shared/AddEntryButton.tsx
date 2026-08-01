interface Props {
  onClick: () => void;
  label: string;
  variant?: 'dashed' | 'pill';
}

const VARIANT_CLS = {
  dashed: 'w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 active:scale-95 transition-colors mb-4',
  pill: 'text-xs px-3 py-1.5 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95 transition-colors',
};

export function AddEntryButton({ onClick, label, variant = 'dashed' }: Props) {
  return (
    <button type="button" onClick={onClick} className={VARIANT_CLS[variant]}>
      {label}
    </button>
  );
}
