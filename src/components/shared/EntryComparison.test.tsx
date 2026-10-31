// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EntryComparison } from './EntryComparison';
import { compareEntries } from '@/src/resume-ai/entryComparison';

afterEach(cleanup);
it('opens on the first changed entry instead of making users page through identical entries', () => {
  render(
    <EntryComparison
      incomingLabel="From Resume"
      entries={[
        {
          label: 'Unchanged employer',
          fields: [
            { label: 'Job title', current: 'Developer', suggested: 'Developer', changed: false },
          ],
        },
        {
          label: 'Changed employer',
          fields: [
            { label: 'Job title', current: 'Engineer', suggested: 'Lead Engineer', changed: true },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByText('Lead Engineer')).toBeTruthy();
  expect(screen.getByText(/Changed employer/)).toBeTruthy();
  expect(screen.queryByText(/Unchanged employer/)).toBeNull();
});

it('shows one entry at a time with changed values highlighted and unchanged details hidden', () => {
  render(
    <EntryComparison
      incomingLabel="From Resume"
      entries={[
        {
          label: 'First employer',
          fields: [
            { label: 'Job title', current: 'Developer', suggested: 'Lead', changed: true },
            { label: 'Start date', current: '2020-01', suggested: '2020-01', changed: false },
          ],
        },
        {
          label: 'Second employer',
          fields: [
            {
              label: 'Job title',
              current: 'Engineer',
              suggested: 'Senior Engineer',
              changed: true,
            },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByText('Lead').tagName).toBe('MARK');
  expect(screen.queryByText('Senior Engineer')).toBeNull();
  expect(screen.queryByText('Start date')).toBeNull();
  fireEvent.click(screen.getByLabelText('Show unchanged details'));
  expect(screen.getByText('Start date')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next entry' }));
  expect(screen.getByText('Senior Engineer')).toBeTruthy();
  expect(screen.queryByText('Lead')).toBeNull();
  expect(screen.queryByLabelText('Show unchanged details')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Previous entry' }));
  expect(screen.getByText('Lead')).toBeTruthy();
});

it('keeps full descriptions available without expanding them by default', () => {
  const value = 'A detailed responsibility. '.repeat(20);
  render(
    <EntryComparison
      incomingLabel="From Resume"
      entries={[
        {
          label: 'Employer',
          fields: [{ label: 'Description', current: 'Old text', suggested: value, changed: true }],
        },
      ]}
    />,
  );
  const summary = screen.getByText('Show full text');
  expect(summary.closest('details')?.open).toBe(false);
  fireEvent.click(summary);
  expect(summary.closest('details')?.open).toBe(true);
  expect(screen.getByText(value.trim())).toBeTruthy();
});

it('hides unchanged controls for a new entry and restores them for a matching saved entry', () => {
  const saved = {
    company: 'Saved employer',
    title: 'Developer',
    startDate: '2020-01',
    isCurrent: true,
  };
  render(
    <EntryComparison
      incomingLabel="From Resume"
      entries={
        compareEntries(
          'workHistory',
          [saved],
          [
            { company: 'New employer', title: 'Engineer', startDate: '2025-01', isCurrent: true },
            { ...saved, title: 'Lead Developer' },
          ],
        )!
      }
    />,
  );
  expect(screen.getByText('New entry')).toBeTruthy();
  expect(screen.getByText('Engineer')).toBeTruthy();
  expect(screen.queryByLabelText('Show unchanged details')).toBeNull();
  expect(screen.queryByText('Current')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next entry' }));
  expect(screen.getByText('Lead Developer')).toBeTruthy();
  expect(screen.queryByText('Start date')).toBeNull();
  fireEvent.click(screen.getByLabelText('Show unchanged details'));
  expect(screen.getByText('Start date')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Previous entry' }));
  expect(screen.getByText('New entry')).toBeTruthy();
  expect(screen.queryByLabelText('Show unchanged details')).toBeNull();
});

it.each(['workHistory', 'education'] as const)(
  'keeps current and incoming %s values visible in Replace mode',
  async (section) => {
    const { replacementChanges } = await import('@/src/utils/importPolicy');
    const oldEntry =
      section === 'workHistory'
        ? { company: 'Example Company', title: 'Designer', startDate: '2020-01', isCurrent: true }
        : {
            institution: 'Example School',
            degree: 'BA',
            fieldOfStudy: 'Design',
            startDate: '2020',
            endDate: '2024',
          };
    const newEntry =
      section === 'workHistory'
        ? { ...oldEntry, title: 'Lead Designer' }
        : { ...oldEntry, degree: 'MA' };
    const change = replacementChanges({ [section]: [oldEntry] }, { [section]: [newEntry] }).find(
      (change) => change.id === section,
    )!;
    render(
      <EntryComparison
        entries={change.entries!}
        incomingLabel="Imported"
        selection={{ change, replacement: true, isSaving: false, onSelect: () => {} }}
      />,
    );
    expect(screen.getByText('Changed entry')).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByText('Imported')).toBeTruthy();
    expect(screen.getByText(section === 'workHistory' ? 'Designer' : 'BA')).toBeTruthy();
    expect(screen.getByText(section === 'workHistory' ? 'Lead Designer' : 'MA')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /^Import Example/ })).toBeTruthy();
    expect(screen.queryByText('New entry')).toBeNull();
  },
);
