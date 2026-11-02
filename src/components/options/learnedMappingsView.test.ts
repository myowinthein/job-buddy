import { expect, it } from 'vitest';
import {
  groupMappings,
  mappingDestination,
  mappingProfileTarget,
  matchesMapping,
  profileFieldLabels,
} from './learnedMappingsView';
import type { Profile } from '@/src/types/profile';
const entry = {
  path: 'personal.firstName',
  count: 2,
  label: 'First name',
  question: 'First name',
  scope: 'field' as const,
};
it('groups only explicit equivalent aliases, preserving their individual records', () => {
  const input = {
    site: {
      one: entry,
      two: { ...entry },
      differentQuestion: { ...entry, question: 'Preferred name' },
      differentPath: { ...entry, path: 'personal.lastName' },
      differentScope: { ...entry, scope: 'entry' as const },
      differentCount: { ...entry, count: 1 },
      inactive: { ...entry, inactive: true as const },
      legacyA: 'personal.firstName',
      legacyB: 'personal.firstName',
    },
  };
  const before = structuredClone(input);
  const groups = groupMappings(input).get('site')!;
  expect(groups).toHaveLength(8);
  expect(groups[0].members.length).toBe(1);
  expect(groups.find((group) => group.members.length === 2)?.members.map(([key]) => key)).toEqual([
    'one',
    'two',
  ]);
  expect(input).toEqual(before);
});
it('keeps unknown-question records separate even if their labels and paths look alike', () => {
  const { question: _, ...value } = entry;
  expect(groupMappings({ site: { one: value, two: value } }).get('site')).toHaveLength(2);
});
it('uses the actual profile entry to distinguish destinations and search results', () => {
  const profile = {
    education: [{ institution: 'Sample University', degree: 'BSc' }],
    links: { github: 'https://github.com/sample' },
  } as Partial<Profile>;
  const labels = profileFieldLabels(profile);
  expect(mappingDestination('education.0.institution', labels)).toBe(
    'Education → Sample University · BSc → Institution',
  );
  expect(labels.get('links.github')).toBe('Links → GitHub');
  const group = groupMappings({
    site: {
      school: { ...entry, path: 'education.0.institution', label: 'School', question: 'School' },
    },
  }).get('site')![0];
  expect(
    matchesMapping(
      group,
      'jobs.example.test',
      'sample institution',
      mappingDestination(group.path, labels),
    ),
  ).toBe(true);
  expect(
    matchesMapping(
      group,
      'jobs.example.test',
      'sample salary',
      mappingDestination(group.path, labels),
    ),
  ).toBe(false);
  expect(mappingDestination('education.8.institution', labels)).toBe(
    'Education → Entry 9 → Institution',
  );
});
it('routes profile links to the selected scalar, custom link or repeated entry, with a safe removed-row fallback', () => {
  expect(mappingProfileTarget({}, 'links.linkedin')).toMatchObject({
    section: 'links',
    target: { id: 'field-linkedin' },
  });
  expect(mappingProfileTarget({}, 'links.custom.1.url')).toMatchObject({
    section: 'links',
    target: { id: 'field-customLink-1-url', fallbackId: 'add-customLinks' },
  });
  expect(
    mappingProfileTarget({ education: [{}] } as Partial<Profile>, 'education.0.institution'),
  ).toMatchObject({
    section: 'education',
    target: { id: 'field-education-0-institution', cardId: 'entry-education-0' },
  });
  expect(mappingProfileTarget({}, 'education.9.institution')).toMatchObject({
    section: 'education',
    target: { id: 'add-education' },
  });
  expect(mappingProfileTarget({}, 'unsafe.nope')).toBeNull();
});
