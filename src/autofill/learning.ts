import type { Profile } from '../types/profile';
import type { LearningContext } from '../types/storage';
import { isControlAvailable } from './dom';
import { fieldIdentity } from './fieldState';
import { readFieldValue } from './fieldValue';
import { extractSignals, controlForm } from './signals';
import { ruleQuestionBlocked } from './ruleContext';
import { isOwnWriteEvent } from './writeSession';
import { saveElementMappings } from './mappings';
import { learningValues, matchLearningValue } from './learningValues';
import { EDIT_LEARN_MIN_VALUE_LENGTH } from './constants';
import { learnedSensitiveQuestion } from './learnedContext';

let saveQueue: Promise<void> = Promise.resolve();
const answer = (element: HTMLElement): string =>
  element instanceof HTMLSelectElement
    ? element.multiple || !readFieldValue(element)
      ? ''
      : (element.selectedOptions[0]?.text.trim() ?? '')
    : readFieldValue(element).trim();

/** Observe real edits across all confidence tiers. Reporting has separate listeners. */
export function watchLearning(
  elements: HTMLElement[],
  profile: Profile,
  domain: string,
  context: LearningContext,
  onEdit: (element: HTMLElement) => void,
): () => void {
  const values = learningValues(profile);
  const cleanup: Array<() => void> = [];
  let active = true;
  for (const element of new Set(elements)) {
    const identity = fieldIdentity(element),
      root = element.getRootNode(),
      form = controlForm(element);
    let baseline = answer(element),
      pending: string | null = null,
      lastPath: string | null = null;
    const current = () =>
      active &&
      isControlAvailable(element) &&
      element.getRootNode() === root &&
      controlForm(element) === form &&
      fieldIdentity(element) === identity;
    const changed = (event: Event) => {
      if (!event.isTrusted || isOwnWriteEvent() || !current()) return;
      pending = answer(element);
      onEdit(element);
    };
    const blurred = () => {
      if (isOwnWriteEvent() || pending === null || !current()) return;
      const value = answer(element),
        edited = pending;
      pending = null;
      if (value !== edited || value === baseline) return;
      baseline = value;
      if (
        value.length < EDIT_LEARN_MIN_VALUE_LENGTH ||
        ((element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement) &&
          !element.validity.valid)
      )
        return;
      const signals = extractSignals(element);
      if (ruleQuestionBlocked(signals)) return;
      const path = matchLearningValue(values, value);
      if (!path || path === lastPath || !learnedSensitiveQuestion(path, signals)) return;
      lastPath = path;
      // Freeze the observation now; a queued save must never re-read a reused control.
      const snapshot = { ...signals, element };
      saveQueue = saveQueue
        .then(async () => {
          if (current() && answer(element) === value)
            await saveElementMappings(domain, snapshot, path, context);
          else if (lastPath === path) lastPath = null;
        })
        .catch(() => {
          lastPath = null; /* A later genuine edit can retry. */
        });
    };
    element.addEventListener('input', changed);
    element.addEventListener('change', changed);
    element.addEventListener('blur', blurred);
    cleanup.push(() => {
      element.removeEventListener('input', changed);
      element.removeEventListener('change', changed);
      element.removeEventListener('blur', blurred);
    });
  }
  const storageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && (changes.profile || changes.learnedMappingsRevision)) remove();
  };
  const remove = () => {
    active = false;
    cleanup.forEach((action) => action());
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(storageChanged);
  };
  if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(storageChanged);
  return remove;
}
