import { useState, useRef, useEffect } from 'react';
import type { DragEvent } from 'react';
import type { ExtractedResume } from '@/src/types/storage';
import { extractFromFile } from '@/src/resume/extractor';

interface Props {
  onClose:    () => void;
  onComplete: (data: ExtractedResume) => void;
}

type ImportState = 'idle' | 'processing' | 'done';
type StepStatus  = 'pending' | 'active' | 'done';

const STEPS = [
  'Detecting file format',
  'Extracting text content',
  'Matching to profile fields',
  'Preparing your data',
] as const;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const MAX_SIZE = 4 * 1024 * 1024;

export function ImportResumeDialog({ onClose, onComplete }: Props) {
  const [importState, setImportState] = useState<ImportState>('idle');
  const [steps, setSteps]             = useState<StepStatus[]>(['pending', 'pending', 'pending', 'pending']);
  const [dragOver, setDragOver]       = useState(false);
  const [validationError, setValidationError] = useState('');
  const [result, setResult]           = useState<ExtractedResume | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMounted    = useRef(true);

  // Reset on every (re)mount so React Strict Mode's intentional
  // unmount → remount cycle doesn't leave isMounted permanently false.
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const validate = (file: File): string => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      return 'Only PDF or DOCX files are supported';
    }
    if (file.size > MAX_SIZE) {
      return 'File is too large. Maximum size is 4MB';
    }
    return '';
  };

  const process = async (file: File) => {
    setImportState('processing');
    setSteps(['active', 'pending', 'pending', 'pending']);

    // Step 1 — 300 ms artificial delay runs in parallel with extraction
    const extractionPromise = extractFromFile(file);
    await delay(300);
    if (!isMounted.current) return;
    setSteps(['done', 'active', 'pending', 'pending']);

    // Step 2 — await the real extraction promise
    let extracted: ExtractedResume;
    try {
      extracted = await extractionPromise;
    } catch (err) {
      console.error('[Job Buddy] Resume extraction failed:', err);
      if (isMounted.current) {
        setImportState('idle');
        setValidationError('Could not read the file. Please try a different file.');
      }
      return;
    }
    if (!isMounted.current) return;
    setSteps(['done', 'done', 'active', 'pending']);

    // Step 3 — 400 ms
    await delay(400);
    if (!isMounted.current) return;
    setSteps(['done', 'done', 'done', 'active']);

    // Step 4 — 300 ms
    await delay(300);
    if (!isMounted.current) return;
    setSteps(['done', 'done', 'done', 'done']);
    setResult(extracted);
    setImportState('done');

    // Done state shown for 1 500 ms then auto-complete
    await delay(1500);
    if (!isMounted.current) return;
    onComplete(extracted);
    onClose();
  };

  const handleFile = (file: File) => {
    const err = validate(file);
    if (err) { setValidationError(err); return; }
    setValidationError('');
    process(file);
  };

  const handleDragOver  = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop      = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (importState === 'idle' && e.target === e.currentTarget) onClose();
  };

  // ── Step indicator ────────────────────────────────────────────────────────
  const StepIcon = ({ status }: { status: StepStatus }) => {
    if (status === 'done') {
      return (
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-3 h-3 text-green-600" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    }
    if (status === 'active') {
      return (
        <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      );
    }
    return (
      <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-300" />
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">

        {/* Close button — idle only */}
        {importState === 'idle' && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        )}

        {/* ── IDLE ───────────────────────────────────────────────────────── */}
        {importState === 'idle' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Import from Resume</h2>
            <p className="text-sm text-gray-500 mb-5">
              Upload your resume and we'll extract your data automatically.
            </p>

            {/* Upload zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-center mb-3">
                <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">Drop your resume here</p>
              <p className="text-xs text-gray-400 mb-4">PDF or DOCX · Max 4MB</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Choose File
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />

            {validationError && (
              <p className="mt-3 text-sm text-red-500">{validationError}</p>
            )}
          </>
        )}

        {/* ── PROCESSING ─────────────────────────────────────────────────── */}
        {importState === 'processing' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Reading your resume...</h2>
            <ul className="space-y-4">
              {STEPS.map((label, idx) => {
                const status = steps[idx] ?? 'pending';
                return (
                  <li key={idx} className="flex items-center gap-3">
                    <StepIcon status={status} />
                    <span className={`text-sm ${
                      status === 'active' ? 'text-blue-600 font-medium'
                      : status === 'done' ? 'text-gray-800'
                      : 'text-gray-400'
                    }`}>
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* ── DONE ───────────────────────────────────────────────────────── */}
        {importState === 'done' && result && (
          <div className="text-center py-4">
            <div className="flex justify-center mb-4">
              <span className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Done! Your resume data is ready.</h2>
            <p className="text-sm text-gray-500">
              Found {result.detectedFields.length} fields · {result.textChunks.length} text chunks
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
