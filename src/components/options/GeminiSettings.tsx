import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { checkApiKey, validateApiKey, KEY_ERROR_MESSAGES } from '@/src/resume-ai/gemini';
import {
  MODEL_DISPLAY_NAMES,
  GEMINI_MODEL_PRIORITY,
  type GeminiModel,
} from '@/src/resume-ai/types';
import {
  getGeminiSettings,
  saveGeminiSettings,
  clearGeminiSettings,
  type GeminiSettings as SavedSettings,
  type GeminiModelPreference,
} from '@/src/utils/storage';
import { useToast } from '@/src/components/ui/useToast';
import { fieldCls } from './shared/fieldCls';
import { SettingsDialog } from './shared/SettingsDialog';

const primary =
  'px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors';
const secondary =
  'px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors';
const danger =
  'px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 active:scale-95 transition-colors';
type Status =
  | 'loading'
  | 'empty'
  | 'saved'
  | 'checking'
  | 'ready'
  | 'saving'
  | 'removing'
  | 'error';
interface CheckedKey {
  apiKey: string;
  model: GeminiModel;
  preference: GeminiModelPreference;
  revision: string | null;
}
const storedStatus = (settings: SavedSettings): Status =>
  !settings.apiKey ? 'empty' : settings.verifiedAt && settings.model ? 'ready' : 'saved';

