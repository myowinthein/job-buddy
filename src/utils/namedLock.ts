import { captureDevelopmentScope } from '@/src/devtools/session';
import { devLockName } from '@/src/devtools/context';

/**
 * Serializes async actions under one Web Lock name, shared by every extension
 * page. Without Web Locks it falls back to an in-memory queue, and a rejected
 * action never blocks the next one.
 */
export function createNamedLock(name: string): <T>(action: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  return async <T>(action: () => Promise<T>): Promise<T> => {
    const assertCurrent = captureDevelopmentScope();
    const guarded = () => {
      assertCurrent();
      return action();
    };
    if (typeof navigator !== 'undefined' && navigator.locks?.request)
      return navigator.locks.request(import.meta.env.DEV ? devLockName(name) : name, guarded);
    const task = queue.then(guarded, guarded);
    queue = task.catch(() => {});
    return task;
  };
}
