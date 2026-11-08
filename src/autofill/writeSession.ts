import { captureField, fieldIdentity, sameFieldState } from './fieldState';
import { controlForm } from './dom';
import type { FieldState } from './fieldState';

interface WriteEntry {
  before: FieldState;
  after: FieldState;
  identity: string;
  root: Node;
  form: Element | null;
  manual: boolean;
  restore: (state: FieldState, active: () => boolean) => Promise<boolean>;
  remove: () => void;
}
/** The control still sits in the tree, form and identity it was written in. */
const sameControl = (
  element: HTMLElement,
  root: Node,
  form: Element | null,
  identity: string,
): boolean =>
  element.isConnected &&
  element.getRootNode() === root &&
  controlForm(element) === form &&
  fieldIdentity(element) === identity;
let entries = new Map<HTMLElement, WriteEntry>();
let ownEventDepth = 0;
const pendingWrites = new Set<Promise<boolean>>();
const confidence = new WeakMap<HTMLElement, number>();

export const isOwnWriteEvent = (): boolean => ownEventDepth > 0;

export function ownWriteEvents<T>(action: () => T): T {
  ownEventDepth++;
  try {
    return action();
  } finally {
    ownEventDepth--;
  }
}
export const getWriteConfidence = (element: HTMLElement): number => confidence.get(element) ?? 1;
export const setWriteConfidence = (element: HTMLElement, score: number): void => {
  confidence.set(element, score);
};

export function resetWriteSession(): void {
  for (const entry of entries.values()) entry.remove();
  entries = new Map();
}

export function performWrite(...args: Parameters<typeof performTrackedWrite>): Promise<boolean> {
  const task = performTrackedWrite(...args);
  pendingWrites.add(task);
  void task.finally(() => pendingWrites.delete(task)).catch(() => {});
  return task;
}

async function performTrackedWrite(
  element: HTMLElement,
  active: () => boolean,
  write: (before: FieldState, unchanged: () => boolean) => Promise<boolean>,
  restore: WriteEntry['restore'],
): Promise<boolean> {
  if (!active()) return false;
  const session = entries;
  const before = captureField(element, true);
  const identity = fieldIdentity(element);
  const root = element.getRootNode();
  const form = controlForm(element);
  const previous = session.get(element);
  if (
    previous &&
    (previous.form !== form || previous.root !== root || previous.identity !== identity)
  )
    return false;
  const entry = session.get(element) ?? {
    before,
    after: before,
    identity,
    root,
    form,
    manual: false,
    restore,
    remove: () => {},
  };
  if (!session.has(element)) {
    const mark = (event: Event) => {
      if (event.isTrusted && !ownEventDepth) entry.manual = true;
    };
    const controls = before.choices?.map((item) => item.element) ?? [element];
    for (const control of controls)
      for (const type of ['input', 'change']) control.addEventListener(type, mark);
    entry.remove = () => {
      for (const control of controls)
        for (const type of ['input', 'change']) control.removeEventListener(type, mark);
    };
  }
  const current = () =>
    active() && !entry.manual && sameControl(element, root, form, identity);
  let accepted = false;
  try {
    accepted = await write(before, current);
  } catch {
    /* A rejected widget must not abort the other fields. */
  }
  if (session !== entries) {
    entry.remove();
    return false;
  }
  if (!accepted && current() && !sameFieldState(before, captureField(element))) {
    try {
      await restore(before, current);
    } catch {
      /* Keep an unreversed change available to Undo. */
    }
  }
  const after = captureField(element);
  if (!sameFieldState(entry.before, after)) {
    entry.after = after;
    session.set(element, entry);
  } else {
    entry.remove();
    session.delete(element);
  }
  return accepted && current();
}

export async function undoWrites(
  active: () => boolean = () => true,
): Promise<{ success: boolean; remaining: Set<HTMLElement>; restored: Set<HTMLElement> }> {
  const session = entries;
  const restoredElements = new Set<HTMLElement>();
  await Promise.allSettled([...pendingWrites]);
  for (const [element, entry] of [...session].reverse()) {
    if (!active() || session !== entries) break;
    const current = () =>
      active() &&
      !entry.manual &&
      session === entries &&
      sameControl(element, entry.root, entry.form, entry.identity);
    if (!current() || entry.manual || !sameFieldState(captureField(element), entry.after)) {
      entry.remove();
      session.delete(element);
      continue; // Preserve subsequent edits and repurposed controls.
    }
    let restored = false;
    try {
      restored = await entry.restore(entry.before, current);
    } catch {
      /* Report incomplete Undo. */
    }
    if (restored) restoredElements.add(element);
    if (restored || entry.manual) {
      entry.remove();
      session.delete(element);
    }
  }
  return {
    success: active() && session === entries && !session.size,
    remaining: new Set(session.keys()),
    restored: restoredElements,
  };
}
