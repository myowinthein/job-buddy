interface Props {
  onClick: () => void;
}

export function RemoveButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-red-500 hover:text-red-700 transition-colors"
    >
      Remove
    </button>
  );
}
