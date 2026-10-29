import { useEffect, useRef, useState } from 'react';
import { Check, Circle, LoaderCircle, RefreshCw } from 'lucide-react';
import { checkApiKey, validateApiKey, KEY_ERROR_MESSAGES } from '@/src/resume-ai/gemini';
import { MODEL_DISPLAY_NAMES } from '@/src/resume-ai/types';
import {
  getGeminiSettings,
  saveGeminiSettings,
  clearGeminiSettings,
  type GeminiSettings as SavedSettings,
  type GeminiModelPreference,
} from '@/src/utils/storage';
import { useToast } from '@/src/components/ui/useToast';
import { fieldCls } from './shared/fieldCls';

const primary =
  'px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors';
const secondary =
  'px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors';
type Status = 'loading' | 'empty' | 'saved' | 'checking' | 'ready' | 'error';

export function GeminiSettings({ resetInProgress = false }: { resetInProgress?: boolean }) {
  const { showToast } = useToast();
  const [saved, setSaved] = useState<SavedSettings | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [preference, setPreference] = useState<GeminiModelPreference>('auto');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [keyInvalid, setKeyInvalid] = useState(false);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const writing = useRef(0);
  const mounted = useRef(true);
  const keyInput = useRef<HTMLInputElement>(null);
  const keyAction = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const configured = !!saved?.apiKey;
  const busy = status === 'checking' || status === 'loading' || resetInProgress;
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
        setEditing(false);
        setStatus(value.apiKey ? 'saved' : 'empty');
        setError('');
        setKeyInvalid(false);
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
    if (editing) keyInput.current?.focus();
    else if (returnFocus.current) {
      keyAction.current?.focus();
      returnFocus.current = false;
    }
  }, [editing]);

  function cancelEdit() {
    returnFocus.current = true;
    sequence.current++;
    request.current?.abort();
    setDraft('');
    setEditing(false);
    setPreference(saved?.preference ?? 'auto');
    setStatus(configured ? 'saved' : 'empty');
    setError('');
    setKeyInvalid(false);
  }

  async function verify(key: string, choice: GeminiModelPreference, save: boolean) {
    const trimmed = key.trim();
    if (!trimmed) {
      setStatus('error');
      setError('Enter your Gemini API key.');
      setKeyInvalid(true);
      keyInput.current?.focus();
      return;
    }
    // Do not fix a key format to today's provider prefix or length.
    if (
      /\s/.test(trimmed) ||
      Array.from(trimmed).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      trimmed.length > 4096
    ) {
      setStatus('error');
      setError('Paste the API key only, without spaces or extra text.');
      setKeyInvalid(true);
      return;
    }
    if (!saved) {
      setStatus('error');
      setError('Could not load AI settings. Reload this page and try again.');
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = ++sequence.current;
    const current = () => mounted.current && id === sequence.current && !controller.signal.aborted;
    setStatus('checking');
    setError('');
    setKeyInvalid(false);
    let committing = false;
    try {
      const check = await checkApiKey(trimmed, controller.signal);
      if (!current()) return;
      if (check !== 'valid') {
        setStatus('error');
        setError(KEY_ERROR_MESSAGES[check]);
        setKeyInvalid(check === 'invalid');
        return;
      }
      const result = await validateApiKey(
        trimmed,
        controller.signal,
        !save && saved.model ? saved.model : choice === 'auto' ? undefined : choice,
      );
      if (!current()) return;
      if (!result.valid || !result.model) {
        setStatus('error');
        setError(result.error ?? 'Could not check this model. Please try again.');
        setKeyInvalid(!!result.keyInvalid);
        setPreference(saved.preference);
        return;
      }
      if (save || !saved.model) {
        committing = true;
        writing.current++;
        const updated = await saveGeminiSettings(
          trimmed,
          result.model,
          choice,
          saved.revision,
          current,
        );
        if (!current()) return;
        if (!updated) {
          const latest = await getGeminiSettings();
          if (!current()) return;
          setSaved(latest);
          setPreference(latest.preference);
          setStatus('error');
          setError('AI settings changed in another tab. Review them and try again.');
          return;
        }
        setSaved(updated);
        setPreference(updated.preference);
        setEditing(false);
        setDraft('');
        showToast('success', replacing ? 'API key saved.' : 'AI model saved.');
      }
      setStatus('ready');
    } catch {
      if (current()) {
        setStatus('error');
        setError('Could not save AI settings. Please try again.');
        setPreference(saved.preference);
      }
    } finally {
      if (committing) writing.current--;
      if (mounted.current && id === sequence.current && controller.signal.aborted)
        setStatus(configured ? 'saved' : 'empty');
    }
  }

  async function removeKey() {
    sequence.current++;
    request.current?.abort();
    setStatus('checking');
    setError('');
    writing.current++;
    try {
      await clearGeminiSettings();
      const latest = await getGeminiSettings();
      if (!mounted.current) return;
      setSaved(latest);
      setDraft('');
      setEditing(false);
      setPreference('auto');
      setKeyInvalid(false);
      setStatus('empty');
      showToast('success', 'API key removed.');
    } catch {
      if (mounted.current) {
        setStatus('error');
        setError('Could not remove the API key. Please try again.');
      }
    } finally {
      writing.current--;
    }
  }

  const statusText =
    saved === null
      ? status === 'error'
        ? 'Unavailable'
        : 'Loading…'
      : status === 'checking'
        ? 'Checking…'
        : status === 'ready'
          ? 'Ready'
          : status === 'error' && configured && !replacing
            ? 'Needs attention'
            : configured
              ? 'Key saved'
              : 'Not configured';
  const statusIndicator = (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 text-xs ${status === 'ready' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}
    >
      {status === 'checking' || status === 'loading' ? (
        <LoaderCircle aria-hidden="true" className="w-3 h-3 motion-safe:animate-spin" />
      ) : status === 'ready' ? (
        <Check aria-hidden="true" className="w-3 h-3" />
      ) : (
        <Circle aria-hidden="true" className="w-2 h-2" />
      )}
      {statusText}
    </span>
  );
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
          if (!busy) void verify(replacing ? draft : (saved?.apiKey ?? ''), preference, replacing);
        }}
      >
        {configured && !replacing ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {saved?.model ? MODEL_DISPLAY_NAMES[saved.model] : 'Gemini API key'}
            </span>
            <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">
              ·
            </span>
            {statusIndicator}
            <button
              type="button"
              onClick={() => void verify(saved?.apiKey ?? '', preference, false)}
              disabled={busy}
              aria-label={status === 'error' ? 'Try Again' : 'Check Key'}
              title={status === 'error' ? 'Try Again' : 'Check Key'}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
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
              onChange={(e) => {
                sequence.current++;
                request.current?.abort();
                setDraft(e.target.value);
                setError('');
                setKeyInvalid(false);
                setStatus(configured ? 'saved' : 'empty');
              }}
              disabled={busy || !saved}
              placeholder="Paste your API key"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={keyInvalid || undefined}
              aria-describedby={`gemini-key-help gemini-key-privacy${error ? ' gemini-key-error' : ''}`}
              className={fieldCls(keyInvalid ? error : undefined, busy || !saved)}
            />
            <p id="gemini-key-help" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Get a key from{' '}
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
            <p id="gemini-key-privacy" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Stored in this browser. Excluded from profile backups.
            </p>
          </>
        )}
        {error && (
          <div
            id="gemini-key-error"
            role="alert"
            className="mt-2 text-xs text-red-600 dark:text-red-400"
          >
            <p>{error}</p>
            {configured && replacing && <p className="mt-1">Your saved key is still active.</p>}
          </div>
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
                {status === 'checking' ? 'Checking…' : 'Save Key'}
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
              {/* Keep the popup's focus target available when the editor is closed. */}
              <button
                ref={keyAction}
                id="gemini-api-key"
                type="button"
                disabled={busy}
                className={primary}
                onClick={() => {
                  setEditing(true);
                  setDraft('');
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
                onClick={() => void removeKey()}
              >
                Remove Key
              </button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
