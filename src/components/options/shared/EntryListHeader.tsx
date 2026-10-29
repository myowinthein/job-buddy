import { AddEntryButton } from './AddEntryButton';

export function EntryListHeader({
  title,
  id,
  onAdd,
  label,
}: {
  title?: string;
  id?: string;
  onAdd: () => void;
  label: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
      {title && (
        <h3 className="mr-auto text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h3>
      )}
      <AddEntryButton id={id} variant="pill" onClick={onAdd} label={label} />
    </div>
  );
}
