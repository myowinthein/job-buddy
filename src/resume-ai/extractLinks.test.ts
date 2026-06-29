import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must mock pdfjs before the module under test is imported, as it runs
// GlobalWorkerOptions assignment at module load time.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

import { extractLinks } from './extractLinks';
import * as pdfjs from 'pdfjs-dist';

const getDocumentMock = vi.mocked(pdfjs.getDocument);

function makeFile(name: string, type: string): File {
  return new File(['%PDF-1.4'], name, { type });
}

function mockPdf(annotationsByPage: Array<Array<{ subtype: string; url?: unknown }>>) {
  getDocumentMock.mockReturnValue({
    promise: Promise.resolve({
      numPages: annotationsByPage.length,
      getPage: vi.fn().mockImplementation((n: number) =>
        Promise.resolve({
          getAnnotations: vi.fn().mockResolvedValue(annotationsByPage[n - 1] ?? []),
        }),
      ),
    }),
  } as ReturnType<typeof pdfjs.getDocument>);
}

beforeEach(() => getDocumentMock.mockReset());

describe('extractLinks', () => {
  it('returns [] for non-PDF files by MIME type', async () => {
    const file = makeFile('resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(await extractLinks(file)).toEqual([]);
    expect(getDocumentMock).not.toHaveBeenCalled();
  });

  it('detects PDF by .pdf extension even with blank MIME type', async () => {
    mockPdf([[]]);
    const file = makeFile('resume.pdf', '');
    expect(await extractLinks(file)).toEqual([]);
    expect(getDocumentMock).toHaveBeenCalled();
  });

  it('extracts link URLs from annotations', async () => {
    mockPdf([[
      { subtype: 'Link', url: 'https://linkedin.com/in/test' },
      { subtype: 'Link', url: 'https://github.com/test' },
    ]]);
    const file = makeFile('cv.pdf', 'application/pdf');
    expect(await extractLinks(file)).toEqual([
      'https://linkedin.com/in/test',
      'https://github.com/test',
    ]);
  });

  it('deduplicates URLs across pages', async () => {
    mockPdf([
      [{ subtype: 'Link', url: 'https://linkedin.com/in/me' }],
      [{ subtype: 'Link', url: 'https://linkedin.com/in/me' }],
    ]);
    const file = makeFile('cv.pdf', 'application/pdf');
    expect(await extractLinks(file)).toEqual(['https://linkedin.com/in/me']);
  });

  it('skips non-Link annotations', async () => {
    mockPdf([[
      { subtype: 'Text',  url: 'https://ignored.com' },
      { subtype: 'Link',  url: 'https://kept.com' },
    ]]);
    const file = makeFile('cv.pdf', 'application/pdf');
    expect(await extractLinks(file)).toEqual(['https://kept.com']);
  });

  it('skips Link annotations with empty or missing url', async () => {
    mockPdf([[
      { subtype: 'Link', url: '' },
      { subtype: 'Link', url: null },
      { subtype: 'Link' },
    ]]);
    const file = makeFile('cv.pdf', 'application/pdf');
    expect(await extractLinks(file)).toEqual([]);
  });

  it('returns [] and never throws when pdfjs rejects', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.reject(new Error('corrupt PDF')),
    } as ReturnType<typeof pdfjs.getDocument>);
    const file = makeFile('bad.pdf', 'application/pdf');
    await expect(extractLinks(file)).resolves.toEqual([]);
  });

  it('returns [] for a PDF with no annotations', async () => {
    mockPdf([[]]);
    const file = makeFile('clean.pdf', 'application/pdf');
    expect(await extractLinks(file)).toEqual([]);
  });
});
