import * as pdfjs from 'pdfjs-dist';

// Vite resolves this to the worker file URL at build time so it is bundled
// alongside the extension and works without external network access.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

// Extracts hyperlink URLs from the annotation layer of a PDF file.
// Returns [] for non-PDF files and on any error — never throws.
export async function extractLinks(file: File): Promise<string[]> {
  const isPdf =
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) return [];

  try {
    const buffer = await file.arrayBuffer();
    const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const seen   = new Set<string>();

    for (let page = 1; page <= pdfDoc.numPages; page++) {
      const pdfPage     = await pdfDoc.getPage(page);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const annotations = await pdfPage.getAnnotations() as any[];
      for (const ann of annotations) {
        if (ann.subtype === 'Link' && typeof ann.url === 'string' && ann.url) {
          seen.add(ann.url);
        }
      }
    }

    return Array.from(seen);
  } catch {
    return [];
  }
}
