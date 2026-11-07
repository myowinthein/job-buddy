import { feedback } from '@/src/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { checkApiKey, validateApiKey, KEY_ERROR_MESSAGES } from '@/src/resume-ai/gemini';
import { MODEL_DISPLAY_NAMES, GEMINI_MODEL_PRIORITY } from '@/src/resume-ai/types';
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
import { primaryButtonCls as primary, secondaryButtonCls as secondary } from '../ui/buttonCls';

type Status = 'loading' | 'empty' | 'saved' | 'checking' | 'removing' | 'ready' | 'error';
const storedStatus = (settings: SavedSettings | null): Status =>
  !settings?.apiKey
    ? 'empty'
    : settings.model &&
        settings.verifiedAt &&
        Number.isFinite(settings.verifiedAt) &&
        settings.verifiedAt > 0
      ? 'ready'
      : 'saved';

function formatCheckedAt(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp <= 0) return 'Not checked yet';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Not checked yet';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const checkedDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((today - checkedDay) / 86_400_000);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const formatted =
    days === 0
      ? `Today at ${time}`
      : days === 1
        ? `Yesterday at ${time}`
        : date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
  return `Last checked: ${formatted}`;
}

export function GeminiSettings({ resetInProgress = false }: { resetInProgress?: boolean }) {
  const { showToast } = useToast();
  const [saved, setSaved] = useState<SavedSettings | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [modelOptionsOpen, setModelOptionsOpen] = useState(false);
  const [preference, setPreference] = useState<GeminiModelPreference>('auto');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [checkingLabel, setCheckingLabel] = useState('Check Key');
  const [keyInvalid, setKeyInvalid] = useState(false);
  const [removeDialog, setRemoveDialog] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const writing = useRef(0);
  const mounted = useRef(true);
  const keyInput = useRef<HTMLInputElement>(null);
  const keyAction = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const focusEmptyKey = useRef(false);
  const configured = !!saved?.apiKey;
  const busy =
    status === 'checking' || status === 'loading' || status === 'removing' || resetInProgress;
  const replacing = editing || !configured;
  const checkLabel =
    status === 'checking'
      ? checkingLabel
      : status === 'error'
        ? 'Try Again'
        : storedStatus(saved) === 'ready'
          ? 'Check again'
          : 'Check Key';

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
        setStatus(storedStatus(value));
        setError('');
        setKeyInvalid(false);
        setRemoveDialog(false);
        setRemoveError('');
      } catch {
        if (mounted.current && id === sequence.current) {
          setStatus('error');
          setError(feedback.geminiLoadFailed);
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
    if (focusEmptyKey.current) {
      keyInput.current?.focus();
      focusEmptyKey.current = false;
    } else if (editing) keyInput.current?.focus();
    else if (returnFocus.current) {
      keyAction.current?.focus();
      returnFocus.current = false;
    }
  }, [editing, removeDialog]);

  function cancelEdit() {
    returnFocus.current = true;
    sequence.current++;
    request.current?.abort();
    setDraft('');
    setEditing(false);
    setPreference(saved?.preference ?? 'auto');
    setStatus(storedStatus(saved));
    setError('');
    setKeyInvalid(false);
  }

  async function verify(key: string, choice: GeminiModelPreference, save: boolean) {
    const trimmed = key.trim();
    if (!trimmed) {
      setStatus('error');
      setError(feedback.geminiKeyRequired);
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
      setError(feedback.geminiKeyFormatInvalid);
      setKeyInvalid(true);
      return;
    }
    if (!saved) {
      setStatus('error');
      setError(feedback.geminiReloadRequired);
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = ++sequence.current;
    const current = () => mounted.current && id === sequence.current && !controller.signal.aborted;
    setCheckingLabel(checkLabel);
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
        setError(feedback.geminiChangedInAnotherTab);
        return;
      }
      setSaved(updated);
      setPreference(updated.preference);
      setEditing(false);
      setDraft('');
      if (save) showToast('success', replacing ? feedback.geminiKeySaved : feedback.geminiModelSaved);
      setStatus('ready');
    } catch {
      if (current()) {
        setStatus('error');
        setError(feedback.geminiSaveFailed);
        setPreference(saved.preference);
      }
    } finally {
      if (committing) writing.current--;
      if (mounted.current && id === sequence.current && controller.signal.aborted)
        setStatus(replacing ? 'empty' : storedStatus(saved));
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
      setSaved(latest);
      setDraft('');
      setEditing(false);
      setPreference('auto');
      setKeyInvalid(false);
      setStatus('empty');
      setError('');
      focusEmptyKey.current = true;
      setRemoveDialog(false);
      showToast('success', feedback.geminiKeyRemoved);
    } catch {
      if (mounted.current) {
        setStatus(status);
        setRemoveError(feedback.geminiRemoveFailed);
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
      : status === 'checking' || status === 'removing'
        ? status === 'removing'
          ? 'Removing…'
          : 'Checking…'
        : status === 'ready'
          ? 'Ready'
          : status === 'error' && configured && !replacing
            ? 'Needs attention'
            : configured && replacing
              ? 'Saved key active'
              : configured
                ? 'Key saved'
                : '';
  const statusIndicator = statusText ? (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 text-xs ${status === 'checking' || status === 'loading' || status === 'removing' ? 'text-blue-600 dark:text-blue-400' : status === 'ready' ? 'text-green-700 dark:text-green-400' : status === 'error' && !replacing ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}
    >
      {status === 'checking' || status === 'loading' || status === 'removing' ? (
        <span
          aria-hidden="true"
          className="h-3 w-3 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin motion-reduce:animate-none"
        />
      ) : (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      )}
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
          if (!busy) void verify(replacing ? draft : (saved?.apiKey ?? ''), preference, replacing);
        }}
      >
        {configured && !replacing ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {saved?.model ? MODEL_DISPLAY_NAMES[saved.model] : 'Gemini API key'}
              </span>
              {statusIndicator}
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{formatCheckedAt(saved?.verifiedAt)}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => void verify(saved?.apiKey ?? '', preference, false)}
                disabled={busy}
                className="text-blue-600 dark:text-blue-400 hover:underline rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
              >
                {checkLabel}
              </button>
            </div>
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
                setStatus('empty');
              }}
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
              . No credit card required.
            </p>
          </>
        )}
        {error && (
          <div
            id="gemini-key-error"
            role="alert"
            className="mt-2 text-xs text-red-600 dark:text-red-400"
          >
            <p className="text-pretty">{error}</p>
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
                Save Key
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
          title="Remove API Key?"
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
          <div className="mt-6 flex flex-wrap justify-end gap-3">
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
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 active:scale-95 transition-colors"
              onClick={() => void removeKey()}
            >
              {status === 'removing' ? 'Removing…' : 'Remove Key'}
            </button>
          </div>
        </SettingsDialog>
      )}
      {configured && (
        <div className="mt-3 max-w-md">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <button
              type="button"
              aria-expanded={modelOptionsOpen}
              aria-controls="gemini-model-options"
              onClick={() => setModelOptionsOpen((open) => !open)}
              className="text-blue-600 dark:text-blue-400 hover:underline rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              <span aria-hidden="true">{modelOptionsOpen ? '▾' : '▸'} </span>
              Model options
            </button>
            <a
              href="https://aistudio.google.com/rate-limit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              View usage and limits <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div id="gemini-model-options" hidden={!modelOptionsOpen} className="mt-3">
            <label
              htmlFor="gemini-model"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              AI Model
            </label>
            <select
              id="gemini-model"
              value={preference}
              disabled={busy}
              onChange={(e) => {
                const choice = e.target.value as GeminiModelPreference;
                setPreference(choice);
                if (!replacing) void verify(saved?.apiKey ?? '', choice, true);
              }}
              className={fieldCls(undefined, busy)}
            >
              <option value="auto">Automatic (recommended)</option>
              {GEMINI_MODEL_PRIORITY.map((model) => (
                <option key={model} value={model}>
                  {MODEL_DISPLAY_NAMES[model]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </section>
  );
}
