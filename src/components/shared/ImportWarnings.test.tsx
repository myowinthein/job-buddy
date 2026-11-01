// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ImportWarnings } from './ImportWarnings';
afterEach(cleanup);
it('makes fields and short reasons scannable while preserving full validation details', () => {
  const original = 'Phone: expected object with countryCode, callingCode, number strings';
  const { container } = render(
    <ImportWarnings
      warnings={[
        original,
        'AI settings: API keys and connection settings are not imported.',
        'Application History: Invalid application at position 1',
      ]}
    />,
  );
  expect(screen.getByText('3 items will be skipped')).toBeTruthy();
  expect(screen.getByText('Phone').tagName).toBe('DT');
  expect(screen.getByText('Unsupported format.').tagName).toBe('DD');
  expect(screen.getByText('Entry 1 has an unsupported format.')).toBeTruthy();
  expect(screen.getByText(original).closest('details')?.open).toBe(false);
  expect(container.querySelectorAll('dl > div')).toHaveLength(3);
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
