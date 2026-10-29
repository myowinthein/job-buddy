export const PROFILE_SECTIONS = [
  { id: 'personal', label: 'Personal', description: 'Your name and contact details', icon: '👤' },
  { id: 'address', label: 'Address', description: 'Your current address', icon: '📍' },
  {
    id: 'workAuthorization',
    label: 'Work Authorization',
    description: 'Your right to work',
    icon: '🛂',
  },
  {
    id: 'workHistory',
    label: 'Work History',
    description: 'Your experience and availability',
    icon: '📋',
  },
  { id: 'education', label: 'Education', description: 'Your academic background', icon: '🎓' },
  {
    id: 'languages',
    label: 'Languages',
    description: 'Your languages and proficiency',
    icon: '🌐',
  },
  { id: 'links', label: 'Links', description: 'Your online profiles', icon: '🔗' },
  { id: 'documents', label: 'Documents', description: 'Your CV and cover letter', icon: '📄' },
  { id: 'salary', label: 'Salary', description: 'Your gross base pay before tax', icon: '💰' },
] as const;

export type ProfileSectionId = (typeof PROFILE_SECTIONS)[number]['id'];
