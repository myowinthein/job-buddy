import { useToast } from '@/src/components/ui/useToast';
import { useState, useRef, DragEvent } from 'react';
import type { Profile, DocumentEntry, DocumentFile } from '@/src/types/profile';
import { FormField } from './shared/FormField';
import { saveSection } from './shared/saveSection';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024;

type InputMode = 'url' | 'file';

interface DocState {
  mode: InputMode;
  url: string;
  file: DocumentFile | null;
  dragOver: boolean;
  sizeError: string;
  urlError: string;
  requiredError: string;
}

function initDocState(entry?: DocumentEntry): DocState {
  return {
    mode: entry?.file ? 'file' : 'url',
    url: entry?.url ?? '',
    file: entry?.file ?? null,
    dragOver: false,
    sizeError: '',
    urlError: '',
    requiredError: '',
  };
}

// URL format check only — runs when the URL field has a value.
// "At least one of URL or upload" is enforced separately in handleSave.
function validateDocUrlFormat(url: string): string {
  if (!url.trim()) return '';
  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  try { return new URL(normalized).hostname.includes('.') ? '' : 'Enter a valid URL'; }
  catch { return 'Enter a valid URL'; }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toDocumentEntry(state: DocState): DocumentEntry {
  const entry: DocumentEntry = {};
  // Always persist the URL if one is set so it survives an upload/remove-file workflow.
  if (state.url.trim()) entry.url = state.url.trim();
  // Persist the file only when in file mode and a file is present.
  if (state.mode === 'file' && state.file) entry.file = state.file;
  return entry;
}

interface DocUploaderProps {
  label: string;
  required?: boolean;
  state: DocState;
  onChange: (updates: Partial<DocState>) => void;
}

function DocUploader({ label, required, state, onChange }: DocUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      onChange({ sizeError: `File exceeds 4 MB limit (${formatBytes(file.size)})` });
      return;
    }
    const base64 = await fileToBase64(file);
    onChange({
      file: { name: file.name, size: file.size, base64 },
      sizeError: '',
      requiredError: '',
    });
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onChange({ dragOver: false });
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const urlCls = state.urlError
    ? 'w-full px-3 py-2 border border-red-300 dark:border-red-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {label}
          {required && <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>}
        </p>
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => onChange({ mode: 'url', requiredError: '' })}
            className={`px-3 py-1.5 active:scale-95 ${state.mode === 'url' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} transition-colors`}
          >
            URL
          </button>
          <button
            type="button"
            onClick={() => onChange({ mode: 'file', requiredError: '' })}
            className={`px-3 py-1.5 active:scale-95 ${state.mode === 'file' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} transition-colors`}
          >
            Upload
          </button>
        </div>
      </div>

      {state.requiredError && (
        <p className="text-xs text-red-500 dark:text-red-400 mb-2">{state.requiredError}</p>
      )}

      {state.mode === 'url' ? (
        <FormField label="Document URL" error={state.urlError}>
          <input
            type="url"
            className={urlCls}
            value={state.url}
            onChange={(e) => onChange({ url: e.target.value, urlError: '', requiredError: '' })}
            onBlur={(e) => onChange({ urlError: validateDocUrlFormat(e.target.value) })}
            placeholder="https://drive.google.com/file/..."
            maxLength={255}
          />
        </FormField>
      ) : (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); onChange({ dragOver: true }); }}
            onDragLeave={() => onChange({ dragOver: false })}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              state.dragOver
                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {state.file ? (
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{state.file.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatBytes(state.file.size)}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onChange({ file: null }); }}
                  className="text-xs text-red-500 dark:text-red-400 mt-2 hover:underline active:scale-95"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">Drag & drop a file here, or click to browse</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF, DOCX — max 4 MB</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {state.sizeError && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{state.sizeError}</p>
          )}
        </>
      )}
    </div>
  );
}

export function DocumentsSection({ profile, onSave }: Props) {
  const [cv, setCv] = useState<DocState>(initDocState(profile.documents?.cv));
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Rule: each document must have at least one of URL or uploaded file.
    const hasUrl  = !!cv.url.trim();
    const hasFile = !!cv.file;

    if (!hasUrl && !hasFile) {
      setCv((s) => ({ ...s, requiredError: 'Provide a URL or upload a file' }));
      return;
    }

    if (hasUrl) {
      const urlError = validateDocUrlFormat(cv.url);
      if (urlError) {
        setCv((s) => ({ ...s, urlError }));
        return;
      }
    }
    setSaving(true);
    await saveSection(onSave, {
      documents: {
        cv: toDocumentEntry(cv),
        // Preserve any existing cover letter data without showing it in the form
        coverLetter: profile.documents?.coverLetter,
      },
    }, showToast, 'Documents saved');
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Documents</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Upload or link your CV / Résumé — max 4 MB</p>
      </div>

      <DocUploader label="CV / Résumé" required state={cv} onChange={(u) => setCv((s) => ({ ...s, ...u }))} />

      <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Documents'}
        </button>
      </div>
    </div>
  );
}
