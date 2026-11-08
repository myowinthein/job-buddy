import { HelpPopover } from '@/src/components/ui/HelpPopover';

export function LearnedMappingsHelp() {
  return (
    <HelpPopover label="How learned mappings work">
      <p>Job Buddy remembers your corrections to improve future autofills on each site.</p>
      <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 gap-y-2">
        <dt className="font-medium text-amber-700 dark:text-amber-400">Learning</dt>
        <dd>One manual correction recorded.</dd>
        <dt className="font-medium text-green-700 dark:text-green-400">Trusted</dt>
        <dd>Confirmed again and ready for future autofills.</dd>
        <dt className="font-medium text-gray-500 dark:text-gray-400">Inactive</dt>
        <dd>Saved but excluded from autofill because the mapping needs review.</dd>
      </dl>
      <p>Use Review Mappings to let AI check your saved matches.</p>
    </HelpPopover>
  );
}
