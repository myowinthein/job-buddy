import type { Profile } from '@/src/types/profile';
import type { LearnedMappings } from '@/src/types/storage';

// Synthetic data covering every editable profile field, including document bytes.
export function settingsReviewProfile(): Profile {
  const file = { size: 15, base64: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK' };
  return {
    id: 'settings-round-trip',
    personal: {
      firstName: 'Alex',
      lastName: 'Sample',
      nickname: 'Lex',
      email: 'alex@example.com',
      phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
      dateOfBirth: '1992-06-15',
      gender: 'other',
      ethnicity: 'prefer_not_to_say',
      veteranStatus: 'no',
      disabilityStatus: 'prefer_not_to_say',
    },
    address: {
      country: 'US',
      city: 'Austin',
      street: '123 Sample Street',
      state: 'Texas',
      postalCode: '78701',
    },
    professional: {
      summary: 'Synthetic career summary for Settings review.',
      noticePeriod: { immediate: false, value: 2, unit: 'month' },
    },
    salary: {
      current: { amount: 90000, currency: 'USD', period: 'annual', country: 'US' },
      expected: [
        { amount: 110000, currency: 'USD', period: 'annual' },
        { amount: 12000, currency: 'SGD', period: 'monthly', country: 'SG' },
      ],
    },
    workAuthorization: [
      { country: 'US', status: 'work_visa', visaType: 'Sample visa', expiryDate: '2029-06-30' },
      { country: 'SG', status: 'requires_sponsorship' },
    ],
    workHistory: [
      {
        company: 'Sample Current',
        title: 'Senior Engineer',
        startDate: '2021-03',
        isCurrent: true,
        location: { countryCode: 'US', city: 'Austin' },
        arrangement: 'hybrid',
        description: 'Current role description.',
      },
      {
        company: 'Sample Previous',
        title: 'Engineer',
        startDate: '2018-07',
        endDate: '2021-02',
        isCurrent: false,
        location: { countryCode: 'SG', city: 'Singapore' },
        arrangement: 'onsite',
        description: 'Previous role description.',
      },
    ],
    education: [
      {
        institution: 'Sample University',
        degree: 'BSc',
        fieldOfStudy: 'Computer Science',
        startDate: '2014-08',
        endDate: '2018-05',
        isCurrent: false,
        grade: '3.7 GPA',
        description: 'Completed thesis.',
      },
      {
        institution: 'Sample Graduate School',
        degree: 'MSc',
        fieldOfStudy: 'Software Engineering',
        startDate: '2025-09',
        endDate: '2028-06',
        isCurrent: true,
        grade: 'Pass',
        description: 'Current coursework.',
      },
    ],
    languages: [
      { language: 'en', proficiency: 'native_bilingual' },
      { language: 'es', proficiency: 'professional_working' },
    ],
    links: {
      linkedin: 'https://linkedin.com/in/alex-sample',
      portfolio: 'https://example.com/portfolio',
      github: 'https://github.com/alex-sample',
      twitter: 'https://x.com/alex-sample',
      dribbble: 'https://dribbble.com/alex-sample',
      behance: 'https://behance.net/alex-sample',
      custom: [
        { label: 'Blog', url: 'https://example.com/blog' },
        { label: 'GitLab', url: 'https://gitlab.com/alex-sample' },
      ],
    },
    documents: {
      cv: { url: 'https://example.com/cv.pdf', file: { ...file, name: 'sample-cv.pdf' } },
      coverLetter: {
        url: 'https://example.com/cover.pdf',
        file: { ...file, name: 'sample-cover.pdf' },
      },
    },
  };
}

export const SETTINGS_REVIEW_MAPPINGS: LearnedMappings = {
  'example.com': {
    'given name': { path: 'personal.firstName', count: 2, label: 'Given name' },
    surname: 'personal.lastName',
  },
};
