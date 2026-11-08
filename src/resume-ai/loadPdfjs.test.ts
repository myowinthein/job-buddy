import { expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn() }));

import * as pdfjs from 'pdfjs-dist';
import { loadPdfjs } from './loadPdfjs';

it('points pdf.js at the bundled worker', async () => {
  await loadPdfjs();
  expect(pdfjs.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs$/);
});
