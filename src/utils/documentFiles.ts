import type { DocumentFile } from '@/src/types/profile';

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Decode stored bytes locally; never navigate to an imported data URL or trust its MIME type. */
export function documentFileBlob(file: DocumentFile): Blob {
  const extension = /\.(pdf|docx?)$/i.exec(file.name)?.[1].toLowerCase();
  const mime = extension ? MIME_TYPES[extension] : undefined;
  if (!mime) throw new Error('Unsupported document type');
  let payload = file.base64;
  if (payload.startsWith('data:')) {
    const match = /^data:[^,]*;base64,([\s\S]*)$/i.exec(payload);
    if (!match) throw new Error('Invalid document data');
    payload = match[1];
  }
  if (!payload.trim()) throw new Error('Missing document data');
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function clickFileLink(url: string, filename?: string) {
  const link = document.createElement('a');
  link.href = url;
  link.hidden = true;
  if (filename !== undefined) link.download = filename;
  else {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
}

// Open PDFs must stay readable when the user navigates to another editor section.
// Reuse their URLs until the options document closes, rather than revoking on a
// component unmount or an arbitrary timer while the viewer may still need them.
const pdfUrls = new Map<DocumentFile, string>();
function releasePdfUrls(event: PageTransitionEvent) {
  if (event.persisted) return;
  for (const url of pdfUrls.values()) URL.revokeObjectURL(url);
  pdfUrls.clear();
  window.removeEventListener('pagehide', releasePdfUrls);
}

export function viewDocumentPdf(file: DocumentFile) {
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Only PDFs can be viewed');
  let url = pdfUrls.get(file);
  if (!url) {
    url = URL.createObjectURL(documentFileBlob(file));
    pdfUrls.set(file, url);
    window.addEventListener('pagehide', releasePdfUrls);
  }
  clickFileLink(url);
}

export function downloadDocumentFile(file: DocumentFile) {
  const url = URL.createObjectURL(documentFileBlob(file));
  try {
    clickFileLink(url, file.name);
  } finally {
    // Let the browser start reading the download before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
