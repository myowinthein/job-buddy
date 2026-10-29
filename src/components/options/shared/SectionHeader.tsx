import { PROFILE_SECTIONS, type ProfileSectionId } from './profileSections';

export function SectionHeader({ sectionId }: { sectionId: ProfileSectionId }) {
  const section = PROFILE_SECTIONS.find((item) => item.id === sectionId)!;
  return (
    <header className="mb-6 min-w-0">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{section.label}</h2>
      <p
        className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400"
        title={section.description}
      >
        {section.description}
      </p>
    </header>
  );
}
