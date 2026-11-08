import { devLockName } from '@/src/devtools/context';

/**
 * Serializes async actions under one Web Lock name, shared by every extension
 * page. Without Web Locks it falls back to an in-memory queue, and a rejected
 * action never blocks the next one.
 */
export function createNamedLock(name: string): <T>(action: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  return async <T>(action: () => Promise<T>): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks?.request)
      return navigator.locks.request(import.meta.env.DEV ? devLockName(name) : name, action);
    const task = queue.then(action, action);
    queue = task.catch(() => {});
    return task;
  };
}
