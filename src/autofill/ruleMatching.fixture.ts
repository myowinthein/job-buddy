import type { Profile } from '../types/profile';
export const RULE_PROFILE: Profile = {
  id: 'synthetic-rule-profile',
  personal: {
    firstName: 'Alex',
    lastName: 'Sample',
    email: 'alex@example.test',
    phone: { countryCode: 'US', callingCode: '+1', number: '2025550100' },
    dateOfBirth: '1996-06-01',
  },
  address: { city: 'Bangkok', country: 'TH' },
  professional: {
    summary: 'Engineering leader',
    noticePeriod: { immediate: false, value: 1, unit: 'month' },
  },
  salary: {
    current: { amount: 5000, currency: 'USD', period: 'monthly' },
    expected: [
      { amount: 6000, currency: 'USD', period: 'monthly' },
      { amount: 120000, currency: 'THB', period: 'annual' },
    ],
  },
  education: [
    {
      institution: 'Old University',
      degree: 'BSc',
      fieldOfStudy: 'Computing',
      startDate: '2010-01',
      endDate: '2013-01',
      isCurrent: false,
    },
    {
      institution: 'New University',
      degree: 'MSc',
      fieldOfStudy: 'AI',
      startDate: '2024-01',
      isCurrent: true,
    },
  ],
  workHistory: [
    {
      company: 'Old Company',
      title: 'Junior',
      startDate: '2015-01',
      endDate: '2018-01',
      isCurrent: false,
      arrangement: 'onsite',
    },
    {
      company: 'New Company',
      title: 'Senior',
      startDate: '2020-01',
      isCurrent: true,
      arrangement: 'remote',
    },
  ],
  languages: [
    { language: 'en', proficiency: 'native_bilingual' },
    { language: 'my', proficiency: 'full_professional' },
  ],
  workAuthorization: [
    { country: 'US', status: 'requires_sponsorship' },
    { country: 'TH', status: 'work_visa' },
  ],
  links: {
    linkedin: 'https://linkedin.example.test/alex',
    github: 'https://github.example.test/alex',
    custom: [{ label: '作品集', url: 'https://portfolio.example.test/alex' }],
  },
  documents: {
    cv: {
      url: 'https://resume.example.test/alex',
      file: { name: 'sample.pdf', size: 3, base64: 'data:application/pdf;base64,YWJj' },
    },
  },
  derived: {
    fullName: 'Alex Sample',
    currentTitle: 'Senior',
    currentCompany: 'New Company',
    totalExperience: { years: 1, months: 0, totalMonths: 12, label: '1 year' },
    age: 29,
  },
};
