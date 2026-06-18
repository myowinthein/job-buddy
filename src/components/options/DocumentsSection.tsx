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
}

function initDocState(entry?: DocumentEntry): DocState {
  return {
    mode: entry?.file ? 'file' : 'url',
    url: entry?.url ?? '',
    file: entry?.file ?? null,
    dragOver: false,
    sizeError: '',
  };
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

  const cls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

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
        <FormField label="Document URL">
          <input
            type="url"
            className={cls}
            value={state.url}
            onChange={(e) => onChange({ url: e.target.value })}
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
  const [coverLetter, setCoverLetter] = useState<DocState>(
    initDocState(profile.documents?.coverLetter),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      documents: {
        cv: toDocumentEntry(cv),
        coverLetter: (() => {
          const entry = toDocumentEntry(coverLetter);
          return Object.keys(entry).length ? entry : undefined;
        })(),
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Documents</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload or link your CV and cover letter — max 4 MB per file
        </p>
      </div>

      <DocUploader label="CV / Résumé" state={cv} onChange={(u) => setCv((s) => ({ ...s, ...u }))} />
      <DocUploader
        label="Cover Letter"
        state={coverLetter}
        onChange={(u) => setCoverLetter((s) => ({ ...s, ...u }))}
      />

      <div className="mt-2 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Documents'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
