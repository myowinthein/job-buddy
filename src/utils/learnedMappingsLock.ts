import { devLockName } from '@/src/devtools/context';
let queue: Promise<unknown> = Promise.resolve();
export async function withLearnedMappingsLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request)
    return navigator.locks.request(
      import.meta.env.DEV
        ? devLockName('job-buddy:learned-mappings')
        : 'job-buddy:learned-mappings',
      action,
    );
  const task = queue.then(action, action);
  queue = task.catch(() => {});
  return task;
}
