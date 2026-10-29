import { useState, useRef, useEffect, type DragEvent } from 'react';
import { DOCUMENT_FILE_SIZE_LABEL, documentFileSizeError } from '@/src/utils/documentLimits';
import type { Profile, DocumentEntry, DocumentFile } from '@/src/types/profile';
import { useToast } from '@/src/components/ui/useToast';
import { FormField } from './shared/FormField';
import { saveSection } from './shared/saveSection';
import { fieldCls } from './shared/fieldCls';
import { SaveButton } from './shared/SaveButton';
import { useSectionDraft } from './shared/useSectionDraft';
import { isValidProfileUrl } from '@/src/utils/profileInputValidation';
import { withScheme } from '@/src/utils/url';

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}
interface DocState {
  url: string;
  file: DocumentFile | null;
  reading: boolean;
  dragOver: boolean;
  sizeError: string;
  typeError: string;
  readError: string;
  urlError: string;
}
function initDocState(entry?: DocumentEntry): DocState {
  return {
    url: entry?.url ?? '',
    file: entry?.file ?? null,
    reading: false,
    dragOver: false,
    sizeError: '',
    typeError: '',
    readError: '',
    urlError: '',
  };
}
const urlError = (value: string) =>
  value.trim() && !isValidProfileUrl(value) ? 'Enter a valid URL' : '';
function toEntry(state: DocState): DocumentEntry {
  return {
    ...(state.url.trim() ? { url: withScheme(state.url.trim()) } : {}),
    ...(state.file ? { file: state.file } : {}),
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
function DocUploader({
  id,
  label,
  state,
  onChange,
}: {
  id: string;
  label: string;
  state: DocState;
  onChange: (updates: Partial<DocState>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const handleFile = async (file: File) => {
    const current = ++generation.current;
    if (
      !['.pdf', '.doc', '.docx'].some((extension) => file.name.toLowerCase().endsWith(extension))
    ) {
      onChange({
        typeError: 'Only PDF and Word documents (.pdf, .doc, .docx) are supported',
        reading: false,
      });
      return;
    }
    const sizeError = documentFileSizeError(file.size);
    if (sizeError) {
      onChange({ sizeError, typeError: '', reading: false });
      return;
    }
    onChange({ reading: true, typeError: '', sizeError: '', readError: '' });
    try {
      const base64 = await fileToBase64(file);
      if (current === generation.current)
        onChange({ file: { name: file.name, size: file.size, base64 }, reading: false });
    } catch {
      if (current === generation.current)
        onChange({ readError: 'Could not read file. Please try again.', reading: false });
    }
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onChange({ dragOver: false });
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };
  return (
    <section
      aria-label={label}
      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-4"
    >
      <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-3">{label}</h3>
      <FormField label="Document URL" error={state.urlError}>
        <input
          id={`field-${id}`}
          type="url"
          className={fieldCls(state.urlError)}
          value={state.url}
          maxLength={2048}
          onChange={(event) => onChange({ url: event.target.value, urlError: '' })}
          onBlur={() => onChange({ urlError: urlError(state.url) })}
          placeholder="https://drive.google.com/file/..."
        />
      </FormField>
      {state.url && (
        <button
          type="button"
          className="text-xs text-red-600 dark:text-red-400 mb-3 hover:underline"
          onClick={() => onChange({ url: '', urlError: '' })}
        >
          Remove URL
        </button>
      )}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          onChange({ dragOver: true });
        }}
        onDragLeave={() => onChange({ dragOver: false })}
        onDrop={drop}
        className={`border-2 border-dashed rounded-lg p-4 ${state.dragOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-300 dark:border-gray-600'}`}
      >
        {state.file && (
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 break-all">
              {state.file.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {(state.file.size / 1024).toFixed(1)} KB
            </p>
            <button
              type="button"
              className="text-xs text-red-600 dark:text-red-400 hover:underline"
              onClick={() => {
                generation.current++;
                onChange({ file: null, reading: false, readError: '' });
              }}
            >
              Remove file
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={state.reading}
          onClick={() => inputRef.current?.click()}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {state.reading ? 'Reading file…' : state.file ? 'Replace file' : 'Upload file'}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Or drop a PDF or Word document here · max {DOCUMENT_FILE_SIZE_LABEL}. URL and file can be
          saved together.
        </p>
        <input
          ref={inputRef}
          aria-label={`Upload ${label}`}
          type="file"
          accept=".pdf,.doc,.docx"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleFile(file);
          }}
        />
      </div>
      {[state.sizeError, state.typeError, state.readError].filter(Boolean).map((error) => (
        <p key={error} role="alert" className="text-xs text-red-500 mt-2">
          {error}
        </p>
      ))}
    </section>
  );
}
export function DocumentsSection({ profile, onSave }: Props) {
  const [cv, setCv] = useState(() => initDocState(profile.documents?.cv));
  const [coverLetter, setCoverLetter] = useState(() =>
    initDocState(profile.documents?.coverLetter),
  );
  const coverRef = useRef<HTMLDetailsElement>(null);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const saveDraft = useSectionDraft({ cv: toEntry(cv), coverLetter: toEntry(coverLetter) }, onSave);
  const handleSave = async () => {
    const cvError = urlError(cv.url),
      coverError = urlError(coverLetter.url);
    setCv((value) => ({ ...value, urlError: cvError }));
    setCoverLetter((value) => ({ ...value, urlError: coverError }));
    if (coverError && coverRef.current) coverRef.current.open = true;
    if (cvError || coverError || cv.reading || coverLetter.reading) return;
    setSaving(true);
    const cover = toEntry(coverLetter);
    await saveSection(
      saveDraft,
      {
        documents: { cv: toEntry(cv), coverLetter: Object.keys(cover).length ? cover : undefined },
      },
      showToast,
      'Documents saved',
    );
    setSaving(false);
  };
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Documents</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Add a CV or cover letter as a URL, a file, or both. Each can be removed separately.
        </p>
      </div>
      <DocUploader
        id="cv"
        label="CV / Résumé"
        state={cv}
        onChange={(updates) => setCv((value) => ({ ...value, ...updates }))}
      />
      <details ref={coverRef} className="mb-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
          Cover letter · optional
          {coverLetter.file || coverLetter.url ? ' · details added' : ''}
        </summary>
        <DocUploader
          id="coverLetter"
          label="Cover letter"
          state={coverLetter}
          onChange={(updates) => setCoverLetter((value) => ({ ...value, ...updates }))}
        />
      </details>
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <SaveButton
          onClick={handleSave}
          saving={saving || cv.reading || coverLetter.reading}
          label="Save Documents"
        />
      </div>
    </div>
  );
}
