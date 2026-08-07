interface Props {
  onClick: () => void;
  saving: boolean;
  label: string;
}

export function SaveButton({ onClick, saving, label }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
    >
      {saving ? 'Saving...' : label}
    </button>
  );
}
