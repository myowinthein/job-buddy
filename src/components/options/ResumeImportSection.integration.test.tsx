// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/src/utils/storage', () => ({
  getGeminiApiKey: vi.fn().mockResolvedValue('fake-key'),
  getGeminiModel: vi.fn().mockResolvedValue('gemini-3-pro'),
}));
vi.mock('@/src/resume-ai/gemini', () => ({
  extractFromResume: vi.fn(),
}));
vi.mock('@/src/resume-ai/extractLinks', () => ({
  extractLinks: vi.fn().mockResolvedValue([]),
}));

import { ResumeImportSection } from './ResumeImportSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import { getGeminiApiKey } from '@/src/utils/storage';
import { extractFromResume } from '@/src/resume-ai/gemini';
import type { Profile } from '@/src/types/profile';

function renderSection(
  profile: Partial<Profile> = {},
  onSave = vi.fn().mockResolvedValue(undefined),
) {
  const onGoToApiKey = vi.fn();
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <ResumeImportSection
        profile={profile}
        onSave={onSave}
        onGoToApiKey={onGoToApiKey}
        onClose={onClose}
      />
    </ToastProvider>,
  );
  return { onSave, onGoToApiKey, onClose };
}

function pdfFile(name = 'resume.pdf', sizeBytes = 1024) {
  const file = new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
  return file;
}

async function selectFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGeminiApiKey).mockResolvedValue('fake-key');
});

afterEach(cleanup);

describe('ResumeImportSection — real review and parser integration', () => {
  it.each([false, true])(
    'persists only accepted changes and preserves rejected documents (accept array: %s)',
    async (acceptArray) => {
      const oldEducation = [
        {
          institution: 'Old School',
          degree: 'BSc',
          fieldOfStudy: 'CS',
          startDate: '2010',
          isCurrent: false,
        },
      ];
      const newEducation = [
        {
          institution: 'New School',
          degree: 'MSc',
          fieldOfStudy: 'CS',
          startDate: '2015',
          isCurrent: false,
        },
      ];
      const documents = {
        cv: {
          url: 'https://example.com/cv',
          file: { name: 'old.pdf', size: 10, base64: 'old-data' },
        },
        coverLetter: {
          url: 'https://example.com/letter',
          file: { name: 'letter.pdf', size: 10, base64: 'letter-data' },
        },
      };
      const profile = {
        personal: {
          firstName: 'Local',
          lastName: 'Person',
          email: 'local@example.com',
          phone: { countryCode: 'US', callingCode: '+1', number: '1234567890' },
        },
        education: oldEducation,
        documents,
      };
      vi.mocked(extractFromResume)
        .mockReset()
        .mockResolvedValue({
          personal: { ...profile.personal, firstName: 'AI Name', nickname: 'New Nickname' },
          education: newEducation,
        });
      const { onSave } = renderSection(profile);
      await screen.findByText(/Drop your CV here/);
      await selectFile(pdfFile());
      fireEvent.click(screen.getByText('Analyze CV'));
      fireEvent.click(await screen.findByText('Review →'));
      fireEvent.click(document.querySelector('input[name="personal.firstName"]')!);
      const arrayChoices = document.querySelectorAll('input[name="education"]');
      fireEvent.click(arrayChoices[acceptArray ? 1 : 0]);
      fireEvent.click(screen.getByRole('checkbox', { name: /Resume File/ }));
      fireEvent.click(screen.getByText('Save selected'));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      const saved = onSave.mock.calls[0][0];
      expect(saved.personal.firstName).toBe('Local');
      expect(saved.personal.nickname).toBe('New Nickname');
      expect(saved.education).toEqual(acceptArray ? newEducation : oldEducation);
      expect(saved.documents).toEqual(documents);
    },
  );
});
