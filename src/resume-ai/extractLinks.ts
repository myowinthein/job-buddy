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

    interface PdfAnnotation { subtype?: unknown; url?: unknown }

    // Each page's annotation extraction is independent — parallelize instead
    // of awaiting one page at a time, to reduce latency on multi-page resumes.
    const pageAnnotations = await Promise.all(
      Array.from({ length: pdfDoc.numPages }, async (_, i) => {
        const pdfPage = await pdfDoc.getPage(i + 1);
        return (await pdfPage.getAnnotations()) as PdfAnnotation[];
      }),
    );
    for (const annotations of pageAnnotations) {
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
