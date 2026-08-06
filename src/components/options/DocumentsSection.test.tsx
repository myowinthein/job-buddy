// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { DocumentsSection } from './DocumentsSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <DocumentsSection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

describe('DocumentsSection — toDocumentEntry: URL and file must never become mutually exclusive', () => {
  it('preserves both an existing URL and an existing file together on save', () => {
    const { onSave } = renderSection({
      documents: { cv: { url: 'https://example.com/cv.pdf', file: { name: 'cv.pdf', size: 1024, base64: 'abc' } } },
    });
    fireEvent.click(screen.getByText('Save Documents'));
    expect(onSave).toHaveBeenCalledWith({
      documents: expect.objectContaining({
        cv: { url: 'https://example.com/cv.pdf', file: { name: 'cv.pdf', size: 1024, base64: 'abc' } },
      }),
    });
  });

  it('adds a file to an existing URL rather than replacing it', async () => {
    const { onSave } = renderSection({ documents: { cv: { url: 'https://example.com/cv.pdf' } } });

    // Switch to the Upload tab (the URL stays in state — switching tabs does
    // not clear it) and simulate a file upload.
    fireEvent.click(screen.getByText('Upload'));
    const file = new File(['%PDF-1.4 fake content'], 'resume.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('resume.pdf')).toBeTruthy());

    fireEvent.click(screen.getByText('Save Documents'));
    expect(onSave).toHaveBeenCalledWith({
      documents: expect.objectContaining({
        cv: expect.objectContaining({ url: 'https://example.com/cv.pdf', file: expect.objectContaining({ name: 'resume.pdf' }) }),
      }),
    });
  });

  it('does not include a file field at all when only a URL is set (never mode is file)', () => {
    const { onSave } = renderSection({ documents: { cv: { url: 'https://example.com/cv.pdf' } } });
    fireEvent.click(screen.getByText('Save Documents'));
    const call = onSave.mock.calls[0][0];
    expect(call.documents.cv).toEqual({ url: 'https://example.com/cv.pdf' });
    expect('file' in call.documents.cv).toBe(false);
  });
});

describe('DocumentsSection — required-field and URL-format validation', () => {
  it('blocks save and shows an error when neither a URL nor a file is provided', () => {
    const { onSave } = renderSection({ documents: { cv: {} } });
    fireEvent.click(screen.getByText('Save Documents'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Provide a URL or upload a file')).toBeTruthy();
  });

  it('blocks save on an invalid URL', () => {
    const { onSave } = renderSection({ documents: { cv: {} } });
    fireEvent.change(screen.getByPlaceholderText('https://drive.google.com/file/...'), { target: { value: 'not a url' } });
    fireEvent.click(screen.getByText('Save Documents'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid URL')).toBeTruthy();
  });
});

describe('DocumentsSection — cover letter preservation', () => {
  it('preserves an existing cover letter unchanged even though the form does not expose it', () => {
    const { onSave } = renderSection({
      documents: {
        cv: { url: 'https://example.com/cv.pdf' },
        coverLetter: { url: 'https://example.com/cover.pdf' },
      },
    });
    fireEvent.click(screen.getByText('Save Documents'));
    expect(onSave).toHaveBeenCalledWith({
      documents: expect.objectContaining({ coverLetter: { url: 'https://example.com/cover.pdf' } }),
    });
  });
});
