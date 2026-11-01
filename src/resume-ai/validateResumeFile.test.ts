// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync, unzipSync, strToU8 } from 'fflate';
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn() }));
import * as pdfjs from 'pdfjs-dist';
import { resumeMimeType, validateResumeFile } from './validateResumeFile';
const bytes = strToU8('%PDF-1.7\nfixture');
const file = (name: string, data = bytes) => ({ name, type: '', size: data.length });
const destroy = vi.fn().mockResolvedValue(undefined);
const page = vi.fn().mockResolvedValue({});
beforeEach(() => {
  destroy.mockClear();
  page.mockClear();
  vi.mocked(pdfjs.getDocument)
    .mockReset()
    .mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: page }),
      destroy,
    } as unknown as ReturnType<typeof pdfjs.getDocument>);
});
afterEach(() => vi.restoreAllMocks());
function docx(
  main = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>履歴書</w:t></w:r></w:p></w:body></w:document>',
  target = 'word/document.xml',
  contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
) {
  return zipSync({
    '[Content_Types].xml': strToU8(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${target}" ContentType="${contentType}"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"/></Relationships>`,
    ),
    [target]: strToU8(main),
  });
}
describe('local resume file validation', () => {
  it('accepts uppercase PDF names and image-only PDFs without requiring text', async () => {
    await validateResumeFile(file('RESUME.PDF'), bytes);
    expect(page).toHaveBeenCalledWith(1);
    expect(destroy).toHaveBeenCalledOnce();
    expect(resumeMimeType({ name: 'CV.DOCX', type: '' })).toContain('wordprocessingml');
  });
  it('rejects empty, oversized, and renamed files before loading PDF content', async () => {
    await expect(
      validateResumeFile(file('resume.pdf', new Uint8Array()), new Uint8Array()),
    ).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(
      validateResumeFile({ ...file('resume.pdf'), size: 4 * 1024 * 1024 + 1 }, bytes),
    ).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(
      validateResumeFile(file('resume.pdf', strToU8('plain text')), strToU8('plain text')),
    ).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(validateResumeFile(file('resume.docx'), bytes)).rejects.toMatchObject({
      code: 'invalid_file',
    });
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });
  it.each(['InvalidPDFException', 'PasswordException'])(
    'rejects %s and releases parser resources',
    async (name) => {
      vi.mocked(pdfjs.getDocument).mockReturnValue({
        promise: Promise.reject(Object.assign(new Error('unreadable'), { name })),
        destroy,
      } as unknown as ReturnType<typeof pdfjs.getDocument>);
      await expect(validateResumeFile(file('resume.pdf'), bytes)).rejects.toMatchObject({
        code: 'invalid_file',
        ...(name === 'PasswordException' && {
          message: 'This PDF is locked. Upload an unlocked copy.',
        }),
      });
      expect(destroy).toHaveBeenCalledOnce();
    },
  );
  it('rejects a PDF with no pages', async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue({
      promise: Promise.resolve({ numPages: 0 }),
      destroy,
    } as unknown as ReturnType<typeof pdfjs.getDocument>);
    await expect(validateResumeFile(file('resume.pdf'), bytes)).rejects.toMatchObject({
      code: 'invalid_file',
    });
  });
  it('cancels parser work without presenting an invalid-file error', async () => {
    const controller = new AbortController();
    page.mockImplementationOnce(async () => {
      controller.abort();
      return {};
    });
    await expect(
      validateResumeFile(file('resume.pdf'), bytes, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(destroy).toHaveBeenCalled();
  });
  it('accepts real DOCX structure with multilingual content or a nonstandard main-part path', async () => {
    for (const data of [docx(), docx(undefined, 'custom/main.xml')])
      await expect(validateResumeFile(file('resume.docx', data), data)).resolves.toBeUndefined();
  });
  it('accepts image-only DOCX documents', async () => {
    const data = docx(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:drawing/></w:r></w:p></w:body></w:document>',
    );
    await expect(validateResumeFile(file('scan.docx', data), data)).resolves.toBeUndefined();
  });
  it('rejects arbitrary ZIPs, broken archives, invalid XML, and non-Word packages', async () => {
    for (const data of [
      zipSync({ 'notes.txt': strToU8('not a document') }),
      docx().slice(0, 30),
      docx('<broken>'),
      docx('<document/>'),
      docx(
        undefined,
        'word/document.xml',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      ),
    ])
      await expect(validateResumeFile(file('resume.docx', data), data)).rejects.toMatchObject({
        code: 'invalid_file',
      });
  });
  it('does not expand excessive XML payloads', async () => {
    const data = docx('x'.repeat(8 * 1024 * 1024 + 1));
    await expect(validateResumeFile(file('resume.docx', data), data)).rejects.toMatchObject({
      code: 'invalid_file',
      message: expect.stringContaining('too complex'),
    });
  });
  it('rejects XML entities and external main-document references', async () => {
    const data = docx(
      '<!DOCTYPE doc [<!ENTITY x SYSTEM "https://example.com/private">]><doc>&x;</doc>',
    );
    await expect(validateResumeFile(file('resume.docx', data), data)).rejects.toMatchObject({
      code: 'invalid_file',
    });
    const external = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      '_rels/.rels': strToU8(
        '<Relationships><Relationship Type="example/officeDocument" TargetMode="External" Target="https://example.com/resume.xml"/></Relationships>',
      ),
    });
    await expect(validateResumeFile(file('resume.docx', external), external)).rejects.toMatchObject(
      { code: 'invalid_file' },
    );
  });
});

it('accepts UTF-16 Word XML with a byte-order mark', async () => {
  const parts = unzipSync(docx());
  const source = new TextDecoder().decode(parts['word/document.xml']);
  const utf16 = new Uint8Array(2 + source.length * 2);
  utf16.set([0xff, 0xfe]);
  for (let i = 0; i < source.length; i++) {
    utf16[2 + i * 2] = source.charCodeAt(i) & 0xff;
    utf16[3 + i * 2] = source.charCodeAt(i) >> 8;
  }
  parts['word/document.xml'] = utf16;
  const data = zipSync(parts);
  await expect(validateResumeFile(file('resume.docx', data), data)).resolves.toBeUndefined();
});
