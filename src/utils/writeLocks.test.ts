import { afterEach, describe, expect, it, vi } from 'vitest';
import { withLearnedMappingsLock } from './learnedMappingsLock';
import { withProfileWriteLock } from './profileWriteLock';

const LOCKS = [
  ['withLearnedMappingsLock', withLearnedMappingsLock, 'job-buddy:learned-mappings'],
  ['withProfileWriteLock', withProfileWriteLock, 'job-buddy:profile-write'],
] as const;

afterEach(() => vi.unstubAllGlobals());

describe.each(LOCKS)('%s without Web Locks', (_name, withLock) => {
  it('runs a second action only after the first has finished', async () => {
    const events: string[] = [];
    let release!: () => void;
    const first = withLock(async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => (release = resolve));
      events.push('first:end');
    });
    const second = withLock(async () => {
      events.push('second:start');
    });
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('rejects the failing action but still runs the next one', async () => {
    const failing = withLock(async () => {
      throw new Error('write failed');
    });
    await expect(failing).rejects.toThrow('write failed');
    await expect(withLock(async () => 'next')).resolves.toBe('next');
  });
});

describe.each(LOCKS)('%s with Web Locks', (_name, withLock, lockName) => {
  it('requests the shared lock name and returns the action result', async () => {
    const request = vi.fn(async (_name: string, action: () => Promise<unknown>) => action());
    vi.stubGlobal('navigator', { locks: { request } });
    await withLock(async () => 'saved');
    expect(request).toHaveBeenCalledWith(lockName, expect.any(Function));
  });

  it('returns the result produced under the lock', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, action: () => Promise<unknown>) => action() },
    });
    await expect(withLock(async () => 'saved')).resolves.toBe('saved');
  });
});
