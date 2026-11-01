// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ImportWarnings } from './ImportWarnings';
afterEach(cleanup);
it('shows plain-language reasons beside each field without a second disclosure', () => {
  const original = 'Phone: expected object with countryCode, callingCode, number strings';
  const { container } = render(
    <ImportWarnings
      warnings={[original, 'AI settings: API keys and connection settings are not imported.']}
    />,
  );
  expect(screen.getByText('2 items will be skipped')).toBeTruthy();
  expect(screen.getByText('Phone').tagName).toBe('DT');
  expect(screen.getByText('Phone details are incomplete or invalid.').tagName).toBe('DD');
  expect(screen.getByText('API keys and connection settings cannot be imported.')).toBeTruthy();
  expect(screen.queryByText(original)).toBeNull();
  expect(container.querySelectorAll('details')).toHaveLength(1);
  expect(container.querySelectorAll('dl > div')).toHaveLength(2);
});
it.each([
  ['Name: expected string, max 100 chars', 'Use text with no more than 100 characters.'],
  [
    'CV: expected object with name (string), size (number), base64 (string)',
    'The saved file is missing its name, size, or contents.',
  ],
  [
    'Learned Mappings: Invalid mapping: example.test / field',
    'Saved field mappings could not be read.',
  ],
  [
    'Gender: expected male | female | other | prefer_not_to_say',
    'The selected option is not supported.',
  ],
  [
    'Work History: missing company, title, startDate (YYYY-MM), or isCurrent boolean',
    'Work details are incomplete or invalid.',
  ],
  [
    'Education: missing institution, degree, fieldOfStudy, or startDate (YYYY or YYYY-MM)',
    'Education details are incomplete or invalid.',
  ],
])('explains a schema warning without exposing its raw structure: %s', (warning, reason) => {
  render(<ImportWarnings warnings={[warning]} />);
  expect(screen.getByText(reason)).toBeTruthy();
  expect(screen.queryByText(warning)).toBeNull();
});
it('preserves field-specific explanations and custom summaries', () => {
  render(
    <ImportWarnings warnings={['Email: Invalid email address.']} summary="Check this detail" />,
  );
  expect(screen.getByText('Check this detail')).toBeTruthy();
  expect(screen.getByText('Invalid email address.')).toBeTruthy();
  expect(screen.queryByText('Technical details')).toBeNull();
});
it('does not display an empty warnings area', () => {
  const { container } = render(<ImportWarnings />);
  expect(container.innerHTML).toBe('');
});
