// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/src/components/ui/Toast';
import { SalarySection } from './SalarySection';
import { PersonalSection } from './PersonalSection';
import { LinksSection } from './LinksSection';
import { WorkHistorySection } from './WorkHistorySection';
import { WorkAuthorizationSection } from './WorkAuthorizationSection';
import { LanguagesSection } from './LanguagesSection';
import { EducationSection } from './EducationSection';
import { DocumentsSection } from './DocumentsSection';
import { validateImportedProfile } from '@/src/utils/profileValidator';
import type { ReactNode } from 'react';
afterEach(cleanup);
const save = () => vi.fn().mockResolvedValue(undefined);
const show = (node: ReactNode) => render(<ToastProvider>{node}</ToastProvider>);
Element.prototype.scrollIntoView = vi.fn();

it('saves a mononymous contact and starts optional personal details collapsed', () => {
  const onSave = save();
  show(
    <PersonalSection
      profile={{
        personal: {
          firstName: 'Jane',
          lastName: '',
          email: 'jane@example.com',
          phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
        },
      }}
      onSave={onSave}
    />,
  );
  expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(false);
  expect(screen.getByLabelText('Preferred name')).toBeTruthy();
  fireEvent.click(screen.getByText('Save Personal'));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      personal: expect.objectContaining({ firstName: 'Jane', lastName: '' }),
    }),
  );
});

it('saves expected pay independently of current pay and country', () => {
  const onSave = save();
  show(
    <SalarySection
      profile={{ salary: { expected: [{ amount: 9000, currency: 'USD', period: 'monthly' }] } }}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByText('Save Salary'));
  expect(onSave).toHaveBeenCalledWith({
    salary: {
      current: undefined,
      expected: [{ amount: 9000, currency: 'USD', country: undefined, period: 'monthly' }],
    },
  });
});

it('lets a currency override the country default', () => {
  const onSave = save();
  show(
    <SalarySection
      profile={{
        salary: {
          current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
          expected: [],
        },
      }}
      onSave={onSave}
    />,
  );
  fireEvent.click(document.getElementById('field-currentCurrency')!);
  fireEvent.change(screen.getByPlaceholderText('Search by code or name…'), {
    target: { value: 'USD' },
  });
  fireEvent.click(screen.getByRole('option', { name: /USD/ }));
  fireEvent.click(screen.getByText('Save Salary'));
  expect(onSave).toHaveBeenCalledWith({
    salary: expect.objectContaining({
      current: expect.objectContaining({ country: 'TH', currency: 'USD' }),
    }),
  });
});

it('saves portfolio and GitHub without LinkedIn', () => {
  const onSave = save();
  show(
    <LinksSection
      profile={{ links: { linkedin: '', portfolio: 'example.com', github: 'github.com/jane' } }}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByText('Save Links'));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      links: expect.objectContaining({
        linkedin: '',
        portfolio: 'https://example.com',
        github: 'https://github.com/jane',
      }),
    }),
  );
});

it.each([true, false])(
  'allows no employment history but requires availability (availability=%s)',
  (availability) => {
    const onSave = save();
    show(
      <WorkHistorySection
        profile={{
          workHistory: [],
          professional: {
            summary: 'Changing careers',
            ...(availability ? { noticePeriod: { immediate: true } } : {}),
          },
        }}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText('Save Work History'));
    if (!availability) {
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText('Select your availability')).toBeTruthy();
      fireEvent.click(screen.getByLabelText('Available Now'));
      fireEvent.click(screen.getByText('Save Work History'));
    }
    expect(onSave).toHaveBeenCalledWith({
      workHistory: [],
      professional: {
        summary: 'Changing careers',
        noticePeriod: { immediate: true, value: undefined, unit: undefined },
      },
    });
  },
);

it('does not drop a partially typed date in an otherwise empty experience row', () => {
  const onSave = save();
  show(<WorkHistorySection profile={{ workHistory: [] }} onSave={onSave} />);
  fireEvent.click(screen.getByText('+ Add Entry'));
  fireEvent.change(screen.getAllByLabelText('Month')[0], { target: { value: '06' } });
  fireEvent.click(screen.getByText('Save Work History'));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('Complete the month and year')).toBeTruthy();
});

it('exposes visa metadata and rejects duplicate authorization countries', () => {
  const onSave = save();
  show(
    <WorkAuthorizationSection
      profile={{
        workAuthorization: [
          {
            country: 'SG',
            status: 'work_visa',
            visaType: 'Employment Pass',
            expiryDate: '2029-06-30',
          },
          { country: 'Singapore', status: 'citizen_or_pr' },
        ],
      }}
      onSave={onSave}
    />,
  );
  expect(screen.getByDisplayValue('Employment Pass')).toBeTruthy();
  expect(screen.getByDisplayValue('2029-06-30')).toBeTruthy();
  fireEvent.click(screen.getByText('Save Work Authorization'));
  expect(screen.getByText('This country is already listed')).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

it('rejects duplicate languages across legacy names and codes', () => {
  const onSave = save();
  show(
    <LanguagesSection
      profile={{
        languages: [
          { language: 'en', proficiency: 'native_bilingual' },
          { language: 'English', proficiency: 'full_professional' },
        ],
      }}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByText('Save Languages'));
  expect(screen.getByText('This language is already listed')).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

it('saves and imports future graduation dates and optional education details', () => {
  const onSave = save();
  const future = `${new Date().getFullYear() + 2}-06`;
  show(
    <EducationSection
      profile={{
        education: [
          {
            institution: 'University',
            degree: 'BSc',
            fieldOfStudy: 'CS',
            startDate: '2024-09',
            isCurrent: true,
            endDate: future,
            grade: '3.8',
            description: 'Thesis project',
          },
        ],
      }}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByText('University: BSc'));
  fireEvent.click(screen.getByText('Grade and coursework'));
  fireEvent.change(screen.getByLabelText('Grade / GPA'), { target: { value: '3.9' } });
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'Updated thesis' },
  });
  fireEvent.click(screen.getByText('Save Education'));
  const patch = onSave.mock.calls[0][0];
  expect(patch.education[0]).toMatchObject({
    endDate: future,
    grade: '3.9',
    description: 'Updated thesis',
  });
  expect(validateImportedProfile(patch).valid).toBe(true);
});

it('saves a cover letter without a CV and removes its URL independently', async () => {
  const onSave = save();
  const file = { name: 'cover.pdf', size: 10, base64: 'synthetic' };
  show(
    <DocumentsSection
      profile={{ documents: { cv: {}, coverLetter: { url: 'https://example.com/cover', file } } }}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByText(/Cover letter/, { selector: 'summary' }));
  expect(screen.getByText('cover.pdf')).toBeTruthy();
  fireEvent.click(screen.getByText('Remove URL'));
  fireEvent.click(screen.getByText('Save Documents'));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({ documents: { cv: {}, coverLetter: { file } } }),
  );
});
