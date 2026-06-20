import { useToast } from '@/src/components/ui/Toast';
import { useState, useRef, DragEvent } from 'react';
import type { Profile, DocumentEntry, DocumentFile } from '@/src/types/profile';
import { FormField } from './shared/FormField';

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
}

function initDocState(entry?: DocumentEntry): DocState {
  return {
    mode: entry?.file ? 'file' : 'url',
    url: entry?.url ?? '',
    file: entry?.file ?? null,
    dragOver: false,
    sizeError: '',
    urlError: '',
  };
}

function validateDocUrl(url: string, required: boolean, hasFile: boolean): string {
  if (!url.trim()) return (required && !hasFile) ? 'CV URL is required' : '';
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
  if (state.mode === 'file' && state.file) return { file: state.file };
  if (state.mode === 'url' && state.url) return { url: state.url };
  return {};
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
    });
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onChange({ dragOver: false });
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const urlCls = state.urlError
    ? 'w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </p>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => onChange({ mode: 'url' })}
            className={`px-3 py-1.5 ${state.mode === 'url' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} transition-colors`}
          >
            URL
          </button>
          <button
            type="button"
            onClick={() => onChange({ mode: 'file' })}
            className={`px-3 py-1.5 ${state.mode === 'file' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} transition-colors`}
          >
            Upload
          </button>
        </div>
      </div>

      {state.mode === 'url' ? (
        <FormField label="Document URL" error={state.urlError}>
          <input
            type="url"
            className={urlCls}
            value={state.url}
            onChange={(e) => onChange({ url: e.target.value, urlError: '' })}
            onBlur={(e) => onChange({ urlError: validateDocUrl(e.target.value, !!required, !!state.file) })}
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
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            {state.file ? (
              <div>
                <p className="text-sm font-medium text-gray-900">{state.file.name}</p>
                <p className="text-xs text-gray-500 mt-1">{formatBytes(state.file.size)}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onChange({ file: null }); }}
                  className="text-xs text-red-500 mt-2 hover:underline"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">Drag & drop a file here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">PDF, DOCX — max 4 MB</p>
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
            <p className="text-xs text-red-500 mt-1">{state.sizeError}</p>
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
    if (cv.mode === 'url') {
      const urlError = validateDocUrl(cv.url, true, !!cv.file);
      if (urlError) {
        setCv((s) => ({ ...s, urlError }));
        return;
      }
    }
    setSaving(true);
    await onSave({
      documents: {
        cv: toDocumentEntry(cv),
        // Preserve any existing cover letter data without showing it in the form
        coverLetter: profile.documents?.coverLetter,
      },
    }).then(() => showToast('success', 'Documents saved'))
      .catch(() => showToast('error', 'Failed to save. Please try again.'));
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Documents</h2>
        <p className="text-sm text-gray-500 mt-1">Upload or link your CV / Résumé — max 4 MB</p>
      </div>

      <DocUploader label="CV / Résumé" required state={cv} onChange={(u) => setCv((s) => ({ ...s, ...u }))} />

      <div className="mt-2 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Documents'}
        </button>
      </div>
    </div>
  );
}
