// @vitest-environment jsdom
import { feedback } from '@/src/ui/feedback';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

vi.mock('@/src/utils/storage', () => ({
  getGeminiApiKey: vi.fn().mockResolvedValue('fake-key'),
  getGeminiModel: vi.fn().mockResolvedValue('gemini-3-pro'),
}));
vi.mock('@/src/resume-ai/gemini', () => ({
  extractFromResume: vi.fn(),
}));
vi.mock('@/src/resume-ai/validateResumeFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/src/resume-ai/validateResumeFile')>()),
  validateResumeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/src/resume-ai/extractLinks', () => ({
  extractLinks: vi.fn().mockResolvedValue([]),
}));
import { ResumeImportSection } from './ResumeImportSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import { getGeminiApiKey } from '@/src/utils/storage';
import { extractFromResume } from '@/src/resume-ai/gemini';
import { extractLinks } from '@/src/resume-ai/extractLinks';
import { validateResumeFile } from '@/src/resume-ai/validateResumeFile';
import type { Profile } from '@/src/types/profile';

function renderSection(profile: Partial<Profile> = {}, onSave = vi.fn().mockResolvedValue(undefined)) {
  const onGoToApiKey = vi.fn();
  const onClose = vi.fn();
  const onReplace = vi.fn().mockResolvedValue(undefined);
  render(
    <ToastProvider>
      <ResumeImportSection profile={profile} onSave={update => onSave(typeof update === 'function' ? update(profile) : update)} onReplace={onReplace} onGoToApiKey={onGoToApiKey} onClose={onClose} />
    </ToastProvider>,
  );
  return { onSave, onReplace, onGoToApiKey, onClose };
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
  vi.mocked(validateResumeFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(getGeminiApiKey).mockResolvedValue('fake-key');
});

afterEach(cleanup);

it('keeps keyboard focus in the upload dialog and skips its hidden file input', async () => {
  renderSection();
  await screen.findByText(/Drop your resume here/);
  const dialog = screen.getByRole('dialog', { name: 'Import Resume' });
  expect(document.activeElement).toBe(dialog);
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  cancel.focus();
  fireEvent.keyDown(cancel, { key: 'Tab' });
  const close = screen.getByRole('button', { name: 'Close' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(cancel);
});

it('shows a loading message and spinner while AI settings are being read', async () => {
  let finish!: (key: string) => void;
  vi.mocked(getGeminiApiKey).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  renderSection();
  expect(screen.getByRole('status').textContent).toBe('Loading AI settings…');
  expect(screen.getByRole('status').querySelector('svg')).not.toBeNull();
  await act(async () => { finish('fake-key'); });
  await screen.findByText(/Drop your resume here/);
  expect(screen.queryByText('Loading AI settings…')).toBeNull();
});

describe('ResumeImportSection — file validation', () => {
  it('rejects a non-PDF/DOCX file with an error message', async () => {
    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(new File(['hello'], 'resume.txt', { type: 'text/plain' }));
    const error = await screen.findByText('Choose a PDF or DOCX resume.');
    expect(error.closest('[role="alert"]')?.className).toContain('bg-red-50');
    expect(error.closest('[role="alert"]')?.querySelector('svg')).not.toBeNull();
  });

  it('rejects a file just over 4 MB', async () => {
    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile('big.pdf', 4 * 1024 * 1024 + 1));
    expect(await screen.findByText('File exceeds 4 MB limit (4.0 MB)')).toBeTruthy();
  });

  it('accepts a PDF exactly at the 4 MB limit', async () => {
    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile('boundary.pdf', 4 * 1024 * 1024));
    expect(screen.getByText('boundary.pdf')).toBeTruthy();
    expect(screen.queryByText(/File exceeds/)).toBeNull();
  });

  it('accepts a valid PDF and clears a prior error', async () => {
    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(new File(['x'], 'bad.txt', { type: 'text/plain' }));
    await screen.findByText('Choose a PDF or DOCX resume.');
    await selectFile(pdfFile());
    expect(screen.queryByText('Choose a PDF or DOCX resume.')).toBeNull();
    expect(screen.getByText('resume.pdf')).toBeTruthy();
  });
});

