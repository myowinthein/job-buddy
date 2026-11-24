import { expect, it } from 'vitest';
import { groupMappings } from '../../learned-mappings/groups';
import {
  mappingDestination,
  mappingSearchText,
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
  expect(groups).toHaveLength(7);
  expect(groups[0].members.length).toBe(3);
  expect(groups.find((group) => group.members.length === 3)?.members.map(([key]) => key)).toEqual([
    'differentCount',
    'one',
    'two',
  ]);
  expect(groups.find((group) => group.members.length === 3)?.status).toBe('Trusted');
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
  const text = mappingSearchText(group, 'jobs.example.test', mappingDestination(group.path, labels));
  expect(matchesMapping(text, ['sample', 'institution'])).toBe(true);
  expect(matchesMapping(text, ['sample', 'salary'])).toBe(false);
  expect(matchesMapping(text, ['jobs.example.test', 'school'])).toBe(true);
  expect(mappingDestination('education.8.institution', labels)).toBe(
    'Education → Entry 9 → Institution',
  );
});
