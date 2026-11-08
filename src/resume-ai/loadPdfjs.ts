/** Loads pdf.js with its bundled worker, so no network access is needed. */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  // Vite resolves this to the worker file URL at build time.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;
  return pdfjs;
}
