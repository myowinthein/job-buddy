import { documentFileSizeError } from '@/src/utils/documentLimits';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_XML_BYTES = 8 * 1024 * 1024;
const invalid = (message = 'Unreadable file. Choose a valid PDF or DOCX.') =>
  Object.assign(new Error(message), { code: 'invalid_file' });

export function resumeMimeType(file: Pick<File, 'name' | 'type'>): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return PDF;
  if (name.endsWith('.docx')) return DOCX;
  if (file.type === PDF || file.type === DOCX) return file.type;
  throw invalid('Only PDF and DOCX files are supported.');
}

function xml(bytes: Uint8Array): XMLDocument {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : 'utf-8';
  const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw invalid();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw invalid();
  return doc;
}

async function validateDocx(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw invalid();
  const { unzipSync } = await import('fflate');
  const readParts = (names: string[]) => {
    let entries = 0;
    return unzipSync(bytes, {
      filter: (entry) => {
        if (++entries > 2048) throw invalid();
        if (!names.includes(entry.name)) return false;
        if (entry.originalSize > MAX_XML_BYTES)
          throw invalid('This DOCX is too complex. Export it as PDF.');
        return true;
      },
    });
  };
  const metadata = readParts(['[Content_Types].xml', '_rels/.rels']);
  if (!metadata['[Content_Types].xml'] || !metadata['_rels/.rels']) throw invalid();
  const relationships = xml(metadata['_rels/.rels']);
  const relationship = Array.from(relationships.getElementsByTagNameNS('*', 'Relationship')).find(
    (element) => element.getAttribute('Type')?.endsWith('/officeDocument'),
  );
  const target = relationship?.getAttribute('Target');
  if (
    !target ||
    relationship?.getAttribute('TargetMode') === 'External' ||
    /^[a-z]+:/i.test(target)
  )
    throw invalid();
  const path = decodeURIComponent(new URL(target, 'https://docx.invalid/').pathname.slice(1));
  const contentTypes = xml(metadata['[Content_Types].xml']);
  const type = Array.from(contentTypes.getElementsByTagNameNS('*', 'Override'))
    .find((element) => decodeURIComponent(element.getAttribute('PartName') ?? '') === `/${path}`)
    ?.getAttribute('ContentType');
  if (type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')
    throw invalid();
  const main = readParts([path])[path];
  if (!main) throw invalid();
  const document = xml(main);
  const namespace = document.documentElement.namespaceURI;
  if (
    document.documentElement.localName !== 'document' ||
    ![
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'http://purl.oclc.org/ooxml/wordprocessingml/main',
    ].includes(namespace ?? '') ||
    !document.getElementsByTagNameNS(namespace, 'body').length
  )
    throw invalid();
}

/** Inspect local bytes before any provider request. Text content is not a format requirement. */
export async function validateResumeFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const sizeError = documentFileSizeError(Math.max(file.size, bytes.byteLength));
  if (sizeError) throw invalid(sizeError);
  if (!file.size || !bytes.length)
    throw invalid('This file is empty. Choose a PDF or DOCX resume.');
  const mime = resumeMimeType(file);
  if (mime === DOCX) {
    try {
      await validateDocx(bytes);
    } catch (error) {
      if ((error as { code?: string }).code === 'invalid_file') throw error;
      throw invalid();
    }
    signal?.throwIfAborted();
    return;
  }
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw invalid();
  const pdfjs = await import('pdfjs-dist');
  signal?.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const abort = () => {
    void task.destroy().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const doc = await task.promise;
    signal?.throwIfAborted();
    if (doc.numPages < 1) throw invalid();
    await doc.getPage(1);
    signal?.throwIfAborted();
  } catch (error) {
    signal?.throwIfAborted();
    if ((error as { name?: string }).name === 'PasswordException')
      throw invalid('This PDF is locked. Upload an unlocked copy.');
    throw invalid();
  } finally {
    signal?.removeEventListener('abort', abort);
    await task.destroy().catch(() => {});
  }
}
