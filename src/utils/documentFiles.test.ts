// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentFileBlob, downloadDocumentFile, viewDocumentPdf } from './documentFiles';
import type { DocumentFile } from '@/src/types/profile';

const pdf: DocumentFile = {
  name: 'resume.pdf',
  size: 9,
  base64: 'data:application/pdf;base64,JVBERi0xLjcK',
};
let clicked: { href: string; download: string; target: string; rel: string }[];
let blobs: Blob[];
const revoke = vi.fn();

beforeEach(() => {
  clicked = [];
  blobs = [];
  vi.useFakeTimers();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download, target: this.target, rel: this.rel });
  });
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob);
        return `blob:test-${blobs.length}`;
      });
      static revokeObjectURL = revoke;
    },
  );
});

afterEach(() => {
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  if (vi.isFakeTimers()) vi.runAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  revoke.mockClear();
});

const read = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

describe('stored document actions', () => {
  it('reconstructs the original bytes and chooses a safe MIME from the filename', async () => {
    vi.useRealTimers();
    const blob = documentFileBlob({ ...pdf, base64: 'data:text/html;base64,JVBERi0xLjcK' });
    expect(blob.type).toBe('application/pdf');
    expect(await read(blob)).toBe(pdf.base64);
  });

  it.each([
    ['letter.doc', 'application/msword'],
    ['letter.DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('downloads %s with its original name and bytes', (name, mime) => {
    downloadDocumentFile({
      name,
      size: 4,
      base64: 'data:application/octet-stream;base64,dGVzdA==',
    });
    expect(blobs[0].type).toBe(mime);
    expect(blobs[0].size).toBe(4);
    expect(clicked[0]).toMatchObject({ download: name, target: '' });
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(revoke).toHaveBeenCalledWith('blob:test-1');
  });

  it('opens a PDF in a separate tab with no opener and reuses its URL until page exit', () => {
    viewDocumentPdf(pdf);
    viewDocumentPdf(pdf);
    expect(blobs).toHaveLength(1);
    expect(clicked).toEqual(
      Array(2).fill({
        href: 'blob:test-1',
        download: '',
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
    );
    vi.advanceTimersByTime(60_000);
    expect(revoke).not.toHaveBeenCalled();
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    expect(revoke).not.toHaveBeenCalled();
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    expect(revoke).toHaveBeenCalledWith('blob:test-1');
  });

  it('keeps a downloaded PDF separate from the PDF viewer resource', () => {
    viewDocumentPdf(pdf);
    downloadDocumentFile(pdf);
    vi.advanceTimersByTime(1_000);
    expect(revoke).toHaveBeenCalledWith('blob:test-2');
    expect(revoke).not.toHaveBeenCalledWith('blob:test-1');
    expect(clicked[1].download).toBe('resume.pdf');
  });

  it('supports older raw base64 and rejects broken data or unsupported preview types', () => {
    expect(documentFileBlob({ ...pdf, base64: 'JVBERi0xLjcK' }).size).toBe(9);
    for (const base64 of ['', 'data:application/pdf,not-base64', '%%%']) {
      expect(() => downloadDocumentFile({ ...pdf, base64 })).toThrow();
    }
    expect(() => viewDocumentPdf({ ...pdf, name: 'resume.docx' })).toThrow();
    expect(() => documentFileBlob({ ...pdf, name: 'resume.html' })).toThrow();
    expect(clicked).toHaveLength(0);
  });
});
