// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EducationSection } from './EducationSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <EducationSection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

describe('EducationSection — initRow legacy-profile defaults', () => {
  it('defaults isCurrent to false for an entry that predates the field', () => {
    const { onSave } = renderSection({
      education: [{
        institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014-09', endDate: '2018-05',
      } as unknown as Profile['education'][0]],
    });
    fireEvent.click(screen.getByText('Save Education'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      education: [expect.objectContaining({ isCurrent: false })],
    }));
  });

  it('preserves grade and description on save even though the form no longer exposes them', () => {
    const { onSave } = renderSection({
      education: [{
        institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014-09', endDate: '2018-05',
        isCurrent: false, grade: '3.8 GPA', description: 'Honors thesis on distributed systems',
      }],
    });
    fireEvent.click(screen.getByText('Save Education'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      education: [expect.objectContaining({ grade: '3.8 GPA', description: 'Honors thesis on distributed systems' })],
    }));
  });
});

describe('EducationSection — YYYY vs YYYY-MM dual-format date comparison', () => {
  it('does not falsely flag a YYYY-only end date as before a YYYY-MM start date when it is not', () => {
    // start 2014-09, end "2018" (year-only) -> endNorm "2018-12" >= startNorm "2014-09": valid.
    const { onSave } = renderSection({
      education: [{
        institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014-09', endDate: '2018', isCurrent: false,
      }],
    });
    fireEvent.click(screen.getByText('Save Education'));
    expect(onSave).toHaveBeenCalled();
  });

  it('flags a YYYY-only end date that is genuinely before a YYYY-MM start date', () => {
    // start 2020-09, end "2018" (year-only) -> endNorm "2018-12" < startNorm "2020-09": invalid.
    const { onSave } = renderSection({
      education: [{
        institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2020-09', endDate: '2018', isCurrent: false,
      }],
    });
    fireEvent.click(screen.getByText('Save Education'));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('MIT — BSc')); // expand to see the error
    expect(screen.getByText('End date cannot be before start date')).toBeTruthy();
  });
});

describe('EducationSection — live year-range validation across the keystroke/onChange paths', () => {
  it('shows a year-range error live while typing, before a month is even chosen (keystroke path)', () => {
    renderSection({ education: [] });
    const yearInputs = screen.getAllByLabelText('Year'); // [0]=start, [1]=end
    fireEvent.change(yearInputs[0], { target: { value: '1800' } });
    expect(screen.getByText(/Year must be between/)).toBeTruthy();
  });

  it('the direct-update path (onChange with a complete date) independently agrees on an out-of-range year', () => {
    renderSection({ education: [] });
    const yearInputs = screen.getAllByLabelText('Year');
    const monthSelects = screen.getAllByLabelText('Month');
    fireEvent.change(yearInputs[0], { target: { value: '1800' } });
    fireEvent.change(monthSelects[0], { target: { value: '06' } }); // completes "1800-06"
    expect(screen.getByText(/Year must be between/)).toBeTruthy();
  });
});

describe('EducationSection — required-field validation', () => {
  it('requires institution, degree, field of study, and start date', () => {
    const { onSave } = renderSection({ education: [] });
    fireEvent.click(screen.getByText('Save Education'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Institution is required')).toBeTruthy();
    expect(screen.getByText('Degree is required')).toBeTruthy();
    expect(screen.getByText('Field of study is required')).toBeTruthy();
    expect(screen.getByText('Start date is required')).toBeTruthy();
  });

  it('does not require an end date when marked as currently active', () => {
    const { onSave } = renderSection({
      education: [{ institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2020-09', isCurrent: true }],
    });
    fireEvent.click(screen.getByText('Save Education'));
    expect(onSave).toHaveBeenCalled();
  });
});

describe('EducationSection — end-date MonthYearPicker wiring', () => {
  it('saves an end date entered via the month/year picker (not just an injected profile shape)', () => {
    const { onSave } = renderSection({
      education: [{ institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014-09', isCurrent: false }],
    });
    fireEvent.click(screen.getByText('MIT — BSc')); // entries default to collapsed

    const yearInputs = screen.getAllByLabelText('Year'); // [0]=start, [1]=end
    const monthSelects = screen.getAllByLabelText('Month');
    fireEvent.change(monthSelects[1], { target: { value: '05' } });
    fireEvent.change(yearInputs[1], { target: { value: '2018' } });

    fireEvent.click(screen.getByText('Save Education'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      education: [expect.objectContaining({ endDate: '2018-05' })],
    }));
  });

  it('shows a live year-range error for the end date via onYearChange, independent of the start date', () => {
    renderSection({
      education: [{ institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014-09', isCurrent: false }],
    });
    fireEvent.click(screen.getByText('MIT — BSc'));

    const yearInputs = screen.getAllByLabelText('Year');
    fireEvent.change(yearInputs[1], { target: { value: '1800' } });
    expect(screen.getByText(/Year must be between/)).toBeTruthy();
  });

  it('flags an end date before the start date at save time, entered entirely via the picker', () => {
    const { onSave } = renderSection({
      education: [{ institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014-09', isCurrent: false }],
    });
    fireEvent.click(screen.getByText('MIT — BSc'));

    const yearInputs = screen.getAllByLabelText('Year');
    const monthSelects = screen.getAllByLabelText('Month');
    fireEvent.change(monthSelects[1], { target: { value: '01' } });
    fireEvent.change(yearInputs[1], { target: { value: '2010' } });

    fireEvent.click(screen.getByText('Save Education'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('End date cannot be before start date')).toBeTruthy();
  });
});
