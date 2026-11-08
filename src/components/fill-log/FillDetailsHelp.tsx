import { HelpPopover } from '@/src/components/ui/HelpPopover';

export function FillDetailsHelp() {
  return (
    <HelpPopover label="How Fill Details works">
      <p className="text-pretty">
        For each field, autofill tries learned mappings → rules → AI and stops when it finds a
        reliable answer.
      </p>
      <p>Each fill attempt can have one of these results:</p>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2 [&_dd]:text-balance">
        <dt className="font-medium text-green-700 dark:text-green-400">Green</dt>
        <dd>Filled, high confidence or confirmed by you.</dd>
        <dt className="font-medium text-amber-700 dark:text-amber-400">Yellow</dt>
        <dd>Filled, but needs your review.</dd>
        <dt className="font-medium text-red-700 dark:text-red-400">Red</dt>
        <dd>Not filled, no safe match or the form rejected it.</dd>
        <dt className="font-medium text-gray-500 dark:text-gray-400">Gray</dt>
        <dd>Not filled, profile match found but no saved data.</dd>
      </dl>
      <div className="space-y-1 text-pretty">
        <p>Fields such as consent questions are always skipped.</p>
        <p>Existing answers are kept in “Empty fields only” mode.</p>
      </div>
    </HelpPopover>
  );
}
