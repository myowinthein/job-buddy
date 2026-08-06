import type { Profile } from '../types/profile';

// Fully-filled fixture used only by getProfile()'s dev fallback (see
// storage.ts) so `pnpm dev` starts at 100% profile completion instead of
// empty. Never used in a production/zip build (import.meta.env.DEV is false
// there) and never persisted to storage — an explicit saveProfile() (e.g.
// editing a section in Options) takes over normally on the next read, same
// as getGeminiApiKey()'s dev-only VITE_GEMINI_API_KEY fallback.
export const DEV_PROFILE: Profile = {
  id: 'dev-profile',
  personal: {
    firstName:        'Jane',
    lastName:          'Doe',
    email:             'jane.doe@example.com',
    phone:             { countryCode: 'US', callingCode: '+1', number: '5551234567' },
    dateOfBirth:       '1992-06-15',
    gender:            'Female',
    ethnicity:         'Prefer not to say',
    veteranStatus:     'Not a veteran',
    disabilityStatus:  'No',
  },
  address: {
    city:       'Austin',
    country:    'US',
    street:     '123 Main St',
    state:      'Texas',
    postalCode: '78701',
  },
  professional: {
    summary: 'Product-minded engineer with 6+ years building web applications, focused on developer tools and frontend architecture.',
    noticePeriod: { immediate: false, value: 2, unit: 'week' },
  },
  salary: {
    current:  { amount: 120000, currency: 'USD', country: 'US', period: 'annual' },
    expected: [{ amount: 140000, currency: 'USD', country: 'US', period: 'annual' }],
  },
  workAuthorization: [
    { country: 'US', status: 'citizen_or_pr' },
  ],
  workHistory: [
    {
      company:     'Acme Corp',
      title:       'Senior Software Engineer',
      startDate:   '2021-03',
      isCurrent:   true,
      location:    { countryCode: 'US', city: 'Austin' },
      arrangement: 'hybrid',
      description: 'Led development of the core dashboard product, mentored junior engineers, and drove adoption of TypeScript across the frontend codebase.',
    },
    {
      company:     'Beta Industries',
      title:       'Software Engineer',
      startDate:   '2018-07',
      endDate:     '2021-02',
      isCurrent:   false,
      location:    { countryCode: 'US', city: 'Denver' },
      arrangement: 'onsite',
      description: 'Built and maintained internal tooling for the operations team.',
    },
  ],
  education: [
    {
      institution:  'University of Texas at Austin',
      degree:       'B.Sc.',
      fieldOfStudy: 'Computer Science',
      startDate:    '2014-08',
      endDate:      '2018-05',
      isCurrent:    false,
      grade:        '3.7 GPA',
    },
  ],
  languages: [
    { language: 'en', proficiency: 'native_bilingual' },
    { language: 'es', proficiency: 'professional_working' },
  ],
  links: {
    linkedin: 'https://linkedin.com/in/janedoe-dev',
    portfolio: 'https://janedoe.dev',
    custom: [{ label: 'GitHub', url: 'https://github.com/janedoe' }],
  },
  documents: {
    cv: { url: 'https://example.com/jane-doe-resume.pdf' },
  },
};