describe('ResumeImportSection — no API key state', () => {
  it('shows a Settings link instead of the upload area when no key is set', async () => {
    vi.mocked(getGeminiApiKey).mockResolvedValue('');
    const { onGoToApiKey } = renderSection();
    fireEvent.click(await screen.findByText('Go to Settings →'));
    expect(onGoToApiKey).toHaveBeenCalled();
  });

  it('updates the open dialog when the preview key is removed and restored', async () => {
    let changed:
      | ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
      | undefined;
    vi.stubGlobal('chrome', {
      storage: {
        onChanged: {
          addListener: (listener: typeof changed) => { changed = listener; },
          removeListener: vi.fn(),
        },
      },
    });
    try {
      renderSection();
      await screen.findByText(/Drop your resume here/);
      vi.mocked(getGeminiApiKey).mockResolvedValue('');
      await act(async () => changed?.({ geminiApiKey: { oldValue: 'fake-key' } }, 'local'));
      expect(await screen.findByText('Add a Gemini API key to import your resume.')).toBeTruthy();
      vi.mocked(getGeminiApiKey).mockResolvedValue('fake-key');
      await act(async () => changed?.({ geminiApiKey: { newValue: 'fake-key' } }, 'local'));
      expect(await screen.findByText(/Drop your resume here/)).toBeTruthy();
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  });
});

describe('ResumeImportSection — cancel/abort during analysis', () => {
  it('aborts the in-flight request and returns to the dialog when Cancel is clicked', async () => {
    vi.mocked(extractFromResume).mockReset().mockImplementation(
      (_key, _model, _b64, _mime, _profile, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
            reject(err);
          });
        }),
    );

    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    await screen.findByText('Analyzing Resume', {}, { timeout: 12000 });
    const progress = screen.getByRole('dialog', { name: 'Analyzing Resume' });
    expect(document.activeElement).toBe(progress);
    fireEvent.keyDown(progress, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Cancel returns to the upload dialog (selectedFile is preserved — only
    // the screen reverts), not all the way back to the empty drop-zone state.
    await screen.findByText('Analyze Resume');
    expect(screen.queryByText('Analyzing Resume')).toBeNull();
  }, 20000);

  it('aborts on Escape while analysis is in progress', async () => {
    vi.mocked(extractFromResume).mockReset().mockImplementation(
      (_key, _model, _b64, _mime, _profile, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );

    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    await screen.findByText('Analyzing Resume', {}, { timeout: 12000 });
    fireEvent.keyDown(window, { key: 'Escape' });

    await screen.findByText('Analyze Resume');
    expect(screen.queryByText('Analyzing Resume')).toBeNull();
  }, 20000);
});

describe('ResumeImportSection — Escape on the initial dialog', () => {
  it('closes the section on Escape before any file is selected', async () => {
    const { onClose } = renderSection();
    await screen.findByText(/Drop your resume here/);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ResumeImportSection — rate_limit error branch', () => {
  it('shows a compact rate-limit alert without a dashboard link', async () => {
    vi.mocked(extractFromResume).mockReset().mockRejectedValue(
      Object.assign(new Error('rate limited'), { code: 'rate_limit' }),
    );

    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    const notice = await screen.findByText(/AI usage limit reached/);
    expect(notice.textContent).toBe(feedback.resumeUsageLimit);
    expect(screen.getByRole('alert').className).toContain('bg-red-50');
    expect(screen.queryByText('Check limits opens in new tab.')).toBeNull();
    expect(screen.queryByText('Reading resume…')).toBeNull();
    expect(screen.queryByRole('link', { name: /Check limits/ })).toBeNull();
  });

  it('shows the raw error message for a non-rate_limit failure instead', async () => {
    vi.mocked(extractFromResume).mockReset().mockRejectedValue(
      Object.assign(new Error('Invalid API key'), { code: 'invalid_key' }),
    );

    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    expect(await screen.findByText('Invalid API key')).toBeTruthy();
    expect(screen.queryByText('Google AI Studio')).toBeNull();
  });
});

it.each(['invalid_file', 'not_resume', 'parse', 'auth', 'network', 'service', 'timeout', 'rate_limit'] as const)(
  'returns a %s failure to the upload dialog with the appropriate recovery',
  async code => {
    const error = Object.assign(new Error('Test failure'), { code });
    vi.mocked(extractFromResume).mockReset().mockRejectedValue(error);
    if (code === 'invalid_file') vi.mocked(validateResumeFile).mockRejectedValueOnce(error);
    const { onGoToApiKey } = renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Resume' }));
    const alert = await screen.findByRole('alert');
    expect(alert.parentElement?.parentElement?.firstElementChild).toBe(alert.parentElement);
    expect(alert.parentElement?.nextElementSibling?.getAttribute('role')).toBe('button');
    expect(screen.getByRole('heading', { name: 'Import Resume' })).toBeTruthy();
    expect(screen.queryByText('Analyzing Resume')).toBeNull();
    const rejectedFile = code === 'invalid_file' || code === 'not_resume';
    expect(screen.queryByText('resume.pdf') !== null).toBe(!rejectedFile);
    expect((screen.getByRole('button', { name: 'Analyze Resume' }) as HTMLButtonElement).disabled).toBe(rejectedFile);
    if (code === 'auth') {
      fireEvent.click(screen.getByRole('button', { name: /Go to Settings/ }));
      expect(onGoToApiKey).toHaveBeenCalledTimes(1);
    }
  },
);

describe('ResumeImportSection — retry after failure does not re-extract links', () => {
  it('reuses the already-read file and extracted links on retry rather than redoing them', { timeout: 20000 }, async () => {
    vi.mocked(extractFromResume)
      .mockReset()
      .mockImplementationOnce(() => Promise.reject(Object.assign(new Error('Network error'), { code: undefined })))
      .mockImplementationOnce(() => Promise.resolve({}));

    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    await screen.findByText('Network error', {}, { timeout: 12000 });
    expect(vi.mocked(extractLinks)).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze Resume' }));

    await screen.findByRole('button', { name: 'Import All' }, { timeout: 12000 });
    expect(vi.mocked(extractLinks)).toHaveBeenCalledTimes(1);
    expect(validateResumeFile).toHaveBeenCalledTimes(1);
    expect(extractFromResume).toHaveBeenCalledTimes(2);
  });

  it('reads and validates a replacement file after an analysis failure', async () => {
    vi.mocked(extractFromResume).mockReset()
      .mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'network' }))
      .mockResolvedValueOnce({});
    const { onSave } = renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile('first.pdf'));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Resume' }));
    await screen.findByText('Network error');

    await selectFile(new File(['%PDF-1.4 replacement'], 'second.pdf', { type: 'application/pdf' }));
    expect(screen.queryByText('Network error')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Resume' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import All' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].documents.cv.file).toEqual(expect.objectContaining({
      name: 'second.pdf', base64: `data:application/pdf;base64,${btoa('%PDF-1.4 replacement')}`,
    }));
    expect(validateResumeFile).toHaveBeenCalledTimes(2);
    expect(extractLinks).toHaveBeenCalledTimes(2);
  });
});

