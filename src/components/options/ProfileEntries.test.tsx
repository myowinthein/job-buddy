// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/src/components/ui/Toast';
import { WorkHistorySection } from './WorkHistorySection';
import { EducationSection } from './EducationSection';
import { WorkAuthorizationSection } from './WorkAuthorizationSection';
import { LanguagesSection } from './LanguagesSection';
import { LinksSection } from './LinksSection';
import { SalarySection } from './SalarySection';
import type { Profile } from '@/src/types/profile';
import '@/src/testing/scrollIntoViewStub';

afterEach(cleanup);

const cases: [string, typeof WorkHistorySection, Partial<Profile>, string | null][] = [
  [
    'experience',
    WorkHistorySection,
    {
      workHistory: [
        { company: 'Example', title: 'Engineer', startDate: '2020-01', isCurrent: true },
      ],
    },
    'Company',
  ],
  [
    'education',
    EducationSection,
    {
      education: [
        {
          institution: 'Example',
          degree: 'BSc',
          fieldOfStudy: 'Design',
          startDate: '',
          isCurrent: false,
        },
      ],
    },
    'Institution',
  ],
  [
    'authorization',
    WorkAuthorizationSection,
    { workAuthorization: [{ country: 'US', status: 'citizen_or_pr' }] },
    null,
  ],
  [
    'language',
    LanguagesSection,
    { languages: [{ language: 'en', proficiency: 'native_bilingual' }] },
    null,
  ],
  [
    'custom link',
    LinksSection,
    { links: { linkedin: '', custom: [{ label: 'Blog', url: 'https://example.test' }] } },
    'Label',
  ],
  [
    'expected salary',
    SalarySection,
    { salary: { expected: [{ amount: 5000, currency: 'USD', period: 'monthly' }] } },
    'Amount',
  ],
];
for (const [name, Component, profile, input] of cases) {
  it(`confirms clearing the last ${name} and keeps one blank card`, () => {
    render(
      <ToastProvider>
        <Component profile={profile} onSave={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry' }));
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(1);
    if (input)
      expect((screen.getAllByLabelText(new RegExp('^' + input))[0] as HTMLInputElement).value).toBe(
        '',
      );
  });
}

it('shows one optional experience card and omits it when untouched', () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <ToastProvider>
      <WorkHistorySection
        profile={{ professional: { noticePeriod: { immediate: true } } }}
        onSave={onSave}
      />
    </ToastProvider>,
  );
  expect(screen.getByLabelText(/^Company/)).toBeTruthy();
  fireEvent.click(screen.getByText('Save'));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ workHistory: [] }));
});

const reuseCases = [
  {
    name: 'experience',
    Component: WorkHistorySection,
    field: /^Company/,
    focus: /^Company/,
    value: 'Example',
    collapsible: true,
  },
  {
    name: 'education',
    Component: EducationSection,
    field: /^Institution/,
    focus: /^Institution/,
    value: 'Example',
    collapsible: true,
  },
  {
    name: 'authorization',
    Component: WorkAuthorizationSection,
    field: /^Authorization Status/,
    focus: /^Country/,
    value: 'citizen_or_pr',
    collapsible: true,
  },
  {
    name: 'language',
    Component: LanguagesSection,
    field: /^Proficiency/,
    focus: /^Language/,
    value: 'native_bilingual',
  },
  {
    name: 'custom link',
    Component: LinksSection,
    field: /^Label/,
    focus: /^Label/,
    value: 'Example',
  },
  {
    name: 'expected salary',
    Component: SalarySection,
    field: /^Amount/,
    focus: /^Amount/,
    value: '0',
    collapsible: true,
  },
];

for (const { name, Component, field, focus, value, collapsible } of reuseCases) {
  it(`reuses an empty ${name}, allows unsaved input, and returns to an earlier cleared row`, async () => {
    render(
      <ToastProvider>
        <Component profile={{}} onSave={vi.fn()} />
      </ToastProvider>,
    );
    const add = screen.getByRole('button', { name: /^\+ Add/ });
    // Custom dropdowns and their surrounding groups share the field label.
    const focusTargets = () =>
      screen.getAllByLabelText(focus, { selector: 'input, select, button' });
    if (collapsible) fireEvent.click(document.querySelector<HTMLButtonElement>('[data-entry-toggle][aria-expanded="true"]')!);
    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(focusTargets()[0]));

    fireEvent.change(screen.getAllByLabelText(field)[0], { target: { value } });
    fireEvent.click(add);
    expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(2);
    await waitFor(() => expect(document.activeElement).toBe(focusTargets()[1]));
    fireEvent.change(screen.getAllByLabelText(field)[1], { target: { value } });
    fireEvent.change(screen.getAllByLabelText(field)[0], { target: { value: '' } });
    fireEvent.click(add);
    expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(2);
    await waitFor(() => expect(document.activeElement).toBe(focusTargets()[0]));
  });
}

for (const Component of [WorkHistorySection, EducationSection]) {
  it(`keeps a partially entered date when adding to ${Component.name}`, () => {
    render(
      <ToastProvider>
        <Component profile={{}} onSave={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.change(screen.getAllByLabelText('Year')[0], { target: { value: '202' } });
    fireEvent.click(screen.getByRole('button', { name: /^\+ Add/ }));
    expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(2);
    expect((screen.getAllByLabelText('Year')[0] as HTMLInputElement).value).toBe('202');
  });
}

it('keeps a salary period selected by the user when adding another expected salary', () => {
  render(
    <ToastProvider>
      <SalarySection profile={{}} onSave={vi.fn()} />
    </ToastProvider>,
  );
  fireEvent.change(screen.getAllByLabelText('Period')[0], { target: { value: 'annual' } });
  fireEvent.click(screen.getByRole('button', { name: /^\+ Add/ }));
  expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(2);
});
