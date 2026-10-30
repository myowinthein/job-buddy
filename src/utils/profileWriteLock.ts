import { devLockName } from '@/src/devtools/context';

let queue: Promise<unknown> = Promise.resolve();
/** Import decisions and editor saves share a lock so a person switch cannot race an old form. */
export async function withProfileWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request)
    return await navigator.locks.request(
      import.meta.env.DEV ? devLockName('job-buddy:profile-write') : 'job-buddy:profile-write',
      operation,
    );
  const result = queue.then(operation, operation);
  queue = result.catch(() => {});
  return result;
}