export function GeminiSettings({ resetInProgress = false }: { resetInProgress?: boolean }) {
  const { showToast } = useToast();
  const [saved, setSaved] = useState<SavedSettings | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [draft, setDraft] = useState('');
  const [checked, setChecked] = useState<CheckedKey | null>(null);
  const [editing, setEditing] = useState(false);
  const [preference, setPreference] = useState<GeminiModelPreference>('auto');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [keyInvalid, setKeyInvalid] = useState(false);
  const [removeDialog, setRemoveDialog] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const writing = useRef(0);
  const mounted = useRef(true);
  const keyInput = useRef<HTMLInputElement>(null);
  const keyAction = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<'input' | 'action' | null>(null);
  const configured = !!saved?.apiKey;
  const busy = ['checking', 'loading', 'saving', 'removing'].includes(status) || resetInProgress;
  const replacing = editing || !configured;

  useEffect(() => {
    mounted.current = true;
    async function load() {
      const id = ++sequence.current;
      request.current?.abort();
      try {
        const value = await getGeminiSettings();
        if (!mounted.current || id !== sequence.current) return;
        setSaved(value);
        setPreference(value.preference);
        setDraft('');
        setChecked(null);
        setEditing(false);
        setStatus(storedStatus(value));
        setError('');
        setKeyInvalid(false);
        setRemoveDialog(false);
        setRemoveError('');
      } catch {
        if (mounted.current && id === sequence.current) {
          setStatus('error');
          setError('Could not load AI settings. Please try again.');
        }
      }
    }
    void load();
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (
        area === 'local' &&
        !writing.current &&
        ['geminiApiKey', 'geminiModel', 'geminiSettingsMeta'].some((key) => key in changes)
      )
        void load();
    };
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(changed);
    return () => {
      mounted.current = false;
      request.current?.abort();
      if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(changed);
    };
  }, [loadAttempt]);
  useEffect(() => {
    if (resetInProgress) request.current?.abort();
  }, [resetInProgress]);
  useEffect(() => {
    if (removeDialog) return;
    if (editing || focusAfter.current === 'input') keyInput.current?.focus();
    else if (focusAfter.current === 'action') keyAction.current?.focus();
    focusAfter.current = null;
  }, [editing, configured, removeDialog]);

  function cancelEdit() {
    focusAfter.current = 'action';
    sequence.current++;
    request.current?.abort();
    setDraft('');
    setChecked(null);
    setEditing(false);
    setPreference(saved?.preference ?? 'auto');
    setStatus(saved ? storedStatus(saved) : 'empty');
    setError('');
    setKeyInvalid(false);
  }
  function changeDraft(value: string) {
    sequence.current++;
    request.current?.abort();
    setDraft(value);
    setChecked(null);
    setError('');
    setKeyInvalid(false);
    setStatus('empty');
  }
  async function commit(value: CheckedKey, current: () => boolean): Promise<boolean> {
    writing.current++;
    try {
      const updated = await saveGeminiSettings(
        value.apiKey,
        value.model,
        value.preference,
        value.revision,
        current,
      );
      if (!current()) return false;
      if (!updated) {
        const latest = await getGeminiSettings();
        if (!current()) return false;
        setSaved(latest);
        setPreference(latest.preference);
        setChecked(null);
        setStatus('error');
        setError('AI settings changed in another tab. Review them and try again.');
        return false;
      }
      setSaved(updated);
      setPreference(updated.preference);
      setStatus('ready');
      return true;
    } finally {
      writing.current--;
    }
  }

  async function checkKey(
    key: string,
    choice: GeminiModelPreference,
    mode: 'draft' | 'current' | 'model',
  ) {
    const trimmed = key.trim();
    if (
      !trimmed ||
      /\s/.test(trimmed) ||
      Array.from(trimmed).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      trimmed.length > 4096
    ) {
      setStatus('error');
      setError(
        !trimmed
          ? 'Enter your Gemini API key.'
          : 'Paste the API key only, without spaces or extra text.',
      );
      setKeyInvalid(true);
      keyInput.current?.focus();
      return;
    }
    if (!saved) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = ++sequence.current;
    const current = () => mounted.current && id === sequence.current && !controller.signal.aborted;
    setChecked(null);
    setStatus('checking');
    setError('');
    setKeyInvalid(false);
    try {
      const check = await checkApiKey(trimmed, controller.signal);
      if (!current()) return;
      if (check !== 'valid') {
        setStatus('error');
        setError(KEY_ERROR_MESSAGES[check]);
        setKeyInvalid(check === 'invalid');
        if (mode === 'model') setPreference(saved.preference);
        return;
      }
      const result = await validateApiKey(
        trimmed,
        controller.signal,
        mode === 'current' && saved.model ? saved.model : choice === 'auto' ? undefined : choice,
      );
      if (!current()) return;
      if (!result.valid || !result.model) {
        setStatus('error');
        setError(result.error ?? 'Could not check this model. Please try again.');
        setKeyInvalid(!!result.keyInvalid);
        if (mode === 'model') setPreference(saved.preference);
        return;
      }
      const value = {
        apiKey: trimmed,
        model: result.model,
        preference: choice,
        revision: saved.revision,
      };
      if (mode === 'draft') {
        setChecked(value);
        setStatus('ready');
      } else if (await commit(value, current)) {
        if (mode === 'model') showToast('success', 'AI model saved.');
      }
    } catch {
      if (current()) {
        setStatus('error');
        setError('Could not save AI settings. Please try again.');
        if (mode === 'model') setPreference(saved.preference);
      }
    } finally {
      if (mounted.current && id === sequence.current && controller.signal.aborted)
        setStatus(mode === 'draft' ? 'empty' : storedStatus(saved));
    }
  }
  async function saveCheckedKey() {
    // Saving never contacts Gemini. Editing either input invalidates this snapshot.
    if (!checked || checked.apiKey !== draft.trim() || checked.preference !== preference) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = ++sequence.current;
    const current = () => mounted.current && id === sequence.current && !controller.signal.aborted;
    setStatus('saving');
    setError('');
    try {
      if (await commit(checked, current)) {
        focusAfter.current = 'action';
        setChecked(null);
        setDraft('');
        setEditing(false);
        showToast('success', 'API key saved.');
      }
    } catch {
      if (current()) {
        setStatus('error');
        setError('Could not save AI settings. Please try again.');
      }
    } finally {
      if (mounted.current && id === sequence.current && controller.signal.aborted)
        setStatus(saved ? storedStatus(saved) : 'empty');
    }
  }
  async function removeKey() {
    sequence.current++;
    request.current?.abort();
    setStatus('removing');
    setRemoveError('');
    writing.current++;
    try {
      await clearGeminiSettings();
      const latest = await getGeminiSettings();
      if (!mounted.current) return;
      focusAfter.current = 'input';
      setSaved(latest);
      setChecked(null);
      setDraft('');
      setEditing(false);
      setPreference('auto');
      setKeyInvalid(false);
      setStatus('empty');
      setError('');
      setRemoveDialog(false);
      showToast('success', 'API key removed.');
    } catch {
      if (mounted.current) {
        setStatus(saved ? storedStatus(saved) : 'error');
        setRemoveError('Could not remove the API key. Please try again.');
      }
    } finally {
      writing.current--;
    }
  }

  const statusText =
    status === 'loading'
      ? 'Loading…'
      : status === 'checking'
        ? 'Checking…'
        : status === 'saving'
          ? 'Saving…'
          : status === 'removing'
            ? 'Removing…'
            : status === 'ready'
              ? 'Ready'
              : status === 'error'
                ? saved === null
                  ? 'Unavailable'
                  : configured && !replacing
                    ? 'Needs attention'
                    : ''
                : status === 'saved' && !replacing
                  ? 'Not checked'
                  : '';
  const statusIndicator = statusText ? (
    <span
      role="status"
      title={
        status === 'ready' && !replacing && saved?.verifiedAt
          ? `Last checked ${new Date(saved.verifiedAt).toLocaleString()}`
          : undefined
      }
      className={`inline-flex items-center gap-1.5 text-xs ${status === 'ready' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}
    >
      {['loading', 'checking', 'saving', 'removing'].includes(status) ? (
        <LoaderCircle aria-hidden="true" className="w-3 h-3 motion-safe:animate-spin" />
      ) : status === 'ready' ? (
        <Check aria-hidden="true" className="w-3 h-3" />
      ) : null}
      {statusText}
    </span>
  ) : null;
  return (
    <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">AI Features</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Enable AI-powered features using your own API key.
      </p>
      <form
        className="max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && replacing) {
            if (checked) void saveCheckedKey();
            else void checkKey(draft, preference, 'draft');
          }
        }}
      >
        {replacing ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label
                htmlFor="gemini-api-key"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Gemini API Key
              </label>
              {statusIndicator}
            </div>
            <input
              ref={keyInput}
              id="gemini-api-key"
              type="password"
              value={draft}
              onChange={(e) => changeDraft(e.target.value)}
              disabled={busy || !saved}
              placeholder="Paste your API key"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={keyInvalid || undefined}
              aria-describedby={`gemini-key-help${error ? ' gemini-key-error' : ''}`}
              className={fieldCls(keyInvalid ? error : undefined, busy || !saved)}
            />
            <p id="gemini-key-help" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Create a key in{' '}
              <a
                href="https://aistudio.google.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                Google AI Studio
              </a>
              . No payment required for the free tier.
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {statusIndicator}
            {(status === 'saved' || status === 'error') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void checkKey(saved?.apiKey ?? '', preference, 'current')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {status === 'error' ? 'Try Again' : 'Check Key'}
              </button>
            )}
          </div>
        )}
        {configured && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label
              htmlFor="gemini-model"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              AI Model
            </label>
            <select
              id="gemini-model"
              value={preference}
              disabled={busy}
              onChange={(e) => {
                const choice = e.target.value as GeminiModelPreference;
                sequence.current++;
                request.current?.abort();
                setChecked(null);
                setPreference(choice);
                setError('');
                if (replacing) setStatus('empty');
                else void checkKey(saved?.apiKey ?? '', choice, 'model');
              }}
              className={`${fieldCls(undefined, busy)} flex-1 min-w-44`}
            >
              <option value="auto">
                {saved?.model && !replacing
                  ? `Automatic · ${MODEL_DISPLAY_NAMES[saved.model]}`
                  : 'Automatic (recommended)'}
              </option>
              {GEMINI_MODEL_PRIORITY.map((model) => (
                <option key={model} value={model}>
                  {MODEL_DISPLAY_NAMES[model]}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && (
          <p
            id="gemini-key-error"
            role="alert"
            className="mt-2 text-xs text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {!saved ? (
            <button
              type="button"
              disabled={status === 'loading'}
              className={primary}
              onClick={() => {
                setStatus('loading');
                setError('');
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              Try Again
            </button>
          ) : replacing ? (
            <>
              <button type="submit" disabled={busy} className={primary}>
                {status === 'checking'
                  ? 'Checking…'
                  : status === 'saving'
                    ? 'Saving…'
                    : checked
                      ? 'Save Key'
                      : 'Check Key'}
              </button>
              {configured && (
                <button
                  type="button"
                  disabled={resetInProgress}
                  className={secondary}
                  onClick={cancelEdit}
                >
                  Cancel
                </button>
              )}
            </>
          ) : (
            <>
              <button
                ref={keyAction}
                id="gemini-api-key"
                type="button"
                disabled={busy}
                className={primary}
                onClick={() => {
                  setEditing(true);
                  setDraft('');
                  setChecked(null);
                  setStatus('empty');
                  setError('');
                  setKeyInvalid(false);
                }}
              >
                Replace Key
              </button>
              <button
                type="button"
                disabled={busy}
                className={secondary}
                onClick={() => {
                  setRemoveError('');
                  setRemoveDialog(true);
                }}
              >
                Remove Key
              </button>
            </>
          )}
        </div>
      </form>
      {removeDialog && (
        <SettingsDialog
          title="Remove API Key"
          busy={status === 'removing'}
          onDismiss={() => setRemoveDialog(false)}
        >
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            AI features will be turned off.
          </p>
          {removeError && (
            <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
              {removeError}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={status === 'removing'}
              className={secondary}
              onClick={() => setRemoveDialog(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={status === 'removing'}
              className={danger}
              onClick={() => void removeKey()}
            >
              {status === 'removing' ? 'Removing…' : 'Remove Key'}
            </button>
          </div>
        </SettingsDialog>
      )}
    </section>
  );
}
