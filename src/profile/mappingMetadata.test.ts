import { expect, it } from 'vitest';
import { settingsReviewProfile } from '@/src/testing/settingsReviewFixture';
import { FIELD_DICTIONARY } from '../autofill/dictionary';
import { repeatingEntryMarkers } from '../autofill/repeatingEntryResolution';
import { isLearnedPath } from '../utils/learnedMappingData';
import {
  PROFILE_ENTRY_PATHS,
  PROFILE_LEARNING_PATH_TEMPLATES,
  PROFILE_MAPPING_PATH_TEMPLATES,
} from './fieldCatalog';
import { expandMappingPaths, indexedProfilePath } from './mappingMetadata';

it('derives every repeated collection from the raw profile catalog', () => {
  expect([...PROFILE_ENTRY_PATHS].sort()).toEqual([
    'education',
    'languages',
    'links.custom',
    'salary.expected',
    'workAuthorization',
    'workHistory',
  ]);
  for (const family of PROFILE_ENTRY_PATHS) {
    expect(indexedProfilePath(`${family}.2`)).toEqual({ family, index: 2, suffix: '' });
    expect(indexedProfilePath(`${family}.2.example.path`)).toEqual({
      family,
      index: 2,
      suffix: '.example.path',
    });
  }
  for (const path of [
    'salary.current.period',
    'educationBackup.1.degree',
    'education.-1.degree',
    'education.1x.degree',
  ])
    expect(indexedProfilePath(path), path).toBeNull();
});

it('preserves the deliberately supported display values for automatic learning', () => {
  expect([...PROFILE_LEARNING_PATH_TEMPLATES].sort()).toEqual([
    'address.countryName',
    'education.$.endDate.formatted',
    'education.$.startDate.formatted',
    'languages.$.language',
    'languages.$.proficiency',
    'languages.formatted',
    'personal.phone.full',
    'professional.noticePeriod.availableDate',
    'professional.noticePeriod.formatted',
    'salary.current.formatted',
    'salary.expected.$.formatted',
    'workHistory.$.endDate.formatted',
    'workHistory.$.startDate.formatted',
  ]);
  const profile = settingsReviewProfile();
  const expanded = expandMappingPaths(profile, PROFILE_LEARNING_PATH_TEMPLATES);
  expect(expanded).toContain('salary.expected.1.formatted');
  expect(expanded).toContain('education.1.startDate.formatted');
  for (const path of expanded) expect(isLearnedPath(path), path).toBe(true);
  expect(
    expandMappingPaths({}, ['education.$.startDate.formatted', 'personal.phone.full']),
  ).toEqual(['personal.phone.full']);
});

it('preserves marker order used to anchor repeated rule matches', () => {
  expect(repeatingEntryMarkers('education')).toEqual([
    'education.institution',
    'education.degree',
    'education.fieldOfStudy',
    'education.startDate.formatted',
    'education.endDate.formatted',
    'education.isCurrent',
  ]);
  expect(repeatingEntryMarkers('workHistory')).toEqual([
    'workHistory.company',
    'workHistory.title',
    'workHistory.location',
    'workHistory.location.city',
    'workHistory.location.countryName',
    'workHistory.startDate.formatted',
    'workHistory.endDate.formatted',
    'workHistory.isCurrent',
    'workHistory.description',
    'workHistory.arrangement',
  ]);
  expect(repeatingEntryMarkers('languages')).toEqual([
    'languages.language',
    'languages.proficiency',
  ]);
  expect(repeatingEntryMarkers('salary.expected')).toEqual(['salary.expected.formatted']);
});

it('requires every dictionary marker in a repeated family to have a catalog mapping path', () => {
  for (const family of PROFILE_ENTRY_PATHS) {
    const markers = Object.keys(FIELD_DICTIONARY).filter((path) => path.startsWith(`${family}.`));
    for (const marker of markers) {
      const template = `${family}.$${marker.slice(family.length)}`;
      if (PROFILE_MAPPING_PATH_TEMPLATES.includes(template)) {
        expect(repeatingEntryMarkers(family)).toContain(marker);
        expect(isLearnedPath(template.replace('$', '0')), marker).toBe(true);
      } else {
        expect(PROFILE_MAPPING_PATH_TEMPLATES, marker).toContain(marker);
        expect(repeatingEntryMarkers(family)).not.toContain(marker);
      }
    }
  }
});
