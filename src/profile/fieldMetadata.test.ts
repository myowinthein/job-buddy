import { expect, it } from 'vitest';
import { settingsReviewProfile } from '../components/options/settingsReviewFixture';
import { compareEntries } from '../resume-ai/entryComparison';
import {
  catalogProfileFieldName,
  catalogProfileTarget,
  catalogSectionStartTarget,
  profileEntryFields,
  profileReviewMetadata,
} from './fieldMetadata';

it.each([
  ['salary.current.period', 'salary', 'field-currentPeriod'],
  ['salary.expected.1.period', 'salary', 'field-expected-1-period'],
  ['workHistory.1.location.city', 'workHistory', 'field-workHistory-1-locationCity'],
  ['education.1.grade', 'education', 'field-education-1-grade'],
  ['education.1.description', 'education', 'field-education-1-description'],
  ['links.custom.1.url', 'links', 'field-customLink-1-url'],
])('targets the actual catalog input for %s', (path, section, id) => {
  expect(catalogProfileTarget(settingsReviewProfile(), path)).toMatchObject({
    section,
    target: { id },
  });
});

it('uses the visible status input for conditional visa details and Add for removed rows', () => {
  const profile = settingsReviewProfile();
  profile.workAuthorization[0].status = 'citizen_or_pr';
  expect(catalogProfileTarget(profile, 'workAuthorization.0.visaType')?.target.id).toBe(
    'field-workAuthorization-0-status',
  );
  expect(catalogProfileTarget({}, 'workHistory.4.company')?.target.id).toBe('add-workHistory');
});

it('uses editor order and names for empty data and aggregate review rows', () => {
  expect(catalogSectionStartTarget('salary')?.id).toBe('field-expected-0-amount');
  expect(catalogProfileFieldName('personal.nickname')).toBe('Personal → Preferred name');
  expect(profileReviewMetadata('education[1].fieldOfStudy')?.label).toBe('Field of Study');
  expect(profileEntryFields('links.custom').map((field) => field.id)).toEqual(['label', 'url']);
});

it('keeps legacy string locations visible beside new structured locations in shared review', () => {
  const current = { company: 'Example', title: 'Engineer', location: 'Test City' };
  const incoming = { ...current, location: { countryCode: 'US', city: 'New City' } };
  const entries = compareEntries('workHistory', [current], [incoming])!;
  expect(entries[0].fields.find((field) => field.id === 'location.city')).toMatchObject({
    label: 'City',
    current: 'Test City',
    suggested: 'New City',
    changed: true,
  });
  expect(entries[0].fields.find((field) => field.id === 'location.countryCode')).toMatchObject({
    current: 'Not provided',
    suggested: 'United States',
  });
});