describe('ResumeImportSection — pre-AI-call failure', () => {
  it('shows an error when link extraction throws, without ever reaching the AI call', async () => {
    // Distinct from the extractFromResume-failure tests above — this fires
    // in handleExtract's own try block, before runExtractCore (and thus
    // extractFromResume) is ever invoked.
    vi.mocked(extractLinks).mockRejectedValueOnce(new Error('failed to parse PDF links'));

    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    expect(await screen.findByText('failed to parse PDF links')).toBeTruthy();
    expect(vi.mocked(extractFromResume)).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the thrown error has no message', async () => {
    vi.mocked(extractLinks).mockRejectedValueOnce({});

    renderSection();
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    expect(await screen.findByText('Could not import this resume. Try again.')).toBeTruthy();
  });
});

describe('ResumeImportSection — completion feedback', () => {
  const savedProfile: Partial<Profile> = {
    personal: {
      firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.test',
      phone: { countryCode: 'US', callingCode: '+1', number: '' },
    },
    documents: { cv: { file: { name: 'resume.pdf', size: 1024, base64: btoa('%PDF-1.4 fake') } } },
  };

  it('closes with a toast without saving an identical resume', async () => {
    vi.mocked(extractFromResume).mockReset().mockResolvedValue({ personal: savedProfile.personal });
    const { onClose, onSave, onReplace } = renderSection(savedProfile);
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    expect(await screen.findByText('No changes to import.')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'No Changes Found' })).toBeNull();
  });

  it('still offers review when only the attached resume changes', async () => {
    vi.mocked(extractFromResume).mockReset().mockResolvedValue({ personal: savedProfile.personal });
    const { onClose } = renderSection(savedProfile);
    await screen.findByText(/Drop your resume here/);
    await selectFile(new File(['%PDF-1.4 updated'], 'resume.pdf', { type: 'application/pdf' }));
    fireEvent.click(screen.getByText('Analyze Resume'));

    expect(await screen.findByRole('heading', { name: 'Import Resume' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Review Changes' })).toBeTruthy();
  });

  it('waits for saving before closing with the saved-detail count', async () => {
    vi.mocked(extractFromResume).mockReset().mockResolvedValue({});
    let finish!: () => void;
    const onSave = vi.fn().mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const { onClose } = renderSection({}, onSave);
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));
    fireEvent.click(await screen.findByRole('button', { name: 'Import All' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/Resume imported/)).toBeNull();
    await act(async () => { finish(); });
    expect(await screen.findByText('Resume imported. 1 detail saved.')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('closes after replacement with a plural saved-detail count', async () => {
    vi.mocked(extractFromResume).mockReset().mockResolvedValue({
      personal: { ...savedProfile.personal!, firstName: 'Jordan', lastName: 'Lee', email: 'jordan@example.test' },
    });
    const { onClose, onSave, onReplace } = renderSection({
      personal: savedProfile.personal,
    });
    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));
    fireEvent.click(await screen.findByRole('radio', { name: /Replace profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace Profile' }));

    expect(await screen.findByText('Resume imported. 4 details saved.')).toBeTruthy();
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ResumeImportSection — CV invariant on save', () => {
  it('adds the resume file without dropping an existing documents.cv.url', async () => {
    vi.mocked(extractFromResume).mockReset().mockResolvedValue({});
    const { onSave } = renderSection({ documents: { cv: { url: 'https://example.com/old-cv.pdf' } } });

    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    await screen.findByRole('heading', { name: 'Import Resume' }, { timeout: 12000 });
    fireEvent.click(screen.getByText('Import All'));

    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 12000 });
    const saved = onSave.mock.calls[0][0];
    expect(saved.documents.cv.url).toBe('https://example.com/old-cv.pdf');
    expect(saved.documents.cv.file).toEqual(expect.objectContaining({ name: 'resume.pdf' }));
  }, 20000);

  it('checks the selected file size again before saving', async () => {
    vi.mocked(extractFromResume).mockReset().mockResolvedValue({});
    const { onSave } = renderSection();
    const file = pdfFile();
    let size = 1024;
    Object.defineProperty(file, 'size', { get: () => size });

    await screen.findByText(/Drop your resume here/);
    await selectFile(file);
    fireEvent.click(screen.getByText('Analyze Resume'));
    await screen.findByRole('heading', { name: 'Import Resume' });

    size = 5 * 1024 * 1024;
    fireEvent.click(screen.getByText('Import All'));

    expect(await screen.findByText('File exceeds 4 MB limit (5.0 MB)')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Import Resume' })).toBeTruthy();
  });

  it('shows a toast and stays on the review screen when onSave rejects', async () => {
    vi.mocked(extractFromResume).mockReset().mockResolvedValue({});
    const onSave = vi.fn().mockRejectedValue(new Error('quota exceeded'));
    const { onClose } = renderSection({}, onSave);

    await screen.findByText(/Drop your resume here/);
    await selectFile(pdfFile());
    fireEvent.click(screen.getByText('Analyze Resume'));

    await screen.findByRole('heading', { name: 'Import Resume' }, { timeout: 12000 });
    fireEvent.click(screen.getByText('Import All'));

    expect(await screen.findByText('Could not save the imported details. Try again.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/Resume imported/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Import Resume' })).toBeTruthy();
  }, 20000);
});


it('shows the Settings route when the key cannot be loaded instead of remaining blank', async () => {
  vi.mocked(getGeminiApiKey).mockRejectedValueOnce(new Error('Storage unavailable'));
  renderSection();
  expect(await screen.findByText('Could not load your API key or model.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Go to Settings/ })).toBeTruthy();
});


it('ignores a late response from an extraction that was cancelled before a new run', async () => {
  let finishOld!: (profile: Partial<Profile>) => void;
  vi.mocked(extractFromResume).mockReset()
    .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockImplementationOnce(() => new Promise(() => {}));
  renderSection();
  await screen.findByText(/Drop your resume here/);
  await selectFile(pdfFile());
  fireEvent.click(screen.getByText('Analyze Resume'));
  await waitFor(() => expect(extractFromResume).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByText('Analyze Resume'));
  await waitFor(() => expect(extractFromResume).toHaveBeenCalledTimes(2));
  await act(async () => { finishOld({}); });
  expect(screen.getByText('Analyzing Resume')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Import Resume' })).toBeNull();
});

it('shows the active model and the reason for fallback', async () => {
  vi.mocked(extractFromResume).mockReset().mockImplementation(
    (_key, _model, _data, _mime, _profile, _signal, _links, onAttempt) => {
      onAttempt?.({ model: 'gemini-3.8-flash', reason: 'timeout' });
      return new Promise(() => {});
    },
  );
  renderSection();
  await screen.findByText(/Drop your resume here/);
  await selectFile(pdfFile());
  fireEvent.click(screen.getByText('Analyze Resume'));
  const reason = await screen.findByText('The previous model took too long.');
  expect(screen.getByText('Trying Gemini 3.8 Flash.').parentElement).toBe(reason.parentElement);
  expect(reason.parentElement?.className).toContain('text-amber-700');
});

it('closes the import without saving when Keep Current is chosen', async () => {
  vi.mocked(extractFromResume).mockReset().mockResolvedValue({ professional: { summary: 'Incoming' } });
  const { onClose, onSave } = renderSection();
  await screen.findByText(/Drop your resume here/);
  await selectFile(pdfFile());
  fireEvent.click(screen.getByText('Analyze Resume'));
  fireEvent.click(await screen.findByText('Keep Current'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.queryByText('Analyze Resume')).toBeNull();
});

it('imports entries with missing dates without an extra warning', async () => {
  vi.mocked(extractFromResume).mockReset().mockResolvedValue({ education: [{
    institution: 'Example University', degree: 'BSc', fieldOfStudy: 'Computing', startDate: '',
  }] });
  const { onSave } = renderSection();
  await screen.findByText(/Drop your resume here/);
  await selectFile(pdfFile());
  fireEvent.click(screen.getByText('Analyze Resume'));
  await screen.findByRole('heading', { name: 'Import Resume' });
  expect(screen.queryByText('Missing dates')).toBeNull();
  expect(screen.queryByText(/invalid item/)).toBeNull();
  fireEvent.click(screen.getByText('Review Changes'));
  expect(screen.getByRole('heading', { name: 'Review Resume' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Import Resume' })).toBeNull();
  expect(screen.getByText('Select the details to save to your profile.')).toBeTruthy();
  expect(screen.queryByText('Missing dates')).toBeNull();
  expect(screen.queryByText(/invalid item/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Import Selected/ }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0].education[0]).toMatchObject({ institution: 'Example University', startDate: '' });
});

it('shows an animated active step without routine model narration', async () => {
  vi.mocked(extractFromResume).mockReset().mockImplementation(
    (_key, _model, _data, _mime, _profile, _signal, _links, onAttempt) => {
      onAttempt?.({ model: 'gemini-3.5-flash-lite' });
      return new Promise(() => {});
    },
  );
  renderSection();
  await screen.findByText(/Drop your resume here/);
  await selectFile(pdfFile());
  fireEvent.click(screen.getByText('Analyze Resume'));
  const active = await screen.findByText('Analyzing resume…');
  await waitFor(() => expect(active.parentElement?.querySelector('.animate-spin')).toBeTruthy());
  expect(screen.queryByText(/^Using Gemini/)).toBeNull();
});

it('blocks renamed text locally before sending a provider request and offers another file', async () => {
  const real = await vi.importActual<typeof import('@/src/resume-ai/validateResumeFile')>(
    '@/src/resume-ai/validateResumeFile',
  );
  vi.mocked(validateResumeFile).mockImplementationOnce(real.validateResumeFile);
  vi.mocked(extractFromResume).mockReset();
  const { onSave } = renderSection();
  await screen.findByText(/Drop your resume here/);
  await selectFile(new File(['not a PDF'], 'renamed.pdf', { type: 'application/pdf' }));
  fireEvent.click(screen.getByText('Analyze Resume'));
  await screen.findByText('Could not read this file. Choose a valid PDF or DOCX.');
  expect(extractFromResume).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText(/Drop your resume here/)).toBeTruthy();
  expect(screen.queryByText('renamed.pdf')).toBeNull();
  expect((screen.getByRole('button', { name: 'Analyze Resume' }) as HTMLButtonElement).disabled).toBe(true);
});
it('stops a non-resume document without a review or save action', async () => {
  vi.mocked(extractFromResume)
    .mockReset()
    .mockRejectedValue({
      code: 'not_resume',
      message: 'This document doesn’t appear to be a resume.',
    });
  const { onSave } = renderSection();
  await screen.findByText(/Drop your resume here/);
  await selectFile(pdfFile());
  fireEvent.click(screen.getByText('Analyze Resume'));
  await screen.findByText('This document doesn’t appear to be a resume.');
  expect(screen.queryByText('Try again')).toBeNull();
  expect(screen.queryByText('Review Changes')).toBeNull();
  expect(onSave).not.toHaveBeenCalled();
});
it('requires confirmation for uncertain documents, then reviews the existing extraction without another request', async () => {
  vi.mocked(extractFromResume)
    .mockReset()
    .mockImplementation(async (...args) => {
      args[8]?.('uncertain');
      return { personal: { firstName: 'Alex' } } as Partial<Profile>;
    });
  const { onSave } = renderSection();
  await screen.findByText(/Drop your resume here/);
  await selectFile(pdfFile());
  fireEvent.click(screen.getByText('Analyze Resume'));
  const notice = await screen.findByRole('dialog', { name: 'Check Document' });
  expect(document.activeElement).toBe(notice);
  expect(screen.queryByText('Import All')).toBeNull();
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Review' }));
  await screen.findByRole('heading', { name: 'Import Resume' });
  fireEvent.click(screen.getByText('Review Changes'));
  expect(screen.getByText('Alex')).toBeTruthy();
  expect(extractFromResume).toHaveBeenCalledOnce();
});
it('clears uncertain extraction when choosing another file', async () => {
  vi.mocked(extractFromResume)
    .mockReset()
    .mockImplementationOnce(async (...args) => {
      args[8]?.('uncertain');
      return { personal: { firstName: 'Alex' } } as Partial<Profile>;
    })
    .mockImplementationOnce(async (...args) => {
      args[8]?.('resume');
      return { personal: { firstName: 'Jane' } } as Partial<Profile>;
    });
  renderSection();
  await screen.findByText(/Drop your resume here/);
  await selectFile(pdfFile('first.pdf'));
  fireEvent.click(screen.getByText('Analyze Resume'));
  fireEvent.click(await screen.findByRole('button', { name: 'Choose Another File' }));
  expect(screen.queryByText('first.pdf')).toBeNull();
  await selectFile(pdfFile('second.pdf'));
  fireEvent.click(screen.getByText('Analyze Resume'));
  await screen.findByRole('heading', { name: 'Import Resume' });
  fireEvent.click(screen.getByText('Review Changes'));
  expect(screen.getByText('Jane')).toBeTruthy();
  expect(screen.queryByText('Alex')).toBeNull();
  expect(extractFromResume).toHaveBeenCalledTimes(2);
});
