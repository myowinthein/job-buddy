// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AddressSection } from '../components/options/AddressSection';
import { buildPickerTree } from '../autofill/profileFieldTree';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import { isLearnedPath } from '../utils/learnedMappingData';
import {
  PROFILE_FIELD_LAYOUTS,
  PROFILE_MAPPING_PATH_TEMPLATES,
  catalogFields,
} from './fieldCatalog';

// Simulate a future catalog edit. Both production consumers must pick it up.
vi.mock('./fieldCatalog', async (original) => {
  const catalog = await original<typeof import('./fieldCatalog')>();
  const [countryPostal, street, locality] = catalog.PROFILE_FIELD_LAYOUTS.address;
  return {
    ...catalog,
    PROFILE_FIELD_LAYOUTS: {
      ...catalog.PROFILE_FIELD_LAYOUTS,
      address: [
        locality,
        street,
        {
          ...countryPostal,
          children: [
            countryPostal.children[1],
            {
              ...countryPostal.children[0],
              label: 'Country of residence',
            },
          ],
        },
      ],
    },
  };
});
vi.mock('../components/ui/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
afterEach(cleanup);

it('applies a shared label and ordering change to the actual editor and chooser', () => {
  const profile = {
    ...RULE_PROFILE,
    address: {
      ...RULE_PROFILE.address,
      street: '123 Test Street',
      state: 'Bangkok',
      postalCode: '10110',
    },
  };
  const { container } = render(<AddressSection profile={profile} onSave={vi.fn()} />);
  const editorLabels = [...container.querySelectorAll('label')].map((label) =>
    label.textContent?.replace('*', '').trim(),
  );
  const section = buildPickerTree(profile).find((item) => item.id === 'address')!;
  const chooserLabels = section.items.map((item) =>
    item.kind === 'option' ? item.label : item.heading,
  );
  expect(editorLabels).toEqual([
    'City',
    'State / Province',
    'Street Address',
    'Postal Code',
    'Country of residence',
  ]);
  expect(chooserLabels).toEqual(editorLabels);
});

it('keeps field identifiers unique within each editor and admits every catalog mapping path', () => {
  for (const nodes of Object.values(PROFILE_FIELD_LAYOUTS)) {
    const fields = catalogFields(nodes);
    expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
  }
  for (const template of PROFILE_MAPPING_PATH_TEMPLATES)
    expect(isLearnedPath(template.replaceAll('$', '12')), template).toBe(true);
  for (const path of [
    'workHistory.01.title',
    'workHistory.-1.company',
    'personal.password',
    'links.custom.0.label',
    'documents.coverLetter.file',
    'documents.cv.file.base64',
    '__proto__.firstName',
    'personal.firstName.extra',
  ])
    expect(isLearnedPath(path), path).toBe(false);
});
